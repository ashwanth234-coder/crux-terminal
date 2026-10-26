import { parseUnits, type Address, type Hex } from "viem";
import { accountNonce, type AccountSigner } from "@/lib/account";
import { TESTNET } from "@/lib/chains";
import { CRUX_SOLVER } from "@/lib/intents";
import { postRelay } from "@/lib/session";

/**
 * Standing orders on a Crux account (CruxAccountV2): buy the dip, take profit, stop loss and trailing stop. The login
 * key signs each once; the Crux keeper (the solver's wallet, the only address allowed to submit it) sends it when the
 * price reaches its trigger. The floor, the least it may fill for, is signed in and enforced on-chain. Mirrors
 * crux-solver standing.ts.
 */

export const STANDING_TYPES = {
  StandingOrder: [
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "tokenOut", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "batchWindow", type: "uint32" },
    { name: "kind", type: "uint8" },
    { name: "triggerPrice", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
  CancelStanding: [
    { name: "nonces", type: "uint256[]" },
    { name: "groups", type: "bytes32[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  ListStanding: [
    { name: "owner", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type StandingKind = "dip" | "takeProfit" | "stopLoss" | "trailing";
export const KIND_ID: Record<StandingKind, number> = { dip: 1, takeProfit: 2, stopLoss: 3, trailing: 4 };
export const KIND_LABEL: Record<StandingKind, string> = { dip: "Buy dip", takeProfit: "Take profit", stopLoss: "Stop loss", trailing: "Trailing stop" };

/** What every fill costs on the way: Uniswap's 0.3% pool fee and the solver's 0.3% spread. */
export const FILL_COST = 0.994;

const ZERO_GROUP = `0x${"00".repeat(32)}` as Hex;
const domain = (account: Address) => ({ name: "CruxAccount", version: "1", chainId: TESTNET.id, verifyingContract: account }) as const;

/** A random group id: orders sharing it are one-cancels-the-other. */
export function newGroup(): Hex {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export type StandingInput = {
  kind: StandingKind;
  tokenIn: Address;
  amountIn: bigint;
  /** CAIP-19 of what's received. */
  tokenOut: string;
  minAmountOut: bigint;
  /** USD per whole token. */
  triggerUsd: number;
  group?: Hex;
  /** Seconds the order waits before expiring (at most 31 days). */
  lifetime: number;
  /** Trailing stops: how far under the peak it fires, in basis points. */
  trailBps?: number;
};

/** Signs one standing order with the login key and hands it to the keeper. */
export async function placeStanding(sign: AccountSigner, owner: Address, account: Address, o: StandingInput) {
  const message = {
    tokenIn: o.tokenIn,
    amountIn: o.amountIn,
    tokenOut: o.tokenOut,
    minAmountOut: o.minAmountOut,
    batchWindow: 10,
    kind: KIND_ID[o.kind],
    // 18 decimals of USD; enough places for sub-nano token prices.
    triggerPrice: parseUnits(o.triggerUsd.toFixed(18), 18),
    group: o.group ?? ZERO_GROUP,
    executor: CRUX_SOLVER,
    nonce: accountNonce(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + o.lifetime),
  };
  const signature = await sign({ domain: domain(account), types: { StandingOrder: STANDING_TYPES.StandingOrder }, primaryType: "StandingOrder", message });
  return postRelay("/v1/standing", { owner, order: message, signature, ...(o.trailBps !== undefined ? { trailBps: o.trailBps } : {}) });
}

export type StandingView = {
  id: string;
  kind: string;
  side: "buy" | "sell";
  token: Address;
  amountIn: string;
  minAmountOut: string;
  triggerUsd: number;
  trailBps: number | null;
  peak: number | null;
  group: Hex | null;
  nonce: string;
  expiry: number;
  status: "open" | "submitted" | "cancelled" | "expired" | "failed";
  note: string | null;
  txHash: Hex | null;
  createdAt: number;
};

/** The owner's orders (a signed read: nobody else can see where their stops are). */
export async function listStanding(sign: AccountSigner, owner: Address, account: Address): Promise<StandingView[]> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const signature = await sign({ domain: domain(account), types: { ListStanding: STANDING_TYPES.ListStanding }, primaryType: "ListStanding", message: { owner, deadline } });
  const data = await postRelay("/v1/standing/list", { owner, deadline: deadline.toString(), signature });
  return (data.orders as StandingView[]) ?? [];
}

/** Cancels orders and whole groups: off the keeper's book, and on-chain. */
export async function cancelStanding(sign: AccountSigner, owner: Address, account: Address, nonces: bigint[], groups: Hex[]) {
  const message = { nonces, groups, nonce: accountNonce(), deadline: BigInt(Math.floor(Date.now() / 1000) + 120) };
  const signature = await sign({ domain: domain(account), types: { CancelStanding: STANDING_TYPES.CancelStanding }, primaryType: "CancelStanding", message });
  return postRelay("/v1/standing/cancel", {
    owner,
    nonces: nonces.map(String),
    groups,
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    signature,
  });
}

/**
 * The floor for a standing order: what it should get at its trigger, after the pool fee and spread, less the
 * trader's slippage. Sells: USDC (6 decimals) for `amountIn` tokens. Buys: tokens for `amountIn` USDC.
 */
export function standingFloor(side: "buy" | "sell", amountIn: bigint, triggerUsd: number, tokenDecimals: number, slippageBps: number): bigint {
  const keep = FILL_COST * (1 - slippageBps / 10_000);
  if (side === "sell") {
    const usd = (Number(amountIn) / 10 ** tokenDecimals) * triggerUsd * keep;
    return parseUnits(usd.toFixed(6), 6);
  }
  const tokens = (Number(amountIn) / 1e6 / triggerUsd) * keep;
  return parseUnits(tokens.toFixed(Math.min(tokenDecimals, 6)), tokenDecimals);
}
