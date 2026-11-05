import type { PhaseV2 } from "@/lib/launchV2";

/**
 * What happens to a launch, in three plain steps, with the one it's on lit up: first-time buyers and creators see where
 * they are and what comes next without reading about auctions, batches or settlement.
 */
const STEPS = [
  { title: "Opens soon", note: "Buy now to get in at the start" },
  { title: "Fair opening", note: "Short window, one price for everyone" },
  { title: "Live", note: "Buy and sell any time" },
] as const;

/** The step a launch is on: the closing seconds and the price being set still read as the opening. */
export function stepOf(phase: PhaseV2): 0 | 1 | 2 | null {
  if (phase === "scheduled") return 0;
  if (phase === "open" || phase === "closed") return 1;
  if (phase === "graduated") return 2;
  return null;
}

export function LaunchSteps({ current, className = "" }: { current: 0 | 1 | 2 | null; className?: string }) {
  return (
    <ol aria-label="How a launch works" className={`grid grid-cols-3 gap-1.5 ${className}`}>
      {STEPS.map((s, i) => {
        const state = current === null ? "todo" : i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li
            key={s.title}
            aria-current={state === "now" ? "step" : undefined}
            className={`rounded-lg border px-2.5 py-2 ${state === "now" ? "border-signal/60 bg-signal/[0.06]" : "border-line"}`}
          >
            <p className={`flex items-center gap-1.5 text-[11.5px] ${state === "todo" ? "text-dim" : "text-chrome"}`}>
              <span
                aria-hidden="true"
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full font-mono text-[9.5px] ${
                  state === "done" ? "bg-up/20 text-up" : state === "now" ? "bg-signal text-void" : "border border-line-2 text-dim"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {s.title}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-dim">{s.note}</p>
          </li>
        );
      })}
    </ol>
  );
}
