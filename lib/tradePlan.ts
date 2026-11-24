/**
 * Ask Crux trade plans (docs/ask-crux-desk-phase1.md): a buy plus its exits, in the strict shape the server checks
 * again (crux-solver scripts/tradeplan.ts; keep the two in step). No language model: the presets are fixed templates
 * and the one-liner comes from their numbers. The coin is always the one Crux's own search found.
 */
import { z } from "zod";

export const MAX_TRADE_USD = 1_000;

const pct = z.number().min(1).max(100);
const LegId = z.string().regex(/^[a-z0-9-]{1,24}$/);

export const ExitLegSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("takeProfit"), id: LegId, sellPct: pct, atMultiple: z.number().gt(1).max(1_000) }),
  z.object({ kind: z.literal("stopLoss"), id: LegId, dropPct: z.number().min(1).max(95), breakevenAfter: LegId.optional() }),
  z.object({ kind: z.literal("trailing"), id: LegId, sellPct: pct, trailPct: z.number().min(1).max(90), armAfter: LegId.optional() }),
]);
export type ExitLeg = z.infer<typeof ExitLegSchema>;

export const PlanChainSchema = z.enum(["solana", "base", "bnb"]);
export type PlanChain = z.infer<typeof PlanChainSchema>;

export const TradePlanSchema = z.object({
  version: z.literal(1),
  preset: z.enum(["conservative", "balanced", "aggressive", "custom"]),
  chain: PlanChainSchema,
  coin: z.string().min(32).max(44),
  entryUsd: z.number().positive().max(MAX_TRADE_USD),
  exits: z.array(ExitLegSchema).max(6),
  rationale: z.string().max(280),
});
export type TradePlan = z.infer<typeof TradePlanSchema>;
export type Preset = Exclude<TradePlan["preset"], "custom">;

export const PRESET_NAMES: Record<Preset, string> = { conservative: "Conservative", balanced: "Balanced", aggressive: "Aggressive" };
export const PRESET_HINTS: Record<Preset, string> = {
  conservative: "Protect your money",
  balanced: "Get your stake back, let the rest run",
  aggressive: "Ride a runner",
};

/** The three preset exit sets: a trailing stop arms only after TP1 fills (founder's guardrail G1). */
export function presetExits(preset: Preset): ExitLeg[] {
  switch (preset) {
    case "conservative":
      return [
        { kind: "takeProfit", id: "tp1", sellPct: 75, atMultiple: 1.3 },
        { kind: "stopLoss", id: "sl", dropPct: 15, breakevenAfter: "tp1" },
      ];
    case "balanced":
      return [
        { kind: "takeProfit", id: "tp1", sellPct: 50, atMultiple: 2 },
        { kind: "trailing", id: "trail", sellPct: 50, trailPct: 20, armAfter: "tp1" },
        { kind: "stopLoss", id: "sl", dropPct: 25 },
      ];
    case "aggressive":
      return [
        { kind: "takeProfit", id: "tp1", sellPct: 25, atMultiple: 2 },
        { kind: "takeProfit", id: "tp2", sellPct: 25, atMultiple: 4 },
        { kind: "trailing", id: "trail", sellPct: 50, trailPct: 25, armAfter: "tp1" },
        { kind: "stopLoss", id: "sl", dropPct: 35 },
      ];
  }
}

/** One exit in plain words, for the card's list. Pure. */
export function describeExit(l: ExitLeg): string {
  if (l.kind === "takeProfit") return `Sell ${l.sellPct}% at ${l.atMultiple}x`;
  if (l.kind === "trailing") return `Then trail the other ${l.sellPct}%: sell if it falls ${l.trailPct}% from its high`;
  return `Floor: sell everything at about −${l.dropPct}%${l.breakevenAfter ? " (moves to breakeven once the first sale fills)" : ""}`;
}

/** A take-profit's name in plain words, by its place among the plan's sales: "the first sale", "the second sale"… */
export function saleName(id: string, exits: { kind: string; id: string }[]): string {
  const i = exits.filter((l) => l.kind === "takeProfit").findIndex((l) => l.id === id);
  return `the ${["first", "second", "third", "fourth", "fifth", "sixth"][i] ?? "first"} sale`;
}

/** The plan's one-liner, from its own numbers (the server writes the same). Pure. */
export function rationale(preset: TradePlan["preset"], exits: ExitLeg[]): string {
  const parts = exits.map((l) =>
    l.kind === "takeProfit"
      ? `sell ${l.sellPct}% at ${l.atMultiple}x`
      : l.kind === "trailing"
        ? `trail ${l.sellPct}% at ${l.trailPct}%${l.armAfter ? ` after ${saleName(l.armAfter, exits)}` : ""}`
        : `floor at about -${l.dropPct}%${l.breakevenAfter ? ` (moves to breakeven after ${saleName(l.breakevenAfter, exits)})` : ""}`,
  );
  const head = { conservative: "Conservative", balanced: "Balanced", aggressive: "Aggressive", custom: "Your plan" }[preset];
  const noStop = !exits.some((l) => l.kind === "stopLoss") ? " No stop-loss set." : "";
  return `${head}: ${parts.join(", ")}.${noStop}`.slice(0, 280);
}

/** A preset plan for one buy, checked against the schema (throws on a bad coin or size). Pure. */
export function presetPlan(preset: Preset, chain: PlanChain, coin: string, entryUsd: number): TradePlan {
  const exits = presetExits(preset);
  return TradePlanSchema.parse({ version: 1, preset, chain, coin, entryUsd, exits, rationale: rationale(preset, exits) });
}
