"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WalletChip } from "@/components/terminal/WalletChip";
import { AccountButton } from "@/components/account/AccountButton";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { StatusTag } from "@/components/ui/StatusTag";
import { Logo } from "./Logo";
import { SiteNav } from "./SiteNav";

/** Slim site bar: mark and wordmark left, the five routes centred, CONNECT WALLET right. */
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
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-300 ${
        scrolled || open ? "border-line/80 bg-void/90 backdrop-blur-md" : "border-line/50 bg-void"
      }`}
    >
      <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto] items-center gap-6 px-4 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:px-12">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Crux home" className="shrink-0">
            <Logo />
          </Link>
          <StatusTag status="testnet" className="hidden sm:inline-flex" />
        </div>

        <nav aria-label="Primary" className="hidden lg:block">
          <SiteNav variant="inline" />
        </nav>

        <div className="flex items-center justify-end gap-2">
          <LanguageSwitcher className="hidden md:flex" />
          <AccountButton />
          <WalletChip variant="header" />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-9 w-9 place-items-center rounded-[4px] border border-line-2 text-chrome lg:hidden"
          >
            <span className="relative block h-2.5 w-4">
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform duration-200 ${open ? "top-[5px] rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform duration-200 ${open ? "top-[5px] -rotate-45" : "top-2.5"}`} />
            </span>
          </button>
        </div>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Primary"
        hidden={!open}
        className="h-[calc(100svh-64px)] overflow-y-auto border-t border-line px-4 pb-8 sm:px-8 lg:hidden"
      >
        <SiteNav variant="rows" onNavigate={() => setOpen(false)} />
        <LanguageSwitcher className="mt-5 flex" />
        <div className="mt-6 flex items-center gap-3 text-[12px] text-muted">
          <StatusTag status="testnet" />
          Base Sepolia. Nothing here is on mainnet.
        </div>
      </nav>
    </header>
  );
}
