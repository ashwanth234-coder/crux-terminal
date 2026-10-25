"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { isAddress } from "viem";

type Hit = { key: string; version: number; auctionId: number; token: string; pool: string | null; name: string; symbol: string; phase: string };

/** Ticker / name matches first by how early they match, then newest first (the feed's own order). */
function search(launches: Hit[], q: string): Hit[] {
  const s = q.trim().replace(/^\$/, "").toLowerCase();
  if (!s) return [];
  const scored = launches.flatMap((l) => {
    const sym = l.symbol.toLowerCase();
    const name = l.name.toLowerCase();
    const score =
      sym === s ? 0 : sym.startsWith(s) ? 1 : name.startsWith(s) ? 2 : sym.includes(s) || name.includes(s) ? 3 : s.startsWith("0x") && (l.token.toLowerCase().startsWith(s) || l.pool?.toLowerCase().startsWith(s)) ? 4 : -1;
    return score < 0 ? [] : [{ l, score }];
  });
  return scored.sort((a, b) => a.score - b.score).slice(0, 8).map((x) => x.l);
}

const PHASE: Record<string, string> = { graduated: "Trading", open: "Auction live", scheduled: "Scheduled", closed: "Settling", cancelled: "Cancelled" };

/**
 * Top-bar token search: a ticker or name opens a dropdown of matching Crux launches; a full 0x contract address
 * (token or pool) jumps straight to /token/[address] on Enter or the button, without waiting for the list.
 */
export function TokenSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const uid = useId();
  const box = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [active, setActive] = useState(0);

  // Fetched on first focus (or keystroke), so pages that never search never read the feed.
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

  const q = value.trim();
  const direct = isAddress(q, { strict: false });
  const hits = direct ? [] : search(feed.data ?? [], q);

  const go = (href: string) => {
    setOpen(false);
    setValue("");
    box.current?.blur();
    router.push(href);
  };
  const submit = () => {
    if (direct) go(`/token/${q}`);
    else if (hits[active]) go(`/launch/v${hits[active].version}/${hits[active].auctionId}`);
  };

  return (
    <div className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <label htmlFor={uid} className="sr-only">
          Search a ticker or paste a contract address
        </label>
        <input
          ref={box}
          id={uid}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Ticker or 0x… address"
          value={value}
          onFocus={() => {
            setWanted(true);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setValue(e.target.value);
            setWanted(true);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              box.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={`${uid}-list`}
          aria-activedescendant={open && hits[active] ? `${uid}-${active}` : undefined}
          className="h-9 w-full min-w-0 rounded-lg border border-line bg-void/60 px-3 font-mono text-[12.5px] text-chrome outline-none placeholder:font-sans placeholder:text-dim focus:border-signal/60 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="submit"
          disabled={!direct && hits.length === 0}
          className="h-9 shrink-0 rounded-lg border border-line-2 px-3 text-[12px] text-muted transition-colors hover:border-chrome/60 hover:text-chrome disabled:opacity-40"
        >
          {direct ? "Open" : "Go"}
        </button>
      </form>

      {open && q.length > 0 && (direct || hits.length > 0 || feed.isFetching || feed.data) && (
        <ul
          id={`${uid}-list`}
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line-2 bg-panel shadow-xl"
        >
          {direct ? (
            <li className="px-3 py-2.5 text-[12px] text-muted">
              Press Enter to open <span className="font-mono text-chrome">{`${q.slice(0, 6)}…${q.slice(-4)}`}</span>
            </li>
          ) : hits.length > 0 ? (
            hits.map((h, i) => (
              <li
                key={h.key}
                id={`${uid}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/launch/v${h.version}/${h.auctionId}`)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${i === active ? "bg-white/[0.04]" : ""}`}
              >
                <span className="min-w-0">
                  <span className="text-[13px] text-chrome">${h.symbol || "TOKEN"}</span>{" "}
                  <span className="truncate text-[11.5px] text-dim">{h.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-dim">{PHASE[h.phase] ?? h.phase}</span>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-[12px] text-dim">{feed.isFetching ? "Loading launches…" : "No Crux launch matches"}</li>
          )}
        </ul>
      )}
    </div>
  );
}
