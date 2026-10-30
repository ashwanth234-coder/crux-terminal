import Link from "next/link";
import { CruxEmblem } from "./CruxEmblem";
import { ChainStrip } from "./ChainStrip";
import { EnterCrux } from "./EnterCrux";

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col overflow-hidden pt-16">
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 items-center gap-10 px-4 pb-10 pt-12 sm:px-8 md:grid-cols-12 md:gap-6 md:py-16 lg:px-12">
        <div className="relative z-10 min-w-0 md:col-span-7">
          {/* Painted with the first frame: the headline is the LCP and is never held back by an animation. */}
          <h1 className="font-display text-[clamp(2.9rem,9.5vw,4.5rem)] text-bright md:text-[6vw] xl:text-[min(6vw,6rem)]">
            Markets
            <br />
            without borders.
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-muted md:mt-8 md:text-[18px]">Launch and trade from the chain you&rsquo;re on. Everything settles on Base.</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4 md:mt-12">
            <EnterCrux />
            <Link href="/launches" className="text-[14px] font-medium text-muted transition-colors hover:text-chrome">
              View launches
            </Link>
          </div>
          <ChainStrip className="mt-12 md:mt-16" />
        </div>

        <div className="relative mx-auto w-full min-w-0 max-w-[320px] md:col-span-5 md:max-w-[480px]">
          <CruxEmblem className="block aspect-square w-full" />
        </div>
      </div>
    </section>
  );
}
