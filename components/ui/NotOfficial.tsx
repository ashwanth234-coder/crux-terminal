import { isReservedName } from "@/lib/antiVamp";

/**
 * A "Not official" tag beside any coin whose ticker or name uses Crux's name (launched straight on the contract, or on
 * another chain): Crux has no token yet. Renders nothing for every other coin.
 */
export function NotOfficial({ symbol, name }: { symbol?: string | null; name?: string | null }) {
  if (!isReservedName(symbol) && !isReservedName(name)) return null;
  return (
    <span
      title="Crux has no token yet. This coin is not from Crux."
      className="inline-flex shrink-0 items-center rounded-[3px] border border-down/60 bg-down/10 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.1em] text-down"
    >
      Not official
    </span>
  );
}
