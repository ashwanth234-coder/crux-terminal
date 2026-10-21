"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/site/Logo";
import { SiteNav } from "@/components/site/SiteNav";
import { WalletChip } from "@/components/terminal/WalletChip";
import { StatusTag } from "@/components/ui/StatusTag";

/** Full-bleed app chrome for the pro terminal: a compact 56px bar, then the terminal fills the viewport. */
export function TerminalShell({ children }: { children: ReactNode }) {
  return (
    // Desktop: exactly one screen tall, so the panels scroll inside themselves like a trading terminal.
    <div className="flex min-h-svh flex-col bg-void lg:h-svh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" aria-label="Crux home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden lg:block">
            <SiteNav variant="inline" hide={["Docs"]} />
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <StatusTag status="testnet" label="Base Sepolia" className="hidden sm:inline-flex" />
          <WalletChip variant="header" />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">{children}</main>
    </div>
  );
}
