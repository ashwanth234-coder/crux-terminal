"use client";

import type { ReactNode } from "react";
import { useT } from "@/providers/I18nProvider";

/** "60s", "15m", "24h": a batch window in the badge's few characters. */
export function shortWindow(seconds: number) {
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/**
 * The anti-sniper trust badge, beside the vesting one. With anti-sniper on, the first stretch of trading after
 * graduation clears in uniform-price batches, so nobody can buy ahead of anyone; off (and on every launch before V5),
 * trading opens on Uniswap at graduation and a bot can buy in the very next transaction. Renders nothing while the
 * setting is still loading (seconds === null).
 */
export function AntiSniperBadge({ seconds, className = "" }: { seconds: number | null; className?: string }) {
  const t = useT();
  if (seconds === null) return null;
  const on = seconds > 0;
  const icon: ReactNode = on ? (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3l2 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M8 1.8 14.5 13.5h-13L8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.2v3.4M8 11.3v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  return (
    <span
      title={
        on
          ? `Anti-sniper: for the first ${shortWindow(seconds)} of trading after graduation, every trade clears in a 60-second batch at one price, so a bot at second 0 pays what a person at second 59 pays. Enforced by the contract.`
          : "Unprotected launch: trading opens on Uniswap the moment the auction graduates, so a bot can buy in the very next transaction, ahead of everyone else."
      }
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${
        on ? "border-up/40 text-up" : "border-down/50 text-down"
      } ${className}`}
    >
      {icon}
      {on ? t("badge.antiSniper", { window: shortWindow(seconds) }) : t("badge.unprotected")}
    </span>
  );
}
