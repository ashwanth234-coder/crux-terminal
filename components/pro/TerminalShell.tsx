"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { Logo } from "@/components/site/Logo";
import { SiteNav } from "@/components/site/SiteNav";
import { TokenSearch } from "@/components/site/TokenSearch";
import { WalletChip } from "@/components/terminal/WalletChip";
import { AccountButton } from "@/components/account/AccountButton";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { SmartAccountHint } from "@/components/ui/SmartAccountNote";
import { StatusTag } from "@/components/ui/StatusTag";

/** Full-bleed app chrome for the pro terminal: a compact 56px bar, then the terminal fills the viewport. */
export function TerminalShell({ children }: { children: ReactNode }) {
  const { address } = useConnection();
  return (
    // Desktop: exactly one screen tall, so the panels scroll inside themselves like a trading terminal.
    <div className="flex min-h-svh flex-col bg-void lg:h-svh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" aria-label="Crux home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden lg:block">
            <SiteNav variant="inline" hide={["Docs", "Protocol"]} />
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <TokenSearch className="hidden w-[200px] md:block" />
          <StatusTag status="testnet" label="Base Sepolia" className="hidden 2xl:inline-flex" />
          <LanguageSwitcher className="hidden 2xl:flex" />
          <ThemeToggle />
          <AccountButton />
          <span className="flex items-center gap-1">
            <WalletChip variant="header" />
            <SmartAccountHint address={address} />
          </span>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">{children}</main>
    </div>
  );
}
