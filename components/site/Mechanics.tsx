import type { ReactNode } from "react";
import { BatchAuctionRings, DerivativesGrid, GlassHelix, LiquidVortex } from "@/components/canvas";
import { ArrowRight, LinkButton } from "@/components/ui/Button";
import { HyperliquidIcon } from "@/components/ui/icons";
import { AuctionClock } from "./AuctionClock";
import { MechanicsTrack } from "./MechanicsTrack";

type Mechanic = {
  chapter: string;
  label: string;
  title: [string, string];
  body: string;
  cta: string;
  /** What the mechanism does, in order or in parts. */
  facts: { sequence: boolean; items: string[] };
  visual: ReactNode;
};

const MECHANICS: Mechanic[] = [
  {
    chapter: "02 Execution",
    label: "Execution",
    title: ["Intent in.", "Execution out."],
    body: "Sign a localized intent. Institutional solvers execute with their own capital using ERC-7683. You get instant execution. They handle the rest.",
    cta: "Learn about execution",
    facts: { sequence: true, items: ["Sign intent", "Solver executes", "Instant settlement"] },
    visual: <GlassHelix className="absolute inset-0" />,
  },
  {
    chapter: "03 Fair launch",
    label: "Fair launch",
    title: ["One window.", "One clearing price."],
    body: "A 60-second blind batch auction neutralizes MEV. All buy intents clear at the same uniform price.",
    cta: "See how it works",
    facts: { sequence: true, items: ["Bids sealed for 60s", "One uniform price", "No front-running"] },
    visual: (
      <>
        <BatchAuctionRings className="absolute inset-0" />
        <AuctionClock />
      </>
    ),
  },
  {
    chapter: "04 Liquidity",
    label: "Liquidity",
    title: ["Liquidity", "has a home."],
    body: "Graduated tokens gain permanent liquidity in the Crux Spot DEX on Base, paired with RWA yield-bearing assets for deeper, more efficient markets.",
    cta: "Explore the DEX",
    facts: { sequence: false, items: ["Deep liquidity", "Low slippage", "RWA yield", "Aggregator ready"] },
    visual: <LiquidVortex className="absolute inset-0" />,
  },
  {
    chapter: "05 Derivatives",
    label: "Derivatives",
    title: ["From discovery", "to derivatives."],
    body: "When a token reaches $10M+ market cap, Crux syndicates to trusted Hyperliquid HIP-3 deployers, unlocking perpetual markets and shared revenue.",
    cta: "Learn about syndication",
    facts: { sequence: false, items: ["Deployer markets", "50% fee share", "Trusted partners", "Scalable liquidity"] },
    visual: (
      <>
        <DerivativesGrid className="absolute inset-0" />
        {/* Figure sits in the open sky above the candles, never over them */}
        <div className="pointer-events-none absolute left-6 top-6 lg:left-10 lg:top-10">
          <p className="font-display text-[clamp(2.6rem,4.4vw,4.2rem)] text-acid">$37M+</p>
          <p className="mt-2 text-[13px] text-chrome/75">recent deployer fees</p>
        </div>
        <div className="pointer-events-none absolute bottom-6 right-6 flex items-center gap-2 lg:bottom-10 lg:right-10">
          <HyperliquidIcon className="h-5 w-5" />
          <span className="leading-tight">
            <span className="block text-[9px] text-muted">Powered by</span>
            <span className="block text-[13px] italic text-chrome">Hyperliquid</span>
          </span>
        </div>
      </>
    ),
  },
];

function Facts({ facts }: { facts: Mechanic["facts"] }) {
  if (facts.sequence) {
    return (
      <ol className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-2">
        {facts.items.map((f, i) => (
          <li key={f} className="flex items-center gap-3 text-[13px] text-chrome/80">
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
    <ul className="mt-9 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2.5">
      {facts.items.map((f) => (
        <li key={f} className="flex items-center gap-2.5 text-[13px] text-chrome/80">
          <span className="h-1 w-1 rounded-full bg-acid" aria-hidden="true" />
          {f}
        </li>
      ))}
    </ul>
  );
}

export function Mechanics() {
  return (
    <MechanicsTrack labels={MECHANICS.map((m) => m.label)}>
      {MECHANICS.map((m, i) => (
        <article
          key={m.chapter}
          data-chapter={m.chapter}
          className={`border-line lg:h-full lg:w-screen lg:shrink-0 ${i > 0 ? "border-t lg:border-t-0" : ""}`}
        >
          <div className="grid lg:mx-auto lg:h-full lg:max-w-[1440px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col justify-center px-5 pb-10 pt-16 sm:px-8 lg:px-12 lg:py-12 xl:px-16">
              <p className="text-[13px] text-muted lg:hidden">
                <span className="font-mono text-[11px] text-acid">0{i + 2}</span> {m.label}
              </p>
              <h3 className="font-display mt-4 text-[clamp(2.2rem,3.7vw,3.6rem)] leading-[0.95] text-bright [font-stretch:108%] lg:mt-0">
                {m.title[0]}
                <br />
                <span className="text-steel">{m.title[1]}</span>
              </h3>
              <p className="mt-6 max-w-[26rem] text-[15px] leading-relaxed text-chrome/65">{m.body}</p>
              <Facts facts={m.facts} />
              <div className="mt-10">
                <LinkButton href="#docs" variant="outline" size="sm">
                  {m.cta} <ArrowRight />
                </LinkButton>
              </div>
            </div>
            <div className="relative h-[380px] overflow-hidden border-line bg-[radial-gradient(ellipse_at_50%_75%,#16181c_0%,#060606_72%)] sm:h-[460px] lg:h-full lg:border-x">
              {m.visual}
            </div>
          </div>
        </article>
      ))}
    </MechanicsTrack>
  );
}
