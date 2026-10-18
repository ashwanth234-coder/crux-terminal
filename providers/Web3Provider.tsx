"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { ConnectModal } from "@/components/terminal/ConnectModal";

type ConnectModalContext = { openConnect: () => void };

const ConnectCtx = createContext<ConnectModalContext | null>(null);

/** Opens the shared wallet picker from anywhere under the provider. */
export function useConnectModal() {
  const ctx = useContext(ConnectCtx);
  if (!ctx) throw new Error("useConnectModal must be used inside <Web3Provider>");
  return ctx;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }),
  );
  const [open, setOpen] = useState(false);
  const openConnect = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openConnect }), [openConnect]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectCtx.Provider value={value}>
          {children}
          <ConnectModal open={open} onClose={() => setOpen(false)} />
        </ConnectCtx.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
