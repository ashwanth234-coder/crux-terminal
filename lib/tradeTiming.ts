/**
 * Click-to-candle timing for a trade, by its pending-trade id, printed as a console.table in DevTools once its real
 * candle is drawn (or it's dropped another way): how long each step took from the click, in milliseconds
 * (performance.now()). No UI; nothing is sent anywhere.
 */
type Step = "click" | "pendingAdded" | "canvasDrawnPending" | "relayReturned" | "realCandleDrawn";
const STEPS: Step[] = ["click", "pendingAdded", "canvasDrawnPending", "relayReturned", "realCandleDrawn"];

const runs = new Map<number, { label: string; at: Partial<Record<Step, number>> }>();

/** Starts a trade's timeline (its click), under the pending trade's id. */
export function timingStart(id: number, label: string, clickAt: number) {
  runs.set(id, { label, at: { click: clickAt } });
}

/** Records `step` for trade `id` now (once: the first time counts). */
export function timingMark(id: number, step: Step) {
  const r = runs.get(id);
  if (!r || r.at[step] !== undefined) return;
  r.at[step] = performance.now();
  if (step === "realCandleDrawn") timingPrint(id);
}

/** Prints trade `id`'s timeline and forgets it: each step's time since the click and since the step before. */
export function timingPrint(id: number) {
  const r = runs.get(id);
  if (!r) return;
  runs.delete(id);
  const t0 = r.at.click ?? 0;
  let prev = t0;
  const rows = STEPS.map((s) => {
    const at = r.at[s];
    const row = { step: s, "ms since click": at === undefined ? "—" : Math.round(at - t0), "ms since previous": at === undefined ? "—" : Math.round(at - prev) };
    if (at !== undefined) prev = at;
    return row;
  });
  console.log(`[crux timing] ${r.label}`);
  console.table(rows);
}
