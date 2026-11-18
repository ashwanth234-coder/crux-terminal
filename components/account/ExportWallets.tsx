"use client";

import { useState } from "react";
import { useExportWallet as useExportEvm } from "@privy-io/react-auth";
import { useExportWallet as useExportSolana } from "@privy-io/react-auth/solana";
import { buttonClass } from "@/components/ui/Button";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";
import { useBnbTrading } from "@/hooks/useBnbTrading";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Take your money elsewhere: the login's own wallets on BNB Chain and Solana (where trades of those coins happen),
 * exported through Privy's window. The key shows on Privy's own page, inside this one; Crux never sees it. Import it
 * into MetaMask (BNB Chain) or Phantom (Solana) and send from there.
 */
export function ExportWallets() {
  const crux = useCruxAccount();
  const { exportWallet: exportEvm } = useExportEvm();
  const { exportWallet: exportSolana } = useExportSolana();
  const sol = useSolanaTrading(null);
  const bnb = useBnbTrading(null);
  const [error, setError] = useState<string | null>(null);
  if (!crux.loggedIn) return null;
  const solWallet = sol.holdings?.wallet;
  const bnbWallet = bnb.holdings?.wallet ?? crux.owner ?? undefined;
  const solCash = sol.holdings ? Number(sol.holdings.usdc) / 1e6 : null;
  const bnbCash = bnb.holdings ? Number(bnb.holdings.usdt) / 1e18 : null;
  const run = (f: () => Promise<void>) => {
    setError(null);
    void f().catch((e: Error) => setError(e.message.includes("not have") ? "This login has no wallet there yet." : "The export window couldn't open. Reload and try again."));
  };
  return (
    <details className="rounded-xl border border-line p-4 text-[13px]">
      <summary className="cursor-pointer text-chrome">Move your Solana and BNB Chain money to your own wallet</summary>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Coins you trade on Solana and BNB Chain live in your login&apos;s own wallets there. Sell your coins first if you want cash. Then export the wallet: a
        secure Privy window shows its private key (Crux never sees it). Import that key into Phantom (Solana) or MetaMask (BNB Chain) and send from there.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-signal">Anyone with this key controls that wallet&apos;s money. Never paste it into a website or share it with anyone, including Crux.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-line-2 p-3">
          <p className="text-chrome">BNB Chain wallet</p>
          <p className="mt-0.5 font-mono text-[11.5px] text-dim">{bnbWallet ? short(bnbWallet) : "…"} · cash {bnbCash !== null ? `$${bnbCash.toFixed(2)}` : "…"}</p>
          <button type="button" disabled={!bnbWallet} onClick={() => run(() => exportEvm(bnbWallet ? { address: bnbWallet } : undefined))} className={buttonClass("outline", "sm", "mt-2 w-full")}>
            Export to MetaMask
          </button>
        </div>
        <div className="rounded-lg border border-line-2 p-3">
          <p className="text-chrome">Solana wallet</p>
          <p className="mt-0.5 font-mono text-[11.5px] text-dim">{solWallet ? short(solWallet) : "…"} · cash {solCash !== null ? `$${solCash.toFixed(2)}` : "…"}</p>
          <button type="button" disabled={!solWallet} onClick={() => run(() => exportSolana(solWallet ? { address: solWallet } : undefined))} className={buttonClass("outline", "sm", "mt-2 w-full")}>
            Export to Phantom
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-[12px] text-down">{error}</p>}
    </details>
  );
}
