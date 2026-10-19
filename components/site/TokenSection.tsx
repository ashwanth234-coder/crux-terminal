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
  // Planned: the deployed CruxFactory charges no fee yet.
  { lead: "1%", title: "Launch Fees", detail: "Planned, not live yet: a fee on batch-auction volume plus graduation fees." },
  { lead: "DEX", title: "Spot Trading", detail: "Protocol cut on all DEX swaps." },
  { lead: "HIP-3", title: "Derivatives Royalties", detail: "Revenue share from HIP-3 syndicated markets." },
  { lead: "Burn", title: "Buyback & Burn", detail: "Net revenue used for open-market buybacks and burns.", sink: true },
];

export function TokenSection() {
  return (
    <section id="token" data-chapter="06 Token" className="relative scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-24 sm:px-8 lg:px-12 lg:pb-32 lg:pt-32">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <h2 className="font-display text-[clamp(2.6rem,5vw,4.6rem)] leading-[0.95] text-bright lg:col-span-7">
            Value moves
            <br />
            <span className="text-steel">through the system.</span>
          </h2>
          <div className="lg:col-span-4 lg:col-start-9">
            <p className="max-w-sm text-[15.5px] leading-relaxed text-chrome/65">
              $CRUX captures value at every stage — from launches to spot trading to derivatives — with protocol revenue
              routed to open-market buybacks and burns.
            </p>
            <p className="mt-4 max-w-sm text-[12.5px] leading-relaxed text-muted">
              $CRUX is not live. This is the planned token design; no token has been issued.
            </p>
            <LinkButton href="#docs" variant="outline" size="sm" className="mt-7">
              Token economics <ArrowRight />
            </LinkButton>
          </div>
        </div>

        {/* The pipeline: revenue enters at launch and drains, stage by stage, into the burn */}
        <ol className="relative mt-20 flex flex-col gap-12 pl-12 sm:grid sm:grid-cols-4 sm:gap-8 sm:pl-0 lg:mt-28">
          {/* Track: vertical on phones, horizontal from sm */}
          <span aria-hidden="true" className="absolute bottom-3 left-[13px] top-3 w-px bg-line-2 sm:hidden" />
          <span aria-hidden="true" className="absolute left-[7px] right-[calc(25%-32px)] top-[102px] hidden h-px bg-line-2 sm:block" />

          {STAGES.map((stage) => (
            <li key={stage.title} className="relative">
              <p
                className={`font-display flex leading-none sm:h-16 sm:items-end ${
                  stage.sink ? "text-[clamp(2.6rem,4vw,3.6rem)] text-bright" : "text-[clamp(2.2rem,3.2vw,3rem)] text-steel"
                }`}
              >
                {stage.lead}
              </p>
              <div className="absolute -left-12 top-1 flex w-7 justify-center sm:static sm:mt-6 sm:h-7 sm:w-auto sm:items-center sm:justify-start">
                <span
                  aria-hidden="true"
                  className={`relative z-10 grid shrink-0 place-items-center rounded-full border bg-void ${stage.sink ? "h-7 w-7 border-acid/70" : "h-3.5 w-3.5 border-line-2"}`}
                >
                  <span className={`rounded-full ${stage.sink ? "h-2.5 w-2.5 bg-acid" : "h-1 w-1 bg-chrome/60"}`} />
                </span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-chrome sm:mt-6">{stage.title}</h3>
              <p className="mt-2 max-w-[16rem] text-[13px] leading-relaxed text-chrome/60">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
