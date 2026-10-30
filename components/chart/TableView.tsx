"use client";

import { useMemo } from "react";
import type { Candle } from "@/lib/candles";

const stamp = (s: number) => new Date(s * 1000).toISOString().replace("T", " ").slice(0, 19);

/** The same candles as an inspectable table, newest first. */
export function TableView({ candles, k, fmt }: { candles: Candle[]; k: number; fmt: (v: number) => string }) {
  const rows = useMemo(() => [...candles].reverse(), [candles]);
  const th = "sticky top-0 bg-void px-3 py-2 text-right text-[11px] font-normal text-dim first:text-left";
  const td = "px-3 py-1.5 text-right font-mono text-[11.5px] first:text-left";
  return (
    <div className="absolute inset-0 overflow-auto">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr className="border-b border-line">
            {["Time (UTC)", "Open", "High", "Low", "Close", "Change", "Volume", "Trades"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => {
            const pct = c.open > 0 ? (c.close / c.open - 1) * 100 : 0;
            return (
              <tr key={c.time} className="hover:bg-tint/[0.02]">
                <td className={`${td} text-muted`}>{stamp(c.time)}</td>
                <td className={`${td} text-chrome/85`}>{fmt(c.open * k)}</td>
                <td className={`${td} text-chrome/85`}>{fmt(c.high * k)}</td>
                <td className={`${td} text-chrome/85`}>{fmt(c.low * k)}</td>
                <td className={`${td} text-chrome`}>{fmt(c.close * k)}</td>
                <td className={`${td} ${pct < 0 ? "text-down" : "text-up"}`}>
                  {pct >= 0 ? "+" : ""}
                  {pct.toFixed(2)}%
                </td>
                <td className={`${td} text-muted`}>${c.volume.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                <td className={`${td} text-muted`}>{c.trades}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-3 py-8 text-center text-[12px] text-dim">No candles yet.</p>}
    </div>
  );
}
