"use client";

import type { DeskCheck } from "@/hooks/useTradePlans";
import { describeExit, presetExits, PRESET_HINTS, PRESET_NAMES, rationale, TEST_FLOOR_EXITS, TEST_FLOOR_NAME, type Preset } from "@/lib/tradePlan";

/** "testFloor": TEMPORARY, for real-money Test 2 only (lib/tradePlan.ts TEST_FLOOR_EXITS). */
export type PlanChoice = Preset | "none" | "testFloor";

const TONE = {
  green: { box: "border-up/50", dot: "bg-up", word: "Looks fine" },
  amber: { box: "border-signal/60", dot: "bg-signal", word: "Worth a look" },
  red: { box: "border-down/60", dot: "bg-down", word: "Crux won't buy this" },
} as const;

/**
 * The plan part of Ask Crux's buy card (docs/ask-crux-desk-phase1.md): pick how to exit (Balanced by default), see the
 * exits in plain words, and the Desk Check: green / amber / red, read by Crux's server while the card is open. Red
 * means Confirm stays off. Nothing happens until the trader confirms.
 */
export function TradePlanSection({
  choice,
  onChoice,
  desk,
  deskLoading,
  deskError,
  locked,
  showDesk,
}: {
  /** Off while logged out: the Desk Check reads your cash, so it needs your account. */
  showDesk: boolean;
  choice: PlanChoice;
  onChoice: (c: PlanChoice) => void;
  desk?: DeskCheck;
  deskLoading: boolean;
  deskError: boolean;
  /** The buy is running or done: the choice can't change. */
  locked: boolean;
}) {
  const exits = choice === "none" ? [] : choice === "testFloor" ? TEST_FLOOR_EXITS : presetExits(choice);
  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="text-[12px] text-dim">After you buy, Crux sells for you:</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Exit plan">
          {(["conservative", "balanced", "aggressive", "none", "testFloor"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={choice === p}
              disabled={locked}
              onClick={() => onChoice(p)}
              className={`rounded-full border px-2.5 py-1 text-[12px] ${choice === p ? "border-chrome/70 bg-tint/[0.06] text-chrome" : "border-line text-muted hover:border-line-2"}`}
              title={p === "none" ? "Just buy. No automatic sells." : p === "testFloor" ? "Temporary, for testing a real stop-loss sale" : PRESET_HINTS[p]}
            >
              {p === "none" ? "No plan" : p === "testFloor" ? TEST_FLOOR_NAME : PRESET_NAMES[p]}
            </button>
          ))}
        </div>
        {choice !== "none" ? (
          <>
            <ul className="mt-2 space-y-0.5 text-[12.5px] text-muted">
              {exits.map((l) => (
                <li key={l.id}>• {describeExit(l)}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11.5px] text-dim">
              {rationale(choice === "testFloor" ? "custom" : choice, exits)} Prices are checked every 2 seconds, so in a fast drop a sale can land lower than the floor.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[12px] text-signal">No stop-loss set: pick a plan to add a floor (Balanced sells everything at about −25%).</p>
        )}
      </div>

      {showDesk && <DeskBanner desk={desk} loading={deskLoading} error={deskError} />}
    </div>
  );
}

function DeskBanner({ desk, loading, error }: { desk?: DeskCheck; loading: boolean; error: boolean }) {
  if (loading) return <p className="text-[12.5px] text-dim">Desk check: reading the market…</p>;
  if (error || !desk) return <p className="rounded-lg border border-signal/60 px-3 py-2 text-[12.5px] text-signal">{"Desk check couldn't finish. The usual buy check still applies."}</p>;
  const tone = TONE[desk.level];
  return (
    <div className={`rounded-lg border px-3 py-2 text-[12.5px] ${tone.box}`}>
      <p className="flex items-center gap-2 font-medium text-chrome">
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
        Desk check · {tone.word}
      </p>
      {desk.blockers.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-down">
          {desk.blockers.map((b) => (
            <li key={b}>✕ {b}</li>
          ))}
        </ul>
      )}
      <ul className="mt-1 space-y-0.5">
        {desk.lines.map((l) => (
          <li key={l.text} className={l.level === "amber" ? "text-signal" : "text-muted"}>
            {l.level === "amber" ? "⚠" : "✓"} {l.text}
          </li>
        ))}
      </ul>
      {desk.suggestedUsd !== undefined && <p className="mt-1 text-signal">A safer size here is about ${desk.suggestedUsd}.</p>}
      <p className="mt-1 text-[11.5px] text-dim">{desk.route}</p>
    </div>
  );
}
