import { ArrowUpRight, LinkButton } from "@/components/ui/Button";
import { FarcasterIcon, HyperliquidIcon, IntentStandardIcon, LayerZeroIcon } from "@/components/ui/icons";

const ECOSYSTEM = [
  { name: "Farcaster", role: "Social distribution", Icon: FarcasterIcon },
  { name: "LayerZero", role: "Omnichain messaging", Icon: LayerZeroIcon },
  { name: "ERC-7683", role: "Intent standard", Icon: IntentStandardIcon },
  { name: "Hyperliquid", role: "Perpetual markets", Icon: HyperliquidIcon },
];

export function Borderless() {
  return (
    <section id="ecosystem" data-chapter="07 Borderless" className="relative scroll-mt-16 border-t border-line">
      <div className="mx-auto grid max-w-[1440px] gap-16 px-4 py-24 sm:px-8 lg:grid-cols-12 lg:items-end lg:px-12 lg:py-36">
        <div className="lg:col-span-7">
          <h2 className="font-display text-[clamp(2.8rem,5.4vw,5rem)] text-bright">
            Built for a
            <br />
            borderless future.
          </h2>
          <p className="mt-6 max-w-sm text-[15.5px] leading-relaxed text-chrome/70">
            Social discovery. Instant execution.
            <br />
            Lasting liquidity. Perpetual opportunity.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton href="#protocol">
              Launch the app <ArrowUpRight />
            </LinkButton>
            <LinkButton href="#docs" variant="outline">
              Read the docs
            </LinkButton>
          </div>
        </div>

        <div className="lg:col-span-4 lg:col-start-9">
          <h3 className="text-[13px] text-muted">Part of a larger ecosystem</h3>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {ECOSYSTEM.map(({ name, role, Icon }) => (
              <li key={name} className="flex items-center gap-4 py-4">
                <Icon className="h-5 w-5 shrink-0 text-chrome/85" />
                <span className="text-[14px] text-chrome">{name}</span>
                <span className="ml-auto text-[12.5px] text-muted">{role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
