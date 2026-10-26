import { EnterCrux } from "./EnterCrux";

/** The close: one line and the one way in. */
export function FinalCta() {
  return (
    <section aria-labelledby="close-title" className="border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-20 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12 lg:py-28">
        <h2 id="close-title" className="font-display text-[clamp(2.1rem,4vw,3.4rem)] text-bright">
          Launch with precision.
          <br />
          Trade with clarity.
        </h2>
        <EnterCrux />
      </div>
    </section>
  );
}
