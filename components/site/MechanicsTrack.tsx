"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Desktop: pins the section and scrubs the panel track sideways, one
 * mechanic per stop. Mobile and reduced motion: panels simply stack/scroll.
 */
export function MechanicsTrack({ labels, children }: { labels: string[]; children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const el = track.current;
      if (!el) return;
      setPinned(true);
      const distance = () => el.scrollWidth - window.innerWidth;
      const tween = gsap.to(el, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: section.current,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          // Settle on whole panels so every stop reads as one composed frame.
          snap: { snapTo: 1 / (labels.length - 1), inertia: false, duration: { min: 0.25, max: 0.7 }, delay: 0.08, ease: "power3.inOut" },
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            setActive(Math.min(labels.length - 1, Math.round(self.progress * (labels.length - 1))));
            if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
          },
        },
      });
      trigger.current = tween.scrollTrigger ?? null;
      return () => {
        setPinned(false);
        trigger.current = null;
      };
    });
    return () => mm.revert();
  }, [labels.length]);

  const jump = (i: number) => {
    const st = trigger.current;
    if (st) {
      const top = st.start + ((st.end - st.start) * i) / (labels.length - 1);
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      track.current?.children[i]?.scrollIntoView({ behavior: "smooth", block: "start", inline: "start" });
    }
  };

  return (
    <section ref={section} id="technology" aria-label="Protocol mechanics" className="relative scroll-mt-0 border-t border-line lg:h-svh lg:pt-[72px]">
      {/* Mechanic rail: sequence + progress, clickable */}
      <div className="relative z-20 hidden border-b border-line bg-void lg:block">
        <div className="relative mx-auto flex h-14 max-w-[1440px] items-center gap-10 px-12">
          {labels.map((l, i) => (
            <button
              key={l}
              type="button"
              onClick={() => jump(i)}
              aria-current={active === i ? "step" : undefined}
              className={`flex items-baseline gap-2.5 text-[13px] transition-colors duration-300 ${active === i ? "text-chrome" : "text-dim hover:text-muted"}`}
            >
              <span className={`font-mono text-[11px] ${active === i ? "text-acid" : ""}`}>0{i + 2}</span>
              {l}
            </button>
          ))}
        </div>
        <span ref={bar} className="absolute inset-x-0 bottom-[-1px] block h-px origin-left scale-x-0 bg-chrome/50" aria-hidden="true" />
      </div>

      <div className={`${pinned ? "overflow-hidden" : "lg:overflow-x-auto"} lg:h-[calc(100svh-72px-56px)]`}>
        <div ref={track} className="flex flex-col lg:h-full lg:w-max lg:flex-row">
          {children}
        </div>
      </div>
    </section>
  );
}
