import { StatusTag } from "@/components/ui/StatusTag";
import { CruxEmblem } from "./CruxEmblem";
import { EnterCrux } from "./EnterCrux";

const ANNOTATION = "font-mono text-[10.5px] uppercase leading-[1.7] tracking-[0.2em] text-muted";

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col overflow-hidden pt-16">
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 items-center gap-6 px-4 pb-10 pt-12 sm:px-8 md:grid-cols-12 md:gap-6 md:py-16 lg:px-12">
        <div className="relative z-10 md:col-span-7">
          {/* Painted with the first frame: the headline is the LCP and is never held back by an animation. */}
          <h1 className="font-display text-[clamp(2.9rem,13.4vw,6.25rem)] uppercase leading-[0.9] md:text-[8.2vw] xl:text-[min(7.8vw,8.75rem)]">
            <span className="block text-bright">Markets</span>
            <span className="block text-signal">Without</span>
            <span className="block text-bright">Borders.</span>
          </h1>
          <p className="mt-7 text-[15px] text-muted md:mt-9 md:text-[17px]">Global markets. One execution layer.</p>
          <EnterCrux className="mt-9 md:mt-14" />
        </div>

        <div className="relative mx-auto w-full max-w-[340px] md:col-span-5 md:max-w-none">
          <CruxEmblem className="block aspect-square w-full" />
          <p className={`${ANNOTATION} absolute right-0 top-[3%] hidden text-right lg:block`}>
            <span className="text-signal">01</span> /<br />
            Execute everywhere
          </p>
          <p className={`${ANNOTATION} absolute bottom-[3%] left-0 hidden lg:block`}>
            <span className="text-signal">02</span> /<br />
            One clearing price
          </p>
        </div>
      </div>

      {/* The bottom edge: what network this is, and the way down */}
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between border-t border-line/70 py-4">
          <span className="flex items-center gap-3 text-[11.5px] text-muted">
            <StatusTag status="testnet" />
            Base Sepolia
          </span>
          <a href="#discover" className="group flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-chrome">
            Scroll
            <span className="relative block h-6 w-px overflow-hidden bg-line-2" aria-hidden="true">
              <span className="absolute inset-x-0 top-0 h-2 bg-signal transition-transform duration-300 group-hover:translate-y-4" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
