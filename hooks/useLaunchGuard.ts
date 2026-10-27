"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conflict } from "@/lib/antiVamp";

export type GuardResult = { ok: boolean; line: string; conflicts: Conflict[]; artwork: "matched" | "unique" | "unreadable" | "none" };

/** Asks /api/launch-check whether a proposed launch copies an existing Crux token. */
export async function checkLaunchNow(p: { symbol: string; image: string; x: string }): Promise<GuardResult | null> {
  const res = await fetch("/api/launch-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }).catch(() => null);
  return res?.ok ? ((await res.json()) as GuardResult) : null;
}

/**
 * The anti-vamp check for the launch form, re-run half a second after the ticker, image or X link stops changing.
 * Null while there is nothing to check yet or the check can't be reached (the relay checks again before a launch).
 */
export function useLaunchGuard(symbol: string, image: string, x: string) {
  const [input, setInput] = useState({ symbol, image, x });
  useEffect(() => {
    const t = setTimeout(() => setInput({ symbol, image, x }), 500);
    return () => clearTimeout(t);
  }, [symbol, image, x]);
  const ready = input.symbol.trim().length >= 2;
  const q = useQuery({
    queryKey: ["launch-check", input],
    queryFn: () => checkLaunchNow(input),
    enabled: ready,
    staleTime: 30_000,
  });
  const settled = input.symbol === symbol && input.image === image && input.x === x;
  return { result: ready ? (q.data ?? null) : null, checking: ready && (q.isFetching || !settled) };
}
