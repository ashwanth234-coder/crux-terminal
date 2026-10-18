"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CreateTokenModal } from "@/components/launch/CreateTokenModal";

const LaunchCtx = createContext<{ openLaunch: () => void } | null>(null);

/** Opens the token launch form from anywhere under the provider. */
export function useLaunchModal() {
  const ctx = useContext(LaunchCtx);
  if (!ctx) throw new Error("useLaunchModal must be used inside <LaunchProvider>");
  return ctx;
}

export function LaunchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLaunch = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openLaunch }), [openLaunch]);
  return (
    <LaunchCtx.Provider value={value}>
      {children}
      <CreateTokenModal open={open} onClose={() => setOpen(false)} />
    </LaunchCtx.Provider>
  );
}
