"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { formatUnits, getAddress, type Address } from "viem";
import type { SeriesMarker, Time } from "lightweight-charts";
import { useConnection } from "wagmi";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { DESTINATION_SETTLER, useLaunchMarket } from "@/hooks/useLaunchMarket";
import { useTokenTransfers } from "@/hooks/useTokenTransfers";
import { useStandingOrders } from "@/hooks/useStandingOrders";
import { barTime, markTrades, type MarkWho } from "@/lib/chartMarks";
import { buildHolders } from "@/lib/holders";
import { CRUX_SOLVER, PREVIOUS_SETTLERS, SETTLER } from "@/lib/intents";
import { EMPTY_CONTEXT, computeInstance, flowByCandle, holdersByCandle, paramsOf, type StudyContext, type StudyId } from "@/lib/indicators";
import { INTERVALS, autoInterval, toCandles, type Candle } from "@/lib/candles";
import { studyById } from "@/lib/indicators";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";
import { BottomBar } from "./BottomBar";
import { ContextMenu, type ContextAt } from "./ContextMenu";
import { ChartEngine } from "./engine";
import { useHistory } from "./history";
import { Legend } from "./Legend";
import { DrawingBar } from "./DrawingBar";
import { DrawingPalette, TOOL_INFO, TOOL_KEYS } from "./DrawingPalette";
import { PATTERN_LABELS, TOOL_POINTS, defaultStop, isPattern, type DrawPart, type DrawPoint, type DrawTool, type Drawing } from "./drawings";
import { OverlaysButton } from "./OverlaysBar";
import { DEFAULT_CONFIG, DEFAULT_SETTINGS, loadLayout, loadSettings, palette, saveSettings, type ChartSettings, type ScaleMode } from "./settings";
import { SettingsModal } from "./SettingsModal";
import { CompareButton, CompareFeed } from "./Compare";
import type { SyncBus, SyncOptions } from "./sync";
import { StudySettings } from "./StudySettings";
import { chartSnapshot, shareImage } from "./snapshot";
import { TableView } from "./TableView";
import { useChartAlerts } from "./useChartAlerts";
import { useChartLayoutSync } from "./useChartLayoutSync";
import { Toolbar } from "./Toolbar";

/** A new chart in a multi-chart layout starts on a different timeframe: auto, 1 minute, 15 minutes, 1 hour. */
const SLOT_INTERVALS: (number | "auto")[] = ["auto", 60, 900, 3_600];

/** How each kind of marked trader shows on the bars. */
const MARK_STYLE: Record<MarkWho, { color: string; buy: string; sell: string }> = {
  focus: { color: "#ff9d6e", buy: "B", sell: "S" },
  me: { color: "#5cc08c", buy: "B", sell: "S" },
  dev: { color: "#c792ea", buy: "Dev", sell: "Dev" },
  whale: { color: "#4cc9f0", buy: "W", sell: "W" },
  top: { color: "#ffd166", buy: "T", sell: "T" },
};

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
/** The chart's colours from the site's tokens, so it follows the light / dark switch. */
const chartTheme = () => ({
  bg: css("--color-void", "#000000"),
  line: css("--color-line", "#1f1f1f"),
  text: css("--color-muted", "#a3a3a3"),
  chrome: css("--color-chrome", "#ffffff"),
  dim: css("--color-dim", "#7a7a7a"),
});

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
export function ProChart({
  auction,
  symbol,
  name,
  factory,
  id,
  focus = null,
  onFocus,
  slot = 0,
  layoutSlot,
  sync,
  external = false,
}: {
  auction: AuctionV2;
  symbol: string;
  name: string | null;
  factory: Address;
  id: string;
  /** A wallet picked in the desk: only its trades are marked while set. */
  focus?: Address | null;
  onFocus?: (a: Address | null) => void;
  /** Which chart of a multi-chart layout this is: each slot keeps its own saved layout. */
  slot?: number;
  /**
   * A token that isn't a Crux launch (lib/externalPools): `auction` carries only its token, pool and supply. Its
   * transfers aren't read (a partial window would show wrong holders), so there are no trader marks.
   */
  external?: boolean;
  /** The layout picker, shown in the toolbar. */
  layoutSlot?: ReactNode;
  /** In a multi-chart layout: what the charts share (crosshair, time range, timeframe). */
  sync?: { bus: SyncBus; opts: SyncOptions };
}) {
  // The sync settings as of the last render, for the chart's own (mount-time) event callbacks.
  const syncRef = useRef(sync);
  // A chart's slot never changes; the mount-time callbacks read it from here.
  const slotRef = useRef(slot);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);
  /** When another chart last moved this one, so applying its move isn't published back. */
  const remoteAt = useRef(0);
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  // The same reads as the Holders tab (shared queries): who holds what, and every transfer to rebuild their trades.
  const transfers = useTokenTransfers(auction.token, factory, BigInt(id), auction.startTime - 86_400, !external);
  const market = useLaunchMarket(auction.token, auction.pair);
  const { address: wallet } = useConnection();
  const crux = useCruxAccount();
  const { orders: standingOrders } = useStandingOrders();
  const now = useNow();
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  // This token's chart as it was left in this browser (drawings, indicators, timeframe…), or the defaults.
  const layoutKey = slot === 0 ? auction.token : `${auction.token}#${slot}`;
  const [initialConfig] = useState(
    () => (typeof window === "undefined" ? null : loadLayout(layoutKey)) ?? { ...DEFAULT_CONFIG, interval: SLOT_INTERVALS[slot] ?? DEFAULT_CONFIG.interval },
  );
  const { state: config, set, undo, redo, replace, canUndo, canRedo } = useHistory(initialConfig);
  const [settings, setSettingsState] = useState<ChartSettings>(() => (typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings()));
  const [scale, setScale] = useState<ScaleMode>("normal");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [marksHidden, setMarksHidden] = useState(false);
  const [full, setFull] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ctx, setCtx] = useState<ContextAt | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Drawing: the palette, the active tool, its first point and where the cursor is (for the live preview).
  // The drawing toolbar starts open on wide screens, folded away on phones.
  const [paletteOpen, setPaletteOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  // Box zoom (drag a box to zoom into it), the sticker to place, and a brush stroke being drawn.
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomBox, setZoomBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [sticker, setSticker] = useState("🚀");
  const [stroke, setStroke] = useState<DrawPoint[] | null>(null);
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [points, setPoints] = useState<DrawPoint[]>([]);
  const [cursor, setCursor] = useState<DrawPoint | null>(null);
  // Editing drawings: the selected one, the one being dragged (shown live, committed as one undo step on release),
  // whether they're hidden, the text note being typed and what the pointer is over.
  const [selected, setSelected] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Drawing | null>(null);
  const [drawHidden, setDrawHidden] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [hover, setHover] = useState<DrawPart | null>(null);
  const drag = useRef<{ orig: Drawing; part: DrawPart; x: number; y: number; moved: boolean; last: Drawing | null } | null>(null);
  const area = useRef<HTMLDivElement>(null);
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
  const allCandles = useMemo(() => toCandles(fills, interval, gradPrice > 0 ? gradPrice : null), [fills, interval, gradPrice]);
  // Bar replay: the chart as it stood at `index`, played forward a candle at a time. Off: every candle, live.
  const [replay, setReplay] = useState<{ index: number | null; playing: boolean; speed: number } | null>(null);
  const replayIndex = replay?.index ?? null;
  const replaying = replay !== null;
  const candles = useMemo(
    () => (replayIndex !== null ? allCandles.slice(0, Math.min(allCandles.length, replayIndex + 1)) : allCandles),
    [allCandles, replayIndex],
  );
  useEffect(() => {
    if (!replay?.playing || replay.index === null) return;
    const t = setInterval(() => {
      setReplay((r) => {
        if (!r || r.index === null) return r;
        if (r.index >= allCandles.length - 1) return { ...r, playing: false };
        return { ...r, index: r.index + 1 };
      });
    }, 1_000 / replay.speed);
    return () => clearInterval(t);
  }, [replay?.playing, replay?.speed, replay?.index, allCandles.length]);
  const fmt = useCallback((v: number) => (config.units === "mcap" ? compactUsd.format(v) : fmtTokenPrice(v)), [config.units]);
  const minMove = config.units === "mcap" ? 0.01 : 1e-15;
  // What the on-chain studies read: USDC bought / sold per candle, and holders at each close (only when shown).
  const studyCtx = useMemo<StudyContext>(() => {
    if (config.studies.length === 0) return EMPTY_CONTEXT;
    const times = candles.map((c) => c.time);
    const flow = flowByCandle(
      times,
      interval,
      (swaps.data?.trades ?? []).map((t) => ({ time: t.time, side: t.side, usd: Number(t.usdc) / 1e6 })),
    );
    if (!config.studies.some((s) => s.id === "holders" && !s.hidden) || !transfers.data) return { ...flow, holders: [] };
    const exclude = new Set(
      [auction.pair, factory, CRUX_SOLVER, DESTINATION_SETTLER, SETTLER, ...PREVIOUS_SETTLERS.map((p) => p.address), market.batchPool ?? "", "0x000000000000000000000000000000000000dEaD", "0x0000000000000000000000000000000000000000"]
        .filter(Boolean)
        .map((a) => a.toLowerCase()),
    );
    const moves = transfers.data.items.filter((t) => t.kind === "transfer");
    return { ...flow, holders: holdersByCandle(times, interval, moves, exclude) };
  }, [config.studies, candles, interval, swaps.data, transfers.data, auction.pair, factory, market.batchPool]);
  // Every study the trader added, with their settings; hidden ones keep their place in the legend but aren't drawn.
  const computedStudies = useMemo(
    () =>
      config.studies.map((inst) => {
        const study = studyById(inst.id);
        const p = paramsOf(inst);
        return { inst, study, title: study.title(p), lines: inst.hidden ? [] : computeInstance(inst, candles, studyCtx), levels: study.levels?.(p) ?? [], widths: inst.widths };
      }),
    [config.studies, candles, studyCtx],
  );
  const drawnStudies = useMemo(() => computedStudies.filter((c) => !c.inst.hidden), [computedStudies]);
  const [editing_study, setEditingStudy] = useState<StudyId | null>(null);
  const updateStudy = (id: StudyId, fn: (s: (typeof config.studies)[number]) => (typeof config.studies)[number] | null) =>
    set((c) => ({ ...c, studies: c.studies.flatMap((s) => (s.id === id ? (fn(s) ? [fn(s)!] : []) : [s])) }));
  const intervalLabel = INTERVALS.find((i) => i.seconds === interval)?.label ?? `${interval}s`;

  // ------------------------------------------------------- overlays

  const me = useMemo(() => [wallet, crux.account].filter((a): a is Address => Boolean(a)).map((a) => getAddress(a)), [wallet, crux.account]);
  const holders = useMemo(() => {
    if (!transfers.data || !swaps.data) return [];
    return buildHolders(transfers.data.items, swaps.data.trades, {
      totalSupply: auction.totalSupply,
      clearingPrice: gradPrice,
      creator: auction.creator,
      factory,
      pair: auction.pair,
      solver: CRUX_SOLVER,
      destinationSettler: DESTINATION_SETTLER,
      me: me[0],
      batchPool: market.batchPool,
    });
  }, [transfers.data, swaps.data, auction, gradPrice, factory, me, market.batchPool]);
  /** Your average entry and balance across your wallet and your Crux account. */
  const mine = useMemo(() => {
    const rows = holders.filter((h) => me.includes(getAddress(h.address)));
    const bal = rows.reduce((s, h) => s + Number(h.balance) / 1e18, 0);
    const priced = rows.filter((h) => h.entry !== null);
    const pricedBal = priced.reduce((s, h) => s + Number(h.balance) / 1e18, 0);
    const entry = pricedBal > 0 ? priced.reduce((s, h) => s + (h.entry as number) * (Number(h.balance) / 1e18), 0) / pricedBal : null;
    return { balance: bal, entry };
  }, [holders, me]);
  const marks = useMemo(() => {
    if (!transfers.data || candles.length === 0) return [];
    const system = new Set(["pool", "auction", "solver", "settler", "burn"]);
    const people = holders.filter((h) => !h.tags.some((t) => system.has(t)));
    const times = candles.map((c) => c.time);
    const venues = [auction.pair, ...(market.batchPool ? [market.batchPool] : [])];
    return markTrades(
      transfers.data.items,
      {
        sources: [...venues, CRUX_SOLVER],
        sinks: [...venues, SETTLER, ...PREVIOUS_SETTLERS.map((p) => p.address)],
        me,
        dev: auction.creator,
        whales: people.filter((h) => h.tags.includes("whale")).map((h) => h.address),
        top: people.filter((h) => getAddress(h.address) !== getAddress(auction.creator)).slice(0, 10).map((h) => h.address),
        focus,
      },
      (time) => {
        const bt = barTime(times, time);
        return bt === null ? null : (candles.find((c) => c.time === bt)?.close ?? null);
      },
    );
  }, [transfers.data, candles, holders, me, auction.pair, auction.creator, market.batchPool, focus]);
  // A wallet picked in the desk shows alone, every trade of it, whatever the overlay switches say.
  const replayEnd = replayIndex !== null && candles.length ? candles[candles.length - 1].time + interval : null;
  const shownMarks = useMemo(
    () =>
      focus
        ? marks.filter((m) => m.who === "focus" && (replayEnd === null || m.time < replayEnd))
        : marks.filter(
            (m) =>
              (replayEnd === null || m.time < replayEnd) &&
              m.usd >= settings.minUsd &&
              (m.who === "me" ? settings.marks.mine : m.who === "top" ? settings.marks.top : settings.marks.dev),
          ),
    [marks, settings.minUsd, settings.marks, focus, replayEnd],
  );
  const markCounts = useMemo(
    () => ({ mine: marks.filter((m) => m.who === "me").length, dev: marks.filter((m) => m.who === "dev" || m.who === "whale").length, top: marks.filter((m) => m.who === "top").length }),
    [marks],
  );
  const last = candles.length ? candles[candles.length - 1] : null;
  const hoverIndex = hoverTime === null ? -1 : candles.findIndex((c) => c.time === hoverTime);
  const shownIndex = hoverIndex >= 0 ? hoverIndex : candles.length - 1;
  const shown = shownIndex >= 0 ? candles[shownIndex] : null;

  // -------------------------------------------------------------- engine

  // The site's theme switch (ThemeToggle) recolours the chart in place.
  useEffect(() => {
    if (!engine) return;
    const recolour = () => engine.setTheme(chartTheme());
    window.addEventListener("crux-theme", recolour);
    return () => window.removeEventListener("crux-theme", recolour);
  }, [engine]);

  useEffect(() => {
    let disposed = false;
    let created: ChartEngine | null = null;
    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !host.current) return;
      created = new ChartEngine(
        lc,
        host.current,
        chartTheme(),
        loadSettings(),
      );
      created.onCrosshair((p) => {
        const time = typeof p.time === "number" ? p.time : null;
        setHoverTime(time);
        // Only the trader's own pointer is shared; crosshairs placed from other charts carry no source event.
        const s = syncRef.current;
        if (s?.opts.crosshair && p.sourceEvent !== undefined) s.bus.publish({ kind: "crosshair", from: slotRef.current, time });
        else if (s?.opts.crosshair && time === null && p.point === undefined) s.bus.publish({ kind: "crosshair", from: slotRef.current, time: null });
      });
      created.onRange(() => {
        setRangeTick((n) => n + 1);
        const s = syncRef.current;
        if (!s?.opts.time || Date.now() - remoteAt.current < 250) return;
        const r = created?.visibleTimes();
        if (r) s.bus.publish({ kind: "range", from: slotRef.current, start: r.start, end: r.end });
      });
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
    engine.setStudies(drawnStudies, candles, k, fmt, minMove);
    const lines: { price: number; color: string; title: string; style?: number }[] = [];
    if (settings.clearingLine && !marksHidden && gradPrice > 0) lines.push({ price: gradPrice * k, color: "#f3f3f080", title: "Auction clear" });
    for (const a of config.alerts) lines.push({ price: a * k, color: "#ffd166", title: "Alert", style: 1 });
    if (settings.marks.mine && !marksHidden && mine.balance > 0 && mine.entry !== null && last) {
      const pct = (last.close / mine.entry - 1) * 100;
      lines.push({ price: mine.entry * k, color: "#4cc9f0", title: `AVG ENTRY ${fmt(mine.entry * k)} · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` });
    }
    // Your standing orders on this token, where they'd fire (a trailing stop where it stands now).
    if (settings.showOrders && !marksHidden) {
      for (const o of standingOrders ?? []) {
        if (o.status !== "open" || o.token.toLowerCase() !== auction.token.toLowerCase()) continue;
        const at = o.kind === "trailing stop" ? Math.max(o.triggerUsd, (o.peak ?? 0) * (1 - (o.trailBps ?? 0) / 10_000)) : o.triggerUsd;
        const look =
          o.kind === "take profit"
            ? { color: "#5cc08c", title: "TP" }
            : o.kind === "stop loss"
              ? { color: "#e5484d", title: "SL" }
              : o.kind === "trailing stop"
                ? { color: "#ff9d6e", title: "Trail" }
                : { color: "#4cc9f0", title: "Dip buy" };
        lines.push({ price: at * k, color: look.color, title: look.title, style: 0 });
      }
    }
    engine.setPriceLines(lines);

    const times = candles.map((c) => c.time);
    const bars: SeriesMarker<Time>[] = marksHidden
      ? []
      : shownMarks
          .slice(-300)
          .flatMap((m) => {
            const time = barTime(times, m.time);
            if (time === null) return [];
            const style = MARK_STYLE[m.who];
            return [
              {
                time: time as Time,
                position: m.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
                shape: m.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
                color: m.who === "me" ? (m.side === "buy" ? "#5cc08c" : "#e5484d") : style.color,
                ...(m.who === "focus" ? { size: 1.4 } : {}),
                text: m.side === "buy" ? style.buy : style.sell,
              },
            ];
          })
          .sort((a, b) => (a.time as number) - (b.time as number));
    engine.setMarkers(bars);
  }, [engine, candles, k, fmt, minMove, config.type, drawnStudies, config.alerts, settings, marksHidden, gradPrice, shownMarks, mine, last, standingOrders, auction.token]);

  useChartAlerts({ external, slot, crux, auction, symbol, interval, gradPrice, config, set, candles, last, studyCtx, fmt, k, flash, replaying });

  // A synced layout: apply the other charts' crosshair, time range and timeframe.
  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);
  const kRef = useRef(k);
  useEffect(() => {
    kRef.current = k;
  }, [k]);
  const fromRemoteInterval = useRef(false);
  useEffect(() => {
    if (!sync || !engine) return;
    return sync.bus.subscribe((e) => {
      if (e.from === slot) return;
      if (e.kind === "crosshair" && sync.opts.crosshair) {
        if (e.time === null) return engine.showCrosshair(null, null);
        const cs = candlesRef.current;
        const bt = barTime(
          cs.map((c) => c.time),
          e.time,
        );
        const c = cs.find((x) => x.time === bt);
        engine.showCrosshair(bt, c ? c.close * kRef.current : null);
      } else if (e.kind === "range" && sync.opts.time) {
        remoteAt.current = Date.now();
        engine.showRange(e.start, e.end);
      } else if (e.kind === "interval" && sync.opts.interval) {
        fromRemoteInterval.current = true;
        set((c) => (c.interval === e.interval ? c : { ...c, interval: e.interval }));
      }
    });
  }, [sync, engine, slot, set]);
  useEffect(() => {
    if (fromRemoteInterval.current) {
      fromRemoteInterval.current = false;
      return;
    }
    if (syncRef.current?.opts.interval) syncRef.current.bus.publish({ kind: "interval", from: slot, interval: config.interval });
  }, [config.interval, slot]);

  // The symbol behind the candles, when wanted.
  useEffect(() => {
    engine?.setWatermark(settings.watermark ? symbol.replace(/^\$/, "") : null);
  }, [engine, settings.watermark, symbol]);

  // Compared tokens: each one's candles at this timeframe, fed by an invisible CompareFeed.
  const [compareData, setCompareData] = useState<Record<string, Candle[]>>({});
  const onCompareCandles = useCallback((pair: Address, c: Candle[]) => setCompareData((d) => (d[pair] === c ? d : { ...d, [pair]: c })), []);
  useEffect(() => {
    if (!engine) return;
    engine.setCompare(
      config.compare.map((c) => ({ key: c.pair, color: c.color, candles: compareData[c.pair] ?? [] })),
      k,
      fmt,
      minMove,
    );
  }, [engine, config.compare, compareData, k, fmt, minMove]);
  const setCompare = (next: typeof config.compare) => {
    // Comparing only reads right on a % scale: everything starts at 0% at the first visible bar.
    if (config.compare.length === 0 && next.length > 0) setScale("percent");
    if (next.length === 0 && scale === "percent") setScale("normal");
    set((c) => ({ ...c, compare: next }));
  };

  // The volume profile, when it's on: the visible range's volume by price, from the same flow as the on-chain studies.
  const profileInst = config.studies.find((s) => s.id === "vprofile" && !s.hidden);
  useEffect(() => {
    if (!engine) return;
    if (!profileInst) return engine.profile.set(null);
    const p = paramsOf(profileInst);
    const { up, down } = palette(settings);
    engine.profile.set({ candles, buyUsd: studyCtx.buyUsd, sellUsd: studyCtx.sellUsd, k, rows: p.rows, width: p.width, va: p.va, up, down });
  }, [engine, profileInst, candles, studyCtx, k, settings]);

  // Drawings: the frame they map through (times, interval, units), the saved ones and the one being placed.
  const draft = useMemo<Drawing | null>(() => {
    if (!tool) return null;
    if (tool === "brush") return stroke && stroke.length > 1 ? { id: "draft", tool, a: stroke[0], path: stroke } : null;
    if (tool === "emoji") return cursor ? { id: "draft", tool, a: cursor, text: sticker } : null;
    if (isPattern(tool)) {
      const path = cursor ? [...points, cursor] : points;
      return path.length > 0 ? { id: "draft", tool, a: path[0], path } : null;
    }
    const [p0, p1] = points;
    if (!p0) return cursor && TOOL_POINTS[tool] === 1 && tool !== "text" ? { id: "draft", tool, a: cursor } : null;
    if (!p1) {
      const b = cursor ?? p0;
      return { id: "draft", tool, a: p0, b, ...(tool === "long" || tool === "short" ? { c: defaultStop(p0, b) } : {}) };
    }
    return { id: "draft", tool, a: p0, b: p1, c: cursor ?? p1 };
  }, [tool, points, cursor, stroke, sticker]);
  const shownDrawings = useMemo(() => (dragged ? config.drawings.map((d) => (d.id === dragged.id ? dragged : d)) : config.drawings), [config.drawings, dragged]);
  useEffect(() => {
    if (!engine) return;
    engine.drawings.setFrame(candles, interval, k, fmt, palette(settings));
    engine.drawings.setDrawings(shownDrawings, draft, selected, drawHidden);
  }, [engine, candles, interval, k, fmt, settings, shownDrawings, draft, selected, drawHidden]);

  useChartLayoutSync({ slot, crux, auction, layoutKey, config, replace });
  // While a tool is active, clicks place points instead of panning the chart.
  useEffect(() => {
    const free = tool === null && !zoomMode;
    engine?.chart.applyOptions({ handleScroll: free, handleScale: free });
  }, [engine, tool, zoomMode]);

  // Fit the view when the timeframe changes or the first candles arrive.
  const fitKey = `${interval}:${candles.length > 0}`;
  useEffect(() => {
    engine?.fit();
  }, [engine, fitKey]);

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
  /** Alerts at these prices (USDC per token); asks for notification permission the first time. */
  const alertAt = (prices: number[]) => {
    set((c) => ({ ...c, alerts: [...c.alerts, ...prices.filter((p) => p > 0 && !c.alerts.includes(p))] }));
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    } catch {
      // ignore
    }
  };
  const addAlert = (value: string) => {
    const v = parseAmount(value);
    if (v === null) return "Enter a number, e.g. 140K or 0.00014.";
    alertAt([v / k]);
    return null;
  };
  const onRange = (seconds: number) => {
    if (!engine) return;
    if (seconds === 0 || now === null) engine.showAll();
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
  const pickTool = (t: DrawTool | null) => {
    setTool(t);
    setPoints([]);
    setCursor(null);
    if (t) setSelected(null);
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = area.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
  };
  const pointer = (e: { clientX: number; clientY: number }) => {
    const at = local(e);
    return engine && at ? engine.pointAt(at.x, at.y, settings.snap) : null;
  };
  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const addDrawing = (d: Drawing) => {
    set((c) => ({ ...c, drawings: [...c.drawings, d] }));
    setSelected(d.id);
    if (d.tool === "text" || d.tool === "callout") setEditing({ id: d.id, value: d.text ?? "" });
  };
  const updateDrawing = (id: string, fn: (d: Drawing) => Drawing) => set((c) => ({ ...c, drawings: c.drawings.map((d) => (d.id === id ? fn(d) : d)) }));
  const removeDrawing = (id: string) => {
    set((c) => ({ ...c, drawings: c.drawings.filter((d) => d.id !== id) }));
    setSelected(null);
  };
  const onChartClick = (e: MouseEvent<HTMLDivElement>) => {
    if (replay && replay.index === null && engine && view === "chart") {
      // Picking where the replay starts.
      const at = local(e);
      const bar = at ? engine.barAt(at.x) : null;
      if (bar !== null && allCandles.length > 1) setReplay({ index: Math.max(0, Math.min(allCandles.length - 2, bar)), playing: false, speed: replay.speed });
      return;
    }
    if (!tool || view !== "chart") return;
    const p = pointer(e);
    if (!p) return;
    const all = [...points, p];
    if (all.length < TOOL_POINTS[tool]) {
      setPoints(all);
      return;
    }
    const [a, b, c] = all;
    if (tool === "brush") return;
    if (isPattern(tool)) {
      addDrawing({ id: newId(), tool, a, path: all });
      pickTool(null);
      return;
    }
    addDrawing({
      id: newId(),
      tool,
      a,
      ...(b ? { b } : {}),
      ...(c ? { c } : tool === "long" || tool === "short" ? { c: defaultStop(a, b!) } : {}),
      ...(tool === "emoji" ? { text: sticker } : {}),
    });
    pickTool(null);
  };
  // Pressing on a drawing grabs it (a handle moves that point, the body moves it all) instead of panning the chart.
  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    if (!engine || view !== "chart" || e.button !== 0) return;
    // The palette, the drawing bar, menus and the note editor handle their own clicks.
    if ((e.target as HTMLElement).closest("[role=toolbar],[role=menu],[role=dialog],input,button")) return;
    const start = local(e);
    if (start && (zoomMode || tool === "brush")) {
      // Box zoom and the brush both follow a drag; the chart doesn't pan meanwhile.
      e.stopPropagation();
      e.preventDefault();
      const path: DrawPoint[] = [];
      const first = engine.pointAt(start.x, start.y, false);
      if (first) path.push(first);
      const move = (ev: globalThis.PointerEvent) => {
        const cur = local(ev);
        if (!cur) return;
        if (zoomMode) {
          setZoomBox({ x1: start.x, y1: start.y, x2: cur.x, y2: cur.y });
          return;
        }
        const p = engine.pointAt(cur.x, cur.y, false);
        if (p) {
          path.push(p);
          setStroke([...path]);
        }
      };
      const up = (ev: globalThis.PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const end = local(ev);
        if (zoomMode) {
          if (end && Math.abs(end.x - start.x) > 8 && Math.abs(end.y - start.y) > 8) engine.zoomTo(start.x, end.x, start.y, end.y);
          setZoomBox(null);
          setZoomMode(false);
          return;
        }
        // Thin the stroke to at most ~200 points so it stays light in the saved layout.
        const step = Math.max(1, Math.ceil(path.length / 200));
        const thin = path.filter((_, i) => i % step === 0 || i === path.length - 1);
        if (thin.length > 1) set((c) => ({ ...c, drawings: [...c.drawings, { id: newId(), tool: "brush", a: thin[0], path: thin }] }));
        setStroke(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    if (tool) return;
    const at = start;
    const hit = at ? engine.drawings.drawingAt(at.x, at.y) : null;
    if (!hit || !at) {
      setSelected(null);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    frame.current?.focus();
    setSelected(hit.id);
    const orig = config.drawings.find((d) => d.id === hit.id);
    // Locked drawings can be selected (to delete or recolour) but not moved.
    if (!orig || settings.drawLocked) return;
    drag.current = { orig, part: hit.part, x: at.x, y: at.y, moved: false, last: null };
    const move = (ev: globalThis.PointerEvent) => {
      const cur = local(ev);
      const d = drag.current;
      if (!cur || !d) return;
      const dx = cur.x - d.x;
      const dy = cur.y - d.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      d.moved = true;
      d.last = engine.drawings.moved(d.orig, d.part, dx, dy);
      setDragged(d.last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = drag.current;
      drag.current = null;
      const last = d?.moved ? d.last : null;
      if (last) updateDrawing(last.id, () => last);
      setDragged(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onAreaMove = (e: MouseEvent<HTMLDivElement>) => {
    if (tool) {
      setCursor(pointer(e));
      return;
    }
    if (!engine || drag.current) return;
    const at = local(e);
    const part = at ? (engine.drawings.drawingAt(at.x, at.y)?.part ?? null) : null;
    if (part !== hover) setHover(part);
  };
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const at = local(e);
    const hit = engine && at ? engine.drawings.drawingAt(at.x, at.y) : null;
    const d = hit && config.drawings.find((x) => x.id === hit.id);
    if (d?.tool === "text" || d?.tool === "callout") setEditing({ id: d.id, value: d.text ?? "" });
  };
  const commitText = () => {
    if (!editing) return;
    const value = editing.value.trim();
    if (value) updateDrawing(editing.id, (d) => ({ ...d, text: value.slice(0, 120) }));
    else removeDrawing(editing.id);
    setEditing(null);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Escape" && (tool || selected || zoomMode)) {
      pickTool(null);
      setSelected(null);
      setZoomMode(false);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      removeDrawing(selected);
    } else if (e.altKey && !mod && TOOL_KEYS[e.key.toLowerCase()]) {
      e.preventDefault();
      const t = TOOL_KEYS[e.key.toLowerCase()];
      setPaletteOpen(true);
      pickTool(tool === t ? null : t);
    } else if (e.altKey && e.key.toLowerCase() === "r") {
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

  // Time left in the current candle, on the price axis under the last price.
  const countdownY = settings.countdown && !replay && last && engine && now !== null ? engine.yOf(last.close * k) : null;
  const countdown =
    countdownY !== null && now !== null && engine ? (
      <span
        aria-label="Time to candle close"
        className="pointer-events-none absolute z-10 rounded-[2px] bg-panel-2/95 text-center font-mono text-[10px] text-muted"
        style={{ top: countdownY + 9, width: engine.axisWidth(), ...(settings.scaleSide === "left" ? { left: 0 } : { right: 0 }) }}
      >
        {(() => {
          const left = Math.max(0, Math.floor(now / interval) * interval + interval - now);
          const h = Math.floor(left / 3600);
          const m = Math.floor((left % 3600) / 60);
          const s2 = left % 60;
          return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s2).padStart(2, "0")}`;
        })()}
      </span>
    ) : null;

  // The selected drawing's bar, just above its first point (kept inside the chart).
  const sel = selected ? config.drawings.find((d) => d.id === selected) : undefined;
  const selAt = sel && engine ? engine.drawings.screenOf(sel.a) : null;
  const selectedBar =
    sel && selAt ? (
      <DrawingBar
        drawing={sel}
        x={Math.max(4, selAt.x - 40)}
        y={Math.max(4, selAt.y - 44)}
        onColor={(color) => updateDrawing(sel.id, (d) => ({ ...d, color }))}
        onAlert={
          sel.tool === "hline" || sel.tool === "ray"
            ? () => {
                alertAt([sel.a.price]);
                flash(`Alert set at ${fmt(sel.a.price * k)}`);
              }
            : (sel.tool === "long" || sel.tool === "short") && sel.b
              ? () => {
                  const stop = sel.c ?? defaultStop(sel.a, sel.b!);
                  alertAt([sel.b!.price, stop.price]);
                  flash(`Alerts at target ${fmt(sel.b!.price * k)} and stop ${fmt(stop.price * k)}`);
                }
              : null
        }
        onEditText={sel.tool === "text" || sel.tool === "callout" ? () => setEditing({ id: sel.id, value: sel.text ?? "" }) : null}
        onDuplicate={() => {
          const shift = engine?.drawings.moved(sel, "body", 24, 24) ?? sel;
          addDrawing({ ...shift, id: newId() });
        }}
        onDelete={() => removeDrawing(sel.id)}
      />
    ) : null;
  const editAt = editing && engine ? (() => {
    const d = config.drawings.find((x) => x.id === editing.id);
    return d ? engine.drawings.screenOf(d.tool === "callout" && d.b ? d.b : d.a) : null;
  })() : null;
  const textEditor = editing && editAt ? (
    <input
      autoFocus
      aria-label="Note text"
      value={editing.value}
      maxLength={120}
      placeholder="Type a note, Enter to save"
      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitText();
        if (e.key === "Escape") {
          if (!config.drawings.find((d) => d.id === editing.id)?.text) removeDrawing(editing.id);
          setEditing(null);
        }
      }}
      onBlur={commitText}
      onPointerDownCapture={(e) => e.stopPropagation()}
      style={{ left: editAt.x - 4, top: editAt.y - 12 }}
      className="absolute z-30 w-56 rounded-[3px] border border-signal/60 bg-panel-2 px-2 py-1 text-[12px] text-chrome outline-none placeholder:text-dim"
    />
  ) : null;
  const live = swaps.data !== undefined && !swaps.isError;

  return (
    // A terminal frame, as on TradingView: one toolbar on top, the drawing rail on the left, the bottom bar under it all.
    <div ref={frame} tabIndex={-1} onKeyDown={onKey} className={`flex h-full min-h-[inherit] flex-col overflow-hidden bg-void outline-none ${full ? "" : "rounded-[6px] border border-line"}`}>
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
        live={live && !replay}
        replaying={replay !== null}
        compareSlot={<CompareButton current={auction.pair} items={config.compare} onChange={setCompare} />}
        overlaysSlot={<OverlaysButton settings={settings} onChange={setSettings} counts={markCounts} />}
        layoutSlot={layoutSlot}
        onReplay={() => setReplay((r) => (r ? null : { index: null, playing: false, speed: 1 }))}
      />

      <div className="relative flex min-h-0 flex-1">
      {view === "chart" && (
        // The drawing tools' own column: they never cover the candles.
        <div className={`relative z-20 shrink-0 border-r border-line bg-panel transition-[width] ${paletteOpen ? "w-11" : "w-3.5"}`}>
          <DrawingPalette
            open={paletteOpen}
            setOpen={setPaletteOpen}
            tool={tool}
            setTool={pickTool}
            count={config.drawings.length}
            onClear={() => set((c) => ({ ...c, drawings: [] }))}
            settings={settings}
            onSettings={setSettings}
            zoom={zoomMode}
            onZoom={() => {
              pickTool(null);
              setZoomMode((z) => !z);
            }}
            sticker={sticker}
            onSticker={setSticker}
            hidden={drawHidden}
            onHidden={() => setDrawHidden((h) => !h)}
          />
        </div>
      )}
      <div
        ref={area}
        // On phones the chart grows by a pane's height for each indicator pane, so panes never squeeze the candles.
        style={{ "--chart-min": `${300 + 110 * computedStudies.filter((c) => c.study.pane === "pane").length}px` } as CSSProperties}
        className={`relative min-h-[300px] min-w-0 flex-1 touch-none overflow-hidden max-lg:min-h-[var(--chart-min)] ${
          tool || zoomMode ? "cursor-crosshair" : dragged ? "cursor-grabbing" : hover === "body" ? "cursor-move" : hover ? "cursor-grab" : ""
        }`}
        onContextMenu={onContext}
        onMouseDown={() => frame.current?.focus()}
        onPointerDownCapture={onPointerDownCapture}
        // A drawing being dragged keeps the chart from panning under it (mouse and touch).
        onMouseDownCapture={(e) => drag.current && e.stopPropagation()}
        onTouchStartCapture={(e) => drag.current && e.stopPropagation()}
        onClick={onChartClick}
        onDoubleClick={onDoubleClick}
        onMouseMove={onAreaMove}
        onMouseLeave={() => setHover(null)}
      >
        <div ref={host} className={`absolute inset-0 ${view === "table" ? "invisible" : ""}`} aria-label={`${symbol} chart`} role="img" />
        {view === "chart" && (
          <Legend
            inset={false}
            title={`${name ?? symbol} · ${intervalLabel} · CRUX`}
            candle={shown}
            k={k}
            fmt={fmt}
            studies={computedStudies.map((c) => ({ id: c.inst.id, title: c.title, hidden: Boolean(c.inst.hidden), priced: c.study.priced, lines: c.lines }))}
            index={shownIndex}
            onSettings={setEditingStudy}
            onToggle={(id) => updateStudy(id, (s) => ({ ...s, hidden: !s.hidden }))}
            onRemove={(id) => updateStudy(id, () => null)}
            show={settings.status}
            compares={config.compare.map((c) => ({
              key: c.pair,
              label: c.symbol,
              color: c.color,
              onRemove: () => setCompare(config.compare.filter((x) => x.pair !== c.pair)),
            }))}
          />
        )}
        {view === "chart" && lockedX !== null && (
          <div className="pointer-events-none absolute bottom-7 top-0 z-[5] w-px border-l border-dashed border-[#4cc9f0]/70" style={{ left: lockedX }} aria-hidden="true" />
        )}
        {view === "chart" && !drawHidden && !tool && !dragged && selectedBar}
        {view === "chart" && editing && textEditor}
        {zoomBox && (
          <div
            className="pointer-events-none absolute z-20 border border-[#4cc9f0] bg-[#4cc9f0]/10"
            style={{ left: Math.min(zoomBox.x1, zoomBox.x2), top: Math.min(zoomBox.y1, zoomBox.y2), width: Math.abs(zoomBox.x2 - zoomBox.x1), height: Math.abs(zoomBox.y2 - zoomBox.y1) }}
            aria-hidden="true"
          />
        )}
        {focus && view === "chart" && (
          <button
            type="button"
            onClick={() => onFocus?.(null)}
            title="Show every marked trade again"
            className="absolute right-16 top-2 z-20 inline-flex items-center gap-1.5 rounded-[4px] border border-[#ff9d6e]/50 bg-panel-2/95 px-2 py-0.5 font-mono text-[11px] text-[#ff9d6e] hover:bg-[#ff9d6e]/15"
          >
            Trades of {focus.slice(0, 6)}…{focus.slice(-4)} · {shownMarks.length} <span aria-hidden="true">×</span>
          </button>
        )}
        {tool && (
          <p className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-[4px] border border-line-2 bg-panel-2/95 px-2.5 py-1 text-[11.5px] text-muted">
            {TOOL_INFO[tool].label}:{" "}
            {tool === "brush"
              ? "drag to draw"
              : isPattern(tool)
                ? `click point ${points.length + 1} of ${TOOL_POINTS[tool]}${PATTERN_LABELS[tool]?.[points.length] ? ` (${PATTERN_LABELS[tool]![points.length]})` : ""}`
                : tool === "callout"
                  ? points.length === 0
                    ? "click what it points at"
                    : "click where the note goes"
                  : tool === "fibext" && points.length > 0
                    ? points.length === 1
                      ? "click the end of the move (B)"
                      : "click where the extension starts (C)"
                    : tool === "curve" && points.length > 0
                      ? points.length === 1
                        ? "click where it ends"
                        : "click where it bends toward"
                      : tool === "circle" && points.length === 0
                        ? "click the centre"
                  : tool === "pitchfork" && points.length > 0
                    ? points.length === 1
                      ? "click the first swing"
                      : "click the second swing"
                    : TOOL_POINTS[tool] === 1
              ? "click to place it"
              : points.length === 0
                ? tool === "long" || tool === "short"
                  ? "click the entry"
                  : "click the first point"
                : points.length === 1
                  ? tool === "long" || tool === "short"
                    ? "click the target (the stop starts at 2 : 1, drag it after)"
                    : tool === "channel"
                      ? "click the end of the base line"
                      : "click the second point"
                  : "click where the parallel line runs"}{" "}
            · {settings.snap ? "magnet on · " : ""}Esc to cancel
          </p>
        )}
        {view === "chart" && countdown}
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
            drawings={config.drawings.length}
            onRemoveDrawings={() => set((c) => ({ ...c, drawings: [] }))}
            onResetLayout={() => {
              replace(DEFAULT_CONFIG);
              flash("Chart layout reset for this token");
            }}
          />
        )}
        {toast && (
          <p role="status" className="absolute bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-[4px] border border-line-2 bg-panel-2 px-3 py-1.5 text-[12px] text-chrome shadow-lg">
            {toast}
          </p>
        )}
        {swaps.isPending && <p className="absolute inset-x-0 top-1/2 text-center text-[12px] text-dim">Reading trades from Base Sepolia…</p>}
        {swaps.data && candles.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-[12px] text-dim">{external ? "No swaps in this pool in the last few days." : `No trades since graduation. The pool opened at ${fmtTokenPrice(gradPrice)}.`}</p>
        )}
      </div>
      </div>
      {replay && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#4cc9f0]/[0.06] px-2 py-1.5 text-[11.5px]" role="toolbar" aria-label="Bar replay">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#4cc9f0]">Replay</span>
          {replay.index === null ? (
            <span className="text-muted">Click a candle to start from it.</span>
          ) : (
            <>
              <button type="button" onClick={() => setReplay({ ...replay, index: null, playing: false })} className="rounded-[3px] px-1.5 py-0.5 text-muted hover:text-chrome" title="Pick another start">
                ⏮
              </button>
              <button
                type="button"
                onClick={() => setReplay({ ...replay, playing: !replay.playing })}
                className="rounded-[3px] border border-[#4cc9f0]/50 px-2 py-0.5 text-[#4cc9f0] hover:bg-[#4cc9f0]/10"
              >
                {replay.playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <button
                type="button"
                disabled={replay.index >= allCandles.length - 1}
                onClick={() => setReplay({ ...replay, playing: false, index: Math.min(allCandles.length - 1, replay.index! + 1) })}
                className="rounded-[3px] px-1.5 py-0.5 text-muted hover:text-chrome disabled:opacity-40"
                title="Next candle"
              >
                ⏭
              </button>
              <span className="flex gap-0.5" role="radiogroup" aria-label="Replay speed">
                {[1, 3, 10].map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    role="radio"
                    aria-checked={replay.speed === sp}
                    onClick={() => setReplay({ ...replay, speed: sp })}
                    className={`rounded-[3px] px-1.5 py-0.5 font-mono ${replay.speed === sp ? "bg-tint/[0.08] text-chrome" : "text-dim hover:text-chrome"}`}
                  >
                    {sp}×
                  </button>
                ))}
              </span>
              <span className="font-mono text-dim">
                {replay.index + 1} / {allCandles.length}
                {candles.length > 0 && ` · ${new Date(candles[candles.length - 1].time * 1000).toISOString().slice(5, 16).replace("T", " ")} UTC`}
              </span>
            </>
          )}
          <button type="button" onClick={() => setReplay(null)} className="ml-auto rounded-[3px] px-1.5 py-0.5 text-muted hover:text-chrome">
            Back to live ✕
          </button>
        </div>
      )}
      <BottomBar
        now={now}
        onRange={onRange}
        scale={scale}
        setScale={setScale}
        auto={engine?.isAutoScale() ?? true}
        onAuto={() => engine?.autoScale()}
        note={
          <>
            {external
              ? "Every swap in this Uniswap pool, its fee included."
              : "Every trade on the locked liquidity since graduation (batch fills during an anti-sniper window, then Uniswap V2 swaps), the 0.3% pool fee included."}{" "}
            {config.units === "mcap" ? "Market cap = price × total supply." : ""} Right-click the chart for more; Alt+R resets the view.
            {swaps.data?.truncated && " Only the last three days are shown."}
          </>
        }
      />
      {config.compare.map((c) => (
        <CompareFeed key={c.pair} item={c} interval={interval} onCandles={onCompareCandles} />
      ))}
      {editing_study && config.studies.some((s) => s.id === editing_study) && (
        <StudySettings
          inst={config.studies.find((s) => s.id === editing_study)!}
          rules={config.rules}
          onChange={(next) => updateStudy(next.id, () => next)}
          onRules={(rules) => set((c) => ({ ...c, rules }))}
          onRemove={() => {
            updateStudy(editing_study, () => null);
            set((c) => ({ ...c, rules: c.rules.filter((r) => r.study !== editing_study) }));
            setEditingStudy(null);
          }}
          onClose={() => setEditingStudy(null)}
          unitHint={config.units === "mcap" ? "market cap (USD)" : "USD per token"}
          k={k}
        />
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={setSettings} />
    </div>
  );
}
