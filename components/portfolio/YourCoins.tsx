"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";
import { useWalletTrading } from "@/hooks/useBnbTrading";
import { usePositions } from "@/hooks/usePositions";
import { bnbCoin } from "@/lib/bnbCoins";
import { entryPrice, pnlOf, pnlText, type Position } from "@/lib/pnl";
import { fmtPrice, solanaCoins } from "@/lib/solanaCoins";
import { holdingsOf, NOT_COPIED } from "@/lib/walletCopy";

const CHAIN: Record<Position["chain"], string> = { solana: "Solana", base: "Base", bsc: "BNB Chain" };
const pageOf = (chain: Position["chain"], coin: string) => (chain === "solana" ? `/sol/${coin}` : chain === "base" ? `/base/${coin}` : `/bnb/${coin}`);
const usd = (n: number) => (n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toFixed(n >= 0.01 ? 2 : 4)}`);

type Row = { chain: Position["chain"]; coin: string; symbol: string; held: number; price?: number; entry?: number };

/**
 * The coins in the one balance's wallets, on every chain: what each is worth now and, for coins bought through Crux, the
 * average price paid and the profit / loss since. Solana from the wallet itself (Jupiter's holdings: every coin, also
 * ones bought elsewhere); BNB Chain and Base from the coins Crux recorded buying (positions), read live per coin.
 */
/** `compact`: the Ask Crux version (a list, each coin with buttons that send `onCommand`). */
export function YourCoins({ compact = false, onCommand }: { compact?: boolean; onCommand?: (command: string, say?: string) => void } = {}) {
  const pos = usePositions();
  const solWallet = useSolanaTrading(null).holdings?.wallet;
  const jup = useQuery({ queryKey: ["your-coins-solana", solWallet], enabled: !!solWallet, refetchInterval: 30_000, queryFn: () => holdingsOf(solWallet!) });
  const solMints = useMemo(() => [...(jup.data ?? new Map<string, bigint>()).keys()].filter((m) => !NOT_COPIED.has(m)), [jup.data]);
  const facts = useQuery({ queryKey: ["your-coins-solana-facts", solMints.join()], enabled: solMints.length > 0, refetchInterval: 30_000, queryFn: () => solanaCoins(solMints) });

  const solRows: Row[] = solMints.flatMap((mint) => {
    const f = facts.data?.find((c) => c.mint === mint);
    const decimals = f?.decimals ?? 6;
    const held = Number(jup.data!.get(mint)!) / 10 ** decimals;
    const p = pos.positions.find((x) => x.chain === "solana" && x.coin === mint);
    // Dust (worth under a cent) isn't a holding.
    if (f?.price !== undefined && held * f.price < 0.01) return [];
    return [{ chain: "solana" as const, coin: mint, symbol: f?.symbol || "COIN", held, price: f?.price, entry: p ? entryPrice(p, decimals) : undefined }];
  });
  const evm = pos.positions.filter((p) => p.chain !== "solana");

  // Each EVM row reads its own bag; its value and profit report back for the totals.
  const [evmRows, setEvmRows] = useState<Record<string, Row | null>>({});
  const report = useCallback((k: string, r: Row | null) => setEvmRows((m) => (m[k] === r ? m : { ...m, [k]: r })), []);
  const rows = [...solRows, ...Object.values(evmRows).filter((r): r is Row => r !== null)];
  const value = rows.reduce((s, r) => s + (r.price !== undefined ? r.held * r.price : 0), 0);
  const withEntry = rows.filter((r) => r.entry !== undefined && r.price !== undefined);
  const pnl = withEntry.reduce((s, r) => s + pnlOf(r.held, r.price!, r.entry!).usd, 0);
  const reading = (!!solWallet && jup.isLoading) || facts.isLoading;

  if (compact) {
    const on = (r: Row) => ` on ${r.chain === "bsc" ? "bnb" : r.chain}`;
    return (
      <div>
        {evm.map((p) => (
          <EvmBag key={`${p.chain}:${p.coin}`} p={p} onRow={report} />
        ))}
        {rows.length === 0 ? (
          <p>{reading ? "Reading your coins…" : "You don't hold any coins yet. Want me to find one?"}</p>
        ) : (
          <>
            <p>
              {`You hold ${rows.length} coin${rows.length === 1 ? "" : "s"} worth ${usd(value)}`}
              {withEntry.length > 0 && <span className={pnl >= 0 ? "text-up" : "text-down"}>{` · ${pnl >= 0 ? "up" : "down"} ${usd(Math.abs(pnl))} overall`}</span>}
              .
            </p>
            <ul className="mt-2 space-y-2">
              {rows.map((r) => {
                const p = r.entry !== undefined && r.price !== undefined ? pnlOf(r.held, r.price, r.entry) : null;
                return (
                  <li key={`${r.chain}:${r.coin}`} className="rounded-lg border border-line-2 px-3 py-2">
                    <p className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span>
                        <span className="font-medium">${r.symbol}</span> <span className="text-[11px] text-dim">{CHAIN[r.chain]}</span>
                      </span>
                      <span className="font-mono">
                        {r.price !== undefined ? usd(r.held * r.price) : "…"}
                        {p && <span className={p.usd >= 0 ? "text-up" : "text-down"}> {pnlText(p)}</span>}
                      </span>
                    </p>
                    {onCommand && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {[
                          { label: "Sell half", command: `sell half of ${r.coin}${on(r)}`, say: `Sell half my ${r.symbol}` },
                          { label: "Sell all", command: `sell all ${r.coin}${on(r)}`, say: `Sell all my ${r.symbol}` },
                          { label: "Take profit 2×", command: `sell all ${r.coin} at 2x${on(r)}`, say: `Sell all my ${r.symbol} at 2×` },
                          { label: "Stop loss 20%", command: `stop loss 20% on ${r.coin}${on(r)}`, say: `Stop loss 20% on ${r.symbol}` },
                        ].map((o) => (
                          <button key={o.label} type="button" onClick={() => onCommand(o.command, o.say)} className="rounded-full border border-line-2 px-2.5 py-0.5 text-[12px] text-muted hover:border-chrome/40 hover:text-chrome">
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="your-coins-h" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="your-coins-h" className="text-[12px] font-medium uppercase tracking-[0.18em] text-dim">
          Your coins
        </h2>
        <p className="font-mono text-[12.5px] text-muted">
          {usd(value)}
          {withEntry.length > 0 && <span className={pnl >= 0 ? "text-up" : "text-down"}> · {pnl >= 0 ? "+" : "−"}{usd(Math.abs(pnl))}</span>}
        </p>
      </div>
      {evm.map((p) => (
        <EvmBag key={`${p.chain}:${p.coin}`} p={p} onRow={report} />
      ))}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-dim">
              <th className="px-4 py-2 font-normal">Coin</th>
              <th className="px-4 py-2 text-right font-normal">Holding</th>
              <th className="px-4 py-2 text-right font-normal">Value</th>
              <th className="px-4 py-2 text-right font-normal">Bought at</th>
              <th className="px-4 py-2 text-right font-normal">Profit / loss</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.entry !== undefined && r.price !== undefined ? pnlOf(r.held, r.price, r.entry) : null;
              return (
                <tr key={`${r.chain}:${r.coin}`} className="border-b border-line/60 text-[13px] last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={pageOf(r.chain, r.coin)} className="font-medium text-chrome hover:underline">
                      ${r.symbol}
                    </Link>
                    <span className="ml-2 text-[11px] text-dim">{CHAIN[r.chain]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted">{r.held.toLocaleString("en-US", { maximumFractionDigits: r.held >= 1 ? 2 : 6 })}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-chrome">{r.price !== undefined ? usd(r.held * r.price) : "…"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted">{r.entry !== undefined ? fmtPrice(r.entry) : "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${p ? (p.usd >= 0 ? "text-up" : "text-down") : "text-dim"}`}>{p ? pnlText(p) : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-dim">
                  {reading ? "Reading your coins…" : "No coins yet. Buy one from any coin's page, or ask Crux."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-dim">“Bought at” and profit / loss show for coins bought through Crux from today on; “—” means Crux has no record of what you paid.</p>
    </section>
  );
}

/** One BNB Chain or Base coin Crux recorded buying: its bag (the wallet's balance) and price, reported as a row. */
function EvmBag({ p, onRow }: { p: Position; onRow: (k: string, r: Row | null) => void }) {
  const chain = p.chain === "base" ? "base" : "bnb";
  const t = useWalletTrading(chain, p.coin);
  const facts = useQuery({ queryKey: ["your-coins-evm", p.chain, p.coin], refetchInterval: 30_000, queryFn: () => bnbCoin(p.coin, p.chain === "base" ? "base" : "bsc") });
  const k = `${p.chain}:${p.coin}`;
  const decimals = t.holdings?.coin?.decimals ?? 18;
  const held = t.holdings?.coin ? Number(t.holdings.coin.amount) / 10 ** decimals : null;
  const price = facts.data?.price;
  const symbol = facts.data?.symbol ?? "COIN";
  useEffect(() => {
    onRow(k, held === null || held <= 0 ? null : { chain: p.chain, coin: p.coin, symbol, held, price, entry: entryPrice(p, decimals) });
  }, [k, held, price, symbol, decimals, p, onRow]);
  return null;
}
