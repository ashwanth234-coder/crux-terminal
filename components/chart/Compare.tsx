"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, type Address } from "viem";
import { useAllLaunches } from "@/hooks/useLaunches";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { toCandles, type Candle } from "@/lib/candles";
import { FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7 } from "@/lib/intents";
import { Popover, Tool } from "./ui";

/** A token compared on the chart: its pool, when it started trading, and its line's colour. */
export type CompareItem = { pair: Address; settledAt: number; symbol: string; color: string };

export const COMPARE_COLORS = ["#ff9d6e", "#c792ea", "#7bdff2"];
export const MAX_COMPARE = 3;

/** Reads one compared token's trades and hands its candles (at the chart's timeframe) to the chart. Renders nothing. */
export function CompareFeed({ item, interval, onCandles }: { item: CompareItem; interval: number; onCandles: (pair: Address, c: Candle[]) => void }) {
  const swaps = usePoolSwaps(item.pair, item.settledAt, true);
  const candles = useMemo(() => toCandles((swaps.data?.trades ?? []).map((t) => ({ time: t.time, price: t.price, usdc: t.usdc })), interval), [swaps.data, interval]);
  useEffect(() => onCandles(item.pair, candles), [item.pair, candles, onCandles]);
  return null;
}

/**
 * The toolbar's compare button: search the graduated Crux tokens and add up to three to the chart. Compared lines and
 * the candles all switch to a % scale from the first visible bar, so their moves line up.
 */
export function CompareButton({ current, items, onChange }: { current: Address; items: CompareItem[]; onChange: (next: CompareItem[]) => void }) {
  const { launches } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7);
  const [query, setQuery] = useState("");
  const tradable = launches.filter((l) => l.v2 && l.v2.status === 1 && getAddress(l.v2.pair) !== getAddress(current));
  const q = query.trim().toLowerCase();
  const shown = tradable.filter((l) => !q || `${l.symbol ?? ""} ${l.name ?? ""} ${l.v2!.token}`.toLowerCase().includes(q)).slice(0, 30);
  const has = (pair: Address) => items.some((i) => getAddress(i.pair) === getAddress(pair));
  return (
    <Popover
      width="w-64"
      button={(open, toggle) => (
        <Tool label="Compare another token" active={open || items.length > 0} onClick={toggle}>
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {items.length > 0 && <span className="font-mono text-[10px]">{items.length}</span>}
          </span>
        </Tool>
      )}
    >
      {() => (
        <div role="menu">
          <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-dim">Compare (up to {MAX_COMPARE})</p>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol, name or address"
            aria-label="Search tokens to compare"
            className="mb-1 w-full rounded-[3px] border border-line-2 bg-void/60 px-2 py-1 text-[12px] text-chrome outline-none placeholder:text-dim focus:border-chrome/50"
          />
          <div className="max-h-64 overflow-y-auto">
            {shown.map((l) => {
              const on = has(l.v2!.pair);
              return (
                <button
                  key={`${l.version}-${l.id}`}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  disabled={!on && items.length >= MAX_COMPARE}
                  onClick={() =>
                    onChange(
                      on
                        ? items.filter((i) => getAddress(i.pair) !== getAddress(l.v2!.pair))
                        : [
                            ...items,
                            {
                              pair: l.v2!.pair,
                              settledAt: l.v2!.settledAt,
                              symbol: l.symbol ? `$${l.symbol}` : `#${l.id}`,
                              color: COMPARE_COLORS.find((c) => !items.some((i) => i.color === c)) ?? COMPARE_COLORS[0],
                            },
                          ],
                    )
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left text-[12px] text-chrome/85 hover:bg-white/[0.05] disabled:opacity-40"
                >
                  <span>
                    {l.symbol ? `$${l.symbol}` : `#${l.id}`} <span className="text-dim">{l.name}</span>
                  </span>
                  <span className={`font-mono text-[10.5px] ${on ? "text-signal" : "text-dim"}`}>{on ? "on" : "add"}</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="px-2 py-3 text-[12px] text-dim">No other trading tokens match.</p>}
          </div>
        </div>
      )}
    </Popover>
  );
}
