"use client";

import type { ReactNode } from "react";
import { PrivyProvider as Privy } from "@privy-io/react-auth";
import { TESTNET } from "@/lib/chains";

/** Privy app "Crux Protocol". The App ID is public (it ships in every page); NEXT_PUBLIC_PRIVY_APP_ID overrides it. */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmvnt6cvy00ua0gjso2qmgkgp";

/**
 * Email / Google login for Crux accounts (lib/account.ts). New users get an Ethereum embedded wallet, which owns their
 * CruxAccount and signs its trades silently (no wallet pop-ups). External wallets keep using the site's own Connect
 * button (wagmi), so this provider adds a login path without touching it.
 */
export function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <Privy
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#e35d2b", landingHeader: "Log in to Crux", walletChainType: "ethereum-only" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: TESTNET,
        supportedChains: [TESTNET],
      }}
    >
      {children}
    </Privy>
  );
}
