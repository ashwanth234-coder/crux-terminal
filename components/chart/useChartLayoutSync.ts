"use client";

import { useEffect, useRef } from "react";
import type { Address } from "viem";
import type { AccountSigner } from "@/lib/account";
import { loadRemoteLayout, saveRemoteLayout } from "@/lib/layoutSync";
import { layoutSavedAt, parseLayout, saveLayout, type ChartConfig } from "./settings";

/**
 * The chart's layout (moved out of ProChart): saved in this browser on every change, and logged in, the first chart's
 * layout follows the trader between devices through the relay.
 */
export function useChartLayoutSync(o: {
  slot: number;
  crux: { sign: AccountSigner | null; owner: Address | null };
  auction: { token: Address };
  layoutKey: string;
  config: ChartConfig;
  replace: (c: ChartConfig) => void;
}) {
  const { slot, crux, auction, layoutKey, config, replace } = o;
  // Layout sync state (below): a layout just loaded from another device isn't synced straight back.
  const skipSync = useRef(false);
  const synced = useRef(false);
  // Every change is saved for this token, so the chart comes back as it was left.
  useEffect(() => {
    saveLayout(layoutKey, config, skipSync.current ? layoutSavedAt(layoutKey) : Date.now());
  }, [layoutKey, config]);

  // Logged in: the first chart's layout follows you between devices. On arrival the newer of this browser's and the
  // synced copy wins; changes are synced a few seconds after you stop making them (signed silently by the login key).
  useEffect(() => {
    if (slot !== 0 || synced.current || !crux.sign || !crux.owner) return;
    synced.current = true;
    const [sign, owner] = [crux.sign, crux.owner];
    void loadRemoteLayout(sign, owner, auction.token)
      .then((remote) => {
        if (!remote || remote.savedAt <= layoutSavedAt(layoutKey)) return;
        const next = parseLayout(remote.layout);
        if (!next) return;
        skipSync.current = true;
        replace(next);
        saveLayout(layoutKey, next, remote.savedAt);
      })
      .catch(() => {
        // No sync (relay without it, or offline): this browser's layout stands.
      });
  }, [slot, crux.sign, crux.owner, auction.token, layoutKey, replace]);
  useEffect(() => {
    if (slot !== 0 || !crux.sign || !crux.owner || !synced.current) return;
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const [sign, owner] = [crux.sign, crux.owner];
    const t = setTimeout(() => {
      const raw = JSON.stringify(config);
      if (raw.length > 46_000) return;
      void saveRemoteLayout(sign, owner, auction.token, raw, layoutSavedAt(layoutKey) || Date.now()).catch(() => {});
    }, 4_000);
    return () => clearTimeout(t);
  }, [slot, config, crux.sign, crux.owner, auction.token, layoutKey]);
}
