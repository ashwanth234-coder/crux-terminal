"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { CandlestickData, HistogramData, IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { INTERVALS, autoInterval, toCandles } from "@/lib/candles";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";

const css = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

type Charts = { chart: IChartApi; candles: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram">; grad: IPriceLine | null };

/**
 * Candles for a graduated launch, built from every swap on its locked Uniswap V2 pool (the tape's data).
 * The dashed line is the auction's clearing price, where the pool opened. TradingView's lightweight-charts
 * is loaded only when this chart mounts; its attribution stays on, as its licence asks.
 */
export function PriceChart({ auction, symbol }: { auction: AuctionV2; symbol: string }) {
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const now = useNow();
  const host = useRef<HTMLDivElement>(null);
  const charts = useRef<Charts | null>(null);
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState<number | "auto">("auto");

  const gradPrice = Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS));
  const fills = (swaps.data?.trades ?? []).map((t) => ({ time: t.time, price: t.price, usdc: t.usdc }));
  const first = fills.length ? Math.min(...fills.map((f) => f.time)) : auction.settledAt;
  const interval = pick === "auto" ? autoInterval(Math.min(first, auction.settledAt), now ?? auction.settledAt) : pick;
  const candles = toCandles(fills, interval, gradPrice > 0 ? gradPrice : null);
  const last = candles.length ? candles[candles.length - 1].close : null;
  const change = last !== null && gradPrice > 0 ? (last / gradPrice - 1) * 100 : null;

  // Create the chart once (client only), themed from the site's tokens.
  useEffect(() => {
    let disposed = false;
    let created: Charts | null = null;
    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !host.current) return;
      const line = css("--color-line", "#1c1e22");
      const chart = lc.createChart(host.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: css("--color-void", "#08090b") },
          textColor: css("--color-muted", "#8f939b"),
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          attributionLogo: true,
        },
        grid: { vertLines: { color: line }, horzLines: { color: line } },
        rightPriceScale: { borderColor: line, scaleMargins: { top: 0.12, bottom: 0.26 } },
        timeScale: { borderColor: line, timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
      });
      const up = css("--color-up", "#c4ec74");
      const down = css("--color-down", "#ff7a6b");
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: up,
        downColor: down,
        wickUpColor: up,
        wickDownColor: down,
        borderVisible: false,
        priceFormat: { type: "custom", formatter: (p: number) => fmtTokenPrice(p), minMove: 1e-15 },
      });
      const volumeSeries = chart.addSeries(lc.HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      created = { chart, candles: candleSeries, volume: volumeSeries, grad: null };
      charts.current = created;
      setReady(true);
    })();
    return () => {
      disposed = true;
      created?.chart.remove();
      charts.current = null;
    };
  }, []);

  // Feed data whenever trades or the interval change.
  useEffect(() => {
    const c = charts.current;
    if (!ready || !c) return;
    const up = css("--color-up", "#c4ec74");
    const down = css("--color-down", "#ff7a6b");
    c.candles.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close }) satisfies CandlestickData));
    c.volume.setData(
      candles.map((k) => ({ time: k.time as UTCTimestamp, value: k.volume, color: `${k.close >= k.open ? up : down}66` }) satisfies HistogramData),
    );
    if (c.grad) c.candles.removePriceLine(c.grad);
    c.grad =
      gradPrice > 0
        ? c.candles.createPriceLine({ price: gradPrice, color: css("--color-chrome", "#f3f3f0") + "80", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Graduation" })
        : null;
    c.chart.timeScale().fitContent();
    // candles is rebuilt each render; its contents only change with the trades and the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, swaps.data, interval, gradPrice]);

  return (
    <div className="flex h-full min-h-[inherit] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-medium text-chrome">
            {symbol} <span className="text-muted">/ USDC</span>
          </h2>
          {last !== null && <span className="font-mono text-[13px] text-chrome">{fmtTokenPrice(last)}</span>}
          {change !== null && (
            <span className={`font-mono text-[12px] ${change >= 0 ? "text-up" : "text-down"}`} title="Since graduation">
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          )}
        </div>
        <div role="radiogroup" aria-label="Candle interval" className="flex gap-1">
          {[{ seconds: "auto" as const, label: "Auto" }, ...INTERVALS].map((i) => (
            <button
              key={i.label}
              type="button"
              role="radio"
              aria-checked={pick === i.seconds}
              onClick={() => setPick(i.seconds)}
              className={`rounded-[3px] px-2 py-0.5 font-mono text-[11px] transition-colors ${pick === i.seconds ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-dim hover:text-chrome"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-lg border border-line">
        <div ref={host} className="absolute inset-0" aria-label={`${symbol} price chart from the locked pool's swaps`} role="img" />
        {swaps.isPending && <p className="absolute inset-x-0 top-1/2 text-center text-[12px] text-dim">Reading pool swaps from Base Sepolia…</p>}
        {swaps.data && candles.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-[12px] text-dim">
            No trades since graduation. The pool opened at {fmtTokenPrice(gradPrice)}.
          </p>
        )}
      </div>
      <p className="px-1 pt-1.5 text-[11px] text-dim">
        Execution prices of every swap on the locked Uniswap V2 pool, Uniswap&apos;s 0.3% fee included. Dashed line: the auction&apos;s
        clearing price, where the pool opened.
        {swaps.data?.truncated && " Only the last six days are shown."}
      </p>
    </div>
  );
}
