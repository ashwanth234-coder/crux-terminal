import { CruxMark } from "@/components/site/Logo";
import { BalancePanel } from "./BalancePanel";
import { MyIntentsPanel } from "./MyIntentsPanel";
import { TerminalTrade } from "./TerminalTrade";
import { WalletChip } from "./WalletChip";

export function UnifiedBalanceCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel">
      {/* App chrome: only what works */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <CruxMark className="h-5 w-5 text-acid" />
        <span className="text-[13.5px] font-medium text-chrome">Terminal</span>
        <span className="rounded-full border border-line-2 px-2 py-0.5 text-[11px] text-muted">Base Sepolia testnet</span>
        <div className="ml-auto">
          <WalletChip />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="border-b border-line p-5 md:border-b-0 md:border-r">
          <BalancePanel />
        </div>
        <div className="p-3">
          <TerminalTrade />
        </div>
      </div>

      {/* Testnet escrow: only renders with a live settler and a connected wallet */}
      <MyIntentsPanel />
    </div>
  );
}
