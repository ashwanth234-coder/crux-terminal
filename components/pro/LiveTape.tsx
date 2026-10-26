"use client";

import { useMemo, useState } from "react";
import { formatUnits, getAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import { useAuctionBids } from "@/hooks/useAuctionBids";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useNow } from "@/hooks/useLaunchAuction";
import { useLedger } from "@/hooks/useLedger";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { isSystem } from "@/lib/holders";
import { fmtTokens } from "@/lib/launch";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { priceUsd, type AuctionV2, type BatchVersion } from "@/lib/launchV2";
import { HoldersTable } from "@/components/pro/HoldersTable";
import { TopTraders } from "@/components/pro/TopTraders";
import { TrustRadar } from "@/components/pro/TrustRadar";
import { MyOrders } from "@/components/pro/MyOrders";
import { FocusChip, Tags, Trader, td, th, type DeskTag } from "@/components/pro/desk";

const PAGE = 25;
/** Testnet trades are often cents: keep USDC to its 6 decimals (at least 2). */
const usd = (units: bigint) => `$${Number(formatUnits(units, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const mcapText = (v: number) => (v < 1_000 ? `$${v.toFixed(2)}` : usdCompact.format(v));

function ago(now: number | null, t: number) {
  if (now === null) return "…";
  const s = Math.max(0, now - t);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** A trade larger than this share of the pool's liquidity (both sides, as the token bar shows it) is a whale. */
const WHALE_SHARE_BPS = 500;

const MIN_SIZES = [
  { label: "All sizes", usd: 0 },
  { label: "≥ $10", usd: 10 },
  { label: "≥ $100", usd: 100 },
  { label: "≥ $250", usd: 250 },
  { label: "≥ $1K", usd: 1_000 },
] as const;

/** Crux's own execution: an intent filled in a batch, or an order in the anti-sniper batch pool. */
function CruxBadge({ venue }: { venue: "intent" | "batch" }) {
  return (
    <span
      title={
        venue === "intent"
          ? "Through Crux: a signed intent with an on-chain minimum, filled by the Crux solver in a batch"
          : "Through Crux: cleared in the anti-sniper batch pool at the batch's one uniform price"
      }
      className="inline-flex items-center gap-1 rounded-[3px] border border-signal/50 bg-signal/10 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-signal"
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
        <path d="M6 1 10.5 2.6v3.1c0 2.6-1.9 4.5-4.5 5.3C3.4 10.2 1.5 8.3 1.5 5.7V2.6L6 1Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1" />
      </svg>
      {venue === "intent" ? "Crux" : "Batch"}
    </span>
  );
}

type Tab = "trades" | "bids" | "orders" | "holders" | "traders" | "trust";

const TAB_LABEL: Record<Tab, string> = { trades: "Swaps", bids: "Auction bids", orders: "My orders", holders: "Holders & PnL", traders: "Top traders", trust: "Trust radar" };

/**
 * The bottom desk. Swaps are what actually happened, newest first: every trade on the locked Uniswap V2 pool and,
 * during an anti-sniper window, the batch pool's fills, each with the market cap it traded at, who traded (dev, whale,
 * top-10 holder, you) and whether it went through Crux. Clicking a trader filters the desk and the chart's marks to
 * that wallet. Bids, my orders, holders & PnL, top traders and the trust radar share the space as tabs.
 */
export function LiveTape({
  factory,
  id,
  auction,
  graduated,
  live,
  symbol,
  version,
  focus,
  onFocus,
}: {
  factory: Address;
  id: string;
  auction: AuctionV2;
  graduated: boolean;
  live: boolean;
  symbol: string;
  version: BatchVersion;
  focus: Address | null;
  onFocus: (a: Address | null) => void;
}) {
  const { address } = useConnection();
  const crux = useCruxAccount();
  const now = useNow();
  const [tab, setTab] = useState<Tab>(graduated ? "trades" : "bids");
  const tabs: Tab[] = graduated ? ["trades", "holders", "traders", "orders", "bids", "trust"] : ["bids", "trust"];
  const [shown, setShown] = useState(PAGE);
  const [minUsd, setMinUsd] = useState(0);
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const bids = useAuctionBids(factory, auction, BigInt(id), live);
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, graduated);
  const { holders, market } = useLedger(factory, id, auction);
  const supply = Number(auction.totalSupply) / 1e18;
  const mine = useMemo(() => new Set([address, crux.account].filter((a): a is Address => Boolean(a)).map((a) => a.toLowerCase())), [address, crux.account]);
  // Pool liquidity = 2 × the USDC side; a whale trade is more than WHALE_SHARE_BPS of it.
  const isWhaleTrade = (usdc: bigint) =>
    market.reserves !== null && market.reserves.usdc > BigInt(0) && usdc * BigInt(10_000) > market.reserves.usdc * BigInt(2 * WHALE_SHARE_BPS);
  const noLimitAbove = auction.floorPrice * BigInt(1_000_000);

  // Who's who, from the ledger: whales by holding, the ten largest non-protocol holders (the dev aside).
  const who = useMemo(() => {
    const people = (holders ?? []).filter((h) => !isSystem(h));
    return {
      whales: new Set(people.filter((h) => h.tags.includes("whale")).map((h) => h.address.toLowerCase())),
      top: new Set(people.filter((h) => getAddress(h.address) !== getAddress(auction.creator)).slice(0, 10).map((h) => h.address.toLowerCase())),
    };
  }, [holders, auction.creator]);
  const tagsOf = (trader: Address, usdc: bigint): DeskTag[] => {
    const a = trader.toLowerCase();
    const tags: DeskTag[] = [];
    if (mine.has(a)) tags.push("you");
    if (a === auction.creator.toLowerCase()) tags.push("creator");
    if (who.whales.has(a) || isWhaleTrade(usdc)) tags.push("whale");
    else if (who.top.has(a)) tags.push("top");
    return tags;
  };

  // Newest first; a wallet's second and later bids are top-ups (they also replace its limit).
  const bidRows = (() => {
    const seen = new Set<string>();
    const rows = (bids.data?.events ?? []).map((e) => {
      const key = e.account.toLowerCase();
      const topUp = seen.has(key);
      seen.add(key);
      return { ...e, topUp };
    });
    return rows.reverse();
  })();
  const allTrades = swaps.data?.trades ?? [];
  const tradeRows = allTrades.filter(
    (t) =>
      Number(t.usdc) / 1e6 >= minUsd &&
      (side === "all" || t.side === side) &&
      (focus === null || getAddress(t.to) === getAddress(focus)),
  );
  const active = tab === "trades" ? swaps : bids;
  const total = tab === "trades" ? tradeRows.length : bidRows.length;
  const truncated = tab === "trades" ? swaps.data?.truncated : bids.data?.truncated;
  const filtered = minUsd > 0 || side !== "all" || focus !== null;

  return (
    <div className="flex h-full min-h-[inherit] flex-col">
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <div role="tablist" aria-label="Desk" className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setShown(PAGE);
              }}
              className={`shrink-0 rounded-[4px] px-3 py-1 text-[12px] transition-colors ${tab === t ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
            >
              {t === "bids" && !graduated ? "Bids" : TAB_LABEL[t]}
              {(t === "trades" || t === "bids") && <span className="ml-1.5 font-mono text-dim">{t === "trades" ? allTrades.length : bidRows.length}</span>}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 text-[11px] text-dim sm:inline">{live || graduated ? "Updates live" : "Final"} · Base Sepolia</span>
      </div>

      {tab === "orders" ? (
        <MyOrders token={auction.token} symbol={symbol} />
      ) : tab === "holders" ? (
        <HoldersTable factory={factory} id={id} auction={auction} focus={focus} onFocus={onFocus} />
      ) : tab === "traders" ? (
        <TopTraders factory={factory} id={id} auction={auction} focus={focus} onFocus={onFocus} />
      ) : tab === "trust" ? (
        <TrustRadar factory={factory} auction={auction} version={version} id={id} />
      ) : (
      <>
      {tab === "trades" && (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-1.5 text-[11px] text-dim">
          <div role="radiogroup" aria-label="Side" className="flex gap-0.5 rounded-[4px] border border-line p-0.5">
            {(["all", "buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                onClick={() => setSide(s)}
                className={`rounded-[3px] px-2 py-0.5 transition-colors ${side === s ? (s === "buy" ? "bg-up/15 text-up" : s === "sell" ? "bg-down/15 text-down" : "bg-panel-2 text-chrome") : "hover:text-chrome"}`}
              >
                {s === "all" ? "All" : s === "buy" ? "Buys" : "Sells"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5">
            <span aria-hidden="true">▽</span>
            <span className="sr-only">Minimum size</span>
            <select
              value={minUsd}
              onChange={(e) => setMinUsd(Number(e.target.value))}
              className="rounded-[3px] border border-line-2 bg-void px-1 py-0.5 font-mono text-[11px] text-chrome outline-none"
            >
              {MIN_SIZES.map((m) => (
                <option key={m.usd} value={m.usd}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {focus && (
            <span className="inline-flex items-center gap-1.5">
              Wallet <FocusChip focus={focus} onFocus={onFocus} />
            </span>
          )}
          {filtered && (
            <span className="ml-auto font-mono">
              {tradeRows.length} of {allTrades.length}
            </span>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 bg-void">
            {tab === "trades" ? (
              <tr className="border-b border-line">
                <th className={th}>Time</th>
                <th className={th}>Side</th>
                <th className={`${th} text-right`}>USDC</th>
                <th className={`${th} text-right`}>{symbol}</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`} title="Market cap at this trade's price: price × total supply">
                  MCap
                </th>
                <th className={th}>Trader</th>
                <th className={th}>Route</th>
              </tr>
            ) : (
              <tr className="border-b border-line">
                <th className={th}>Time</th>
                <th className={th}>Type</th>
                <th className={`${th} text-right`}>Amount (USDC)</th>
                <th className={`${th} text-right`}>Wallet total</th>
                <th className={`${th} text-right`}>Limit</th>
                <th className={th}>Wallet</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-line">
            {tab === "trades"
              ? tradeRows.slice(0, shown).map((t) => {
                  const route = t.viaIntent ? "intent" : t.venue === "batch-pool" ? "batch" : null;
                  return (
                    <tr key={`${t.txHash}-${t.logIndex}-${t.usdc}`} className={`hover:bg-white/[0.02] ${t.side === "buy" ? "bg-up/[0.025]" : "bg-down/[0.025]"}`}>
                      <td className={`${td} font-mono text-dim`}>
                        <a href={`${TESTNET_EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" className="hover:text-chrome" title={new Date(t.time * 1000).toLocaleString()}>
                          {ago(now, t.time)}
                        </a>
                      </td>
                      <td className={td}>
                        <span className={t.side === "buy" ? "text-up" : "text-down"}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                      </td>
                      <td className={`${td} text-right font-mono ${t.side === "buy" ? "text-up" : "text-down"}`}>{usd(t.usdc)}</td>
                      <td className={`${td} text-right font-mono text-chrome/90`}>{fmtTokens(t.tokens)}</td>
                      <td className={`${td} text-right font-mono text-muted`}>{fmtTokenPrice(t.price)}</td>
                      <td className={`${td} text-right font-mono text-chrome/90`}>{mcapText(t.price * supply)}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1.5">
                          {t.viaIntent ? (
                            <Trader address={t.to} label="Crux solver" focused={false} />
                          ) : (
                            <Trader address={t.to} me={mine.has(t.to.toLowerCase())} focused={focus !== null && getAddress(focus) === getAddress(t.to)} onFocus={onFocus} />
                          )}
                          {!t.viaIntent && <Tags tags={tagsOf(t.to, t.usdc)} />}
                        </span>
                      </td>
                      <td className={td}>
                        {route ? (
                          <CruxBadge venue={route} />
                        ) : (
                          <span title="A direct swap on the Uniswap V2 pool" className="rounded-[3px] border border-line px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                            Direct
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              : bidRows.slice(0, shown).map((b) => (
                  <tr key={`${b.txHash}-${b.account}-${b.totalQuote}`} className="hover:bg-white/[0.02]">
                    <td className={`${td} font-mono text-dim`}>
                      <a href={`${TESTNET_EXPLORER}/tx/${b.txHash}`} target="_blank" rel="noopener noreferrer" className="hover:text-chrome">
                        {ago(now, b.time)}
                      </a>
                    </td>
                    <td className={`${td} text-chrome/90`}>{b.topUp ? "Top-up" : "Bid"}</td>
                    <td className={`${td} text-right font-mono text-chrome/90`}>{usd(b.quoteAdded)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{usd(b.totalQuote)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{b.maxPrice >= noLimitAbove ? "Any" : `$${priceUsd(b.maxPrice)}`}</td>
                    <td className={td}>
                      <Trader address={b.account} me={mine.has(b.account.toLowerCase())} focused={false} />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {active.isPending && <p className="px-3 py-6 text-center text-[12px] text-dim">Reading from Base Sepolia…</p>}
        {active.isError && !active.data && <p className="px-3 py-6 text-center text-[12px] text-dim">Couldn&apos;t read the chain. Retrying…</p>}
        {active.data && total === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-dim">
            {tab === "trades" ? (filtered ? "No swaps match these filters." : "No trades in the pool yet.") : "No bids yet. Every bid in the window will show here."}
          </p>
        )}
        {total > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="w-full border-t border-line py-2 text-[12px] text-muted transition-colors hover:text-chrome"
          >
            Show more (<span className="font-mono">{total - shown}</span>)
          </button>
        )}
      </div>
      {truncated && <p className="px-1 pt-1.5 text-[11px] text-dim">Only the last three days are shown.</p>}
      </>
      )}
    </div>
  );
}
