import Link from "next/link";
import { CruxEmblem } from "./CruxEmblem";
import { ChainStrip } from "./ChainStrip";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { TERMINAL_HREF } from "@/lib/site";
import { IS_TESTNET } from "@/lib/network";

/** The promise in one line: one CRUX Account, funded from every chain, that launches and trades. */
export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col overflow-hidden pt-16">
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 items-center gap-10 px-4 pb-10 pt-12 sm:px-8 md:grid-cols-12 md:gap-6 md:py-16 lg:px-12">
        <div className="relative z-10 min-w-0 md:col-span-7">
          {/* Painted with the first frame: the headline is the LCP and is never held back by an animation. */}
          <h1 className="font-display text-[clamp(2.9rem,9.5vw,4.5rem)] text-bright md:text-[6vw] xl:text-[min(6vw,6rem)]">
            One account.
            <br />
            Every chain.
          </h1>
          <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-muted md:mt-8 md:text-[18px]">
            {/* Mainnet trades Base, Solana and BNB Chain today; Ethereum, Arbitrum and Robinhood Chain follow. */}
            <span className="text-chrome">{IS_TESTNET ? "5 chains. 1 account." : "Base, Solana, BNB. 1 account."}</span> Launch and trade them all, no gas, no bridges.
          </p>
          {/* The two products: launch a coin, and trade any coin in the terminal. */}
          <div className="mt-9 flex flex-wrap items-center gap-3 md:mt-12">
            <Link href="/launch/v9/new" className={buttonClass("primary", "md", "font-semibold")}>
              Launch a coin <ArrowUpRight />
            </Link>
            {/* A plain anchor: /terminal is a redirect. */}
            <a href={TERMINAL_HREF} className={buttonClass("outline", "md", "font-semibold")}>
              Open terminal <ArrowUpRight />
            </a>
          </div>
          <Link href="/account" className="mt-4 inline-block text-[13px] text-muted transition-colors hover:text-chrome">
            New here? Create your account →
          </Link>
          <ChainStrip className="mt-12 md:mt-16" />
        </div>

        <div className="relative mx-auto w-full min-w-0 max-w-[320px] md:col-span-5 md:max-w-[480px]">
          <CruxEmblem className="block aspect-square w-full" />
        </div>
      </div>
    </section>
  );
}
