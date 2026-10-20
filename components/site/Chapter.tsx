import type { ReactNode } from "react";

/**
 * An editorial chapter: one hairline on top, the chapter number in Signal Orange,
 * a serif headline, a short titanium intro, then the evidence.
 */
export function Chapter({
  id,
  index,
  name,
  title,
  intro,
  children,
}: {
  id: string;
  index: string;
  name: string;
  title: ReactNode;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8 lg:px-12 lg:py-32">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="lg:col-span-7">
            <p className="label-mono">
              <span className="text-signal">{index}</span> / {name}
            </p>
            <h2 id={`${id}-title`} className="font-display mt-6 text-[clamp(2.5rem,5.4vw,4.9rem)] text-bright">
              {title}
            </h2>
          </div>
          <div className="max-w-md text-[15px] leading-relaxed text-muted lg:col-span-4 lg:col-start-9">{intro}</div>
        </div>
        <div className="mt-14 lg:mt-20">{children}</div>
      </div>
    </section>
  );
}
