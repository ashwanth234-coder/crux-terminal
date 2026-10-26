"use client";

import { useId, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { LaunchCard } from "@/components/launch/LaunchCard";
import { Shell } from "@/components/launch/LaunchView";
import { useAllLaunches, type LaunchSummary } from "@/hooks/useLaunches";
import { useNow } from "@/hooks/useLaunchAuction";
import { FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7 } from "@/lib/intents";
import { type Phase } from "@/lib/launch";
import { describeLaunch } from "@/lib/launchSummary";
import { launchKey, useWatchlist } from "@/lib/watchlist";

type Filter = "all" | "active" | "graduated" | "watchlist";
type Sort = "ending" | "newest" | "raised";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All launches" },
  { id: "active", label: "Active batches" },
  { id: "graduated", label: "Graduated" },
  { id: "watchlist", label: "Watchlist" },
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
  const { total, launches, loading, error } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("ending");
  const watchlist = useWatchlist();

  const rows: Row[] = launches.map((launch) => ({
    launch,
    phase: describeLaunch(launch, now).phase,
    closesAt: launch.auction.startTime + launch.auction.batchWindow,
  }));
  const counts: Record<Filter, number> = {
    all: rows.length,
    active: rows.filter((r) => r.phase === "open" || r.phase === "scheduled").length,
    graduated: rows.filter((r) => r.phase === "graduated").length,
    watchlist: rows.filter((r) => watchlist.has(launchKey(r.launch.version, r.launch.id))).length,
  };
  const matches = (r: Row) =>
    filter === "all"
      ? true
      : filter === "active"
        ? r.phase === "open" || r.phase === "scheduled"
        : filter === "watchlist"
          ? watchlist.has(launchKey(r.launch.version, r.launch.id))
          : r.phase === "graduated";
  const visible = sortRows(rows.filter(matches), sort);

  return (
    <Shell mode={FACTORY || FACTORY_V2 || FACTORY_V3 || FACTORY_V4 || FACTORY_V5 || FACTORY_V6 || FACTORY_V7 ? "live" : null}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label-mono">
            <span className="text-signal">01</span> / Discover
          </p>
          <h1 className="font-display mt-5 text-[clamp(2.4rem,5.4vw,4.4rem)] text-chrome">
            Every launch, <span className="text-steel">one price.</span>
          </h1>
          <p className="mt-4 max-w-[34rem] text-[14px] leading-relaxed text-muted">
            Each token sells its sale supply (60% on V2 and V3) in one batch window. Every filled bid clears at the same uniform
            price, so arriving first inside the window buys nothing. Base Sepolia testnet.
          </p>
        </div>
        <LaunchTokenButton className={buttonClass("signal", "md", "font-semibold")} />
      </div>

      {!FACTORY && !FACTORY_V2 && !FACTORY_V3 && !FACTORY_V4 && !FACTORY_V5 && !FACTORY_V6 && !FACTORY_V7 ? (
        <p className="mt-12 border-y border-line py-10 text-center text-[14px] text-muted">
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
                  className={`inline-flex h-9 items-center gap-2 rounded-[4px] border px-4 text-[12.5px] transition-colors ${
                    filter === f.id ? "border-signal/70 text-chrome" : "border-line text-muted hover:border-line-2 hover:text-chrome"
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
                className="h-9 rounded-[4px] border border-line bg-void px-3 text-[12.5px] text-chrome outline-none focus-visible:border-chrome/60"
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
                <li key={i} className="h-[300px] rounded-md border border-line" />
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <div className="mt-12 border-y border-line py-14 text-center">
              <p className="text-[15px] text-chrome">
                {total === 0
                  ? "No launches yet."
                  : filter === "active"
                    ? "No batch is open right now."
                    : filter === "watchlist"
                      ? "Your watchlist is empty."
                      : "No launches have graduated yet."}
              </p>
              <p className="mt-2 text-[13px] text-muted">
                {filter === "watchlist"
                  ? "Star a launch from its terminal header to keep it here. Stars stay in this browser."
                  : "Launch a token to open a uniform-price batch auction."}
              </p>
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
