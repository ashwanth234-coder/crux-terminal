import { isStable } from "./solanaCoins.ts";
import type { ScanPool } from "./coinMarket.ts";

/**
 * The command bar's scan (lib/commandChat ScanRule): new Solana coins from Jupiter's free lists (newest launches and
 * the hour's most traded), each checked against fixed safety rules before it can be bought. Read from the browser.
 */
export type ScanCoin = {
  mint: string;
  symbol: string;
  name: string;
  price?: number;
  mcap?: number;
  liquidity?: number;
  /** Dollars traded in its last hour (buys + sells). */
  volume1h: number;
  createdAt: number;
  mintOff?: boolean;
  freezeOff?: boolean;
  creatorPct?: number;
  topHoldersPct?: number;
  organic?: string;
};

type Jup = {
  id: string;
  name?: string;
  symbol?: string;
  usdPrice?: number;
  mcap?: number;
  liquidity?: number;
  createdAt?: string;
  firstPool?: { createdAt?: string };
  organicScoreLabel?: string;
  stats1h?: { buyVolume?: number; sellVolume?: number };
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; devBalancePercentage?: number; topHoldersPercentage?: number };
};

/** The safety rules every scanned coin must pass (shown on the scan's card). */
export const SCAN_SAFETY = {
  minLiquidity: 10_000,
  maxCreatorPct: 20,
  maxTopHoldersPct: 60,
};
export const SCAN_SAFETY_TEXT = `Safety checks: nobody can print more or freeze coins, at least $${SCAN_SAFETY.minLiquidity / 1000}k in its pool, the creator holds under ${SCAN_SAFETY.maxCreatorPct}% and the top holders under ${SCAN_SAFETY.maxTopHoldersPct}%.`;

const toScan = (t: Jup): ScanCoin => ({
  mint: t.id,
  symbol: t.symbol ?? "",
  name: t.name ?? "",
  price: t.usdPrice,
  mcap: t.mcap,
  liquidity: t.liquidity,
  volume1h: (t.stats1h?.buyVolume ?? 0) + (t.stats1h?.sellVolume ?? 0),
  createdAt: Date.parse(t.firstPool?.createdAt ?? t.createdAt ?? "") || 0,
  mintOff: t.audit?.mintAuthorityDisabled,
  freezeOff: t.audit?.freezeAuthorityDisabled,
  creatorPct: t.audit?.devBalancePercentage,
  topHoldersPct: t.audit?.topHoldersPercentage,
  organic: t.organicScoreLabel,
});

/** Why a coin fails the scan's rules, in plain words, or null when it passes. Pure, for tests. */
export type AgeRule = { minVolume: number; maxAgeHours: number; minAgeHours?: number };

/** The age, trading and money rules every chain shares. Pure. */
function marketRefusal(c: { createdAt?: number; volume1h: number; liquidity?: number; price?: number; symbol: string }, rule: AgeRule, now: number): string | null {
  if (!c.createdAt || now - c.createdAt > rule.maxAgeHours * 3_600_000) return "too old";
  if (now - c.createdAt < (rule.minAgeHours ?? 0) * 3_600_000) return "too new";
  if (isStable(c.symbol)) return "a stablecoin";
  if (c.volume1h < rule.minVolume) return "not enough trading";
  if ((c.liquidity ?? 0) < SCAN_SAFETY.minLiquidity) return "too little in its pool";
  if (!(c.price && c.price > 0)) return "no price yet";
  return null;
}

/**
 * A Base or BNB Chain coin's age, trading and pool rules (its code is checked next, by GoPlus, before it's bought).
 * Pure, for tests.
 */
export function evmScanRefusal(c: ScanPool, rule: AgeRule, now: number): string | null {
  return marketRefusal(c, rule, now);
}

/** The Base/BNB coins that pass the market rules, most traded first (then checked for warning signs). Pure. */
export function evmCandidates(list: ScanPool[], rule: AgeRule, now: number, skip: Set<string> = new Set()): ScanPool[] {
  return list.filter((c) => !skip.has(c.address.toLowerCase()) && evmScanRefusal(c, rule, now) === null).sort((a, b) => b.volume1h - a.volume1h);
}

export function scanRefusal(c: ScanCoin, rule: AgeRule, now: number): string | null {
  const market = marketRefusal(c, rule, now);
  if (market === "too old" || market === "too new" || market === "a stablecoin" || market === "not enough trading") return market;
  if (c.mintOff !== true) return "more can be printed";
  if (c.freezeOff !== true) return "coins can be frozen";
  if ((c.liquidity ?? 0) < SCAN_SAFETY.minLiquidity) return "too little in its pool";
  if ((c.creatorPct ?? 0) >= SCAN_SAFETY.maxCreatorPct) return "the creator holds too much";
  if ((c.topHoldersPct ?? 0) >= SCAN_SAFETY.maxTopHoldersPct) return "a few wallets hold too much";
  if (!(c.price && c.price > 0)) return "no price yet";
  return null;
}

/** The coins worth a look now: the newest launches and the hour's most traded, each once. */
export async function scanSolana(): Promise<ScanCoin[]> {
  const read = async (path: string) => {
    try {
      const r = await fetch(`https://lite-api.jup.ag/tokens/v2/${path}`);
      const j = r.ok ? ((await r.json()) as Jup[]) : [];
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  };
  const [recent, traded] = await Promise.all([read("recent"), read("toptraded/1h?limit=100")]);
  const seen = new Set<string>();
  return [...recent, ...traded].filter((t) => t.id && !seen.has(t.id) && seen.add(t.id)).map(toScan);
}

/** One Solana coin's facts and safety signs by its mint (for a pasted address), or null when Jupiter doesn't know it. */
export async function solanaFacts(mint: string): Promise<ScanCoin | null> {
  try {
    const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`);
    const hit = r.ok ? ((await r.json()) as Jup[]).find((t) => t.id === mint) : undefined;
    return hit ? toScan(hit) : null;
  } catch {
    return null;
  }
}

/** A Solana coin's warning signs in plain words (the same rules a scan applies). Pure. */
export function solanaWarnings(c: ScanCoin): string[] {
  const w: string[] = [];
  if (c.mintOff === false) w.push("More can be printed");
  if (c.freezeOff === false) w.push("Coins can be frozen");
  if ((c.liquidity ?? 0) < SCAN_SAFETY.minLiquidity) w.push("Little money in its pool");
  if ((c.creatorPct ?? 0) >= SCAN_SAFETY.maxCreatorPct) w.push(`Creator holds ${Math.round(c.creatorPct ?? 0)}%`);
  if ((c.topHoldersPct ?? 0) >= SCAN_SAFETY.maxTopHoldersPct) w.push(`Top holders own ${Math.round(c.topHoldersPct ?? 0)}%`);
  return w;
}

/** The best coin that passes: the most traded in its last hour. Pure, for tests. */
export function pickScanCoin(list: ScanCoin[], rule: AgeRule, now: number, skip: Set<string> = new Set()): ScanCoin | null {
  return list.filter((c) => !skip.has(c.mint) && scanRefusal(c, rule, now) === null).sort((a, b) => b.volume1h - a.volume1h)[0] ?? null;
}
