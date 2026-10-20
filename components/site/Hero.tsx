import { ArrowUpRight, LinkButton } from "@/components/ui/Button";
import { CHAINS } from "@/components/ui/icons";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { TestnetActivity } from "./TestnetActivity";

export function Hero() {
  return (
    <section id="top" className="relative pt-[72px]">
      <div className="mx-auto grid max-w-[1440px] gap-14 px-4 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-12 lg:pb-24 lg:pt-24">
        <div className="lg:col-span-7">
          {/* Painted with the first frame: the headline is the LCP and is never held back by an animation. */}
          <h1 className="font-display text-[clamp(2.4rem,5.4vw,5.1rem)] leading-[0.95]">
            <span className="block text-bright">Launch on your home chain.</span>
            <span className="block text-steel">Trade from anywhere.</span>
          </h1>

          <p className="mt-8 max-w-[32rem] text-[16px] leading-relaxed text-chrome/70">
            Native token creation on its home chain, fair price discovery in a uniform-price batch auction, and
            solver-based access from other networks. On testnet today: Base Sepolia.
          </p>
          <p className="mt-4 max-w-[32rem] text-[13.5px] leading-relaxed text-muted">
            <span className="text-chrome">Built to scale.</span> Auctions settle by price step, not by bidder: tested with{" "}
            <span className="font-mono text-chrome">5,000</span> bidders, settlement cost stays flat.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <LinkButton href="/launches">
              Explore Markets <ArrowUpRight />
            </LinkButton>
            <LaunchTokenButton label="Launch a Token" />
          </div>

          <div className="mt-16">
            <p className="text-[12.5px] text-muted">One balance across</p>
            <ul className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-3">
              {CHAINS.map((chain) => (
                <li key={chain.id} className="flex items-center gap-2.5 text-[13.5px] text-chrome/85">
                  <chain.Icon className="h-[18px] w-[18px]" />
                  {chain.name}
                  {"planned" in chain && (
                    <span className="rounded-full border border-line-2 px-1.5 py-px text-[10.5px] text-muted">Planned</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <TestnetActivity className="lg:col-span-5 xl:col-span-4 xl:col-start-9" />
      </div>
    </section>
  );
}
