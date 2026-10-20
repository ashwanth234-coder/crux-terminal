/**
 * One vocabulary for what a number or feature is: LIVE (reading the chain now), TESTNET (deployed on Base
 * Sepolia), DEMO (illustrative, not real) and PLANNED (not built). Only LIVE uses the accent.
 */
export type Status = "live" | "testnet" | "demo" | "planned";

const STYLE: Record<Status, { label: string; box: string; dot: string }> = {
  live: { label: "Live", box: "border-signal/50 text-chrome", dot: "bg-signal" },
  testnet: { label: "Testnet", box: "border-line-2 text-muted", dot: "bg-muted" },
  demo: { label: "Demo", box: "border-dashed border-line-2 text-muted", dot: "border border-muted" },
  planned: { label: "Planned", box: "border-dashed border-line-2 text-dim", dot: "border border-dim" },
};

export function StatusTag({ status, label, className = "" }: { status: Status; label?: string; className?: string }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${s.box} ${className}`}
    >
      <span className={`h-[5px] w-[5px] rounded-full ${s.dot}`} aria-hidden="true" />
      {label ?? s.label}
    </span>
  );
}
