import { parseAbi, type Address, type Hex } from "viem";
import { PublicKey } from "@solana/web3.js";
import { accountNonce, type AccountSigner } from "@/lib/account";
import { TESTNET } from "@/lib/chains";
import { postRelay } from "@/lib/session";

/**
 * One balance (crux-solver docs/one-balance-solana.md): Solana coins bought with the Crux account's USDC
 * (CruxAccountV3.tradeSolana), delivered to the login's own Solana wallet, which the account binds once
 * (setSolanaWallet). Both are EIP-712 messages the login key signs silently; the relay submits them and pays the gas
 * (crux-solver accountsolana.ts).
 */
export const cruxAccountSolanaAbi = parseAbi(["function solanaWallet() view returns (bytes32)"]);

const TYPES = {
  TradeSolana: [
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "mint", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "fillDeadline", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  SetSolanaWallet: [
    { name: "wallet", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const domain = (account: Address) => ({ name: "CruxAccount", version: "1", chainId: TESTNET.id, verifyingContract: account });
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 120);

/** A Solana address as the 32 bytes the account stores. */
export const walletBytes32 = (wallet: string) => `0x${[...new PublicKey(wallet).toBytes()].map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;

/** Binds the login's Solana wallet to the account (instant the first time; any later change waits 48 hours). */
export async function linkSolanaWallet(sign: AccountSigner, owner: Address, account: Address, wallet: string) {
  const message = { wallet: walletBytes32(wallet), nonce: accountNonce(), deadline: deadline() };
  const signature = await sign({ domain: domain(account), types: { SetSolanaWallet: TYPES.SetSolanaWallet }, primaryType: "SetSolanaWallet", message });
  return postRelay("/v1/solana/account-wallet", { owner, account, wallet, nonce: message.nonce.toString(), deadline: message.deadline.toString(), signature });
}

/** Buys `mint` with `amountIn` (6-decimal USDC) of the account's USDC; the coin lands in the bound Solana wallet. */
export async function buySolanaFromAccount(
  sign: AccountSigner,
  owner: Address,
  account: Address,
  t: { usdc: Address; amountIn: bigint; mint: string; minAmountOut: bigint },
): Promise<{ orderId: Hex | null }> {
  const message = {
    tokenIn: t.usdc,
    amountIn: t.amountIn,
    mint: t.mint,
    minAmountOut: t.minAmountOut > BigInt(0) ? t.minAmountOut : BigInt(1),
    fillDeadline: Math.floor(Date.now() / 1000) + 600,
    nonce: accountNonce(),
    deadline: deadline(),
  };
  const signature = await sign({ domain: domain(account), types: { TradeSolana: TYPES.TradeSolana }, primaryType: "TradeSolana", message });
  const data = await postRelay("/v1/solana/account-buy", {
    owner,
    account,
    trade: { ...message, amountIn: message.amountIn.toString(), minAmountOut: message.minAmountOut.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    signature,
  });
  return { orderId: typeof data.orderId === "string" ? (data.orderId as Hex) : null };
}

/**
 * The least a buy of `mint` for `usdcIn` (6 decimals) should get, from Jupiter's free quote less `slippageBps`; 0 when
 * there's no quote (the account then signs a floor of 1 and the solver's own slippage check protects the price).
 */
export async function quoteMinOut(mint: string, usdcIn: bigint, slippageBps = 300): Promise<bigint> {
  try {
    const q = new URLSearchParams({ inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", outputMint: mint, amount: usdcIn.toString(), slippageBps: String(slippageBps) });
    const r = (await (await fetch(`https://lite-api.jup.ag/swap/v1/quote?${q}`)).json()) as { otherAmountThreshold?: string };
    return r.otherAmountThreshold ? BigInt(r.otherAmountThreshold) : BigInt(0);
  } catch {
    return BigInt(0);
  }
}
