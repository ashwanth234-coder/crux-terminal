import { EnterCrux } from "./EnterCrux";

/** The close: the promise once more, and the one way in. */
export function FinalCta() {
  return (
    <section aria-labelledby="close-title" className="border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 py-24 sm:px-8 lg:px-12 lg:py-40">
        <h2 id="close-title" className="font-display text-[clamp(2.75rem,7vw,6.5rem)] text-bright">
          Markets without borders.
        </h2>
        <div className="mt-10 flex flex-col gap-10 border-t border-line pt-10 md:flex-row md:items-center md:justify-between">
          <p className="text-[16px] text-muted md:text-[18px]">Launch with precision. Trade with clarity.</p>
          <EnterCrux />
        </div>
      </div>
    </section>
  );
}
