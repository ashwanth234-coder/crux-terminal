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
            <span className="block text-bright">Launch once.</span>
            <span className="block text-bright">Clear fairly.</span>
            <span className="block text-steel">Trade everywhere.</span>
          </h1>

          <p className="mt-8 max-w-[30rem] text-[16px] leading-relaxed text-chrome/70">
            From social discovery to cross-chain execution, canonical liquidity and perpetual markets. One unified
            trading experience.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <LinkButton href="/launches">
              Explore Markets <ArrowUpRight />
            </LinkButton>
            <LaunchTokenButton label="Launch a Token" />
          </div>

          <div className="mt-16">
            <p className="text-[12.5px] text-muted">Natively connected</p>
            <ul className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-3">
              {CHAINS.map(({ id, name, Icon }) => (
                <li key={id} className="flex items-center gap-2.5 text-[13.5px] text-chrome/85">
                  <Icon className="h-[18px] w-[18px]" />
                  {name}
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
