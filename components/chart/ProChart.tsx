"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { formatUnits } from "viem";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { INTERVALS, autoInterval, toCandles } from "@/lib/candles";
import { studyById } from "@/lib/indicators";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";
import { BottomBar } from "./BottomBar";
import { ContextMenu, type ContextAt } from "./ContextMenu";
import { ChartEngine } from "./engine";
import { useHistory } from "./history";
import { Legend } from "./Legend";
import { DEFAULT_CONFIG, DEFAULT_SETTINGS, loadSettings, saveSettings, type ChartSettings, type ScaleMode } from "./settings";
import { SettingsModal } from "./SettingsModal";
import { chartSnapshot, shareImage } from "./snapshot";
import { TableView } from "./TableView";
import { Toolbar } from "./Toolbar";

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** "$140.6K", "0.000141", "1.2m" → a number (K / M / B suffixes, $ and commas ignored), or null. */
function parseAmount(s: string): number | null {
  const m = s.trim().replace(/[$,\s]/g, "").match(/^(\d*\.?\d+(?:e-?\d+)?)([kmb])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  const v = Number(m[1]) * mult;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * The CRUX Pro chart for a graduated launch: candles from every trade on its liquidity (the batch pool's fills during
 * an anti-sniper window, then Uniswap V2 swaps), on lightweight-charts. Timeframes from 1 second, six chart styles,
 * overlay and pane indicators, price or market cap, %, log and auto scales, range presets, a live OHLCV legend, a
 * right-click menu, a table view, price alerts, undo / redo, a branded snapshot and fullscreen.
 */
export function ProChart({ auction, symbol, name }: { auction: AuctionV2; symbol: string; name: string | null }) {
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const now = useNow();
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const { state: config, set, undo, redo, canUndo, canRedo } = useHistory(DEFAULT_CONFIG);
  const [settings, setSettingsState] = useState<ChartSettings>(() => (typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings()));
  const [scale, setScale] = useState<ScaleMode>("normal");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [marksHidden, setMarksHidden] = useState(false);
  const [full, setFull] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ctx, setCtx] = useState<ContextAt | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Bumped when the visible range moves, so the locked time line follows the candles.
  const [, setRangeTick] = useState(0);

  const setSettings = (s: ChartSettings) => {
    setSettingsState(s);
    saveSettings(s);
  };
  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2_200);
  }, []);

  // ---------------------------------------------------------------- data

  const supply = Number(auction.totalSupply) / 1e18;
  const k = config.units === "mcap" ? supply : 1;
  const gradPrice = Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS));
  const fills = useMemo(() => (swaps.data?.trades ?? []).map((t) => ({ time: t.time, price: t.price, usdc: t.usdc })), [swaps.data]);
  const first = fills.length ? Math.min(...fills.map((f) => f.time)) : auction.settledAt;
  const interval = config.interval === "auto" ? autoInterval(Math.min(first, auction.settledAt), now ?? auction.settledAt) : config.interval;
  const candles = useMemo(() => toCandles(fills, interval, gradPrice > 0 ? gradPrice : null), [fills, interval, gradPrice]);
  const fmt = useCallback((v: number) => (config.units === "mcap" ? compactUsd.format(v) : fmtTokenPrice(v)), [config.units]);
  const minMove = config.units === "mcap" ? 0.01 : 1e-15;
  const studyLines = useMemo(
    () => config.studies.flatMap((id) => studyById(id).compute(candles).map((line) => ({ line, priced: studyById(id).priced }))),
    [config.studies, candles],
  );
  const intervalLabel = INTERVALS.find((i) => i.seconds === interval)?.label ?? `${interval}s`;
  const last = candles.length ? candles[candles.length - 1] : null;
  const hoverIndex = hoverTime === null ? -1 : candles.findIndex((c) => c.time === hoverTime);
  const shownIndex = hoverIndex >= 0 ? hoverIndex : candles.length - 1;
  const shown = shownIndex >= 0 ? candles[shownIndex] : null;

  // -------------------------------------------------------------- engine

  useEffect(() => {
    let disposed = false;
    let created: ChartEngine | null = null;
    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !host.current) return;
      created = new ChartEngine(
        lc,
        host.current,
        { bg: css("--color-void", "#0a0b0d"), line: css("--color-line", "#292b2f"), text: css("--color-muted", "#8f939b"), chrome: css("--color-chrome", "#f3f3f0"), dim: css("--color-dim", "#5d6168") },
        loadSettings(),
      );
      created.onCrosshair((p) => setHoverTime(typeof p.time === "number" ? p.time : null));
      created.onRange(() => setRangeTick((n) => n + 1));
      setEngine(created);
    })();
    return () => {
      disposed = true;
      created?.remove();
    };
  }, []);

  useEffect(() => {
    engine?.applySettings(settings);
  }, [engine, settings]);

  useEffect(() => {
    engine?.setType(config.type);
  }, [engine, config.type]);

  useEffect(() => {
    engine?.setScale(scale);
  }, [engine, scale]);

  // Data, studies and lines: whenever the candles, units, style, settings or studies change.
  useEffect(() => {
    if (!engine) return;
    engine.setData(candles, k, fmt, minMove);
    engine.setStudies(config.studies, candles, k, fmt, minMove);
    const lines: { price: number; color: string; title: string; style?: number }[] = [];
    if (settings.clearingLine && !marksHidden && gradPrice > 0) lines.push({ price: gradPrice * k, color: "#f3f3f080", title: "Auction clear" });
    for (const a of config.alerts) lines.push({ price: a * k, color: "#ffd166", title: "Alert", style: 1 });
    engine.setPriceLines(lines);
  }, [engine, candles, k, fmt, minMove, config.type, config.studies, config.alerts, settings, marksHidden, gradPrice]);

  // Fit the view when the timeframe changes or the first candles arrive.
  const fitKey = `${interval}:${candles.length > 0}`;
  useEffect(() => {
    engine?.fit();
  }, [engine, fitKey]);

  // Alerts fire when the latest close crosses them, then clear (a browser notification if allowed).
  const lastClose = last?.close ?? null;
  const prevClose = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevClose.current;
    prevClose.current = lastClose;
    if (prev === null || lastClose === null || prev === lastClose) return;
    const hit = config.alerts.filter((a) => (prev < a && lastClose >= a) || (prev > a && lastClose <= a));
    if (hit.length === 0) return;
    const msg = `${symbol} crossed ${hit.map((a) => fmt(a * k)).join(", ")}`;
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("CRUX alert", { body: msg });
    } catch {
      // Notifications unavailable: the in-page message below still shows.
    }
    setTimeout(() => {
      flash(msg);
      set((c) => ({ ...c, alerts: c.alerts.filter((a) => !hit.includes(a)) }));
    }, 0);
  }, [lastClose, config.alerts, symbol, fmt, k, flash, set]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ------------------------------------------------------------- actions

  const reset = () => {
    engine?.reset();
    setScale("normal");
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen();
  };
  const snapshot = async () => {
    if (!engine || !last) return;
    const change = candles.length > 1 ? (last.close / candles[0].open - 1) * 100 : null;
    const blob = await chartSnapshot(engine.screenshot(), {
      title: `${name ?? symbol} (${symbol}) · ${intervalLabel}`,
      value: `${config.units === "mcap" ? "MCap " : ""}${fmt(last.close * k)}`,
      change: change === null ? null : `${change >= 0 ? "+" : ""}${change.toFixed(2)}% shown`,
      up: (change ?? 0) >= 0,
      sub: `CRUX Pro · Base Sepolia testnet · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    });
    const how = await shareImage(blob, `${symbol.replace(/^\$/, "")}-${intervalLabel}.png`);
    flash(how === "copied" ? "Chart copied: paste it into X" : "Chart image downloaded");
  };
  const addAlert = (value: string) => {
    const v = parseAmount(value);
    if (v === null) return "Enter a number, e.g. 140K or 0.00014.";
    const price = v / k;
    set((c) => ({ ...c, alerts: [...c.alerts, price] }));
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    } catch {
      // ignore
    }
    return null;
  };
  const onRange = (seconds: number) => {
    if (!engine) return;
    if (seconds === 0 || now === null) engine.fit();
    else engine.showRange(now - seconds, now);
  };
  const onContext = (e: MouseEvent<HTMLDivElement>) => {
    if (!engine || view !== "chart") return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const bar = engine.barAt(x);
    const time = bar === null || candles.length === 0 ? null : candles[Math.max(0, Math.min(candles.length - 1, bar))].time;
    setCtx({ x: Math.min(x, r.width - 248), y: Math.min(y, r.height - 280), price: engine.priceAt(y), time });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.altKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      reset();
    } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  };

  const lockedX = config.lockedTime !== null && engine ? engine.xOf(config.lockedTime) : null;
  const live = swaps.data !== undefined && !swaps.isError;

  return (
    <div ref={frame} tabIndex={-1} onKeyDown={onKey} className={`flex h-full min-h-[inherit] flex-col outline-none ${full ? "bg-void p-3" : ""}`}>
      <Toolbar
        config={config}
        set={set}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        view={view}
        setView={setView}
        full={full}
        onFull={toggleFull}
        onSnapshot={() => void snapshot()}
        onSettings={() => setSettingsOpen(true)}
        onAddAlert={addAlert}
        formatInput={last ? fmt(last.close * k) : ""}
        live={live}
      />

      <div className="relative min-h-[300px] flex-1 overflow-hidden rounded-t-[4px] border border-line" onContextMenu={onContext} onMouseDown={() => frame.current?.focus()}>
        <div ref={host} className={`absolute inset-0 ${view === "table" ? "invisible" : ""}`} aria-label={`${symbol} chart`} role="img" />
        {view === "chart" && (
          <Legend title={`${name ?? symbol} · ${intervalLabel} · CRUX`} candle={shown} k={k} fmt={fmt} lines={studyLines} index={shownIndex} />
        )}
        {view === "chart" && lockedX !== null && (
          <div className="pointer-events-none absolute bottom-7 top-0 z-[5] w-px border-l border-dashed border-[#4cc9f0]/70" style={{ left: lockedX }} aria-hidden="true" />
        )}
        {view === "table" && <TableView candles={candles} k={k} fmt={fmt} />}
        {ctx && (
          <ContextMenu
            at={ctx}
            fmt={fmt}
            onClose={() => setCtx(null)}
            onReset={reset}
            onCopyPrice={(p) => {
              void navigator.clipboard?.writeText(fmt(p)).then(() => flash(`Copied ${fmt(p)}`));
            }}
            onLockTime={(time) => set((c) => ({ ...c, lockedTime: time }))}
            lockedTime={config.lockedTime}
            onTable={() => setView("table")}
            studies={config.studies.length}
            onRemoveStudies={() => set((c) => ({ ...c, studies: [] }))}
            marksHidden={marksHidden}
            onToggleMarks={() => setMarksHidden((m) => !m)}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
        {toast && (
          <p role="status" className="absolute bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-[4px] border border-line-2 bg-panel-2 px-3 py-1.5 text-[12px] text-chrome shadow-lg">
            {toast}
          </p>
        )}
        {swaps.isPending && <p className="absolute inset-x-0 top-1/2 text-center text-[12px] text-dim">Reading trades from Base Sepolia…</p>}
        {swaps.data && candles.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-[12px] text-dim">No trades since graduation. The pool opened at {fmtTokenPrice(gradPrice)}.</p>
        )}
      </div>
      <BottomBar now={now} onRange={onRange} scale={scale} setScale={setScale} auto={engine?.isAutoScale() ?? true} onAuto={() => engine?.autoScale()} />
      <p className="px-1 pt-1.5 text-[11px] text-dim">
        Every trade on the locked liquidity since graduation (batch fills during an anti-sniper window, then Uniswap V2 swaps), the 0.3% pool fee
        included. {config.units === "mcap" ? "Market cap = price × total supply." : ""} Right-click the chart for more; Alt+R resets the view.
        {swaps.data?.truncated && " Only the last three days are shown."} Charts by{" "}
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 hover:text-chrome">
          TradingView Lightweight Charts™
        </a>
        .
      </p>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={setSettings} />
    </div>
  );
}
