"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { SiteNav } from "./SiteNav";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

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
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter] duration-300 ${
        scrolled || open ? "bg-void/85 backdrop-blur-xl" : ""
      }`}
    >
      {/* CRUX | Discover | Launch | Terminal | Docs */}
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-10 px-4 sm:px-8 lg:px-12">
        <Link href="/" aria-label="Crux home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <SiteNav variant="inline" />
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-2 text-[12px] text-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-acid" aria-hidden="true" />
            Base Sepolia testnet
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 place-items-center rounded-full border border-line-2 text-chrome md:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-1.5 h-px w-4 bg-current transition-opacity ${open ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
          </button>
        </div>
      </div>

      {/* A single hairline under the bar */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-line" aria-hidden="true" />

      <nav
        id="mobile-nav"
        aria-label="Primary"
        className={`overflow-hidden px-4 transition-[max-height,opacity] duration-300 sm:px-8 md:hidden ${open ? "max-h-[80svh] pb-6 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <SiteNav variant="rows" onNavigate={() => setOpen(false)} />
        <p className="mt-5 flex items-center gap-2 text-[12.5px] text-muted sm:hidden">
          <span className="h-1.5 w-1.5 rounded-full bg-acid" aria-hidden="true" />
          Base Sepolia testnet
        </p>
      </nav>
    </header>
  );
}
