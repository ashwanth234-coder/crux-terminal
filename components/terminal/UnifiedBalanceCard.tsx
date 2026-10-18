import { CruxMark } from "@/components/site/Logo";
import { TokenOrbs } from "@/components/canvas";
import { BalancePanel } from "./BalancePanel";
import { TradeWidget } from "./TradeWidget";
import { WalletChip } from "./WalletChip";

const TABS = ["Trade", "Discover", "Portfolio", "Activity"] as const;

export function UnifiedBalanceCard() {
  return (
    <div className="panel-sheen relative overflow-hidden rounded-2xl border border-line shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)]">
      {/* App chrome */}
      <div className="flex items-center gap-4 border-b border-line px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2">
          <CruxMark className="h-5 w-5 text-acid" />
          <span className="font-display-md text-[13px] tracking-[0.28em]">CRUX</span>
        </span>
        <nav aria-label="Terminal" className="ml-3 hidden items-center gap-5 md:flex">
          {TABS.map((tab, i) => (
            <span
              key={tab}
              className={`relative py-1 text-[11.5px] ${i === 0 ? "text-chrome after:absolute after:-bottom-[13px] after:left-0 after:h-px after:w-full after:bg-acid" : "text-muted"}`}
            >
              {tab}
            </span>
          ))}
        </nav>
        <div className="ml-auto hidden h-8 w-56 items-center gap-2 rounded-full border border-line bg-void/50 px-3 text-[11px] text-dim lg:flex xl:w-64">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="truncate">Search tokens, markets, or paste a link…</span>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <WalletChip />
          <span className="hidden h-8 w-8 place-items-center rounded-full border border-line-2 text-muted sm:grid" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Balance */}
        <div className="border-b border-line p-5 md:border-r xl:border-b-0">
          <BalancePanel />
        </div>

        {/* Token orbs */}
        <div className="relative min-h-[300px] border-b border-line xl:border-b-0 xl:border-r">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(212,249,51,0.06),transparent_60%)]" />
          <TokenOrbs className="absolute inset-0" />
          <span className="absolute left-4 top-4 text-[11px] text-dim">Routing mesh</span>
        </div>

        {/* Trade */}
        <div className="p-3 md:col-span-2 xl:col-span-1">
          <TradeWidget />
        </div>
      </div>
    </div>
  );
}
