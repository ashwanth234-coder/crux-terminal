"use client";

import { useEffect, useRef, type Dispatch } from "react";
import type { Address } from "viem";
import { getServerAlerts, pushOn, setServerAlerts } from "@/lib/alertSync";
import type { AccountSigner } from "@/lib/account";
import type { Candle } from "@/lib/candles";
import { computeInstance, paramsOf, studyById, type StudyContext, type StudyId } from "@/lib/indicators";
import type { ChartConfig } from "./settings";

/**
 * The chart's alerts (moved out of ProChart): price alerts fire when the latest close crosses them, indicator alerts
 * when a line crosses its target between the last two candles; both then clear (or stay, for repeating rules). Logged
 * in, the first chart's alerts also live at the relay, which fires them by web push with Crux closed.
 */
export function useChartAlerts(o: {
  external: boolean;
  slot: number;
  crux: { sign: AccountSigner | null; owner: Address | null };
  auction: { token: Address; pair: Address };
  symbol: string;
  interval: number;
  gradPrice: number;
  config: ChartConfig;
  set: Dispatch<(c: ChartConfig) => ChartConfig>;
  candles: Candle[];
  last: Candle | null;
  studyCtx: StudyContext;
  fmt: (v: number) => string;
  k: number;
  flash: (msg: string) => void;
  replaying: boolean;
}) {
  const { external, slot, crux, auction, symbol, interval, gradPrice, config, set, candles, last, studyCtx, fmt, k, flash, replaying } = o;
  // Logged in, the first chart's alerts live at the relay too, which fires them with Crux closed (web push). On
  // arrival the relay's pending set wins (alerts that fired while you were away are gone); after that every change is
  // sent there a moment later. Logged out, alerts stay in this tab.
  const alertsReady = useRef(false);
  // An alert this tab saw fire while push is on: the relay fires it too (by push) and clears it itself, so the tab's
  // removal isn't sent there, or the relay would lose it before its own check and nothing would be pushed.
  const firedHere = useRef(false);
  useEffect(() => {
    // The relay watches Crux launch pools only: an outside token's alerts fire in this tab.
    if (external || slot !== 0 || alertsReady.current || !crux.sign || !crux.owner) return;
    const [sign, owner] = [crux.sign, crux.owner];
    void getServerAlerts(sign, owner, auction.token)
      .then((srv) => {
        if (srv.updatedAt !== null) set((c) => ({ ...c, alerts: srv.prices, rules: srv.rules as typeof c.rules }));
      })
      .catch(() => {
        // No alert service (or offline): the chart's own alerts stand.
      })
      .finally(() => {
        alertsReady.current = true;
      });
  }, [external, slot, crux.sign, crux.owner, auction.token, set]);
  useEffect(() => {
    if (external || slot !== 0 || !alertsReady.current || !crux.sign || !crux.owner) return;
    const [sign, owner] = [crux.sign, crux.owner];
    const t = setTimeout(() => {
      if (firedHere.current) {
        firedHere.current = false;
        return;
      }
      const used = new Set(config.rules.map((r) => r.study));
      void setServerAlerts(sign, owner, auction.token, {
        pair: auction.pair,
        symbol,
        interval,
        openPrice: gradPrice,
        prices: config.alerts,
        rules: config.rules,
        studies: config.studies.filter((s) => used.has(s.id)),
      }).catch(() => {});
    }, 2_000);
    return () => clearTimeout(t);
  }, [external, slot, crux.sign, crux.owner, auction.token, auction.pair, symbol, interval, gradPrice, config.alerts, config.rules, config.studies]);

  // Alerts fire when the latest close crosses them, then clear (a browser notification if allowed).
  const lastClose = last?.close ?? null;
  const prevClose = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevClose.current;
    prevClose.current = lastClose;
    if (prev === null || lastClose === null || prev === lastClose || replaying) return;
    const hit = config.alerts.filter((a) => (prev < a && lastClose >= a) || (prev > a && lastClose <= a));
    if (hit.length === 0) return;
    const msg = `${symbol} crossed ${hit.map((a) => fmt(a * k)).join(", ")}`;
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && !pushOn()) new Notification("CRUX alert", { body: msg });
    } catch {
      // Notifications unavailable: the in-page message below still shows.
    }
    if (pushOn() && alertsReady.current) firedHere.current = true;
    setTimeout(() => {
      flash(msg);
      set((c) => ({ ...c, alerts: c.alerts.filter((a) => !hit.includes(a)) }));
    }, 0);
  }, [lastClose, config.alerts, symbol, fmt, k, flash, set, replaying]);

  // Indicator alerts: a line crossing its target between the last two candles fires once for that candle.
  const firedAt = useRef(new Map<string, number>());
  useEffect(() => {
    const n = candles.length - 1;
    if (n < 1 || config.rules.length === 0 || replaying) return;
    const seriesOf = (id: StudyId, key: string) => {
      const inst = config.studies.find((s) => s.id === id);
      return inst ? (computeInstance(inst, candles, studyCtx).find((l) => l.key === key)?.values ?? null) : null;
    };
    const fired: string[] = [];
    const messages: string[] = [];
    for (const r of config.rules) {
      const a = seriesOf(r.study, r.line);
      if (!a) continue;
      const b = r.target === "price" ? candles.map((c) => c.close) : "line" in r.target ? seriesOf(r.study, r.target.line) : null;
      const at = (i: number) => (b ? b[i] : (r.target as { value: number }).value);
      const [pa, ca, pb, cb] = [a[n - 1], a[n], at(n - 1), at(n)];
      if (pa == null || ca == null || pb == null || cb == null) continue;
      const up = pa <= pb && ca > cb;
      const down = pa >= pb && ca < cb;
      if (!(r.op === "up" ? up : r.op === "down" ? down : up || down)) continue;
      if (firedAt.current.get(r.id) === candles[n].time) continue;
      firedAt.current.set(r.id, candles[n].time);
      fired.push(r.id);
      const study = studyById(r.study);
      const target = r.target === "price" ? "the price" : "line" in r.target ? r.target.line : study.priced ? fmt(r.target.value * k) : String(r.target.value);
      messages.push(`${symbol}: ${study.title(paramsOf(config.studies.find((s) => s.id === r.study) ?? { id: r.study }))} ${r.line} crossed ${up ? "above" : "below"} ${target}`);
    }
    if (fired.length === 0) return;
    const msg = messages.join(" · ");
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && !pushOn()) new Notification("CRUX alert", { body: msg });
    } catch {
      // Notifications unavailable: the in-page message still shows.
    }
    if (pushOn() && alertsReady.current) firedHere.current = true;
    setTimeout(() => {
      flash(msg);
      set((c) => ({ ...c, rules: c.rules.filter((r) => r.repeat || !fired.includes(r.id)) }));
    }, 0);
  }, [candles, config.rules, config.studies, studyCtx, symbol, fmt, k, flash, set, replaying]);

}
