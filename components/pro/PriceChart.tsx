"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType, Time, UTCTimestamp } from "lightweight-charts";
import { StatusTag } from "@/components/ui/StatusTag";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { INTERVALS, autoInterval, toCandles, type Candle } from "@/lib/candles";
import { INDICATORS, type IndicatorId } from "@/lib/indicators";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";

const css = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

type ChartType = "candles" | "bars" | "line" | "area";
type Mode = "price" | "mcap";
type Lc = typeof import("lightweight-charts");

const TYPES: { id: ChartType; label: string; icon: ReactNode }[] = [
  {
    id: "candles",
    label: "Candles",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M5 2v12M11 3v10" stroke="currentColor" strokeWidth="1.1" />
        <rect x="3.5" y="5" width="3" height="5" fill="currentColor" />
        <rect x="9.5" y="6" width="3" height="4" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    id: "bars",
    label: "Bars",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M5 2v12M3 5h2M5 10h2M11 3v10M9 6h2M11 11h2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  {
    id: "line",
    label: "Line",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="m2 12 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "area",
    label: "Area",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="m2 11 4-4 3 2 5-6v11H2Z" fill="currentColor" fillOpacity="0.25" />
        <path d="m2 11 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const INDICATOR_COLORS: Record<IndicatorId, string> = { ma20: "#e8e6df", ema50: "#9aa0aa", vwap: "#ff9d6e" };
const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

function Tool({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-7 min-w-7 place-items-center rounded-[3px] px-1.5 font-mono text-[11px] transition-colors ${
        active ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-dim hover:text-chrome"
      }`}
    >
      {children}
    </button>
  );
}

type Handles = { chart: IChartApi; main: ISeriesApi<SeriesType>; volume: ISeriesApi<"Histogram">; overlays: Map<IndicatorId, ISeriesApi<"Line">>; grad: IPriceLine | null };

/**
 * Candles for a graduated launch, built from every swap on its locked Uniswap V2 pool (the tape's data), with
 * a pro toolbar: interval, chart type, indicators (computed from the same candles), price or market cap,
 * screenshot and fullscreen, plus an OHLC legend that follows the crosshair. Drawing tools wait for TradingView's
 * Advanced Charts licence. lightweight-charts loads only when this chart mounts; its attribution stays on.
 */
export function PriceChart({ auction, symbol }: { auction: AuctionV2; symbol: string }) {
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const now = useNow();
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const lcRef = useRef<Lc | null>(null);
  const handles = useRef<Handles | null>(null);
  const candleRef = useRef<Candle[]>([]);
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState<number | "auto">("auto");
  const [type, setType] = useState<ChartType>("candles");
  const [mode, setMode] = useState<Mode>("price");
  const [indicators, setIndicators] = useState<IndicatorId[]>([]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [full, setFull] = useState(false);

  const supply = Number(auction.totalSupply) / 1e18;
  const k = mode === "mcap" ? supply : 1;
  const gradPrice = Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS));
  const fills = (swaps.data?.trades ?? []).map((t) => ({ time: t.time, price: t.price, usdc: t.usdc }));
  const first = fills.length ? Math.min(...fills.map((f) => f.time)) : auction.settledAt;
  const interval = pick === "auto" ? autoInterval(Math.min(first, auction.settledAt), now ?? auction.settledAt) : pick;
  const candles = toCandles(fills, interval, gradPrice > 0 ? gradPrice : null);
  useEffect(() => {
    candleRef.current = candles;
  });
  const last = candles.length ? candles[candles.length - 1] : null;
  const shown = hover ?? last;
  const shownIndex = shown ? candles.findIndex((c) => c.time === shown.time) : -1;
  const fmt = (v: number) => (mode === "mcap" ? compactUsd.format(v) : fmtTokenPrice(v));
  const intervalLabel = INTERVALS.find((i) => i.seconds === interval)?.label ?? `${interval}s`;

  // Create the chart once (client only), themed from the site's tokens.
  useEffect(() => {
    let disposed = false;
    let created: Handles | null = null;
    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !host.current) return;
      lcRef.current = lc;
      const line = css("--color-line", "#292b2f");
      const chart = lc.createChart(host.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: css("--color-void", "#0a0b0d") },
          textColor: css("--color-muted", "#8f939b"),
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          attributionLogo: true,
        },
        grid: { vertLines: { color: line }, horzLines: { color: line } },
        rightPriceScale: { borderColor: line, scaleMargins: { top: 0.14, bottom: 0.26 } },
        timeScale: { borderColor: line, timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
      });
      const volume = chart.addSeries(lc.HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      const main = chart.addSeries(lc.CandlestickSeries, {});
      chart.subscribeCrosshairMove((p) => {
        const t = p.time as number | undefined;
        setHover(t === undefined ? null : (candleRef.current.find((c) => c.time === t) ?? null));
      });
      created = { chart, main, volume, overlays: new Map(), grad: null };
      handles.current = created;
      setReady(true);
    })();
    return () => {
      disposed = true;
      created?.chart.remove();
      handles.current = null;
    };
  }, []);

  // Swap the main series when the chart type changes.
  useEffect(() => {
    const h = handles.current;
    const lc = lcRef.current;
    if (!ready || !h || !lc) return;
    const up = css("--color-up", "#c4ec74");
    const down = css("--color-down", "#ff7a6b");
    const chrome = css("--color-chrome", "#f3f3f0");
    h.chart.removeSeries(h.main);
    h.grad = null;
    h.main =
      type === "candles"
        ? h.chart.addSeries(lc.CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false })
        : type === "bars"
          ? h.chart.addSeries(lc.BarSeries, { upColor: up, downColor: down, thinBars: false })
          : type === "line"
            ? h.chart.addSeries(lc.LineSeries, { color: chrome, lineWidth: 2 })
            : h.chart.addSeries(lc.AreaSeries, { lineColor: chrome, topColor: `${chrome}33`, bottomColor: `${chrome}00`, lineWidth: 2 });
  }, [ready, type]);

  // Feed data whenever trades, interval, type, mode or indicators change.
  useEffect(() => {
    const h = handles.current;
    const lc = lcRef.current;
    if (!ready || !h || !lc) return;
    const up = css("--color-up", "#c4ec74");
    const down = css("--color-down", "#ff7a6b");
    const fmtAxis = (v: number) => (mode === "mcap" ? compactUsd.format(v) : fmtTokenPrice(v));
    // Every series on the right scale shares this format; the scale takes it from whichever series is first.
    const priceFormat = { type: "custom" as const, formatter: fmtAxis, minMove: mode === "mcap" ? 0.01 : 1e-15 };
    h.main.applyOptions({ priceFormat });
    const time = (c: Candle) => c.time as UTCTimestamp;
    if (type === "candles" || type === "bars") {
      (h.main as ISeriesApi<"Candlestick">).setData(candles.map((c) => ({ time: time(c), open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })));
    } else {
      (h.main as ISeriesApi<"Line">).setData(candles.map((c) => ({ time: time(c), value: c.close * k })));
    }
    h.volume.setData(candles.map((c) => ({ time: time(c), value: c.volume, color: `${c.close >= c.open ? up : down}66` })));

    // Indicators: one line series each, recomputed from the same candles.
    for (const [id, series] of h.overlays) {
      if (!indicators.includes(id)) {
        h.chart.removeSeries(series);
        h.overlays.delete(id);
      }
    }
    for (const ind of INDICATORS) {
      if (!indicators.includes(ind.id)) continue;
      let series = h.overlays.get(ind.id);
      if (!series) {
        series = h.chart.addSeries(lc.LineSeries, { color: INDICATOR_COLORS[ind.id], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        h.overlays.set(ind.id, series);
      }
      series.applyOptions({ priceFormat });
      const values = ind.compute(candles);
      series.setData(candles.flatMap((c, i) => (values[i] === null ? [] : [{ time: time(c) as Time, value: (values[i] as number) * k }])));
    }

    if (h.grad) h.main.removePriceLine(h.grad);
    h.grad =
      gradPrice > 0
        ? h.main.createPriceLine({ price: gradPrice * k, color: `${css("--color-chrome", "#f3f3f0")}80`, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Graduation" })
        : null;
    h.chart.timeScale().fitContent();
    // candles is rebuilt each render; its contents only change with these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, swaps.data, interval, type, mode, indicators.join(","), gradPrice]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const screenshot = () => {
    const h = handles.current;
    if (!h) return;
    h.chart.takeScreenshot().toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${symbol.replace(/^\$/, "")}-${intervalLabel}-${mode}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
    });
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen();
  };
  const toggleIndicator = (id: IndicatorId) => setIndicators((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const change = shown ? (shown.close / shown.open - 1) * 100 : null;
  const live = swaps.data !== undefined && !swaps.isError;

  return (
    <div ref={frame} className={`flex h-full min-h-[inherit] flex-col ${full ? "bg-void p-3" : ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 pb-2">
        <div role="radiogroup" aria-label="Candle interval" className="flex items-center gap-0.5">
          {[{ seconds: "auto" as const, label: "Auto" }, ...INTERVALS].map((i) => (
            <button
              key={i.label}
              type="button"
              role="radio"
              aria-checked={pick === i.seconds}
              onClick={() => setPick(i.seconds)}
              className={`rounded-[3px] px-1.5 py-1 font-mono text-[11px] transition-colors ${pick === i.seconds ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-dim hover:text-chrome"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <div role="radiogroup" aria-label="Chart type" className="flex items-center gap-0.5">
          {TYPES.map((t) => (
            <Tool key={t.id} label={t.label} active={type === t.id} onClick={() => setType(t.id)}>
              {t.icon}
            </Tool>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <div ref={menuRef} className="relative">
          <Tool label="Indicators" active={menu || indicators.length > 0} onClick={() => setMenu((m) => !m)}>
            <span className="font-display italic text-[13px]">ƒx</span>
          </Tool>
          {menu && (
            <ul className="absolute left-0 top-full z-20 mt-1 w-40 rounded-[4px] border border-line-2 bg-panel-2 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]" role="menu">
              {INDICATORS.map((ind) => (
                <li key={ind.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={indicators.includes(ind.id)}
                    onClick={() => toggleIndicator(ind.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left text-[12px] text-chrome/85 hover:bg-white/[0.04]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-px w-3" style={{ background: INDICATOR_COLORS[ind.id] }} aria-hidden="true" />
                      {ind.label}
                    </span>
                    <span className="font-mono text-[11px] text-dim">{indicators.includes(ind.id) ? "on" : "off"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <div role="radiogroup" aria-label="Scale" className="flex items-center gap-0.5 text-[11.5px]">
          {(["price", "mcap"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-[3px] px-1.5 py-1 uppercase tracking-[0.1em] transition-colors ${mode === m ? "text-signal" : "text-dim hover:text-chrome"}`}
            >
              {m === "price" ? "Price" : "MCap"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {live && <StatusTag status="live" className="mr-1" />}
          <Tool label="Download a screenshot of the chart" onClick={screenshot}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M2.5 5.2h2.2l1.2-1.7h4.2l1.2 1.7h2.2v7.3h-11Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <circle cx="8" cy="8.7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </Tool>
          <Tool label={full ? "Exit fullscreen" : "Fullscreen"} active={full} onClick={toggleFull}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              {full ? (
                <path d="M6 2.5v3.5H2.5M10 2.5v3.5h3.5M6 13.5V10H2.5M10 13.5V10h3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              ) : (
                <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" fill="none" stroke="currentColor" strokeWidth="1.2" />
              )}
            </svg>
          </Tool>
        </div>
      </div>

      <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-[4px] border border-line">
        <div ref={host} className="absolute inset-0" aria-label={`${symbol} chart from the locked pool's swaps`} role="img" />

        {/* OHLC legend: the hovered candle, or the latest */}
        {shown && (
          <div className="pointer-events-none absolute left-2 top-1.5 z-10 max-w-[calc(100%-7rem)] font-mono text-[11px] leading-snug">
            <p className="text-chrome/90">
              {symbol} · {intervalLabel} · <span className="text-muted">Crux pool</span>
            </p>
            <p className={change !== null && change < 0 ? "text-down" : "text-up"}>
              <span className="text-dim">O</span>
              {fmt(shown.open * k)} <span className="text-dim">H</span>
              {fmt(shown.high * k)} <span className="text-dim">L</span>
              {fmt(shown.low * k)} <span className="text-dim">C</span>
              {fmt(shown.close * k)}
              {change !== null && ` (${change >= 0 ? "+" : ""}${change.toFixed(2)}%)`}
            </p>
            <p className="text-muted">
              <span className="text-dim">Vol</span> ${shown.volume.toLocaleString("en-US", { maximumFractionDigits: 6 })}
            </p>
            {indicators.length > 0 && (
              <p className="flex flex-wrap gap-x-2">
                {INDICATORS.filter((i) => indicators.includes(i.id)).map((i) => {
                  const v = i.compute(candles)[shownIndex];
                  return (
                    <span key={i.id} style={{ color: INDICATOR_COLORS[i.id] }}>
                      {i.label} <span className={v == null ? "text-dim" : ""}>{v == null ? `needs ${i.needs} candles` : fmt(v * k)}</span>
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        )}
        {swaps.isPending && <p className="absolute inset-x-0 top-1/2 text-center text-[12px] text-dim">Reading pool swaps from Base Sepolia…</p>}
        {swaps.data && candles.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-[12px] text-dim">No trades since graduation. The pool opened at {fmtTokenPrice(gradPrice)}.</p>
        )}
      </div>
      <p className="px-1 pt-1.5 text-[11px] text-dim">
        Every swap on the locked Uniswap V2 pool, Uniswap&apos;s 0.3% fee included. Dashed line: the auction&apos;s clearing price, where the pool
        opened.{indicators.length > 0 && " Indicators are computed from these same candles."}
        {swaps.data?.truncated && " Only the last six days are shown."}
      </p>
    </div>
  );
}
