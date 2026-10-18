import { CruxCoin } from "@/components/canvas";
import { ArrowRight, LinkButton } from "@/components/ui/Button";

type Stage = {
  /** The stage's defining token, set large: the metric where one exists. */
  lead: string;
  title: string;
  detail: string;
  /** The burn is the sink every other stage drains into. */
  sink?: boolean;
};

const STAGES: Stage[] = [
  { lead: "1%", title: "Launch Fees", detail: "On bonding curve volume plus graduation fees." },
  { lead: "DEX", title: "Spot Trading", detail: "Protocol cut on all DEX swaps." },
  { lead: "HIP-3", title: "Derivatives Royalties", detail: "Revenue share from HIP-3 syndicated markets." },
  { lead: "Burn", title: "Buyback & Burn", detail: "Net revenue used for open-market buybacks and burns.", sink: true },
];

/** One node on the line. Small taps for revenue, a heavy acid ring for the burn. */
function Node({ sink, index }: { sink?: boolean; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={`relative z-10 grid shrink-0 place-items-center rounded-full border bg-void animate-node motion-reduce:animate-none ${
        sink ? "h-7 w-7 border-acid/70 shadow-[0_0_24px_-4px_rgba(212,249,51,0.6)]" : "h-3.5 w-3.5 border-line-2"
      }`}
      style={{ animationDelay: `${index * 0.8}s` }}
    >
      <span className={`rounded-full ${sink ? "h-2.5 w-2.5 bg-acid" : "h-1 w-1 bg-chrome/60"}`} />
    </span>
  );
}

export function TokenSection() {
  return (
    <section id="token" data-chapter="06 Token" className="relative isolate scroll-mt-16 overflow-hidden border-t border-line">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_38%_60%_at_84%_58%,#17191d_0%,transparent_70%)]" />
      <div className="mx-auto max-w-[1440px] px-4 pb-20 pt-24 sm:px-8 lg:px-12 lg:pb-24 lg:pt-32">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <h2 className="font-display text-[clamp(2.6rem,5vw,4.8rem)] leading-[0.95] text-bright lg:col-span-7">
            Value moves
            <br />
            <span className="text-steel">through the system.</span>
          </h2>
          <div className="lg:col-span-4 lg:col-start-9">
            <p className="max-w-sm text-[15px] leading-relaxed text-chrome/65">
              $CRUX captures value at every stage — from launches to spot trading to derivatives — with protocol revenue
              routed to open-market buybacks and burns.
            </p>
            <LinkButton href="#docs" variant="outline" size="sm" className="mt-7">
              Token economics <ArrowRight />
            </LinkButton>
          </div>
        </div>

        <div className="mt-16 grid items-center gap-12 lg:mt-24 lg:grid-cols-12">
          {/* The pipeline: revenue enters at launch and drains, stage by stage, into the burn */}
          <ol className="relative flex flex-col gap-10 pl-12 sm:grid sm:grid-cols-4 sm:gap-6 sm:pl-0 lg:col-span-8">
            {/* Track: vertical on phones, horizontal from sm */}
            <span aria-hidden="true" className="absolute bottom-3 left-[13px] top-3 w-px bg-line-2 sm:hidden">
              <span className="absolute left-1/2 h-12 w-[3px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,transparent,#d4f933)] shadow-[0_0_12px_rgba(212,249,51,0.7)] animate-flow-y motion-reduce:hidden" />
            </span>
            <span aria-hidden="true" className="absolute left-[7px] right-[calc(25%-32px)] top-[102px] hidden h-px bg-line-2 sm:block">
              <span className="absolute top-1/2 h-[3px] w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,transparent,#d4f933)] shadow-[0_0_12px_rgba(212,249,51,0.7)] animate-flow motion-reduce:hidden" />
            </span>

            {STAGES.map((stage, i) => (
              <li key={stage.title} className="relative">
                <p
                  className={`font-display flex leading-none sm:h-16 sm:items-end ${
                    stage.sink ? "text-[clamp(2.6rem,4vw,3.6rem)] text-bright" : "text-[clamp(2.2rem,3.2vw,3rem)] text-steel"
                  }`}
                >
                  {stage.lead}
                </p>
                <div className="absolute -left-12 top-1 flex w-7 justify-center sm:static sm:mt-6 sm:h-7 sm:w-auto sm:items-center sm:justify-start">
                  <Node sink={stage.sink} index={i} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-chrome sm:mt-6">{stage.title}</h3>
                <p className="mt-2 max-w-[14rem] text-[13px] leading-relaxed text-chrome/55">{stage.detail}</p>
              </li>
            ))}
          </ol>

          <div className="relative h-[360px] sm:h-[440px] lg:col-span-4 lg:h-[500px]">
            <CruxCoin className="absolute inset-0" />
            <div className="pointer-events-none absolute bottom-2 right-0 text-right">
              <p className="font-mono text-[14px] text-chrome">$CRUX</p>
              <p className="mt-1 text-[12px] text-muted">The execution economy</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
