"use client";

import { useMemo } from "react";
import { getAddress, type Address } from "viem";
import { useLedger } from "@/hooks/useLedger";
import { isSystem, topTraders } from "@/lib/holders";
import { fmtTokens } from "@/lib/launch";
import type { AuctionV2 } from "@/lib/launchV2";
import { FocusChip, Tags, Trader, pnlTone, pnlUsd, td, th } from "@/components/pro/desk";

const SHOWN = 25;
const usd = (v: number) => (v === 0 ? "—" : `$${v >= 1_000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 0.01 ? v.toFixed(2) : v.toPrecision(2)}`);

/**
 * Top traders: every wallet that bought or sold this token at a price, ranked by total PnL (realized from its sales,
 * plus what it still holds at the pool price), sold-out wallets included. Clicking one filters the desk and the chart.
 */
export function TopTraders({
  factory,
  id,
  auction,
  focus,
  onFocus,
}: {
  factory: Address;
  id: string;
  auction: AuctionV2;
  focus: Address | null;
  onFocus: (a: Address | null) => void;
}) {
  const { ledger, holders, transfers, swaps, price } = useLedger(factory, id, auction);
  const traders = useMemo(() => (ledger ? topTraders(ledger, price) : null), [ledger, price]);
  const top = useMemo(
    () => new Set((holders ?? []).filter((h) => !isSystem(h) && getAddress(h.address) !== getAddress(auction.creator)).slice(0, 10).map((h) => h.address)),
    [holders, auction.creator],
  );
  const all = traders ?? [];
  const rows = focus ? all.filter((t) => getAddress(t.address) === getAddress(focus)) : all;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {focus && (
        <div className="flex items-center gap-2 px-1 pb-1.5 text-[11px] text-dim">
          Filtered to <FocusChip focus={focus} onFocus={onFocus} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="sticky top-0 bg-void">
            <tr className="border-b border-line">
              <th className={th}>#</th>
              <th className={th}>Trader</th>
              <th className={`${th} text-right`}>Bought</th>
              <th className={`${th} text-right`}>Sold</th>
              <th className={`${th} text-right`}>Realized</th>
              <th className={`${th} text-right`}>Unrealized</th>
              <th className={`${th} text-right`}>Total PnL</th>
              <th className={`${th} text-right`}>Holding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, SHOWN).map((t) => (
              <tr key={t.address} className="hover:bg-tint/[0.02]">
                <td className={`${td} font-mono text-dim`}>{all.indexOf(t) + 1}</td>
                <td className={td}>
                  <span className="inline-flex items-center gap-2">
                    <Trader address={t.address} me={t.tags.includes("you")} focused={focus !== null && getAddress(focus) === getAddress(t.address)} onFocus={onFocus} />
                    <Tags tags={[...t.tags, ...(top.has(t.address) && !t.tags.includes("whale") ? (["top"] as const) : [])]} />
                  </span>
                </td>
                <td className={`${td} text-right font-mono text-muted`}>
                  {usd(t.boughtUsd)} <span className="text-[10.5px] text-dim">{t.buys}×</span>
                </td>
                <td className={`${td} text-right font-mono text-muted`}>
                  {usd(t.soldUsd)} <span className="text-[10.5px] text-dim">{t.sells}×</span>
                </td>
                <td className={`${td} text-right font-mono ${pnlTone(t.sells ? t.realized : null)}`}>
                  {t.sells === 0 ? "—" : `${t.approxRealized ? "≈" : ""}${pnlUsd(t.realized)}${t.partialRealized ? "*" : ""}`}
                </td>
                <td className={`${td} text-right font-mono ${pnlTone(t.pricedQty > 0 ? t.unrealized : null)}`}>
                  {t.unrealized === null || t.pricedQty <= 0 ? "—" : pnlUsd(t.unrealized)}
                </td>
                <td className={`${td} text-right font-mono font-medium ${pnlTone(t.total)}`}>{pnlUsd(t.total)}</td>
                <td className={`${td} text-right font-mono text-dim`}>{t.balance > BigInt(0) ? `${fmtTokens(t.balance)} · ${t.pct.toFixed(t.pct >= 1 ? 1 : 2)}%` : "Sold out"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(transfers.isPending || swaps.isPending) && <p className="px-3 py-6 text-center text-[12px] text-dim">Reading trades from Base Sepolia…</p>}
        {traders && rows.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-dim">{focus ? "This wallet has no priced trades." : "No priced trades yet."}</p>}
      </div>
      <p className="px-1 pt-1.5 text-[11px] text-dim">
        Ranked by realized + unrealized PnL in test USDC, at the pool price · auction claims count as buys at the clearing price · ≈ intent sells priced at
        the solver&apos;s fill · * some tokens moved without a price and are left out.
      </p>
    </div>
  );
}
