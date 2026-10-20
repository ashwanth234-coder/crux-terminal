import type { ReactNode } from "react";

export type RiskRow = {
  label: string;
  value: ReactNode;
  /** One line of plain-English context under the value. */
  hint?: string;
  tone?: "plain" | "caution" | "danger";
};

/**
 * Smart Risk Preview: the cold math of an order, shown before the button. Values are computed from the
 * same functions that execute (factory rules for bids, the solver's pool quote and the signed minimum for
 * intents), so what's shown is what's signed.
 */
export function RiskPreview({ rows, note }: { rows: RiskRow[]; note?: string }) {
  return (
    <section aria-label="Risk preview" className="rounded-lg border border-line bg-void/60">
      <p className="border-b border-line px-3 py-2 text-[11.5px] text-muted">Risk preview</p>
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[12px] text-muted">{r.label}</dt>
              <dd
                className={`min-w-0 text-right font-mono text-[12.5px] ${
                  r.tone === "danger" ? "text-down" : r.tone === "caution" ? "text-chrome" : "text-chrome/90"
                }`}
              >
                {r.value}
              </dd>
            </div>
            {r.hint && <p className="mt-0.5 text-[11px] leading-snug text-dim">{r.hint}</p>}
          </div>
        ))}
      </dl>
      {note && <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-dim">{note}</p>}
    </section>
  );
}

/** The always-on protection, stated as a fact rather than a switch. */
export function ProtectionRow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
      <svg viewBox="0 0 16 16" className="mt-px h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true">
        <path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4l5-2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="m5.6 8 1.7 1.7 3.1-3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
