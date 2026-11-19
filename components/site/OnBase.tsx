import { Chapter } from "./Chapter";

// Built on Base, in four short claims.
const PARTS = [
  { n: "01", title: "One pool.", body: "Every coin has one Uniswap pool on Base. Same price on every chain.", tag: "Uniswap · Base" },
  { n: "02", title: "Fills in seconds.", body: "Buy from any chain. Filled on Base in about 3 seconds.", tag: "~3 s fills" },
  { n: "03", title: "Your account, your wallet.", body: "Money only ever leaves to the wallet you choose.", tag: "Smart account" },
  { n: "04", title: "Fair by contract.", body: "Optional one-price opening. Creator coins vest on-chain.", tag: "Anti-sniper · Vesting" },
];

const FACTS = [
  { value: "5", label: "chains" },
  { value: "1", label: "pool per coin" },
  { value: "~3 s", label: "fills" },
  { value: "30%", label: "of fees to creators" },
];

/** Built on Base: four claims and the numbers. */
export function OnBase() {
  return (
    <Chapter id="base" title="Built on Base." intro="Every trade settles on Base.">
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PARTS.map((p) => (
          <li key={p.n} className="flex flex-col rounded-xl border border-line bg-panel p-6">
            <span className="font-mono text-[11px] text-signal">{p.n}</span>
            <h3 className="mt-4 text-[19px] font-medium text-chrome">{p.title}</h3>
            <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-muted">{p.body}</p>
            <span className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{p.tag}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-10 grid grid-cols-2 border-t border-line md:grid-cols-4">
        {FACTS.map((f) => (
          <div key={f.label} className="border-b border-line py-6 pr-4 md:border-b-0">
            <dt className="sr-only">{f.label}</dt>
            <dd className="font-display text-[clamp(2rem,3.4vw,2.8rem)] text-bright">{f.value}</dd>
            <dd className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{f.label}</dd>
          </div>
        ))}
      </dl>
    </Chapter>
  );
}
