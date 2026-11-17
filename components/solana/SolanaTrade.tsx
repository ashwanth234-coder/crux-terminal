"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buttonClass } from "@/components/ui/Button";
import { fmtPrice, solanaCoin } from "@/lib/solanaCoins";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";

/**
 * One Buy/Sell panel for a Solana coin, as one account: amounts, one button, the result in plain words. How it's paid
 * (cash already on this side, or the Crux balance) is picked for you and never shown. Pointing at a button prepares
 * that trade, so the click only sends it.
 */
export function SolanaTradePanel({ mint }: { mint: string }) {
  const crux = useCruxAccount();
  const t = useSolanaTrading(mint);
  const [custom, setCustom] = useState("");
  const [turbo, setTurbo] = useState(false);
  // The coin's name, icon and price: the same lookup the coin page makes (shared cache), read in the browser.
  const coin = useQuery({ queryKey: ["solana-coin", mint], queryFn: () => solanaCoin(mint), refetchInterval: 30_000 }).data;
  const h = t.holdings;
  const decimals = h?.coin?.decimals ?? coin?.decimals ?? 0;
  const held = h?.coin?.amount ?? BigInt(0);
  const symbol = coin?.symbol || h?.token?.symbol || "coin";
  const price = coin?.price ?? h?.token?.usdPrice;
  const icon = coin?.icon ?? h?.token?.icon;
  const busy = t.result.kind === "busy";
  const value = price !== undefined && decimals ? (Number(held) / 10 ** decimals) * price : null;
  const units = (dollars: number) => BigInt(Math.round(dollars * 1e6));
  const sellAmount = (p: number) => (p === 100 ? ("all" as const) : (held * BigInt(p)) / BigInt(100));
  /** Hover, keyboard focus or a finger landing on the button: prepare that trade now. */
  const warm = (side: "buy" | "sell", amount: bigint | "all") => ({
    onMouseEnter: () => t.prepare(side, amount, { turbo }),
    onFocus: () => t.prepare(side, amount, { turbo }),
    onTouchStart: () => t.prepare(side, amount, { turbo }),
  });

  if (!crux.loggedIn) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <p className="text-[13px] text-muted">Trade this coin from your one Crux account. No SOL, no bridging.</p>
        <button type="button" onClick={crux.login} className={buttonClass("primary", "md", "font-semibold")}>
          Log in to trade
        </button>
      </section>
    );
  }

  const done = t.result.kind === "done" ? t.result : null;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
        {icon ? <img src={icon} alt="" className="h-9 w-9 rounded-full" /> : <span className="h-9 w-9 rounded-full bg-line" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-chrome">
            {coin?.name || h?.token?.name || "…"} <span className="text-dim">${symbol}</span>
          </p>
          <p className="font-mono text-[12px] text-muted">{price !== undefined ? fmtPrice(price) : "price …"}</p>
        </div>
        <div className="text-right text-[12px]">
          <p className="text-dim">You hold</p>
          <p className="font-mono text-chrome">{value !== null ? `$${value.toFixed(2)}` : held > BigInt(0) ? "…" : "$0.00"}</p>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          {[1, 5, 20].map((d) => (
            <button key={d} type="button" disabled={busy} onClick={() => void t.buy(units(d), { turbo })} {...warm("buy", units(d))} className={buttonClass("primary", "sm", "font-semibold")}>
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
          <button
            type="button"
            disabled={busy || !Number(custom)}
            onClick={() => void t.buy(units(Number(custom)), { turbo })}
            {...(Number(custom) ? warm("buy", units(Number(custom))) : {})}
            className={buttonClass("outline", "sm")}
          >
            Buy
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[25, 50, 100].map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy || held === BigInt(0)}
              onClick={() => void t.sell(sellAmount(p), { turbo })}
              {...(held > BigInt(0) ? warm("sell", sellAmount(p)) : {})}
              className={buttonClass("outline", "sm")}
            >
              Sell {p}%
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
          Turbo (fastest landing)
        </label>
      </div>

      <p className="text-[11.5px] text-dim">Paid from your Crux balance. Fee 0.5%, at least $0.05.</p>

      {t.result.kind === "busy" && <p className="text-[13px] text-muted">{t.result.label}</p>}
      {t.result.kind === "error" && <p className="rounded-lg border border-down/50 px-3 py-2 text-[13px] text-down">{t.result.message}</p>}
      {done && (
        <p className="rounded-lg border border-up/40 px-3 py-2 text-[13px] text-up">
          {done.side === "buy" ? "Bought" : "Sold"} in {(done.ms / 1000).toFixed(1)} s
          <span className="text-muted">{done.confirmed ? " · confirmed ✓" : " · confirming…"}</span>
          {done.how === "account" && <span className="text-muted"> · test run: your test USDC comes back</span>}
          {done.signature && (
            <>
              {" · "}
              <a href={`https://solscan.io/tx/${done.signature}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2">
                receipt
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
}
