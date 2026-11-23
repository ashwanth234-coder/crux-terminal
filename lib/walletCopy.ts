/**
 * Copy-trading a Solana wallet from the command bar ("when <wallet> buys a coin, buy $5 and sell when it sells"):
 * Crux reads the wallet's holdings from Jupiter's free API every few seconds while the page is open. A coin it didn't
 * hold before (or holds more of) is a buy; holding half or less of what it had after its buy is a sell. Read from the
 * browser (Jupiter allows cruxprotocol.xyz).
 */

/** Coins that are cash, not trades: never copied (SOL, wrapped SOL, USDC, USDT). */
export const NOT_COPIED = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

/** How often the wallet is read. */
export const COPY_EVERY_MS = 8_000;
/** The wallet "sold" once it holds this share (or less) of what it had right after its buy. */
export const SOLD_SHARE = 0.5;

/** The wallet's coins: mint → amount in base units (each mint's accounts added up). */
export type Holdings = Map<string, bigint>;

type JupHoldings = { tokens?: Record<string, { amount?: string }[]> };

/** One read of the wallet's coins, or null when Jupiter couldn't answer (the next read tries again). */
export async function holdingsOf(wallet: string): Promise<Holdings | null> {
  try {
    const r = await fetch(`https://lite-api.jup.ag/ultra/v1/holdings/${wallet}`);
    if (!r.ok) return null;
    const j = (await r.json()) as JupHoldings;
    const out: Holdings = new Map();
    for (const [mint, accounts] of Object.entries(j.tokens ?? {})) {
      const sum = (accounts ?? []).reduce((s, a) => s + BigInt(a.amount ?? "0"), BigInt(0));
      if (sum > BigInt(0)) out.set(mint, sum);
    }
    return out;
  } catch {
    return null;
  }
}

/** What the wallet did between two reads: coins it bought (or added to) and coins it holds less of. Pure. */
export function walletChanges(before: Holdings, after: Holdings): { bought: string[]; less: string[] } {
  const bought: string[] = [];
  const less: string[] = [];
  for (const [mint, amount] of after) {
    if (NOT_COPIED.has(mint)) continue;
    if (amount > (before.get(mint) ?? BigInt(0))) bought.push(mint);
  }
  for (const [mint, amount] of before) {
    if (NOT_COPIED.has(mint)) continue;
    if ((after.get(mint) ?? BigInt(0)) < amount) less.push(mint);
  }
  return { bought, less };
}

/** Whether the wallet has sold a coin: it holds SOLD_SHARE or less of what it had right after its buy. Pure. */
export function hasSold(peak: bigint, now: bigint): boolean {
  return now * BigInt(100) <= peak * BigInt(Math.round(SOLD_SHARE * 100));
}

export const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
