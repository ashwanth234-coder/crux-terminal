"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The terminal rises out of the page like a screen being stood up: scrubbed
 * to scroll, and always visible (it starts tilted, never hidden).
 */
export function TiltIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { rotateX: 16, y: 80, scale: 0.94, transformPerspective: 1800, transformOrigin: "50% 100%" },
        {
          rotateX: 0,
          y: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "top 38%", scrub: 0.8 },
        },
      );
    });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
