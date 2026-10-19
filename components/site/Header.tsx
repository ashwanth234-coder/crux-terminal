"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { NAV_LINKS } from "@/lib/site";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";

/** Chapters announce themselves with data-chapter="NN Label" on their section or panel. */
function useActiveChapter() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const ratios = new Map<Element, number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
        let best: Element | null = null;
        let bestRatio = 0.18;
        ratios.forEach((r, el) => {
          if (r > bestRatio) {
            best = el;
            bestRatio = r;
          }
        });
        setActive(best ? (best as HTMLElement).dataset.chapter ?? null : null);
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );
    document.querySelectorAll("[data-chapter]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return active;
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const chapter = useActiveChapter();
  const [num, ...label] = (chapter ?? "").split(" ");
  const showChip = chapter !== null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);


  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        scrolled || open ? "bg-void/80 backdrop-blur-xl" : ""
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-8 lg:px-12">
        <a href="#top" aria-label="Crux home" className="shrink-0">
          <Logo />
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="relative text-[13px] text-chrome/70 transition-colors duration-300 hover:text-chrome after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-acid after:transition-transform after:duration-300 hover:after:scale-x-100"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-5">
          {/* Where you are on the page: the chapter sequence is real wayfinding */}
          <p
            aria-live="polite"
            className={`hidden min-w-[9.5rem] items-baseline justify-end gap-2 transition-opacity duration-500 xl:flex ${
              showChip ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="font-mono text-[11px] tabular-nums text-acid">{num}</span>
            <span className="font-mono text-[11px] text-dim">/ 07</span>
            <span className="text-[13px] text-chrome">{label.join(" ")}</span>
          </p>
          <div className="relative">
            <a href="#protocol" className={buttonClass("acid", "sm", "h-10 px-5")}>
              Launch App <ArrowUpRight />
            </a>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 place-items-center rounded-full border border-line-2 text-chrome lg:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-1.5 h-px w-4 bg-current transition-opacity ${open ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
          </button>
        </div>
      </div>

      {/* A single hairline under the bar; no clock, no glow */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-line" aria-hidden="true" />

      <div
        id="mobile-nav"
        className={`overflow-hidden transition-[max-height,opacity] duration-500 lg:hidden ${open ? "max-h-[80svh] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <ul className="flex flex-col gap-1 px-4 pb-6 pt-2 sm:px-8">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-line py-4 font-display-md text-2xl text-chrome"
              >
                {link.label}
                <ArrowUpRight className="h-4 w-4 text-dim" />
              </a>
            </li>
          ))}
          <li className="pt-5">
            <LaunchTokenButton onOpen={() => setOpen(false)} className={buttonClass("outline", "md", "w-full")} />
          </li>
        </ul>
      </div>
    </header>
  );
}
