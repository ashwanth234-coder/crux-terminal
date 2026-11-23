"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { Logo } from "@/components/site/Logo";
import { SiteNav } from "@/components/site/SiteNav";
import { MobileSearch, TokenSearch } from "@/components/site/TokenSearch";
import { CommandButton } from "@/components/command/CommandBar";
import { WalletChip } from "@/components/terminal/WalletChip";
import { AccountButton } from "@/components/account/AccountButton";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { SmartAccountHint } from "@/components/ui/SmartAccountNote";
import { StatusTag } from "@/components/ui/StatusTag";
import { IS_TESTNET } from "@/lib/network";

/** Full-bleed app chrome for the pro terminal: a compact 56px bar, then the terminal fills the viewport. */
export function TerminalShell({ children }: { children: ReactNode }) {
  const { address } = useConnection();
  return (
    // Desktop: exactly one screen tall, so the panels scroll inside themselves like a trading terminal.
    <div className="flex min-h-svh flex-col bg-void lg:h-svh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-6">
          <span className="flex shrink-0 items-center gap-3">
            <Link href="/" aria-label="Crux home" className="shrink-0">
              <Logo />
            </Link>
            <StatusTag status={IS_TESTNET ? "testnet" : "live"} className="hidden sm:inline-flex" />
          </span>
          <nav aria-label="Primary" className="hidden min-[1440px]:block">
            <SiteNav variant="inline" hide={["Docs", "Protocol"]} />
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <TokenSearch className="hidden w-[220px] min-w-[140px] shrink md:block" />
          <MobileSearch className="md:hidden" />
          <CommandButton className="hidden sm:inline-flex" />
          <LanguageSwitcher compact className="hidden md:flex" />
          <ThemeToggle />
          <AccountButton />
          <span className="flex items-center gap-1">
            <WalletChip variant="header" />
            <SmartAccountHint address={address} />
          </span>
        </div>
      </header>
      <p role="note" className="shrink-0 border-b border-signal/30 bg-signal/[0.06] px-4 py-1 text-center text-[11.5px] text-chrome sm:px-5">
        The terminal is still being built. Some features may be missing or slow.
      </p>
      <main className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">{children}</main>
    </div>
  );
}
