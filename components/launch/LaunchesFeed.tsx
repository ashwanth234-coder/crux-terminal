"use client";

import { useId, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { LaunchCard } from "@/components/launch/LaunchCard";
import { Shell } from "@/components/launch/LaunchView";
import { useAllLaunches, type LaunchSummary } from "@/hooks/useLaunches";
import { useNow } from "@/hooks/useLaunchAuction";
import { FACTORY, FACTORY_V2, FACTORY_V3 } from "@/lib/intents";
import { type Phase } from "@/lib/launch";
import { describeLaunch } from "@/lib/launchSummary";

type Filter = "all" | "active" | "graduated";
type Sort = "ending" | "newest" | "raised";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All launches" },
  { id: "active", label: "Active batches" },
  { id: "graduated", label: "Graduated" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "ending", label: "Ending soonest" },
  { id: "newest", label: "Newest" },
  { id: "raised", label: "Highest raised" },
];

type Row = { launch: LaunchSummary; phase: Phase; closesAt: number };

function sortRows(rows: Row[], sort: Sort) {
  const sorted = [...rows];
  if (sort === "newest") return sorted.sort((a, b) => b.launch.version - a.launch.version || b.launch.id - a.launch.id);
  if (sort === "raised")
    return sorted.sort((a, b) => {
      const diff = b.launch.auction.totalDeposits - a.launch.auction.totalDeposits;
      return diff === BigInt(0) ? b.launch.version - a.launch.version || b.launch.id - a.launch.id : diff > BigInt(0) ? 1 : -1;
    });
  // Ending soonest: open windows by time left, then everything else newest first.
  return sorted.sort((a, b) => {
    const aOpen = a.phase === "open";
    const bOpen = b.phase === "open";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return aOpen ? a.closesAt - b.closesAt : b.launch.version - a.launch.version || b.launch.id - a.launch.id;
  });
}

export function LaunchesFeed() {
  const uid = useId();
  const now = useNow();
  const { total, launches, loading, error } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("ending");

  const rows: Row[] = launches.map((launch) => ({
    launch,
    phase: describeLaunch(launch, now).phase,
    closesAt: launch.auction.startTime + launch.auction.batchWindow,
  }));
  const counts: Record<Filter, number> = {
    all: rows.length,
    active: rows.filter((r) => r.phase === "open" || r.phase === "scheduled").length,
    graduated: rows.filter((r) => r.phase === "graduated").length,
  };
  const visible = sortRows(
    rows.filter((r) => filter === "all" || (filter === "active" ? r.phase === "open" || r.phase === "scheduled" : r.phase === "graduated")),
    sort,
  );

  return (
    <Shell mode={FACTORY || FACTORY_V2 || FACTORY_V3 ? "live" : null}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display-md text-[clamp(2rem,5vw,3.4rem)] leading-[0.95] text-chrome">
            Every launch, <span className="text-steel">one price.</span>
          </h1>
          <p className="mt-3 max-w-[34rem] text-[14px] leading-relaxed text-muted">
            Each token sells 80% of its supply in a sealed window. Every buyer clears at the same uniform price, so arriving first
            buys nothing.
          </p>
        </div>
        <LaunchTokenButton className={buttonClass("acid", "md", "font-semibold")} />
      </div>

      {!FACTORY && !FACTORY_V2 && !FACTORY_V3 ? (
        <p className="mt-12 rounded-2xl border border-line p-8 text-center text-[14px] text-muted">
          This build has no Crux factory configured (NEXT_PUBLIC_CRUX_FACTORY), so there are no on-chain launches to list.
        </p>
      ) : (
        <>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
            <div role="group" aria-label="Filter launches" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[12.5px] transition-colors ${
                    filter === f.id ? "border-chrome/60 bg-line-2 text-chrome" : "border-line text-muted hover:text-chrome"
                  }`}
                >
                  {f.label}
                  <span className="font-mono text-[11px] tabular-nums text-dim">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`${uid}-sort`} className="text-[12px] text-muted">
                Sort
              </label>
              <select
                id={`${uid}-sort`}
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-9 rounded-full border border-line bg-void px-3 text-[12.5px] text-chrome outline-none focus-visible:border-chrome/60"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-10 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-[13px] text-down">
              Couldn&apos;t read launches from Base Sepolia. Retrying…
            </p>
          ) : loading ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading launches">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-[300px] rounded-2xl border border-line bg-panel/40" />
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <div className="mt-12 rounded-2xl border border-line p-10 text-center">
              <p className="text-[15px] text-chrome">
                {total === 0
                  ? "No launches yet."
                  : filter === "active"
                    ? "No batch is open right now."
                    : "No launches have graduated yet."}
              </p>
              <p className="mt-2 text-[13px] text-muted">Launch a token to open a 60-second uniform-price batch.</p>
            </div>
          ) : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((r) => (
                <li key={`${r.launch.version}-${r.launch.id}`}>
                  <LaunchCard launch={r.launch} phase={r.phase} now={now} />
                </li>
              ))}
            </ul>
          )}
          {total > launches.length && !loading && (
            <p className="mt-6 text-center text-[12px] text-dim">Showing the newest {launches.length} of {total}. Open older auctions by id above.</p>
          )}
        </>
      )}
    </Shell>
  );
}
