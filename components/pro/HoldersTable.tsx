"use client";

import { getAddress, type Address } from "viem";
import { useNow } from "@/hooks/useLaunchAuction";
import { useLedger } from "@/hooks/useLedger";
import { isSystem, unrealizedUsd } from "@/lib/holders";
import { fmtTokens } from "@/lib/launch";
import { fmtTokenPrice } from "@/lib/launchTrade";
import type { AuctionV2 } from "@/lib/launchV2";
import { FocusChip, Tags, Trader, pnlTone, pnlUsd, td, th } from "@/components/pro/desk";

const SHOWN = 25;

function held(now: number | null, since: number) {
  if (now === null || since === 0) return "…";
  const s = Math.max(0, now - since);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/**
 * Holders & PnL: balances rebuilt from Transfer logs, with each wallet's average entry, unrealized PnL at the pool
 * price and realized PnL from what it already sold. Clicking a holder filters the desk and the chart to them.
 */
export function HoldersTable({
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
  const now = useNow();
  const { holders, transfers, swaps, price } = useLedger(factory, id, auction);
  const all = holders ?? [];
  const rows = focus ? all.filter((h) => getAddress(h.address) === getAddress(focus)) : all;
  const top = new Set(all.filter((h) => !isSystem(h) && getAddress(h.address) !== getAddress(auction.creator)).slice(0, 10).map((h) => h.address));

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
              <th className={th}>Holder</th>
              <th className={`${th} text-right`}>Balance</th>
              <th className={`${th} text-right`}>% supply</th>
              <th className={`${th} text-right`}>Avg entry</th>
              <th className={`${th} text-right`}>Unrealized</th>
              <th className={`${th} text-right`}>Realized</th>
              <th className={`${th} text-right`}>Held</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, SHOWN).map((h) => {
              const system = isSystem(h);
              const upnl = system ? null : unrealizedUsd(h, price);
              const upct = h.entry !== null && price !== null && !system ? (price / h.entry - 1) * 100 : null;
              const rank = all.indexOf(h) + 1;
              return (
                <tr key={h.address} className="hover:bg-tint/[0.02]">
                  <td className={`${td} font-mono text-dim`}>{rank}</td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2">
                      <Trader address={h.address} me={h.tags.includes("you")} focused={focus !== null && getAddress(focus) === getAddress(h.address)} onFocus={system ? undefined : onFocus} />
                      <Tags tags={[...h.tags, ...(top.has(h.address) && !h.tags.includes("whale") ? (["top"] as const) : [])]} />
                    </span>
                  </td>
                  <td className={`${td} text-right font-mono text-chrome/90`}>{fmtTokens(h.balance)}</td>
                  <td className={`${td} text-right font-mono text-muted`}>{h.pct.toFixed(h.pct >= 1 ? 1 : 3)}%</td>
                  <td
                    className={`${td} text-right font-mono text-muted`}
                    title={
                      system
                        ? "Protocol address: no entry price"
                        : h.entry === null
                          ? "No priced acquisition: tokens arrived by transfer or allocation"
                          : [h.approxEntry && "Intent fills priced at the solver's batch price", h.partialEntry && "Part of this holding has no price"].filter(Boolean).join(" · ") || "From this wallet's own priced buys"
                    }
                  >
                    {system || h.entry === null ? "—" : `${h.approxEntry ? "≈" : ""}${fmtTokenPrice(h.entry)}${h.partialEntry ? "*" : ""}`}
                  </td>
                  <td className={`${td} text-right font-mono ${pnlTone(upnl)}`} title="The priced tokens still held, at the pool price, less their average cost">
                    {upnl === null || h.pricedQty <= 0 ? (
                      "—"
                    ) : (
                      <>
                        {pnlUsd(upnl)}
                        {upct !== null && <span className="ml-1.5 text-[11px] opacity-75">{`${upct >= 0 ? "+" : ""}${upct.toFixed(Math.abs(upct) >= 100 ? 0 : 1)}%`}</span>}
                      </>
                    )}
                  </td>
                  <td
                    className={`${td} text-right font-mono ${pnlTone(system ? null : h.realized)}`}
                    title={
                      [h.approxRealized && "Intent sells priced at the solver's pool sell", h.partialRealized && "Some tokens left unpriced (a transfer, or no sale price): not counted"]
                        .filter(Boolean)
                        .join(" · ") || "Sale proceeds less their average cost"
                    }
                  >
                    {system || h.sells === 0 ? "—" : `${h.approxRealized ? "≈" : ""}${pnlUsd(h.realized)}${h.partialRealized ? "*" : ""}`}
                  </td>
                  <td className={`${td} text-right font-mono text-dim`}>{held(now, h.since)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(transfers.isPending || swaps.isPending) && <p className="px-3 py-6 text-center text-[12px] text-dim">Reading transfers from Base Sepolia…</p>}
        {transfers.isError && !transfers.data && <p className="px-3 py-6 text-center text-[12px] text-dim">Couldn&apos;t read the chain. Retrying…</p>}
        {holders && rows.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-dim">{focus ? "This wallet holds none now." : "No holders yet."}</p>}
      </div>
      <p className="px-1 pt-1.5 text-[11px] text-dim">
        {holders ? `Top ${Math.min(SHOWN, all.length)} of ${all.length} holders` : "Holders"} · balances from Transfer events · PnL at the pool price · ≈ priced at
        the solver&apos;s fill · * part of the holding or its sales has no price.
        {transfers.data?.truncated && " Only the last three days of transfers are read, so older holders may be missing."}
      </p>
    </div>
  );
}
