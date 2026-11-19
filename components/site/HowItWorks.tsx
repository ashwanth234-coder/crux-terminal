import { Chapter } from "./Chapter";

// A launch in three steps, one line each.
const STEPS = [
  { name: "Launch", body: "Name it, launch it. Free, no gas. Creators earn 30% of trading fees.", fact: "Free" },
  { name: "Fair opening", body: "Optional: everyone in the first minute pays the same price. No snipers.", fact: "One price" },
  { name: "Graduate", body: "Hits its target, moves to Uniswap on Base. Liquidity burned.", fact: "LP burned" },
];

const TRUST = ["Creator vests 30 days", "LP burned", "Anti-sniper opening", "Priced in USDC", "Withdraw only to your wallet"];

export function HowItWorks() {
  return (
    <Chapter id="protocol" title="How a launch works." intro="Three steps.">
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
