"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useSolanaAutoDeposit } from "@/hooks/useSolanaAutoDeposit";
import { useOneBalance } from "@/hooks/useSolanaTrading";
import { AddMoneyButton } from "@/components/account/AddMoney";
import { fmtUsdc } from "@/lib/launch";

const noopSubscribe = () => () => {};

/**
 * The header's Crux account control: "Log in" (email or Google, through Privy) when logged out; once in, the account's
 * test USDC, linking to /account, with a red dot until a withdrawal address protects it.
 */
export function AccountButton() {
  const a = useCruxAccount();
  // USDC landing on the login's Solana address moves into the account by itself (mounted here: the header is on every page).
  const moving = useSolanaAutoDeposit();
  // One balance: Base, Solana and BNB Chain cash plus the Protected Savings Vault (useOneBalance). On Base Sepolia the
  // vault's is test money and the rest real, so they're shown apart (never added).
  const one = useOneBalance();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const base = "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[4px] border px-3 text-[11px] font-medium transition-colors duration-200";

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
    <span className="inline-flex items-center gap-2">
      {/* Add money sits beside the balance, wherever the balance is shown. */}
      <AddMoneyButton />
      <Link
        href="/account"
        className={`${base} border-line-2 font-mono text-chrome hover:border-chrome/50`}
        title={
          moving.kind === "moving"
            ? `Moving $${fmtUsdc(moving.usdc)} from Solana into your account…`
            : protectedNow
              ? "Your Crux account"
              : "Your Crux account: not protected yet. Bind a withdrawal address."
        }
      >
        <span className={`h-1.5 w-1.5 rounded-full ${moving.kind === "moving" ? "animate-pulse bg-signal" : protectedNow ? "bg-up" : "bg-down"}`} aria-hidden="true" />
        {/* Says what it opens: the CRUX Account page (balance, deposit, withdraw, holdings, creator rewards). */}
        <span className="hidden font-sans uppercase tracking-[0.14em] text-dim min-[1800px]:inline">Account</span>
        {a.usdc === null ? (
          "Account"
        ) : one.testnet ? (
          <>
            ${fmtUsdc(a.usdc)}
            <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-dim">test</span>
            {one.solana !== null && one.solana > BigInt(0) && (
              <>
                <span className="text-dim">·</span>${fmtUsdc(one.solana)}
                <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-up">real</span>
              </>
            )}
          </>
        ) : (
          `$${fmtUsdc(one.total ?? a.usdc + (one.solana ?? BigInt(0)))}`
        )}
      </Link>
    </span>
  );
}
