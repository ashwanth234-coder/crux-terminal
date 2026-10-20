"use client";

import { useSyncExternalStore } from "react";
import { useConnection, useDisconnect } from "wagmi";
import { ArrowUpRight } from "@/components/ui/Button";
import { useConnectModal } from "@/providers/Web3Provider";

const noopSubscribe = () => () => {};

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-3)}`;
}

/**
 * Wallet control: opens the shared picker, or disconnects when connected.
 * "header" is the outlined Signal Orange CONNECT WALLET ↗ in the site and terminal bars;
 * "compact" is the small chip inside a panel.
 */
export function WalletChip({ variant = "compact" }: { variant?: "header" | "compact" }) {
  const { address, isConnected, isConnecting, isReconnecting } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { openConnect } = useConnectModal();
  // Wallet state only exists client-side; render the neutral label until hydrated.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const onClick = () => (isConnected ? disconnect() : openConnect());
  const isPending = isConnecting || isReconnecting;
  const connected = hydrated && isConnected && Boolean(address);
  const title = isConnected ? "Disconnect wallet" : "Connect wallet";

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`group inline-flex h-9 items-center gap-2 rounded-[4px] border px-3 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors duration-200 sm:px-4 ${
          connected
            ? "border-line-2 font-mono normal-case tracking-normal text-chrome hover:border-chrome/50"
            : "border-signal/80 text-signal hover:border-signal hover:bg-signal/[0.08]"
        }`}
      >
        {connected && address ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
            {short(address)}
          </>
        ) : (
          <>
            {hydrated && isPending ? (
              "Connecting"
            ) : (
              <>
                Connect<span className="hidden sm:inline">&nbsp;wallet</span>
              </>
            )}
            <ArrowUpRight className="h-3 w-3" />
          </>
        )}
      </button>
    );
  }

  const label = connected && address ? short(address) : hydrated && isPending ? "Connecting" : "Connect";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-2 rounded-[4px] border border-line-2 bg-void/60 pl-2.5 pr-3 font-mono text-[11px] text-chrome transition-colors hover:border-chrome/40"
      title={title}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-signal" : "bg-dim"}`} aria-hidden="true" />
      {label}
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-muted" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}
