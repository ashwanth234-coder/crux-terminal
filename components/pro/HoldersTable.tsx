"use client";

import { formatUnits, type Address } from "viem";
import { useConnection } from "wagmi";
import { useNow } from "@/hooks/useLaunchAuction";
import { DESTINATION_SETTLER, useLaunchMarket } from "@/hooks/useLaunchMarket";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useTokenTransfers } from "@/hooks/useTokenTransfers";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { WHALE_SUPPLY_PCT, buildHolders, type HolderTag } from "@/lib/holders";
import { CRUX_SOLVER } from "@/lib/intents";
import { fmtTokens } from "@/lib/launch";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";

const SHOWN = 25;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const TAG: Record<HolderTag, { label: string; title: string }> = {
  you: { label: "You", title: "Your connected wallet" },
  creator: { label: "Creator", title: "Launched this token" },
  whale: { label: "Whale", title: `Holds more than ${WHALE_SUPPLY_PCT}% of supply` },
  pool: { label: "Pool", title: "The locked Uniswap V2 pool" },
  auction: { label: "Auction", title: "The launch factory: unclaimed sale tokens and creator vesting" },
  solver: { label: "Solver", title: "Crux solver inventory used to fill intents" },
  settler: { label: "Settler", title: "Crux destination settler" },
  burn: { label: "Burned", title: "0x…dEaD: can never move" },
};

function held(now: number | null, since: number) {
  if (now === null || since === 0) return "…";
  const s = Math.max(0, now - since);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

const th = "px-3 py-2 text-left text-[11px] font-normal text-dim";
const td = "px-3 py-1.5 text-[12px]";

/** Holders & PnL: balances rebuilt from Transfer logs, with entry and unrealized PnL where a price is known. */
export function HoldersTable({ factory, id, auction }: { factory: Address; id: string; auction: AuctionV2 }) {
  const { address } = useConnection();
  const now = useNow();
  const transfers = useTokenTransfers(auction.token, factory, BigInt(id), auction.startTime - 86_400, true);
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const market = useLaunchMarket(auction.token, auction.pair);

  const rows =
    transfers.data && swaps.data
      ? buildHolders(transfers.data.items, swaps.data.trades, {
          totalSupply: auction.totalSupply,
          clearingPrice: Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS)),
          creator: auction.creator,
          factory,
          pair: auction.pair,
          solver: CRUX_SOLVER,
          destinationSettler: DESTINATION_SETTLER,
          me: address,
          batchPool: market.batchPool,
        })
      : null;
  const price = market.price;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="sticky top-0 bg-void">
            <tr className="border-b border-line">
              <th className={th}>#</th>
              <th className={th}>Holder</th>
              <th className={`${th} text-right`}>Balance</th>
              <th className={`${th} text-right`}>% supply</th>
              <th className={`${th} text-right`}>Avg entry</th>
              <th className={`${th} text-right`}>Unrealized</th>
              <th className={`${th} text-right`}>Held</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).slice(0, SHOWN).map((h, i) => {
              const system = h.tags.some((t) => t === "pool" || t === "auction" || t === "solver" || t === "settler" || t === "burn");
              const pnl = h.entry !== null && price !== null && !system ? (price / h.entry - 1) * 100 : null;
              return (
                <tr key={h.address} className="hover:bg-white/[0.02]">
                  <td className={`${td} font-mono text-dim`}>{i + 1}</td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2">
                      <a
                        href={`${TESTNET_EXPLORER}/address/${h.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-mono hover:text-chrome ${h.tags.includes("you") ? "text-chrome" : "text-muted"}`}
                      >
                        {short(h.address)}
                      </a>
                      {h.tags.map((t) => (
                        <span
                          key={t}
                          title={TAG[t].title}
                          className={`rounded-[3px] border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] ${
                            t === "you" ? "border-signal/60 text-chrome" : t === "whale" || t === "creator" ? "border-line-2 text-chrome/85" : "border-line text-dim"
                          }`}
                        >
                          {TAG[t].label}
                        </span>
                      ))}
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
                  <td className={`${td} text-right font-mono ${pnl === null ? "text-dim" : pnl >= 0 ? "text-up" : "text-down"}`}>
                    {pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(Math.abs(pnl) >= 100 ? 0 : 1)}%`}
                  </td>
                  <td className={`${td} text-right font-mono text-dim`}>{held(now, h.since)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(transfers.isPending || swaps.isPending) && <p className="px-3 py-6 text-center text-[12px] text-dim">Reading transfers from Base Sepolia…</p>}
        {transfers.isError && !transfers.data && <p className="px-3 py-6 text-center text-[12px] text-dim">Couldn&apos;t read the chain. Retrying…</p>}
        {rows && rows.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-dim">No holders yet.</p>}
      </div>
      <p className="px-1 pt-1.5 text-[11px] text-dim">
        {rows ? `Top ${Math.min(SHOWN, rows.length)} of ${rows.length} holders` : "Holders"} · balances from Transfer events · PnL at the pool price · ≈ priced at
        the solver&apos;s batch price · * part of the holding has no price.
        {transfers.data?.truncated && " Only the last three days of transfers are read, so older holders may be missing."}
      </p>
    </div>
  );
}
