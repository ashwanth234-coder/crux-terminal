"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  // The first request can be interrupted (e.g. the host asking the user to pick a
  // preferred wallet), so retry a couple of times before leaving it to the picker.
  const attempts = useRef(0);
  useEffect(() => {
    if (!isFarcaster || isConnected) return;
    const fc = connectors.find((c) => c.id === "farcaster");
    if (!fc) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryConnect = () => {
      attempts.current += 1;
      connect(
        { connector: fc },
        {
          onError: () => {
            if (attempts.current < 3) timer = setTimeout(tryConnect, 2000);
          },
        },
      );
    };
    tryConnect();
    return () => clearTimeout(timer);
  }, [isFarcaster, isConnected, connectors, connect]);

  const value = useMemo<FarcasterState>(() => ({ isFarcaster, context, triggerSwap: triggerCruxIntent }), [isFarcaster, context]);

  return <FarcasterCtx.Provider value={value}>{children}</FarcasterCtx.Provider>;
}
