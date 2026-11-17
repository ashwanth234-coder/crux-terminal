"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Shell } from "@/components/launch/LaunchView";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";

/** BONK: a liquid default to try a first trade with. */
const DEFAULT_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

const usd = (units6: bigint) => `$${(Number(units6) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Buy and sell a Solana coin from the one Crux account (plan: docs/one-account-everywhere.md, phase C). The same panel
 * (SolanaTradePanel) goes on every Solana coin's page in phase D.
 */
export function SolanaTrade() {
  const crux = useCruxAccount();
  const [mint, setMint] = useState(DEFAULT_MINT);
  const [draft, setDraft] = useState(DEFAULT_MINT);
  return (
    <Shell mode="live">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <h1 className="font-display-md text-[28px] text-chrome">Trade a Solana coin</h1>
        {!crux.loggedIn ? (
          <button type="button" onClick={crux.login} className={buttonClass("primary", "md", "font-semibold")}>
            Log in with email or Google
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                aria-label="Coin address"
                value={draft}
                onChange={(e) => setDraft(e.target.value.trim())}
                spellCheck={false}
                placeholder="Paste a coin address"
                className="min-w-0 flex-1 rounded-lg border border-line bg-void/60 px-3 py-2 font-mono text-[12px] text-chrome outline-none focus:border-line-2"
              />
              <button type="button" onClick={() => setMint(draft)} className={buttonClass("outline", "sm")}>
                Open
              </button>
            </div>
            <SolanaTradePanel mint={mint} />
          </>
        )}
      </div>
    </Shell>
  );
}

/** One Buy/Sell panel for a Solana coin: amounts, one button, the result in plain words. Routes are picked for you. */
export function SolanaTradePanel({ mint }: { mint: string }) {
  const t = useSolanaTrading(mint);
  const [custom, setCustom] = useState("");
  const [turbo, setTurbo] = useState(false);
  const h = t.holdings;
  const decimals = h?.coin?.decimals ?? h?.token?.decimals ?? 0;
  const held = h?.coin?.amount ?? BigInt(0);
  const symbol = h?.token?.symbol ?? "coin";
  const busy = t.result.kind === "busy";
  const value = h?.token?.usdPrice !== undefined && decimals ? (Number(held) / 10 ** decimals) * h.token.usdPrice : null;
  const buy = (dollars: number) => void t.buy(BigInt(Math.round(dollars * 1e6)), { turbo });

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
        {h?.token?.icon ? <img src={h.token.icon} alt="" className="h-9 w-9 rounded-full" /> : <span className="h-9 w-9 rounded-full bg-line" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-chrome">
            {h?.token?.name ?? "…"} <span className="text-dim">${symbol}</span>
          </p>
          <p className="font-mono text-[12px] text-muted">{h?.token?.usdPrice !== undefined ? `$${h.token.usdPrice.toPrecision(4)}` : "price …"}</p>
        </div>
        <div className="text-right text-[12px]">
          <p className="text-dim">You hold</p>
          <p className="font-mono text-chrome">{value !== null ? `$${value.toFixed(2)}` : held > BigInt(0) ? "…" : "$0.00"}</p>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          {[1, 5, 20].map((d) => (
            <button key={d} type="button" disabled={busy} onClick={() => buy(d)} className={buttonClass("primary", "sm", "font-semibold")}>
              Buy ${d}
            </button>
          ))}
          <input
            inputMode="decimal"
            aria-label="Other amount in dollars"
            placeholder="$ other"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-24 rounded-lg border border-line bg-void/60 px-2 py-1.5 font-mono text-[12px] text-chrome outline-none"
          />
          <button type="button" disabled={busy || !Number(custom)} onClick={() => buy(Number(custom))} className={buttonClass("outline", "sm")}>
            Buy
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[25, 50, 100].map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy || held === BigInt(0)}
              onClick={() => void t.sell(p === 100 ? "all" : (held * BigInt(p)) / BigInt(100), { turbo })}
              className={buttonClass("outline", "sm")}
            >
              Sell {p}%
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
          Turbo (lands faster)
        </label>
      </div>

      <p className="text-[11.5px] text-dim">
        {h && h.usdc > BigInt(0) ? `Buys use your ${usd(h.usdc)} cash first, then your Crux balance.` : "Buys are paid from your Crux balance."} Fee 0.5%, at least $0.05.
      </p>

      {t.result.kind === "busy" && <p className="text-[13px] text-muted">{t.result.label}</p>}
      {t.result.kind === "error" && <p className="rounded-lg border border-down/50 px-3 py-2 text-[13px] text-down">{t.result.message}</p>}
      {t.result.kind === "done" && (
        <p className="rounded-lg border border-up/40 px-3 py-2 text-[13px] text-up">
          {t.result.side === "buy" ? "Bought" : "Sold"} in {(t.result.ms / 1000).toFixed(1)} s
          {t.result.how === "account" ? " · paid from your Crux balance (test run: it's checked, then your test USDC comes back)" : ""}
          {t.result.signature && (
            <>
              {" · "}
              <a href={`https://solscan.io/tx/${t.result.signature}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2">
                receipt
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
}
