import { MobiusHero } from "@/components/canvas";
import { ArrowUpRight, LinkButton } from "@/components/ui/Button";
import { CHAINS } from "@/components/ui/icons";
import { BatchStatus } from "./BatchStatus";
import { IntentTape } from "./IntentTape";

const LINES = [
  { text: "Every chain.", tone: "text-bright", delay: "120ms" },
  { text: "One market.", tone: "text-bright", delay: "220ms" },
  { text: "Zero friction.", tone: "text-steel", delay: "320ms" },
];

export function Hero() {
  return (
    <section id="top" className="relative isolate flex min-h-svh flex-col overflow-hidden pt-[72px]">
      {/* Atmosphere: a cold key light on the knot, falling off to void */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_60%_at_74%_42%,#1b1d22_0%,#0b0b0c_52%,#050505_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:calc(100%/12)_100%] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />

      {/* Desktop knot, bleeding off the right edge */}
      <div className="absolute inset-y-0 right-[-24%] hidden w-[84%] lg:block">
        <MobiusHero className="absolute inset-0" />
      </div>

      {/* Phones get the tape up top so the live market is in the first viewport */}
      <div className="lg:hidden">
        <IntentTape />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1440px] flex-1 px-4 sm:px-8 lg:grid-cols-12 lg:px-12">
        <div className="relative z-10 flex flex-col justify-center pb-10 pt-12 lg:col-span-7 lg:pb-20 lg:pt-6 xl:col-span-6">
          <h1 className="font-display whitespace-nowrap text-[clamp(2.25rem,5.9vw,5.6rem)] [font-stretch:122%]">
            {LINES.map((l) => (
              <span key={l.text} className="block overflow-hidden pb-[0.06em]">
                <span className={`block animate-line-up ${l.tone}`} style={{ animationDelay: l.delay }}>
                  {l.text}
                </span>
              </span>
            ))}
          </h1>

          <p className="mt-8 max-w-[29rem] animate-rise text-[15px] leading-relaxed text-chrome/70 [animation-delay:420ms] sm:text-[16px]">
            From social discovery to cross-chain execution, canonical liquidity and perpetual markets. One unified
            trading experience.
          </p>

          <div className="mt-10 flex animate-rise flex-wrap items-center gap-3 [animation-delay:500ms]">
            <LinkButton href="#protocol">
              Explore the protocol <ArrowUpRight />
            </LinkButton>
            <LinkButton href="#technology" variant="outline">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-chrome/40">
                <svg viewBox="0 0 10 10" className="ml-px h-2 w-2" aria-hidden="true">
                  <path d="M2 1 8.5 5 2 9Z" fill="currentColor" />
                </svg>
              </span>
              Watch overview
            </LinkButton>
          </div>

          <BatchStatus className="mt-8 animate-rise self-start [animation-delay:560ms]" />

          <div className="mt-12 animate-rise [animation-delay:620ms]">
            <p className="text-[12px] text-muted">Natively connected</p>
            <ul className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-3">
              {CHAINS.map(({ id, name, Icon }) => (
                <li key={id} className="flex items-center gap-2.5 text-[13px] text-chrome/85">
                  <Icon className="h-[18px] w-[18px]" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Mobile knot sits under the copy */}
      <div className="relative -mt-4 h-[360px] sm:h-[460px] lg:hidden">
        <MobiusHero className="absolute inset-0" />
      </div>

      <div className="hidden lg:block">
        <IntentTape />
      </div>
    </section>
  );
}
