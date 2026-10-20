import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, LinkButton } from "@/components/ui/Button";
import { BatchAuctionTracker } from "@/components/terminal/BatchAuctionTracker";
import { BatchWindowDiagram, ExecutionDiagram, LiquidityDiagram, SyndicationDiagram } from "./Diagrams";

type Mechanic = {
  chapter: string;
  title: [string, string];
  body: string;
  cta: string;
  /** Where the CTA goes; defaults to the docs anchor. */
  href?: string;
  /** What exists today: running on Base Sepolia, or still on the roadmap. */
  status: "testnet" | "planned";
  /** What the mechanism does, in order or in parts. */
  facts: { sequence: boolean; items: string[] };
  visual: ReactNode;
};

const MECHANICS: Mechanic[] = [
  {
    chapter: "02 Execution",
    title: ["Intent in.", "Execution out."],
    body: "Sign one intent. On EVM chains it is an ERC-7683 order: a solver fills it from its own capital and is repaid from escrow, so you never bridge. Solana access is planned through an SVM-native intent integration on the same solver network; ERC-7683 itself stays EVM-only.",
    cta: "Try an intent",
    href: "#protocol",
    status: "testnet",
    facts: { sequence: true, items: ["Sign intent", "Solver fills", "Escrow settles"] },
    visual: <ExecutionDiagram />,
  },
  {
    chapter: "03 Fair launch",
    title: ["One window.", "One clearing price."],
    body: "Every bid in the batch window clears at one uniform price, so arriving first buys nothing. Settlement is priced by 1% price steps, not by bidders: tested with 5,000 bidders, its cost stays flat.",
    cta: "View all live launches",
    href: "/launches",
    status: "testnet",
    facts: { sequence: true, items: ["Bids in one window", "One uniform price", "No ordering edge"] },
    visual: (
      <div className="grid gap-4">
        <BatchWindowDiagram />
        <BatchAuctionTracker />
      </div>
    ),
  },
  {
    chapter: "04 Liquidity",
    title: ["One pool.", "Locked forever."],
    body: "Maximum liquidity concentration: graduation puts all of a launch's liquidity into one canonical Uniswap V2 pool on its home chain. One deep pool means lower slippage, and none of the cross-chain arbitrage drains that hit fragmented multi-chain launches.",
    cta: "See graduated launches",
    href: "/launches",
    status: "testnet",
    facts: { sequence: false, items: ["One canonical pool", "LP burned to 0x…dEaD", "Opens at clearing price", "70% of fees to creators"] },
    visual: <LiquidityDiagram />,
  },
  {
    chapter: "05 Derivatives",
    title: ["From discovery", "to derivatives."],
    body: "Tokens that prove real depth, measured by executable liquidity, sustained 24h volume and low volatility rather than market cap, can be syndicated to trusted Hyperliquid HIP-3 deployers for perpetual markets and shared revenue.",
    cta: "Learn about syndication",
    status: "planned",
    facts: { sequence: false, items: ["Deployer markets", "50% fee share", "Trusted partners", "Scalable liquidity"] },
    visual: <SyndicationDiagram />,
  },
];

function Facts({ facts }: { facts: Mechanic["facts"] }) {
  if (facts.sequence) {
    return (
      <ol className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
        {facts.items.map((f, i) => (
          <li key={f} className="flex items-center gap-3 text-[13.5px] text-chrome/80">
            {i > 0 && (
              <svg viewBox="0 0 16 8" className="h-2 w-4 text-dim" aria-hidden="true">
                <path d="M0 4h14m-3-3 3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            )}
            {f}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="mt-8 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2.5">
      {facts.items.map((f) => (
        <li key={f} className="flex items-center gap-2.5 text-[13.5px] text-chrome/80">
          <span className="h-1 w-1 rounded-full bg-chrome/40" aria-hidden="true" />
          {f}
        </li>
      ))}
    </ul>
  );
}

export function Mechanics() {
  return (
    <section id="technology" aria-label="Protocol mechanics">
      {MECHANICS.map((m) => (
        <article key={m.chapter} data-chapter={m.chapter} className="scroll-mt-16 border-t border-line">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-20 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-12 lg:py-28">
            <div className="lg:col-span-5">
              <h3 className="font-display text-[clamp(2.2rem,3.6vw,3.5rem)] leading-[0.95] [font-stretch:108%]">
                <span className="block text-bright">{m.title[0]}</span>
                <span className="block text-steel">{m.title[1]}</span>
              </h3>
              <p className="mt-6 max-w-[27rem] text-[15.5px] leading-relaxed text-chrome/65">{m.body}</p>
              <Facts facts={m.facts} />
              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
                <LinkButton href={m.href ?? "#docs"} variant="outline" size="sm">
                  {m.cta} {m.href ? <ArrowUpRight /> : <ArrowRight />}
                </LinkButton>
                <span className="flex items-center gap-2 text-[12.5px] text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${m.status === "testnet" ? "bg-acid" : "border border-chrome/40"}`} aria-hidden="true" />
                  {m.status === "testnet" ? "Live on Base Sepolia testnet" : "Planned"}
                </span>
              </div>
            </div>
            <div className="lg:col-span-7 xl:col-span-6 xl:col-start-7">{m.visual}</div>
          </div>
        </article>
      ))}
    </section>
  );
}
