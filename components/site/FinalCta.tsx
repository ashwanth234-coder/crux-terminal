import { ConvergeRibbon } from "./ConvergeRibbon";
import { EnterCrux } from "./EnterCrux";

/** The close: one line, the liquid-chrome strands converging, and the one way in. */
export function FinalCta() {
  return (
    <section aria-labelledby="close-title" className="border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-20 sm:px-8 lg:flex-row lg:items-center lg:gap-12 lg:px-12 lg:py-28">
        <h2 id="close-title" className="shrink-0 font-display text-[clamp(2.1rem,4vw,3.4rem)] text-bright">
          Launch with precision.
          <br />
          Trade with clarity.
        </h2>
        <ConvergeRibbon className="h-[120px] w-full min-w-0 lg:h-[168px] lg:flex-1" />
        <div className="shrink-0">
          <EnterCrux />
        </div>
      </div>
    </section>
  );
}
