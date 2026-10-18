import { UnifiedBalanceCard } from "@/components/terminal/UnifiedBalanceCard";
import { TiltIn } from "./TiltIn";

export function Experience() {
  return (
    <section id="protocol" data-chapter="01 Experience" className="relative scroll-mt-16">
      <div className="mx-auto grid max-w-[1440px] gap-14 px-4 pb-24 pt-24 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:px-12 lg:pb-24 lg:pt-32">
        <div className="flex flex-col justify-center lg:col-span-4">
          <h2 className="font-display text-[clamp(2.5rem,4vw,3.8rem)] leading-[0.95] [font-stretch:108%]">
            <span className="block text-bright">One balance.</span>
            <span className="block text-steel">Every chain.</span>
          </h2>
          <p className="mt-7 max-w-sm text-[15px] leading-relaxed text-chrome/65">
            Trade any asset, on any chain, with a single, unified buying power. No switching networks. No bridging.
            Just intent.
          </p>

          {/* 4 in, 1 out, 0 between: read as an equation, not a stat strip */}
          <dl className="mt-12 flex max-w-sm items-end justify-between">
            {[
              { value: "4", label: ["Chains", "unified"] },
              { value: "1", label: ["Balance", "interface"] },
              { value: "0", label: ["Bridges", "required"], accent: true },
            ].map((m, i) => (
              <div key={m.value} className="flex items-end gap-4">
                {i > 0 && (
                  <svg viewBox="0 0 24 12" className="mb-[30px] h-3 w-6 text-line-2" aria-hidden="true">
                    <path d="M0 6h22m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
                <div>
                  <dt className="sr-only">{m.label.join(" ")}</dt>
                  <dd>
                    <span className={`block font-mono text-[56px] font-light leading-none ${m.accent ? "text-acid" : "text-bright"}`}>
                      {m.value}
                    </span>
                    <span className="mt-3 block text-[12px] leading-[1.45] text-muted">
                      {m.label[0]}
                      <br />
                      {m.label[1]}
                    </span>
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <TiltIn className="lg:col-span-8">
          <UnifiedBalanceCard />
        </TiltIn>
      </div>
    </section>
  );
}
