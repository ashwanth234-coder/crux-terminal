import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  LogicalRange,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/candles";
import { studyById, type StudyId } from "@/lib/indicators";
import { palette, type ChartSettings, type ChartType, type ScaleMode } from "./settings";

type Lc = typeof import("lightweight-charts");

export type Theme = { bg: string; line: string; text: string; chrome: string; dim: string };

/** Formats a value on the price axis: market cap compact ($140.6K) or a token price ($0.000141). */
export type Formatter = (v: number) => string;

const t = (c: Candle) => c.time as UTCTimestamp;

/**
 * The CRUX chart on lightweight-charts: one price pane (candles in the chosen style, volume underneath, overlay
 * studies) and one pane per oscillator study (RSI, MACD). Owns every series and price line; ProChart drives it with
 * data and options and listens to the crosshair.
 */
export class ChartEngine {
  readonly chart: IChartApi;
  private readonly lc: Lc;
  private readonly theme: Theme;
  private main: ISeriesApi<SeriesType>;
  private type: ChartType = "candles";
  private readonly volume: ISeriesApi<"Histogram">;
  private studySeries: ISeriesApi<SeriesType>[] = [];
  private paneLines: IPriceLine[] = [];
  private mainLines: IPriceLine[] = [];
  private markers: ISeriesMarkersPluginApi<Time> | null = null;
  private markerData: SeriesMarker<Time>[] = [];
  private settings: ChartSettings;

  constructor(lc: Lc, host: HTMLElement, theme: Theme, settings: ChartSettings) {
    this.lc = lc;
    this.theme = theme;
    this.settings = settings;
    this.chart = lc.createChart(host, {
      autoSize: true,
      layout: {
        background: { type: lc.ColorType.Solid, color: theme.bg },
        textColor: theme.text,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10,
        // The library's attribution is given in the chart's footnote instead (its licence allows either).
        attributionLogo: false,
        panes: { separatorColor: theme.line, separatorHoverColor: `${theme.chrome}33` },
      },
      rightPriceScale: { borderColor: theme.line, scaleMargins: { top: 0.12, bottom: 0.24 } },
      timeScale: { borderColor: theme.line, timeVisible: true, rightOffset: 6 },
      crosshair: { horzLine: { labelBackgroundColor: "#2a2d33" }, vertLine: { labelBackgroundColor: "#2a2d33" } },
    });
    this.volume = this.chart.addSeries(lc.HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    this.volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.main = this.addMain("candles");
    this.markers = lc.createSeriesMarkers(this.main, []);
    this.applySettings(settings);
  }

  remove() {
    this.chart.remove();
  }

  /** Grid, crosshair magnet, seconds on the time axis, volume, up / down colours. */
  applySettings(s: ChartSettings) {
    this.settings = s;
    const grid = s.grid ? this.theme.line : "transparent";
    this.chart.applyOptions({
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: s.magnet ? this.lc.CrosshairMode.MagnetOHLC : this.lc.CrosshairMode.Normal },
      timeScale: { secondsVisible: s.seconds },
    });
    this.volume.applyOptions({ visible: s.volume });
    this.setType(this.type, true);
  }

  private addMain(type: ChartType): ISeriesApi<SeriesType> {
    const { up, down } = palette(this.settings);
    const chrome = this.theme.chrome;
    const lc = this.lc;
    switch (type) {
      case "hollow":
        return this.chart.addSeries(lc.CandlestickSeries, {
          upColor: "rgba(0,0,0,0)",
          borderUpColor: up,
          wickUpColor: up,
          downColor: down,
          borderDownColor: down,
          wickDownColor: down,
          borderVisible: true,
        });
      case "bars":
        return this.chart.addSeries(lc.BarSeries, { upColor: up, downColor: down, thinBars: false });
      case "line":
        return this.chart.addSeries(lc.LineSeries, { color: chrome, lineWidth: 2 });
      case "area":
        return this.chart.addSeries(lc.AreaSeries, { lineColor: chrome, topColor: `${chrome}33`, bottomColor: `${chrome}00`, lineWidth: 2 });
      case "baseline":
        return this.chart.addSeries(lc.BaselineSeries, {
          topLineColor: up,
          topFillColor1: `${up}40`,
          topFillColor2: `${up}05`,
          bottomLineColor: down,
          bottomFillColor1: `${down}05`,
          bottomFillColor2: `${down}40`,
          lineWidth: 2,
        });
      default:
        return this.chart.addSeries(lc.CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    }
  }

  /** Swaps the main series' style (recreated, so the next setData fills it). */
  setType(type: ChartType, force = false) {
    if (type === this.type && !force) return;
    this.mainLines = [];
    this.markers?.detach();
    this.chart.removeSeries(this.main);
    this.type = type;
    this.main = this.addMain(type);
    this.markers = this.lc.createSeriesMarkers(this.main, this.markerData);
  }

  /** Marks on the bars (B / S, D, W, T), kept across chart-style changes. */
  setMarkers(markers: SeriesMarker<Time>[]) {
    this.markerData = markers;
    this.markers?.setMarkers(markers);
  }

  /** Candles (in USDC per token) shown in the chosen units: `k` multiplies prices (total supply for market cap). */
  setData(candles: Candle[], k: number, format: Formatter, minMove: number) {
    const { up, down } = palette(this.settings);
    const priceFormat = { type: "custom" as const, formatter: format, minMove };
    this.main.applyOptions({ priceFormat });
    if (this.type === "candles" || this.type === "hollow" || this.type === "bars") {
      (this.main as ISeriesApi<"Candlestick">).setData(candles.map((c) => ({ time: t(c), open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })));
    } else {
      if (this.type === "baseline" && candles.length) {
        (this.main as ISeriesApi<"Baseline">).applyOptions({ baseValue: { type: "price", price: candles[0].open * k } });
      }
      (this.main as ISeriesApi<"Line">).setData(candles.map((c) => ({ time: t(c), value: c.close * k })));
    }
    this.volume.setData(candles.map((c) => ({ time: t(c), value: c.volume, color: `${c.close >= c.open ? up : down}55` })));
  }

  /** Rebuilds the studies: overlays on the price pane, one pane per oscillator (RSI, MACD) below it. */
  setStudies(ids: StudyId[], candles: Candle[], k: number, format: Formatter, minMove: number) {
    for (const s of this.studySeries) this.chart.removeSeries(s);
    this.studySeries = [];
    this.paneLines = [];
    while (this.chart.panes().length > 1) this.chart.removePane(this.chart.panes().length - 1);

    let paneIndex = 0;
    for (const id of ids) {
      const study = studyById(id);
      const pane = study.pane === "price" ? 0 : ++paneIndex;
      const scale = study.priced ? k : 1;
      const fmt = study.priced ? { type: "custom" as const, formatter: format, minMove } : { type: "price" as const, precision: 1, minMove: 0.1 };
      let first: ISeriesApi<SeriesType> | null = null;
      for (const line of study.compute(candles)) {
        const data = candles.flatMap((c, i) => (line.values[i] === null ? [] : [{ time: t(c) as Time, value: (line.values[i] as number) * scale }]));
        const opts = { color: line.color, priceLineVisible: false, lastValueVisible: pane > 0, priceFormat: fmt, crosshairMarkerVisible: false };
        const series =
          line.kind === "histogram"
            ? this.chart.addSeries(this.lc.HistogramSeries, opts, pane)
            : this.chart.addSeries(this.lc.LineSeries, { ...opts, lineWidth: 1 }, pane);
        if (line.kind === "histogram") {
          (series as ISeriesApi<"Histogram">).setData(
            data.map((d) => ({ ...d, color: d.value >= 0 ? `${palette(this.settings).up}88` : `${palette(this.settings).down}88` })),
          );
        } else {
          series.setData(data);
        }
        this.studySeries.push(series);
        first ??= series;
      }
      for (const level of study.levels ?? []) {
        if (first) this.paneLines.push(first.createPriceLine({ price: level, color: `${this.theme.dim}99`, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" }));
      }
    }
    const panes = this.chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
  }

  /** Horizontal lines on the price pane (the clearing price, alerts), replaced as a set. */
  setPriceLines(lines: { price: number; color: string; title: string; style?: number }[]) {
    for (const l of this.mainLines) this.main.removePriceLine(l);
    this.mainLines = lines.map((l) =>
      this.main.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style ?? 2, axisLabelVisible: true, title: l.title }),
    );
  }

  setScale(mode: ScaleMode) {
    const m = mode === "log" ? this.lc.PriceScaleMode.Logarithmic : mode === "percent" ? this.lc.PriceScaleMode.Percentage : this.lc.PriceScaleMode.Normal;
    this.chart.priceScale("right").applyOptions({ mode: m });
  }

  /** Back to "everything visible, scale fitted": the reset the context menu and Alt+R do. */
  reset() {
    this.chart.priceScale("right").applyOptions({ autoScale: true });
    for (const p of this.chart.panes()) for (const s of p.getSeries()) s.priceScale().applyOptions({ autoScale: true });
    this.chart.timeScale().fitContent();
  }

  autoScale() {
    this.chart.priceScale("right").applyOptions({ autoScale: true });
  }

  isAutoScale() {
    return this.chart.priceScale("right").options().autoScale;
  }

  fit() {
    this.chart.timeScale().fitContent();
  }

  /** Shows `from`..`to` (unix seconds); falls back to everything when there's no data there. */
  showRange(from: number, to: number) {
    try {
      this.chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
    } catch {
      this.fit();
    }
  }

  onCrosshair(cb: (p: MouseEventParams) => void) {
    this.chart.subscribeCrosshairMove(cb);
  }

  onRange(cb: (r: LogicalRange | null) => void) {
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
  }

  /** The price-axis value at a y coordinate in the price pane. */
  priceAt(y: number): number | null {
    return this.main.coordinateToPrice(y);
  }

  /** The bar index (logical) at an x coordinate, rounded to the nearest bar. */
  barAt(x: number): number | null {
    const l = this.chart.timeScale().coordinateToLogical(x);
    return l === null ? null : Math.round(l);
  }

  xOf(time: number): number | null {
    return this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
  }

  screenshot(): HTMLCanvasElement {
    return this.chart.takeScreenshot(true, false);
  }
}
