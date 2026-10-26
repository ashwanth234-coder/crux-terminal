import type { ReactNode } from "react";

/** A home-page section: one hairline on top, the headline with a short titanium intro beside it, then the evidence. */
export function Chapter({ id, title, intro, children }: { id: string; title: ReactNode; intro: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-10">
          <h2 id={`${id}-title`} className="font-display text-[clamp(2.1rem,4vw,3.4rem)] text-bright lg:col-span-7">
            {title}
          </h2>
          <div className="max-w-md text-[15px] leading-relaxed text-muted lg:col-span-4 lg:col-start-9">{intro}</div>
        </div>
        <div className="mt-12 lg:mt-16">{children}</div>
      </div>
    </section>
  );
}
