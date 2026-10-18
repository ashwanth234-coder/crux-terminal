"use client";

// Side effect: inside a Farcaster client this registers the host's Solana wallet
// (Wallet Standard) and marks it for auto-connect. Outside Farcaster it does nothing.
import "@farcaster/mini-app-solana";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SolanaConnectModal } from "@/components/terminal/SolanaConnectModal";
import { SITE_URL } from "@/lib/site";

/**
 * Solana's public RPC refuses browser-origin requests, so by default reads go
 * through our own relay (app/api/solana). NEXT_PUBLIC_SOLANA_RPC overrides it
 * with an endpoint that allows browser access.
 */
function solanaEndpoint() {
  if (process.env.NEXT_PUBLIC_SOLANA_RPC) return process.env.NEXT_PUBLIC_SOLANA_RPC;
  const origin = typeof window === "undefined" ? SITE_URL : window.location.origin;
  return `${origin}/api/solana`;
}
// Shared with @farcaster/mini-app-solana so its auto-selection of the Farcaster wallet sticks.
const WALLET_STORAGE_KEY = "fcWalletName";

const SolanaModalCtx = createContext<{ openSolana: () => void } | null>(null);

/** Opens the Solana wallet picker from anywhere under the provider. */
export function useSolanaConnectModal() {
  const ctx = useContext(SolanaModalCtx);
  if (!ctx) throw new Error("useSolanaConnectModal must be used inside <SolanaProvider>");
  return ctx;
}

export function SolanaProvider({ children }: { children: ReactNode }) {
  // Phantom and Solflare are listed even when not installed so the picker can link to them;
  // any other Wallet Standard wallet (Backpack, the Farcaster wallet…) is detected automatically.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  const endpoint = useMemo(() => solanaEndpoint(), []);
  const [open, setOpen] = useState(false);
  const openSolana = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openSolana }), [openSolana]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect localStorageKey={WALLET_STORAGE_KEY}>
        <SolanaModalCtx.Provider value={value}>
          {children}
          <SolanaConnectModal open={open} onClose={() => setOpen(false)} />
        </SolanaModalCtx.Provider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
