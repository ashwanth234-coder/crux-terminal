/**
 * The coach's review when Ask Crux opens (docs/superpowers/specs/2026-11-24-ask-crux-coach-design.md): the page's six
 * rules over what the trader holds, plus the server's alerts of the last day, cut to one card per coin (capCards). Pure.
 */
import { capCards, concentration, deadBags, idleCash, noFloor, oversized, pullback, quiet, type Card, type CoinRef } from "./coach.ts";

export type ReviewRow = {
  coin: CoinRef;
  /** Whole coins held. */
  held: number;
  /** USD per whole coin now, and the average paid (Crux's record), when known. */
  price?: number;
  entry?: number;
  /** The cash in the coin's market (Solana coins' facts). */
  marketCash?: number;
  /** How long since the coin was bought through Crux. */
  heldMs?: number;
  /** An open plan with a floor, or a pending stop-loss order. */
  hasFloor: boolean;
};

export type ReviewInput = {
  rows: ReviewRow[];
  cashUsd: number;
  /** Each watched coin's highest price since the buy, by "chain:address" (from /v1/coach/cards). */
  peaks: Record<string, number>;
  /** The server's alerts of the last day (/v1/coach/cards). */
  server: Card[];
  /** When the trader dismissed a card, by "rule|chain:address" ("rule|" for portfolio cards). */
  dismissed: Record<string, number>;
  boughtThisSession: boolean;
  lossesToday: number;
  now: number;
};

export const coinKey = (c: CoinRef) => `${c.chain}:${c.chain === "solana" ? c.address : c.address.toLowerCase()}`;
export const dismissKey = (c: Card) => `${c.rule}|${c.coin ? coinKey(c.coin) : ""}`;

export function reviewCards(i: ReviewInput): Card[] {
  const priced = i.rows.filter((r) => r.price !== undefined && Number.isFinite(r.price));
  const value = (r: ReviewRow) => r.held * r.price!;
  const totalUsd = i.cashUsd + priced.reduce((s, r) => s + value(r), 0);
  const cards: (Card | null)[] = [...i.server];
  for (const r of priced) {
    cards.push(oversized({ coin: r.coin, valueUsd: value(r), marketCash: r.marketCash }, i.now));
    cards.push(pullback({ coin: r.coin, price: r.price, peak: i.peaks[coinKey(r.coin)] }, i.now));
    cards.push(noFloor({ coin: r.coin, valueUsd: value(r), hasFloor: r.hasFloor }, i.now));
    cards.push(concentration({ coin: r.coin, valueUsd: value(r), totalUsd }, i.now));
  }
  cards.push(
    deadBags(
      { coins: priced.map((r) => ({ coin: r.coin, valueUsd: value(r), heldMs: r.heldMs, pnlPct: r.entry ? (r.price! / r.entry - 1) * 100 : undefined, marketCash: r.marketCash })) },
      i.now,
    ),
  );
  cards.push(idleCash({ cashUsd: i.cashUsd, totalUsd, boughtThisSession: i.boughtThisSession, lossesToday: i.lossesToday }, i.now));
  return capCards(cards.filter((c): c is Card => c !== null && !quiet(c.rule, i.dismissed[dismissKey(c)], i.now)));
}

/** "Take initials": the share of the holding (percent, rounded up) that sells back what was paid; null when not up. */
export function initialsShare(paidUsd: number, valueUsd: number): number | null {
  if (!(paidUsd > 0) || !(valueUsd > paidUsd)) return null;
  return Math.min(100, Math.ceil((paidUsd / valueUsd) * 100));
}
