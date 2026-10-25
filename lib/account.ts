import { parseAbi, type Address, type Hex } from "viem";
import { TESTNET } from "@/lib/chains";
import { postRelay } from "@/lib/session";

/**
 * Crux accounts (CruxAccount, Phase B). Logging in with email or Google gives the trader a Privy embedded wallet: the
 * account's owner, a login key that signs silently. The account itself is a contract at an address derived from that
 * key, the same on every chain, and it's the trader's deposit address. Its funds can only:
 *   - trade through the Crux settler, with every fill and refund paid back into the account, or
 *   - be withdrawn to the withdrawal address the trader binds (instant the first time; any change waits 48 hours, and
 *     the bound address can cancel it or sweep everything to itself).
 * The login key signs EIP-712 messages; the relay submits them and pays the gas, deploying the account right before
 * its first trade or binding. A stolen login key can trade but never move funds out.
 */

/** CruxAccountFactory: the same address on every chain (deterministic CREATE2 deploy). */
export const ACCOUNT_FACTORY = "0xDdB0DF1CfcdEd073A72A489351f22cfF646f8C6E" as Address;
/** How long a change of withdrawal address waits (CruxAccount.WITHDRAWAL_CHANGE_DELAY). */
export const WITHDRAWAL_CHANGE_DELAY = 48 * 3600;
/** A trade's fill deadline is at most this far out (CruxAccount.MAX_FILL_WINDOW); the terminal uses 10 minutes less. */
export const ACCOUNT_FILL_SECONDS = 600;

export const accountFactoryAbi = parseAbi(["function accountOf(address owner) view returns (address)"]);
export const cruxAccountAbi = parseAbi([
  "function owner() view returns (address)",
  "function withdrawalAddress() view returns (address)",
  "function pendingWithdrawalAddress() view returns (address)",
  "function withdrawalChangeEta() view returns (uint64)",
  "function emergencySweep(address[] tokens)",
  "function cancelWithdrawalChange(uint256 nonce, uint256 deadline, bytes signature)",
]);

/** The EIP-712 types the owner signs (CruxAccount's typehashes, mirrored in crux-solver accounts.ts). */
export const ACCOUNT_TYPES = {
  Trade: [
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "tokenOut", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "fillDeadline", type: "uint32" },
    { name: "batchWindow", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Withdraw: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  SetWithdrawalAddress: [
    { name: "withdrawalAddress", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  CancelWithdrawalChange: [
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type PrimaryType = keyof typeof ACCOUNT_TYPES;

export type AccountTypedData = {
  domain: { name: "CruxAccount"; version: "1"; chainId: number; verifyingContract: Address };
  types: Pick<typeof ACCOUNT_TYPES, PrimaryType>;
  primaryType: PrimaryType;
  message: Record<string, unknown>;
};

/** Signs one account message with the owner's login key (the Privy embedded wallet, silently). */
export type AccountSigner = (typed: AccountTypedData) => Promise<Hex>;

const typed = (account: Address, primaryType: PrimaryType, message: Record<string, unknown>): AccountTypedData => ({
  domain: { name: "CruxAccount", version: "1", chainId: TESTNET.id, verifyingContract: account },
  types: { [primaryType]: ACCOUNT_TYPES[primaryType] } as AccountTypedData["types"],
  primaryType,
  message,
});

/** A random unordered nonce: several signed actions can be in flight at once. */
export function accountNonce(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return BigInt(`0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
}

/** Signatures expire two minutes after signing (the relay submits within seconds). */
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 120);

export type AccountTrade = { tokenIn: Address; amountIn: bigint; tokenOut: string; minAmountOut: bigint };

/** A buy or sell from the account, signed by the login key and opened by the relay. Returns the order id. */
export async function tradeFromAccount(sign: AccountSigner, owner: Address, account: Address, t: AccountTrade): Promise<Hex> {
  const now = Math.floor(Date.now() / 1000);
  const message = {
    tokenIn: t.tokenIn,
    amountIn: t.amountIn,
    tokenOut: t.tokenOut,
    minAmountOut: t.minAmountOut,
    fillDeadline: now + ACCOUNT_FILL_SECONDS,
    batchWindow: 10,
    nonce: accountNonce(),
    deadline: deadline(),
  };
  const signature = await sign(typed(account, "Trade", message));
  const data = await postRelay("/v1/account/trade", { owner, trade: message, signature });
  if (typeof data.orderId !== "string") throw new Error("The relay opened the trade but didn't return its order id.");
  return data.orderId as Hex;
}

/** Binds the withdrawal address (instant while none is bound) or requests a change (takes effect after 48 hours). */
export async function setWithdrawalAddress(sign: AccountSigner, owner: Address, account: Address, to: Address) {
  const message = { withdrawalAddress: to, nonce: accountNonce(), deadline: deadline() };
  const signature = await sign(typed(account, "SetWithdrawalAddress", message));
  return postRelay("/v1/account/withdrawal-address", { owner, ...message, signature });
}

/** Withdraws `amount` of `token` to the bound withdrawal address, the only place it can go. */
export async function withdrawFromAccount(sign: AccountSigner, owner: Address, account: Address, token: Address, amount: bigint) {
  const message = { token, amount, nonce: accountNonce(), deadline: deadline() };
  const signature = await sign(typed(account, "Withdraw", message));
  return postRelay("/v1/account/withdraw", { owner, ...message, signature });
}

export async function cancelWithdrawalChange(sign: AccountSigner, owner: Address, account: Address) {
  const message = { nonce: accountNonce(), deadline: deadline() };
  const signature = await sign(typed(account, "CancelWithdrawalChange", message));
  return postRelay("/v1/account/cancel-change", { owner, ...message, signature });
}

/** Applies a change whose 48 hours have passed. Needs no signature. */
export async function finalizeWithdrawalChange(owner: Address) {
  return postRelay("/v1/account/finalize-change", { owner });
}
