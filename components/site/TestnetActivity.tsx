"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@/components/ui/Button";
import { useNow } from "@/hooks/useLaunchAuction";
import { useTestnetActivity, type Activity } from "@/hooks/useTestnetActivity";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { SETTLER } from "@/lib/intents";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ago(seconds: number) {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function describe(a: Activity): { title: string; detail: string; outcome: boolean } {
  const who = a.account ? short(a.account) : "";
  switch (a.kind) {
    case "intent-opened":
      return { title: "Intent opened", detail: `${a.usdc} USDC escrowed by ${who}`, outcome: false };
    case "intent-filled":
      return { title: "Intent filled", detail: `${a.usdc} USDC released to solver ${who}`, outcome: true };
    case "intent-refunded":
      return { title: "Intent refunded", detail: `${a.usdc} USDC returned to ${who}`, outcome: false };
    case "launch-created":
      return { title: `Launch #${a.auctionId} created`, detail: `Graduates at ${a.usdc} USDC`, outcome: false };
    case "launch-deposit":
      return { title: `Deposit · launch #${a.auctionId}`, detail: `${a.usdc} USDC from ${who}`, outcome: false };
    case "launch-settled":
      return { title: `Launch #${a.auctionId} settled`, detail: "One uniform price fixed for every buyer", outcome: true };
  }
}

function Row({ item, now }: { item: Activity; now: number | null }) {
  const { title, detail, outcome } = describe(item);
  const internal = item.auctionId !== null;
  const href = internal ? `/launch/${item.auctionId}` : `${TESTNET_EXPLORER}/tx/${item.tx}`;
  const body = (
    <>
      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${outcome ? "bg-acid" : "bg-chrome/35"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-chrome">{title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted">{detail}</span>
      </span>
      <span className="shrink-0 pt-px font-mono text-[11.5px] text-dim">
        {item.time !== null && now !== null ? ago(Math.max(0, now - item.time)) : ""}
      </span>
    </>
  );
  const cls = "flex items-start gap-3 rounded-lg px-3 py-3 transition-colors duration-200 hover:bg-white/[0.025]";
  return (
    <li>
      {internal ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${title}, view transaction on Basescan`}>
          {body}
        </a>
      )}
    </li>
  );
}

/**
 * The hero's proof: the newest real events from the Crux contracts on Base
 * Sepolia, never a simulated feed. Honest loading, error and empty states.
 */
export function TestnetActivity({ className = "" }: { className?: string }) {
  const now = useNow();
  const { configured, items, loading, error } = useTestnetActivity();

  return (
    <section aria-labelledby="activity-title" className={`rounded-2xl border border-line bg-panel ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5">
        <div>
          <h2 id="activity-title" className="text-[15px] font-medium text-chrome">
            Live on Base Sepolia
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">Real events from the Crux contracts, last 24 hours.</p>
        </div>
        <span className="shrink-0 rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-muted">Testnet</span>
      </div>

      <div className="px-2 py-2">
        {!configured ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted">No Crux contracts are configured for this build.</p>
        ) : loading ? (
          <ul aria-busy="true" aria-label="Reading Base Sepolia">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-3">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-line-2" />
                <span className="flex-1 space-y-2 pt-0.5">
                  <span className="block h-3 w-28 rounded bg-line" />
                  <span className="block h-2.5 w-44 rounded bg-line/70" />
                </span>
              </li>
            ))}
          </ul>
        ) : error && items.length === 0 ? (
          <p role="status" className="px-3 py-8 text-center text-[13px] text-muted">
            Couldn&apos;t reach Base Sepolia. Retrying every 30 seconds.
          </p>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[13.5px] text-chrome">Quiet for the last 24 hours.</p>
            <p className="mt-1 text-[12.5px] text-muted">Open an intent or launch a token to see it land here.</p>
          </div>
        ) : (
          <ul aria-live="polite">
            {items.map((item) => (
              <Row key={item.key} item={item} now={now} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-[12px]">
        {configured && (
        <a
          href={`${TESTNET_EXPLORER}/address/${SETTLER}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 text-muted transition-colors hover:text-chrome"
        >
          Settler <span className="font-mono">{short(SETTLER)}</span>
          <ArrowUpRight className="h-3 w-3" />
        </a>
        )}
        <Link href="/launches" className="group inline-flex items-center gap-1.5 text-chrome/80 transition-colors hover:text-chrome">
          All launches <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
