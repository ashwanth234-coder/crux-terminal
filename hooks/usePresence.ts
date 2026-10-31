"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { RELAY_URL } from "@/lib/session";

// A random id for this page load, so the relay counts tabs, not people: no wallet or login is ever sent.
let tab: string | null = null;
const tabId = () => (tab ??= typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Math.random().toString(36).slice(2, 14)}`);

/**
 * How many tabs have this token open right now, as trading terminals show "viewers". The page checks in every 20
 * seconds while it's visible (a hidden tab drops out within a minute). Null until the relay answers, or if it can't.
 */
export function usePresence(token: Address | null): number | null {
  const [viewers, setViewers] = useState<{ token: Address; n: number } | null>(null);
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const ping = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch(`${RELAY_URL}/v1/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, tab: tabId() }) });
        const j = (await r.json()) as { viewers?: unknown };
        if (!stopped && r.ok && typeof j.viewers === "number") setViewers({ token, n: j.viewers });
      } catch {
        // Relay unreachable (or not serving presence yet): the count stays hidden.
      }
    };
    void ping();
    const timer = setInterval(() => void ping(), 20_000);
    const onVisible = () => document.visibilityState === "visible" && void ping();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);
  return viewers?.token === token ? viewers.n : null;
}
