import { Chapter } from "./Chapter";
import { ORIGIN_NAMES, SOON_LINE } from "@/lib/networks";

// Each one is live on Base Sepolia today; nothing planned is listed here.
const MECHANISMS = [
  {
    name: "Fair launch",
    body: "Bids gather in one window and clear together at one uniform price, so arriving first inside the window buys nothing.",
    fact: "One clearing price",
  },
  {
    name: "One-signature orders",
    body: "Sign what you want, not how to get it. Crux fills your order in a batch where everyone pays the same price, and your funds move only when it fills.",
    fact: "Everyone pays the same price",
  },
  {
    name: "Any chain in",
    body: `Pay with test USDC on ${ORIGIN_NAMES}. Crux fills on Base; no bridge, no network switch. ${SOON_LINE}.`,
    fact: "Five networks",
  },
  {
    name: "Locked liquidity",
    body: "Graduation seeds one canonical pool on Base with its LP burned. Every venue reads from it instead of splitting it.",
    fact: "LP burned",
  },
];

export function HowItWorks() {
  return (
    <Chapter id="protocol" title="How Crux works." intro="Four mechanisms, each running on Base Sepolia today and source-verified on Basescan.">
      <dl className="border-t border-line">
        {MECHANISMS.map((m) => (
          <div key={m.name} className="grid gap-2 border-b border-line py-7 md:grid-cols-12 md:items-baseline md:gap-6">
            <dt className="text-[17px] font-medium text-chrome md:col-span-3">{m.name}</dt>
            <dd className="max-w-xl text-[14.5px] leading-relaxed text-muted md:col-span-6">{m.body}</dd>
            <dd className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim md:col-span-3 md:text-right">{m.fact}</dd>
          </div>
        ))}
      </dl>
    </Chapter>
  );
}
