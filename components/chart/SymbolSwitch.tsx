"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { PHASE, search, type Hit } from "@/components/site/TokenSearch";
import { Popover, Tool } from "./ui";

/**
 * The chart's symbol button, as on a trading terminal: the current ticker, opening a search over every Crux launch
 * (trading ones listed first when the box is empty) that also opens any Base Sepolia token by its address.
 */
export function SymbolSwitch({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [wanted, setWanted] = useState(false);
  const feed = useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: Hit[] }).launches;
    },
    enabled: wanted,
    staleTime: 60_000,
  });
  const text = q.trim();
  const direct = isAddress(text, { strict: false });
  const hits = direct ? [] : text ? search(feed.data ?? [], text) : (feed.data ?? []).filter((l) => l.phase === "graduated").slice(0, 8);

  return (
    <Popover
      width="w-72"
      button={(open, toggle) => (
        <Tool
          label="Change symbol"
          active={open}
          onClick={() => {
            setWanted(true);
            toggle();
          }}
          className="px-2"
        >
          <span className="flex items-center gap-1 font-sans text-[12.5px] font-semibold text-chrome">
            {symbol}
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-dim" aria-hidden="true">
              <path d="m2 3.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
        </Tool>
      )}
    >
      {(close) => {
        const go = (href: string) => {
          close();
          setQ("");
          router.push(href);
        };
        return (
          <div className="flex flex-col gap-1 p-1">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (direct) go(`/token/${text}`);
                else if (hits[0]) go(`/launch/v${hits[0].version}/${hits[0].auctionId}`);
              }}
            >
              <label htmlFor="chart-symbol-search" className="sr-only">
                Ticker, name or 0x address
              </label>
              <input
                id="chart-symbol-search"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker, name or 0x address"
                className="w-full rounded-[4px] border border-line bg-void px-2 py-1.5 text-[12.5px] text-chrome outline-none placeholder:text-dim focus:border-line-2"
              />
            </form>
            {!text && <p className="px-1.5 pt-1 text-[10px] uppercase tracking-[0.14em] text-dim">Trading on Crux</p>}
            {direct ? (
              <button type="button" onClick={() => go(`/token/${text}`)} className="rounded-[3px] px-2 py-1.5 text-left text-[12px] text-chrome hover:bg-tint/[0.05]">
                Open {text.slice(0, 6)}…{text.slice(-4)}
              </button>
            ) : feed.isLoading ? (
              <p className="px-2 py-1.5 text-[12px] text-dim">Loading launches…</p>
            ) : hits.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-dim">{text ? "No Crux launch matches. Paste a token address to open any token." : "No launches yet."}</p>
            ) : (
              <ul className="flex flex-col">
                {hits.map((h) => (
                  <li key={h.key}>
                    <button
                      type="button"
                      onClick={() => go(`/launch/v${h.version}/${h.auctionId}`)}
                      className="flex w-full items-baseline justify-between gap-3 rounded-[3px] px-2 py-1.5 text-left hover:bg-tint/[0.05]"
                    >
                      <span className="min-w-0 truncate text-[12.5px] text-chrome">
                        ${h.symbol} <span className="text-dim">{h.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{PHASE[h.phase] ?? h.phase}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </Popover>
  );
}
