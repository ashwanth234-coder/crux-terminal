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

/**
 * Batch factory generation: V2 (bidder list, max 200), V3 (1% price ticks, no bidder limit), V4 (V3 + the creator's
 * vesting choice), V5 (V4 + 24 hours of batch-only trading in CruxBatchPool after graduation), V6 (V5 with a
 * per-launch window, 15 minutes by default, in CruxBatchPoolV2).
 */
export type BatchVersion = 2 | 3 | 4 | 5 | 6 | 7;

/** V3 and V4 put bid limits on the same 1% price-tick grid (V4 is V3 plus the creator's vesting choice). */
export const usesTicks = (version: BatchVersion) => version >= 3;

/** CruxFactoryV3 prices limits on a grid 1% apart; a limit rounds down to its step. */
export const V3_TICK_STEP_PERCENT = 1;
/** CruxFactoryV3.TICK_COUNT: steps floor × 1.01^0 … floor × 1.01^2047. */
export const TICK_COUNT_V3 = 2048;

/**
 * V3's per-wallet cap in quote: maxAllocationPerWallet × floorPrice / 1e36, rounded up (CruxFactoryV3._maxDeposit).
 * Bidding never clears below the floor, so this much buys at most the token cap.
 */
export function maxDepositV3(a: Pick<AuctionV2, "maxAllocationPerWallet" | "floorPrice">) {
  const product = a.maxAllocationPerWallet * a.floorPrice;
  return (product + PRICE_DENOMINATOR - BigInt(1)) / PRICE_DENOMINATOR;
}

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

/** Batch windows offered at launch; the contract accepts anything from 30 seconds to 24 hours. */
export const V2_WINDOWS = [
  { seconds: 60, label: "60 sec" },
  { seconds: 300, label: "5 min" },
  { seconds: 3_600, label: "1 hour" },
  { seconds: 86_400, label: "24 hours" },
] as const;

/** "60-second", "5-minute", "1-hour", "24-hour". */
export function windowLabel(seconds: number) {
  if (seconds % 3_600 === 0) return `${seconds / 3_600}-hour`;
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60}-minute`;
  return `${seconds}-second`;
}

/** Fewest distinct wallets that can fill the sale under a per-wallet cap (as a % of the sale). */
export function buyersNeeded(capPercent: number) {
  return Math.ceil(100 / capPercent - 1e-9);
}

const PRICE_UNIT = BigInt(10) ** BigInt(36);

/**
 * What deposits must total for a launch to graduate: enough to buy the whole sale at the floor price. The factory
 * rounds the floor price up (it must never sell below the target), so this can be a base unit or so above
 * graduationTarget, and deposits of exactly the target then cancel. Seen live 2026-10-23: a 2 USDC target needed
 * 2.000001.
 */
export function graduationNeeds(a: Pick<AuctionV2, "saleSupply" | "floorPrice" | "graduationTarget">): bigint {
  const need = (a.saleSupply * a.floorPrice + PRICE_UNIT - BigInt(1)) / PRICE_UNIT;
  return need > a.graduationTarget ? need : a.graduationTarget;
}

/** USDC with all six decimals when it isn't a whole cent, so 2.000001 never shows as $2.00. */
export function fmtUsdcExact(units: bigint): string {
  if (units % BigInt(10_000) === BigInt(0)) return (Number(units) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (Number(units) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/** A share rounded down to one decimal, so a sale that is 99.99% covered never reads "100.0%". */
export const pctDown = (v: number) => (Math.floor(v * 10) / 10).toFixed(1);
