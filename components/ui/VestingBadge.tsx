import type { ReactNode } from "react";

/**
 * The creator-vesting trust badge: a vested launch earns it, an instant unlock carries a warning.
 * Renders nothing while the setting is still loading (days === null).
 */
export function VestingBadge({ days, className = "" }: { days: number | null; className?: string }) {
  if (days === null) return null;
  const vested = days > 0;
  const icon: ReactNode = vested ? (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5.6 8 1.7 1.7L10.6 6.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
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
        vested
          ? `The creator's 10% and their share of the raise vest linearly over ${days} days from graduation. The contract can't release them faster.`
          : "Instant unlock: the creator's 10% and their share of the raise were all released at graduation. They can sell at once."
      }
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${
        vested ? "border-up/40 text-up" : "border-down/50 text-down"
      } ${className}`}
    >
      {icon}
      {vested ? `${days}D vested` : "Instant unlock"}
    </span>
  );
}
