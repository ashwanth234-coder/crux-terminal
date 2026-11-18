"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoinTerminal } from "@/components/coin/CoinTerminal";
import { buttonClass } from "@/components/ui/Button";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useBnbTrading } from "@/hooks/useBnbTrading";
import { bnbCoin, bnbFeeText } from "@/lib/bnbCoins";

/** /bnb/[address]: a BNB Chain coin in the pro terminal, traded from the one Crux account. */
export function BnbCoinPage({ address }: { address: string }) {
  const coin = useQuery({ queryKey: ["bnb-coin", address], queryFn: () => bnbCoin(address), refetchInterval: 30_000 });
  const c = coin.data;
  return (
    <CoinTerminal
      network="bsc"
      token={address}
      coin={c}
      path={`/bnb/${address}`}
      trade={
        <>
          {c === null && <p className="mb-3 text-[12.5px] text-down">This coin has no market on BNB Chain yet, so it can&rsquo;t be traded here.</p>}
          <BnbTradePanel address={address} symbol={c?.symbol} price={c?.price} />
        </>
      }
    />
  );
}

/** The Buy/Sell panel for a BNB Chain coin: the same as Solana's, paid from the Crux balance's BNB-side cash. */
export function BnbTradePanel({ address, symbol = "coin", price }: { address: string; symbol?: string; price?: number }) {
  const crux = useCruxAccount();
  const t = useBnbTrading(address);
  const [custom, setCustom] = useState("");
  const h = t.holdings;
  const held = h?.coin?.amount ?? BigInt(0);
  const value = price !== undefined && h?.coin ? (Number(held) / 10 ** h.coin.decimals) * price : null;
  const busy = t.result.kind === "busy";
  // USDT on BNB Chain has 18 decimals.
  const units = (dollars: number) => BigInt(Math.round(dollars * 1e6)) * BigInt(1e12);
  const sellAmount = (p: number) => (p === 100 ? ("all" as const) : (held * BigInt(p)) / BigInt(100));
  const warm = (side: "buy" | "sell", amount: bigint | "all") => ({
    onMouseEnter: () => t.prepare(side, amount),
    onFocus: () => t.prepare(side, amount),
    onTouchStart: () => t.prepare(side, amount),
  });

  if (!crux.loggedIn) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <p className="text-[13px] text-muted">Trade this coin from your one Crux account. No BNB needed, no bridging.</p>
        <button type="button" onClick={crux.login} className={buttonClass("primary", "md", "font-semibold")}>
          Log in to trade
        </button>
      </section>
    );
  }
  const done = t.result.kind === "done" ? t.result : null;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-dim">
          Cash ready: <span className="font-mono text-chrome">{h ? `$${(Number(h.usdt) / 1e18).toFixed(2)}` : "…"}</span>
        </span>
        <span className="text-dim">
          You hold <span className="font-mono text-chrome">{value !== null ? `$${value.toFixed(2)}` : "$0.00"}</span> ${symbol}
        </span>
      </div>
      <div>
        <div className="flex flex-wrap gap-2">
          {[1, 5, 20].map((d) => (
            <button key={d} type="button" disabled={busy} onClick={() => void t.buy(units(d))} {...warm("buy", units(d))} className={buttonClass("primary", "sm", "font-semibold")}>
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
          <button type="button" disabled={busy || !Number(custom)} onClick={() => void t.buy(units(Number(custom)))} className={buttonClass("outline", "sm")}>
            Buy
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[25, 50, 100].map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy || held === BigInt(0)}
              onClick={() => void t.sell(sellAmount(p))}
              {...(held > BigInt(0) ? warm("sell", sellAmount(p)) : {})}
              className={buttonClass("outline", "sm")}
            >
              Sell {p}%
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11.5px] text-dim">Paid from your Crux balance (its BNB Chain cash). {bnbFeeText} Crux pays the gas.</p>
      {t.result.kind === "busy" && <p className="text-[13px] text-muted">{t.result.label}</p>}
      {t.result.kind === "error" && <p className="rounded-lg border border-down/50 px-3 py-2 text-[13px] text-down">{t.result.message}</p>}
      {done && (
        <p className="rounded-lg border border-up/40 px-3 py-2 text-[13px] text-up">
          {done.side === "buy" ? "Bought" : "Sold"} in {(done.ms / 1000).toFixed(1)} s<span className="text-muted">{done.confirmed ? " · confirmed ✓" : " · confirming…"}</span>
          {" · "}
          <a href={`https://bscscan.com/tx/${done.hash}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2">
            receipt
          </a>
        </p>
      )}
    </section>
  );
}
