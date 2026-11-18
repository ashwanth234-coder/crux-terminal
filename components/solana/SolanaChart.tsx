"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, createChart, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { coinCandles, type ChartNetwork, type Timeframe } from "@/lib/solanaCoins";

const FRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

/** The theme's colours, read from its CSS variables (light and dark both work). */
function themeColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** A Solana coin's price chart: USD candles and volume from its deepest pool, refreshed every 30 s. */
/** `fill`: no card frame, and it fills its panel (the coin terminal's chart pane). */
export function SolanaChart({ mint, network = "solana", fill = false }: { mint: string; network?: ChartNetwork; fill?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [tf, setTf] = useState<Timeframe>("5m");
  const candles = useQuery({ queryKey: ["coin-candles", network, mint, tf], queryFn: () => coinCandles(network, mint, tf), refetchInterval: 30_000, staleTime: 15_000 });

  useEffect(() => {
    if (!host.current || !candles.data) return;
    const up = themeColor("--up", "#22c55e");
    const down = themeColor("--down", "#ef4444");
    const c = createChart(host.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: themeColor("--dim", "#7a7a7a"), attributionLogo: false },
      grid: { vertLines: { color: themeColor("--line", "#1f1f1f") }, horzLines: { color: themeColor("--line", "#1f1f1f") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      localization: { priceFormatter: (p: number) => (p >= 1 ? p.toFixed(2) : p.toPrecision(4)) },
    });
    chart.current = c;
    const price = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: { type: "price", minMove: 1e-12, precision: 12 } });
    const volume = c.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" } });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    price.setData(candles.data.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    volume.setData(candles.data.map((k) => ({ time: k.time as UTCTimestamp, value: k.volume, color: k.close >= k.open ? `${up}55` : `${down}55` })));
    c.timeScale().fitContent();
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [candles.data]);

  return (
    <section className={fill ? "flex h-full min-h-0 flex-col p-2" : "rounded-xl border border-line p-3"}>
      <div className="mb-2 flex gap-1">
        {FRAMES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTf(f)}
            className={`rounded px-2 py-1 font-mono text-[11px] ${f === tf ? "bg-tint/[0.08] text-chrome" : "text-dim hover:text-chrome"}`}
          >
            {f}
          </button>
        ))}
      </div>
      <div ref={host} className={fill ? "min-h-0 w-full flex-1" : "h-[360px] w-full md:h-[440px]"}>
        {candles.isLoading && <p className="p-4 text-[12px] text-dim">Loading the chart…</p>}
        {candles.data?.length === 0 && <p className="p-4 text-[12px] text-dim">No chart for this coin yet.</p>}
      </div>
    </section>
  );
}
