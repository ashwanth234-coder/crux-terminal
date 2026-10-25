"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { fmtUsdc } from "@/lib/launch";

const noopSubscribe = () => () => {};

/**
 * The header's Crux account control: "Log in" (email or Google, through Privy) when logged out; once in, the account's
 * test USDC, linking to /account, with a red dot until a withdrawal address protects it.
 */
export function AccountButton() {
  const a = useCruxAccount();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const base = "inline-flex h-9 items-center gap-2 rounded-[4px] border px-3 text-[11px] font-medium transition-colors duration-200";

  if (!hydrated || !a.ready) return <span className={`${base} border-line text-dim`}>Account</span>;
  if (!a.loggedIn) {
    return (
      <button type="button" onClick={a.login} className={`${base} border-line-2 uppercase tracking-[0.16em] text-chrome hover:border-chrome/50`} title="Log in with email or Google">
        Log in
      </button>
    );
  }
  const protectedNow = a.withdrawalAddress !== null;
  return (
    <Link
      href="/account"
      className={`${base} border-line-2 font-mono text-chrome hover:border-chrome/50`}
      title={protectedNow ? "Your Crux account" : "Your Crux account: not protected yet. Bind a withdrawal address."}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${protectedNow ? "bg-up" : "bg-down"}`} aria-hidden="true" />
      {a.usdc !== null ? `$${fmtUsdc(a.usdc)}` : "Account"}
    </Link>
  );
}
