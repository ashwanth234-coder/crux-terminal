import { formatUnits, parseUnits } from "viem";

/**
 * CruxFactoryV2 units. Prices are quote base units per whole token, × 1e18, so with
 * 6-decimal USDC one dollar per token is 1e24: tokens = quote × 1e36 / price.
 */
export const PRICE_DECIMALS = 24;
export const PRICE_DENOMINATOR = BigInt(10) ** BigInt(36);
/** A bid with no limit: the largest price the contract accepts. */
export const NO_LIMIT = (BigInt(1) << BigInt(160)) - BigInt(1);
/** Supply split, mirroring CruxFactoryV2's constants. */
export const V2_SPLIT = { saleBps: 6_000, lpBps: 3_000, creatorBps: 1_000 } as const;
export const V2_FEE = { feeBps: 100, creatorShareBps: 7_000 } as const;
export const V2_VESTING_DAYS = 30;
/** Contract minimum is 60s; the form asks for more so the transaction lands in time. */
export const V2_MIN_LEAD_SECONDS = 180;

export type AuctionV2 = {
  token: `0x${string}`;
  creator: `0x${string}`;
  startTime: number;
  batchWindow: number;
  /** 0 Live, 1 Graduated, 2 Cancelled. */
  status: number;
  bidderCount: number;
  settledAt: number;
  pair: `0x${string}`;
  totalSupply: bigint;
  saleSupply: bigint;
  graduationTarget: bigint;
  floorPrice: bigint;
  maxAllocationPerWallet: bigint;
  totalDeposits: bigint;
  clearingPrice: bigint;
};

export type PhaseV2 = "scheduled" | "open" | "closed" | "graduated" | "cancelled";

export function phaseV2(a: Pick<AuctionV2, "status" | "startTime" | "batchWindow">, now: number): PhaseV2 {
  if (a.status === 1) return "graduated";
  if (a.status === 2) return "cancelled";
  if (now < a.startTime) return "scheduled";
  return now < a.startTime + a.batchWindow ? "open" : "closed";
}

const usdFmt = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

/** USD per token for a V2 price (exact for display; sub-cent prices keep their digits). */
export function priceUsd(price: bigint) {
  return usdFmt.format(Number(formatUnits(price, PRICE_DECIMALS)));
}

/** "0.00002" (USD per token) → V2 price units, or null if it doesn't parse. */
export function parsePriceUsd(value: string): bigint | null {
  const v = value.trim();
  if (!/^\d*\.?\d+$/.test(v)) return null;
  try {
    const p = parseUnits(v, PRICE_DECIMALS);
    return p > BigInt(0) ? p : null;
  } catch {
    return null;
  }
}

/** Market cap at a V2 price: price × total supply, in USD. */
export function marketCapUsd(price: bigint, totalSupply: bigint) {
  const cap = Number(formatUnits((price * totalSupply) / PRICE_DENOMINATOR, 6));
  return cap < 10_000
    ? `$${cap.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(cap);
}

export function toAuctionV2(raw: {
  token: `0x${string}`;
  creator: `0x${string}`;
  startTime: bigint;
  batchWindow: number;
  status: number;
  bidderCount: number;
  settledAt: bigint;
  pair: `0x${string}`;
  totalSupply: bigint;
  saleSupply: bigint;
  graduationTarget: bigint;
  floorPrice: bigint;
  maxAllocationPerWallet: bigint;
  totalDeposits: bigint;
  clearingPrice: bigint;
}): AuctionV2 {
  return { ...raw, startTime: Number(raw.startTime), settledAt: Number(raw.settledAt) };
}
