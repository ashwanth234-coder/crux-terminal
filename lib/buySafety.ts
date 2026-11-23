/**
 * The check every buy goes through (coin pages, quick buys, Ask Crux): a coin's warning signs, split into what Crux
 * refuses to buy at all (it can't be sold back, or a sell is taxed away) and what the trader must see and accept first.
 * Nothing here can promise a coin won't be rugged; it makes sure no one buys a known trap, or buys blind.
 * Sources: Solana: Jupiter's token facts (lib/coinScan solanaWarnings); BNB Chain and Base: GoPlus (lib/tokenSafety).
 */
export type BuyCheck = {
  /** Reasons Crux won't buy it at all. */
  blocks: string[];
  /** Warning signs the trader must accept ("Buy anyway"). */
  warnings: string[];
  /** False when the coin couldn't be checked (then the trader is told, and must accept that too). */
  checked: boolean;
};

export const NOT_CHECKED = "Crux couldn't check this coin's safety yet";

/** Which warnings make a buy a trap: it can't be sold, a sell is mostly taxed, or balances can be changed. Pure. */
export function isBlocking(w: string): boolean {
  if (/can't be sold|can't sell everything|owner can change balances/i.test(w)) return true;
  const tax = w.match(/^sell tax (\d+)%/i);
  return tax !== null && Number(tax[1]) >= 30;
}

/** A coin's warnings split into blocks and warnings; `null` warnings: it couldn't be checked. Pure, for tests. */
export function classify(warnings: string[] | null, liquidity?: number): BuyCheck {
  if (warnings === null) return { blocks: [], warnings: [NOT_CHECKED], checked: false };
  const blocks = warnings.filter(isBlocking);
  const rest = warnings.filter((w) => !isBlocking(w));
  // A pool with almost nothing in it: a buy may not be sellable for anything near what it cost.
  if (liquidity !== undefined && liquidity < 1_000) blocks.push("Almost no money in its pool: you may not be able to sell");
  return { blocks, warnings: rest, checked: true };
}

/** Whether a buy can go ahead now: no blocks, and no unaccepted warnings. Pure. */
export const buyClear = (c: BuyCheck, accepted: boolean) => c.blocks.length === 0 && (c.warnings.length === 0 || accepted);
