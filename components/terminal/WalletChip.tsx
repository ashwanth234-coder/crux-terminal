"use client";

import { useSyncExternalStore } from "react";
import { useConnection, useDisconnect } from "wagmi";
import { useConnectModal } from "@/providers/Web3Provider";

const noopSubscribe = () => () => {};

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-3)}`;
}

/** Compact wallet control for the terminal header: opens the picker, or disconnects when connected. */
export function WalletChip() {
  const { address, isConnected, isConnecting, isReconnecting } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { openConnect } = useConnectModal();
  // Wallet state only exists client-side; render the neutral label until hydrated.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const onClick = () => (isConnected ? disconnect() : openConnect());
  const isPending = isConnecting || isReconnecting;

  const label = !hydrated ? "Connect" : isConnected && address ? short(address) : isPending ? "Connecting" : "Connect";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-2 rounded-full border border-line-2 bg-void/60 pl-1.5 pr-3 font-mono text-[11px] text-chrome transition-colors hover:border-chrome/40"
      title={isConnected ? "Disconnect wallet" : "Connect wallet"}
    >
      <span className={`grid h-5 w-5 place-items-center rounded-full ${hydrated && isConnected ? "bg-acid/15" : "bg-line-2"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${hydrated && isConnected ? "bg-acid" : "bg-dim"}`} />
      </span>
      {label}
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-muted" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}
