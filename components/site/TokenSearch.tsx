"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { isAddress } from "viem";
import { PHASE_WORDS } from "@/lib/phaseWords";
import { fmtPrice, isSolanaAddress, searchSolanaCoins } from "@/lib/solanaCoins";
import { chainOf0x, searchBnbCoins } from "@/lib/bnbCoins";
import { findShowcase, showcasePath } from "@/lib/showcase";

export type Hit = { key: string; version: number; auctionId: number; token: string; pool: string | null; name: string; symbol: string; phase: string };

/** Ticker / name matches first by how early they match, then newest first (the feed's own order). */
export function search(launches: Hit[], q: string): Hit[] {
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

export const PHASE: Record<string, string> = PHASE_WORDS;

/** One row of the search list: a Crux launch (Base) or a Solana coin, opened the same way. */
type Row = { key: string; href: string; symbol: string; name: string; chain: "Base" | "Solana" | "BNB"; right: string };

/**
 * Top-bar token search, every chain in one list (one account trades them all): Crux launches on Base and Solana coins
 * (Jupiter's verified list), each with a small chain badge and nothing else about chains. A full 0x address jumps to
 * /token/[address]; a full Solana address to /sol/[mint].
 */
export function TokenSearch({ className = "", autoFocus = false, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
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
  // Any of the showcase coin's three addresses opens its showcase page.
  const showcase = findShowcase(q);
  const direct = showcase ? showcasePath(showcase) : isAddress(q, { strict: false }) ? `/token/${q}` : isSolanaAddress(q) ? `/sol/${q}` : null;
  const solana = useQuery({
    queryKey: ["solana-search", q.toLowerCase()],
    queryFn: () => searchSolanaCoins(q),
    enabled: wanted && !direct && q.replace(/^\$/, "").length >= 2,
    staleTime: 60_000,
  });
  const bnb = useQuery({
    queryKey: ["bnb-search", q.toLowerCase()],
    queryFn: () => searchBnbCoins(q),
    enabled: wanted && !direct && q.replace(/^\$/, "").length >= 2,
    staleTime: 60_000,
  });
  const hits: Row[] = direct
    ? []
    : [
        ...search(feed.data ?? [], q).map((h) => ({
          key: h.key,
          href: `/launch/v${h.version}/${h.auctionId}`,
          symbol: h.symbol || "TOKEN",
          name: h.name,
          chain: "Base" as const,
          right: PHASE[h.phase] ?? h.phase,
        })),
        ...(solana.data ?? []).map((c) => ({
          key: `sol:${c.mint}`,
          href: `/sol/${c.mint}`,
          symbol: c.symbol || "COIN",
          name: c.name,
          chain: "Solana" as const,
          right: c.price !== undefined ? fmtPrice(c.price) : "",
        })),
        ...(bnb.data ?? []).map((c) => ({
          key: `bnb:${c.address}`,
          href: `/bnb/${c.address}`,
          symbol: c.symbol || "COIN",
          name: c.name,
          chain: "BNB" as const,
          right: c.price !== undefined ? fmtPrice(c.price) : "",
        })),
      ];

  const go = (href: string) => {
    setOpen(false);
    setValue("");
    // The search box has focus whenever a result is picked; blurring what's focused closes the keyboard on phones.
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(href);
    onDone?.();
  };
  /** A full address: Solana's opens its coin; a 0x one opens on BNB Chain when that's where it trades, else on Base. */
  const goAddress = async (address: string) => {
    const sc = findShowcase(address);
    if (sc) return go(showcasePath(sc));
    if (isSolanaAddress(address)) return go(`/sol/${address}`);
    go((await chainOf0x(address)) === "bnb" ? `/bnb/${address}` : `/token/${address}`);
  };
  const submit = () => {
    if (direct) void goAddress(q);
    else if (hits[active]) go(hits[active].href);
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
          placeholder="Search or paste a coin address"
          value={value}
          autoFocus={autoFocus}
          onPaste={(e) => {
            // A pasted contract address opens its coin at once: no list, no Enter.
            const pasted = e.clipboardData.getData("text").trim();
            if (isAddress(pasted, { strict: false }) || isSolanaAddress(pasted)) {
              e.preventDefault();
              void goAddress(pasted);
            }
          }}
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
          className="h-9 w-full min-w-0 rounded-lg border border-line bg-void/60 px-3 font-mono text-[12.5px] text-chrome outline-none placeholder:font-sans placeholder:text-dim focus:border-chrome/50 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="submit"
          disabled={!direct && hits.length === 0}
          className="sr-only focus:not-sr-only focus:h-9 focus:shrink-0 focus:rounded-lg focus:border focus:border-line-2 focus:px-3 focus:text-[12px] focus:text-chrome"
        >
          {direct ? "Open" : "Go"}
        </button>
      </form>

      {open && q.length > 0 && (direct || hits.length > 0 || feed.isFetching || solana.isFetching || bnb.isFetching || feed.data) && (
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
                onClick={() => go(h.href)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${i === active ? "bg-tint/[0.04]" : ""}`}
              >
                <span className="min-w-0 truncate">
                  <span className="text-[13px] text-chrome">${h.symbol}</span>{" "}
                  <span className="text-[11.5px] text-dim">{h.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10.5px] text-dim">{h.right}</span>
                  <span className="rounded border border-line px-1.5 py-px text-[9.5px] uppercase tracking-[0.1em] text-muted">{h.chain}</span>
                </span>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-[12px] text-dim">{feed.isFetching || solana.isFetching || bnb.isFetching ? "Searching…" : "No coin matches"}</li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Search on a phone (or any screen too narrow for the header's box): a search button that opens a full-width search
 * bar under the header. Pasting an address there opens the coin straight away, as on desktop.
 */
export function MobileSearch({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Search coins"
        className={`grid h-9 w-9 place-items-center rounded-[4px] border border-line-2 text-chrome ${className}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-x-0 top-14 z-[90] border-b border-line bg-panel px-4 py-3">
          <TokenSearch autoFocus onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
