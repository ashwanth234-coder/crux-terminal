"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useTrustFacts, type CheckState } from "@/hooks/useTrustFacts";
import { TESTNET_EXPLORER } from "@/lib/chains";
import type { AuctionV2, BatchVersion } from "@/lib/launchV2";

function Mark({ state }: { state: CheckState }) {
  if (state === "pass") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-chrome/80" aria-label="Verified">
        <path d="m3.5 8.2 2.8 2.8 6.2-6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "fail") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-down" aria-label="Failed check">
        <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "loading") return <span className="h-3.5 w-3.5 shrink-0 animate-none rounded-full border border-line-2" aria-label="Checking" />;
  // Pending: enforced later by the contract, nothing to verify yet.
  return <span className="mx-[3px] h-2 w-2 shrink-0 rounded-full border border-chrome/40" aria-label="Not yet applicable" />;
}

/**
 * The CRUX trust dashboard: every row is read live from Base Sepolia (see useTrustFacts), not asserted.
 * Rows are compact by default; tapping one reveals how it was verified.
 */
export function SecurityBadges({ factory, auction, version }: { factory: Address; auction: AuctionV2; version: BatchVersion }) {
  const { checks } = useTrustFacts(factory, auction, version, TESTNET_EXPLORER);
  const [open, setOpen] = useState<string | null>(null);
  const passed = checks.filter((c) => c.state === "pass").length;

  return (
    <section aria-labelledby="trust-title" className="border-t border-line">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <h2 id="trust-title" className="text-[13px] font-medium text-chrome">
          Trust checks
        </h2>
        <span className="text-[11px] text-dim">
          <span className="font-mono">{passed}</span>/<span className="font-mono">{checks.length}</span> verified live
        </span>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {checks.map((c) => {
          const expanded = open === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : c.key)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <Mark state={c.state} />
                <span className="flex-1 text-[12.5px] text-muted">{c.label}</span>
                <span className={`text-right text-[12.5px] ${c.state === "fail" ? "text-down" : c.state === "pending" ? "text-chrome/70" : "text-chrome"}`}>
                  {c.value}
                </span>
              </button>
              {expanded && (
                <p className="px-4 pb-3 pl-[42px] text-[11.5px] leading-snug text-dim">
                  {c.detail}
                  {c.href && (
                    <>
                      {" "}
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-muted underline decoration-line-2 hover:text-chrome">
                        View on Basescan ↗
                      </a>
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
