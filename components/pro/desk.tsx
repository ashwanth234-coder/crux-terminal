"use client";

import type { Address } from "viem";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { WHALE_SUPPLY_PCT, type HolderTag } from "@/lib/holders";

/** Shared pieces of the desk's tables (Swaps, Holders, Top traders). */

export const th = "px-3 py-2 text-left text-[11px] font-normal text-dim";
export const td = "px-3 py-1.5 text-[12px]";
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Signed USDC, testnet-sized: cents to 2 places, smaller amounts to 3 significant digits. */
export function pnlUsd(v: number): string {
  const a = Math.abs(v);
  const body = a >= 1_000 ? a.toLocaleString("en-US", { maximumFractionDigits: 0 }) : a >= 0.01 ? a.toFixed(2) : a === 0 ? "0" : a.toPrecision(2);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}$${body}`;
}

export const pnlTone = (v: number | null) => (v === null || Math.abs(v) < 1e-9 ? "text-dim" : v > 0 ? "text-up" : "text-down");

export type DeskTag = HolderTag | "top";

const TAG: Record<DeskTag, { label: string; title: string }> = {
  you: { label: "You", title: "Your connected wallet" },
  creator: { label: "Dev", title: "Launched this token" },
  whale: { label: "Whale", title: `Holds more than ${WHALE_SUPPLY_PCT}% of supply` },
  top: { label: "Top 10", title: "One of the ten largest holders" },
  pool: { label: "Pool", title: "The locked Uniswap V2 pool or the batch pool" },
  auction: { label: "Auction", title: "The launch factory: unclaimed sale tokens and creator vesting" },
  solver: { label: "Solver", title: "Crux solver inventory used to fill intents" },
  settler: { label: "Settler", title: "A Crux settler (intent escrow)" },
  burn: { label: "Burned", title: "0x…dEaD: can never move" },
};

export function Tags({ tags }: { tags: DeskTag[] }) {
  return (
    <>
      {tags.map((t) => (
        <span
          key={t}
          title={TAG[t].title}
          className={`rounded-[3px] border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] ${
            t === "you" ? "border-signal/60 text-chrome" : t === "creator" ? "border-[#c792ea]/60 text-[#c792ea]" : t === "whale" ? "border-[#4cc9f0]/50 text-[#4cc9f0]" : t === "top" ? "border-[#ffd166]/40 text-[#ffd166]/90" : "border-line text-dim"
          }`}
        >
          {TAG[t].label}
        </span>
      ))}
    </>
  );
}

/**
 * A trader's address: clicking it filters the desk and the chart's marks to that wallet (clicking again clears it);
 * the arrow opens it on the explorer.
 */
export function Trader({ address, label, focused, onFocus, me }: { address: Address; label?: string; focused: boolean; onFocus?: (a: Address | null) => void; me?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {me && <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />}
      {onFocus ? (
        <button
          type="button"
          onClick={() => onFocus(focused ? null : address)}
          title={focused ? "Clear the filter" : "Show only this wallet's trades, here and on the chart"}
          className={`rounded-[3px] px-0.5 font-mono transition-colors ${focused ? "bg-[#ff9d6e]/15 text-[#ff9d6e]" : me ? "text-chrome hover:text-[#ff9d6e]" : "text-muted hover:text-[#ff9d6e]"}`}
        >
          {label ?? short(address)}
        </button>
      ) : (
        <span className={`font-mono ${me ? "text-chrome" : "text-muted"}`}>{label ?? short(address)}</span>
      )}
      <a href={`${TESTNET_EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer" aria-label="Open on the explorer" className="text-dim hover:text-chrome">
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
          <path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </a>
    </span>
  );
}

/** The active wallet filter, shown above a desk table. */
export function FocusChip({ focus, onFocus }: { focus: Address; onFocus: (a: Address | null) => void }) {
  return (
    <button
      type="button"
      onClick={() => onFocus(null)}
      className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#ff9d6e]/50 bg-[#ff9d6e]/10 px-2 py-0.5 font-mono text-[11px] text-[#ff9d6e] hover:bg-[#ff9d6e]/20"
      title="Clear the wallet filter"
    >
      {short(focus)} <span aria-hidden="true">×</span>
    </button>
  );
}
