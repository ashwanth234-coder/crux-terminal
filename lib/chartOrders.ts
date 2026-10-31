"use client";

import { useEffect } from "react";
import type { Address } from "viem";

/**
 * Trading from the chart: the chart's right-click menu asks the order ticket on the same page to open a standing
 * order at a price (a take profit above the market, a stop loss or a buy-the-dip below it), as a browser event, so the
 * two components stay apart. The ticket fills in the trigger; the trader still sizes and signs the order.
 */
export type ChartOrderKind = "takeProfit" | "stopLoss" | "dip";
export type ChartOrderRequest = { token: Address; kind: ChartOrderKind; price: number };

const EVENT = "crux:order-at";

export function requestOrderAt(r: ChartOrderRequest) {
  window.dispatchEvent(new CustomEvent<ChartOrderRequest>(EVENT, { detail: r }));
}

/** Calls `on` for requests about `token` (USD per token in `price`). */
export function useOrderRequests(token: Address, on: (r: ChartOrderRequest) => void) {
  useEffect(() => {
    const listen = (e: Event) => {
      const r = (e as CustomEvent<ChartOrderRequest>).detail;
      if (r && r.token.toLowerCase() === token.toLowerCase()) on(r);
    };
    window.addEventListener(EVENT, listen);
    return () => window.removeEventListener(EVENT, listen);
  }, [token, on]);
}
