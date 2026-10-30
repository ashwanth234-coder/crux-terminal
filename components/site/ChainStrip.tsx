import { StatusTag } from "@/components/ui/StatusTag";
import { ChainMark, LANDING_CHAINS } from "./ChainMarks";

/** Under the hero: the chains you can launch and trade from, each mark taking its network's colour on hover. */
export function ChainStrip({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-dim">Launch and trade from</span>
        <StatusTag status="testnet" />
      </div>
      <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {LANDING_CHAINS.map((c) => (
          <li key={c.key} title={c.network} className={`group flex items-center gap-2 text-[13.5px] ${c.live ? "text-chrome/90" : "text-dim"}`}>
            <span className="text-muted transition-colors duration-200 group-hover:text-[var(--chain)]" style={{ ["--chain" as string]: c.color }}>
              <ChainMark chain={c.key} className="h-[18px] w-[18px]" />
            </span>
            {c.name}
            {!c.live && <span className="rounded-[3px] border border-dashed border-line-2 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Soon</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
