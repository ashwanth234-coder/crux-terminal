"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import type { Candle } from "@/lib/candles";
import type { ChartEngine } from "./engine";
import { Legend } from "./Legend";

/**
 * One value outside React that small parts of the chart read on their own (the hovered bar, "the view moved"): the
 * crosshair and panning change it on every frame, and only the part that shows it re-renders, never the whole chart.
 */
export type ValueStore<T> = { get: () => T; set: (v: T) => void; subscribe: (l: () => void) => () => void };

export function valueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (Object.is(v, value)) return;
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

/**
 * The legend for the bar under the crosshair (or the newest): React renders it for the newest bar, and the legend
 * itself writes the hovered bar's numbers into its own text as the crosshair moves (Legend's `live`), with no render.
 */
export function HoverLegend({
  hover,
  candles,
  ...rest
}: { hover: ValueStore<number | null>; candles: Candle[] } & Omit<ComponentProps<typeof Legend>, "candle" | "index" | "live">) {
  const index = candles.length - 1;
  return <Legend {...rest} candle={index >= 0 ? candles[index] : null} index={index} live={{ hover, candles }} />;
}

/**
 * Time left in the current candle, on the price axis under the last price. It places itself and writes its own text:
 * each second from a timer, and whenever the view moves, with no render of anything.
 */
export function AxisCountdown({
  view,
  engine,
  price,
  interval,
  side,
}: {
  view: ValueStore<number>;
  engine: ChartEngine;
  /** The last price, in the chart's units. */
  price: number;
  interval: number;
  side: "left" | "right";
}) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      const node = el.current;
      if (!node) return;
      const y = Number.isFinite(price) ? engine.yOf(price) : null;
      if (y === null) {
        node.style.display = "none";
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const left = Math.max(0, Math.floor(now / interval) * interval + interval - now);
      const h = Math.floor(left / 3600);
      const m = Math.floor((left % 3600) / 60);
      const s = left % 60;
      node.style.display = "";
      node.style.top = `${y + 9}px`;
      node.style.width = `${engine.axisWidth()}px`;
      node.textContent = `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
    };
    paint();
    // Once more when the newest bar has finished easing to its price (the axis moves with it).
    const settle = setTimeout(paint, 130);
    const off = view.subscribe(paint);
    const timer = setInterval(paint, 1_000);
    return () => {
      clearTimeout(settle);
      clearInterval(timer);
      off();
    };
  }, [view, engine, price, interval]);
  return (
    <span
      ref={el}
      aria-label="Time to candle close"
      className="pointer-events-none absolute z-10 rounded-[2px] bg-panel-2/95 text-center font-mono text-[10px] text-muted"
      style={side === "left" ? { left: 0 } : { right: 0 }}
    />
  );
}
