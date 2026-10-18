import { ArrowUpRight, LinkButton } from "@/components/ui/Button";
import { FarcasterIcon, HyperliquidIcon, IntentStandardIcon, LayerZeroIcon } from "@/components/ui/icons";
import { MonolithScene } from "@/components/canvas";

const ECOSYSTEM = [
  { name: "Farcaster", role: "Social distribution", Icon: FarcasterIcon },
  { name: "LayerZero", role: "Omnichain messaging", Icon: LayerZeroIcon },
  { name: "ERC-7683", role: "Intent standard", Icon: IntentStandardIcon },
  { name: "Hyperliquid", role: "Perpetual markets", Icon: HyperliquidIcon },
];


export function Borderless() {
  return (
    <section id="ecosystem" data-chapter="07 Borderless" className="grain relative isolate scroll-mt-16 overflow-hidden border-t border-line">
      {/* Canvas centre sits over the spacer column so the beam lands between copy and badges */}
      <MonolithScene className="absolute inset-y-0 left-[8%] right-0 -z-10 hidden lg:block" />
      <div className="pointer-events-none absolute inset-y-0 left-0 -z-10 hidden w-[50%] bg-gradient-to-r from-void from-30% via-void/85 to-transparent lg:block" />
      <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[46%] bg-gradient-to-l from-void from-30% via-void/85 to-transparent lg:block" />

      <div className="mx-auto grid min-h-[720px] max-w-[1440px] gap-12 px-4 pb-16 pt-20 sm:px-8 lg:grid-cols-12 lg:items-center lg:px-12 lg:py-24">
        <div className="lg:col-span-5">
          <h2 className="font-display text-[clamp(2.8rem,5.4vw,5.2rem)] text-bright">
            Built for a
            <br />
            borderless future.
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-chrome/70">
            Social discovery. Instant execution.
            <br />
            Lasting liquidity. Perpetual opportunity.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="#protocol">
              Launch the app <ArrowUpRight />
            </LinkButton>
            <LinkButton href="#docs" variant="outline" className="bg-void/40 backdrop-blur-sm">
              Read the docs
            </LinkButton>
          </div>
        </div>

        {/* Spacer column keeps the monolith clear on desktop */}
        <div className="relative -mx-4 h-[380px] sm:-mx-8 lg:col-span-3 lg:mx-0 lg:h-auto" aria-hidden="true">
          <MonolithScene className="absolute inset-0 lg:hidden" />
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-void to-transparent lg:hidden" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-void to-transparent lg:hidden" />
        </div>

        <div className="lg:col-span-4">
          <h3 className="text-[13px] text-chrome">Part of a larger ecosystem</h3>
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
            {ECOSYSTEM.map(({ name, role, Icon }) => (
              <li key={name} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2 bg-void/60 text-chrome backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="leading-tight">
                  <span className="block text-[13px] text-chrome">{name}</span>
                  <span className="block text-[11.5px] text-chrome/70">{role}</span>
                </span>
              </li>
            ))}
          </ul>

        </div>
      </div>
    </section>
  );
}
