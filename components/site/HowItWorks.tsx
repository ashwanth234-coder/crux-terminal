import { Chapter } from "./Chapter";

// A launch, start to finish. Each step is live on Base Sepolia today.
const STEPS = [
  {
    name: "Launch",
    body: "Name it and launch for $0: no gas, no wallet pop-ups, a copycat check on the ticker. The creator's share is locked for 30 days.",
    fact: "Gas-free",
  },
  {
    name: "A 30-second fair opening",
    body: "Everyone who buys in the opening pays the same price, so being first buys nothing. Bots and snipers get no head start, and every launch goes live.",
    fact: "One price",
  },
  {
    name: "It trades everywhere",
    body: "It goes live on one Uniswap pool on Base with its liquidity locked forever, and anyone can buy it from the chain they're on through Crux. Trades land on the chart in under a second.",
    fact: "LP burned",
  },
];

/** Promises every launch keeps, enforced on-chain (vesting by the Crux launch form). */
const TRUST = ["Creator vested 30 days", "LP burned", "One price at open", "Every launch goes live", "Withdrawals only to your wallet"];

export function HowItWorks() {
  return (
    <Chapter id="protocol" title="How a launch works." intro="Three steps, each running on Base Sepolia today and source-verified on Basescan.">
      <ol className="border-t border-line">
        {STEPS.map((s, i) => (
          <li key={s.name} className="grid gap-2 border-b border-line py-7 md:grid-cols-12 md:items-baseline md:gap-6">
            <span className="flex items-baseline gap-3 text-[17px] font-medium text-chrome md:col-span-3">
              <span className="font-mono text-[11px] text-signal">{String(i + 1).padStart(2, "0")}</span>
              {s.name}
            </span>
            <p className="max-w-xl text-[14.5px] leading-relaxed text-muted md:col-span-6">{s.body}</p>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim md:col-span-3 md:text-right">{s.fact}</span>
          </li>
        ))}
      </ol>
      <ul aria-label="What every launch guarantees" className="mt-10 flex flex-wrap gap-2">
        {TRUST.map((t) => (
          <li key={t} className="inline-flex items-center gap-2 rounded-[4px] border border-line-2 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-chrome/80">
            <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </Chapter>
  );
}
