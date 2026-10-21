"use client";

import { useSyncExternalStore } from "react";
import { BaseIcon, BscIcon, RobinhoodIcon, SolanaIcon } from "@/components/ui/icons";
import { useUnifiedBalance, type BalanceStatus } from "@/hooks/useUnifiedBalance";
import { StatusTag } from "@/components/ui/StatusTag";
import { usd } from "@/lib/tokens";
import { useSolanaConnectModal } from "@/providers/SolanaProvider";

const CHAIN_ICON = { base: BaseIcon, solana: SolanaIcon, bsc: BscIcon, robinhood: RobinhoodIcon } as const;

const STATUS_NOTE: Partial<Record<BalanceStatus, string>> = {
  unavailable: "RPC offline",
  soon: "Network coming soon",
  "evm-off": "EVM wallet not connected",
};

const noopSubscribe = () => () => {};

export function BalancePanel() {
  // Wallet state is client-only; render the no-wallet state until hydrated so SSR matches.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const live = useUnifiedBalance();
  const { openSolana } = useSolanaConnectModal();
  const b = hydrated ? live : { ...live, mode: "demo" as const };
  const [whole, cents] = b.totalFormatted.split(".");
  const up = (b.change24h ?? 0) >= 0;
  const demo = b.mode === "demo";

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">Total Buying Power</p>
        {b.mode === "live" ? <StatusTag status="live" /> : <StatusTag status="testnet" label="No wallet" />}
      </div>
      {demo ? (
        <>
          {/* No wallet, no number: balances are only ever read from the chain, never sampled. */}
          <p className="mt-1 font-mono text-[30px] font-medium tracking-tight text-chrome/30">$—</p>
          <p className="mt-1 text-[12px] text-muted">Connect a wallet to read your balances.</p>
        </>
      ) : (
        <>
          <p className={`mt-1 font-mono text-[30px] font-medium tracking-tight text-chrome ${b.isLoading ? "text-chrome/40" : ""}`}>
            {whole}
            <span className="text-chrome/70">.{cents}</span>
          </p>
          <p className={`mt-1 flex items-center gap-1.5 font-mono text-[12px] ${b.change24h === null ? "text-muted" : up ? "text-up" : "text-down"}`}>
            {b.change24h === null ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                Live · refreshes every 30s
              </>
            ) : (
              <>
                <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 ${up ? "" : "rotate-180"}`} aria-hidden="true">
                  <path d="M5 1.5 9 8H1l4-6.5Z" fill="currentColor" />
                </svg>
                {b.changeFormatted} <span className="text-muted">(24h)</span>
              </>
            )}
          </p>
        </>
      )}

      <ul className="mt-6 space-y-3.5">
        {b.chains.map((row) => {
          const Icon = CHAIN_ICON[row.chain];
          const note = STATUS_NOTE[row.status];
          return (
            <li key={row.chain}>
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="flex min-w-0 items-center gap-2.5 text-chrome/90">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{row.label}</span>
                  {note && <span className="truncate text-[10.5px] text-dim">{note}</span>}
                  {row.chain === "solana" && hydrated && (
                    <button
                      type="button"
                      onClick={openSolana}
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors ${
                        b.solana.connected
                          ? "border-line-2 font-mono text-muted hover:border-chrome/40 hover:text-chrome"
                          : "border-signal/40 text-signal hover:border-signal hover:bg-signal/10"
                      }`}
                      title={b.solana.connected ? "Manage Solana wallet" : "Connect a Solana wallet"}
                    >
                      {b.solana.connected && b.solana.publicKey
                        ? `${b.solana.publicKey.slice(0, 4)}…${b.solana.publicKey.slice(-4)}`
                        : "Connect Solana"}
                    </button>
                  )}
                </span>
                {demo ? (
                  <span className="font-mono text-dim">—</span>
                ) : row.status === "loading" ? (
                  <span className="h-3 w-16 rounded bg-line" />
                ) : (
                  <span className="font-mono text-chrome/90" title={row.native ? `${row.native.amount.toFixed(5)} ${row.native.symbol} + ${row.usdc.toFixed(2)} USDC` : undefined}>
                    {usd.format(row.usd)}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-px w-full bg-line">
                <div className="h-px bg-chrome/40 transition-[width] duration-700" style={{ width: `${demo ? 0 : row.share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
