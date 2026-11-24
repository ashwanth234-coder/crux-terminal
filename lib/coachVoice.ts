/**
 * Crux's voice (docs/superpowers/specs/2026-11-24-ask-crux-coach-design.md, "Voice"): warm, a bit funny, a bit of sass.
 * Every line is hand-written and picked by the moment, rotated so it doesn't repeat. No language model.
 * Guardrails (tested): after a loss only empathy, no jokes; after a loss never a nudge to trade again; never a promise.
 * The same file lives in crux-solver (scripts/coachvoice.ts) for the plan-sale pushes. Keep the two in step.
 */
export type Moment = "profitTaken" | "bigWin" | "floorSold" | "loss" | "rough" | "initials";

export const LINES: Record<Moment, string[]> = {
  profitTaken: ["Good job. Money in the bank beats money on a chart.", "Profit taken. Future you says thanks.", "Nice. Green is a good look on you."],
  bigWin: ["Look at you. Screenshot it, then set a floor.", "That's a proper win. Frame it, then protect the rest."],
  floorSold: ["Sorry, that one hurt. Your floor did its job and kept it small.", "Not the result you wanted. The floor kept the damage small, and that's the point of it."],
  loss: ["Sorry, that one didn't work out. Small losses are part of trading.", "That one's done. Taking a small loss early is a skill."],
  rough: ["Rough day. Nothing wrong with a break: the coins will still be here.", "Today's been tough. Stepping away for a bit is a good move."],
  initials: ["Took your initials: sold enough to get your {usd} back. The rest keeps riding.", "Initials out: your {usd} is back. Everything from here is a free ride."],
};

/** Which moment a finished trade is, or null for none. `lossesToday` counts this sale if it was a loss. Pure. */
export function momentOf(o: { side: "buy" | "sell"; pnlPct?: number; byFloor?: boolean; lossesToday: number }): Moment | null {
  if (o.side !== "sell" || o.pnlPct === undefined || !Number.isFinite(o.pnlPct)) return null;
  if (o.pnlPct < 0) return o.lossesToday >= 2 ? "rough" : o.byFloor ? "floorSold" : "loss";
  if (o.pnlPct >= 200) return "bigWin";
  return o.pnlPct > 0 ? "profitTaken" : null;
}

/** A line for the moment, rotated by `seed`, with {symbol} / {usd} filled in. Pure. */
export function voice(m: Moment, seed: number, vars: { symbol?: string; usd?: string } = {}): string {
  const ls = LINES[m];
  return ls[Math.abs(Math.floor(seed)) % ls.length].replace("{symbol}", vars.symbol ?? "it").replace("{usd}", vars.usd ?? "money");
}
