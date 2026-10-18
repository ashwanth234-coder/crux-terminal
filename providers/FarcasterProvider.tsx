"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnect, useConnection, useConnectors } from "wagmi";
import {
  getMiniAppContext,
  initFarcaster,
  triggerCruxIntent,
  type CruxIntent,
  type CruxIntentResult,
  type MiniAppContext,
} from "@/lib/farcaster";

type FarcasterState = {
  /** True once the SDK confirms we are running inside a Farcaster client. */
  isFarcaster: boolean;
  context: MiniAppContext | null;
  /** Opens the host's native swap form. Resolves to `unsupported` outside Farcaster. */
  triggerSwap: (params: CruxIntent) => Promise<CruxIntentResult>;
};

const FarcasterCtx = createContext<FarcasterState>({
  isFarcaster: false,
  context: null,
  triggerSwap: triggerCruxIntent,
});

export function useFarcaster() {
  return useContext(FarcasterCtx);
}

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const [isFarcaster, setIsFarcaster] = useState(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const { isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();

  // Detect the host and call sdk.actions.ready() to drop the splash screen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const inMiniApp = await initFarcaster();
      if (cancelled || !inMiniApp) return;
      setIsFarcaster(true);
      const ctx = await getMiniAppContext();
      if (!cancelled) setContext(ctx);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Inside Farcaster the user already has a wallet: connect it without a picker.
  useEffect(() => {
    if (!isFarcaster || isConnected) return;
    const fc = connectors.find((c) => c.id === "farcaster");
    if (fc) connect({ connector: fc });
  }, [isFarcaster, isConnected, connectors, connect]);

  const value = useMemo<FarcasterState>(() => ({ isFarcaster, context, triggerSwap: triggerCruxIntent }), [isFarcaster, context]);

  return <FarcasterCtx.Provider value={value}>{children}</FarcasterCtx.Provider>;
}
