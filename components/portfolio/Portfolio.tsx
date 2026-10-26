"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, zeroAddress, type Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { buttonClass } from "@/components/ui/Button";
import { IntentModal } from "@/components/terminal/IntentModal";
import { OneClickOrderStatus, useOrderWatch, type OneClickOrder } from "@/components/pro/OneClick";
import { Shell } from "@/components/launch/LaunchView";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { useAllLaunches, type LaunchSummary } from "@/hooks/useLaunches";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { tradeFromAccount } from "@/lib/account";
import { DESTINATION_SETTLER, useLaunchMarket } from "@/hooks/useLaunchMarket";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useTokenTransfers } from "@/hooks/useTokenTransfers";
import { TESTNET } from "@/lib/chains";
import { buildHolders } from "@/lib/holders";
import { CRUX_SOLVER, FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7, SETTLER_DEPLOYED, TESTNET_USDC, batchFactory } from "@/lib/intents";
import { fmtTokens, fmtUsdc } from "@/lib/launch";
import { fmtTokenPrice, launchCaip19 } from "@/lib/launchTrade";
import { PRICE_DECIMALS, type AuctionV2, type BatchVersion } from "@/lib/launchV2";
import { minReceived, type OrderDraft } from "@/lib/order";
import { SOLVER_MAX_IMPACT_PCT, tradeRisk } from "@/lib/risk";
import { PAY_SOURCES } from "@/lib/tokens";
import { useConnectModal } from "@/providers/Web3Provider";

const TEST_USDC_SOURCE = PAY_SOURCES.find((s) => s.id === "base-usdc") ?? PAY_SOURCES[0];
const SELL_SIZES = [25, 50, 100] as const;

// Rounded before the sign is chosen, so a sliver below zero shows as 0, not "−0.0".
const usd = (v: number) => {
  const c = Math.round(v * 100) / 100;
  if (c === 0 && v !== 0) return v > 0 ? "<$0.01" : "−<$0.01";
  return `${c < 0 ? "−" : ""}$${Math.abs(c).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const signedUsd = (v: number) => `${Math.round(v * 100) > 0 ? "+" : ""}${usd(v)}`;
const signedPct = (v: number) => {
  const digits = Math.abs(v) >= 100 ? 0 : 1;
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(digits)}%`;
};

type Position = { launch: LaunchSummary & { v2: AuctionV2; version: BatchVersion }; balance: bigint; claimTokens: bigint; claimRefund: bigint };
/** What a row reports up for the totals: its value at the pool price and the cost of the part with a known entry. */
type Mark = { value: number | null; cost: number | null; pricedValue: number | null };

/**
 * Crux positions on Base Sepolia, for the logged-in Crux account or the connected wallet: every launch token held,
 * valued at the pool price, with its average entry and unrealized PnL rebuilt from on-chain transfers, Sell 25% / 50% /
 * All (silent from the account, a signed intent from the wallet), and anything waiting to be claimed from an auction.
 */
export function Portfolio() {
  const { address: wallet } = useConnection();
  const { openConnect } = useConnectModal();
  const crux = useCruxAccount();
  const [view, setView] = useState<"account" | "wallet">("account");
  const viaAccount = view === "account" && crux.loggedIn && crux.account !== null;
  // Whose positions: the Crux account when logged in (unless the wallet is picked), else the connected wallet.
  const address = viaAccount ? crux.account! : wallet;
  const isConnected = Boolean(address);
  const { launches, loading } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7);
  const batch = useMemo(
    () => launches.filter((l): l is Position["launch"] => l.v2 !== null && l.version !== 1 && batchFactory(l.version as BatchVersion) !== null),
    [launches],
  );
  const me = address ?? zeroAddress;
  const on = { chainId: TESTNET.id } as const;

  const reads = useReadContracts({
    contracts: batch.flatMap((l) => [
      { ...on, address: l.v2.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [me] as const },
      {
        ...on,
        address: batchFactory(l.version)!,
        abi: cruxBatchFactoryAbi,
        functionName: "claimable" as const,
        args: [BigInt(l.id), me] as const,
      },
    ]),
    query: { enabled: Boolean(address) && batch.length > 0, refetchInterval: 15_000 },
  });
  const usdc = useReadContract({
    ...on,
    address: TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [me],
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  const positions: Position[] = [];
  batch.forEach((launch, i) => {
    const bal = reads.data?.[i * 2]?.result as bigint | undefined;
    const claim = reads.data?.[i * 2 + 1]?.result as readonly [bigint, bigint] | undefined;
    const balance = bal ?? BigInt(0);
    const [claimTokens, claimRefund] = claim ?? [BigInt(0), BigInt(0)];
    if (balance > BigInt(0) || claimTokens > BigInt(0) || claimRefund > BigInt(0)) positions.push({ launch, balance, claimTokens, claimRefund });
  });
  const holdings = positions.filter((p) => p.balance > BigInt(0) && p.launch.v2.status === 1 && p.launch.v2.pair !== zeroAddress);
  const claims = positions.filter((p) => p.claimTokens > BigInt(0) || p.claimRefund > BigInt(0));

  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const report = useCallback((key: string, mark: Mark) => {
    setMarks((m) => {
      const old = m[key];
      if (old && old.value === mark.value && old.cost === mark.cost && old.pricedValue === mark.pricedValue) return m;
      return { ...m, [key]: mark };
    });
  }, []);
  const [order, setOrder] = useState<OrderDraft | null>(null);
  // Account sells: signed silently by the login key, opened by the relay, followed until filled.
  const [accountOrder, setAccountOrder] = useState<OneClickOrder | null>(null);
  useOrderWatch(accountOrder, setAccountOrder);
  const sell = (draft: OrderDraft, input: bigint) => {
    if (!viaAccount) return setOrder(draft);
    if (!crux.sign || !crux.owner || !crux.account || !draft.asset) return;
    const { sign, owner, account } = crux;
    const token = draft.asset.address;
    setAccountOrder({ kind: "sending" });
    tradeFromAccount(sign, owner, account, {
      tokenIn: token,
      amountIn: input,
      tokenOut: launchCaip19(TESTNET_USDC),
      minAmountOut: parseUnits(minReceived(draft).toFixed(6), 6),
    })
      .then((orderId) => setAccountOrder({ kind: "open", orderId }))
      .catch((e: Error) => setAccountOrder({ kind: "error", message: e.message.split("\n")[0] }));
  };

  const live = holdings.map((h) => marks[`v${h.launch.version}#${h.launch.id}`]).filter(Boolean);
  const totalValue = live.reduce((s, m) => s + (m.value ?? 0), 0);
  const totalCost = live.reduce((s, m) => s + (m.cost ?? 0), 0);
  const totalPriced = live.reduce((s, m) => s + (m.pricedValue ?? 0), 0);
  const totalPnl = totalCost > 0 ? totalPriced - totalCost : null;
  const usdcBalance = usdc.data !== undefined ? usdc.data : null;
  const reading = loading || (Boolean(address) && batch.length > 0 && reads.isPending);

  return (
    <Shell mode="live">
      <div className="flex flex-col gap-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Portfolio · Base Sepolia testnet</p>
          <h1 className="mt-2 font-display-md text-[30px] text-chrome">Your Crux positions</h1>
          <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-muted">
            Every launch token held, valued at its pool&apos;s price. Entry and PnL are rebuilt from the chain&apos;s own transfers and
            fills, so they cover the last three days. Test tokens and test USDC only.
          </p>
        </div>

        {crux.loggedIn && crux.account && (
          <div role="radiogroup" aria-label="Positions of" className="-mt-4 flex items-center gap-1.5 text-[12px]">
            <span className="mr-1 text-dim">Showing</span>
            {(["account", "wallet"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={`h-7 rounded-[4px] border px-2.5 transition-colors ${view === v ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
              >
                {v === "account" ? "Crux account" : "Wallet"}
              </button>
            ))}
          </div>
        )}

        {!isConnected ? (
          <div className="rounded-xl border border-line px-6 py-12 text-center">
            <p className="text-[14px] text-muted">
              {crux.loggedIn ? "Connect a wallet to see its holdings, PnL and anything waiting to be claimed." : "Log in for your Crux account's positions, or connect a wallet to see its holdings, PnL and claims."}
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              {!crux.loggedIn && (
                <button type="button" onClick={crux.login} className={buttonClass("signal", "md", "font-semibold")}>
                  Log in
                </button>
              )}
              <button type="button" onClick={openConnect} className={buttonClass(crux.loggedIn ? "signal" : "outline", "md", "font-semibold")}>
                Connect wallet
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
              <Stat label="Holdings value" value={holdings.length === 0 ? usd(0) : live.length < holdings.length ? "…" : usd(totalValue)} />
              <Stat
                label="Unrealized PnL"
                value={totalPnl === null ? "—" : signedUsd(totalPnl)}
                tone={totalPnl === null ? undefined : totalPnl >= 0 ? "up" : "down"}
                hint="Across the holdings with a known entry price"
              />
              <Stat label={viaAccount ? "Account test USDC" : "Test USDC"} value={usdcBalance !== null ? `$${fmtUsdc(usdcBalance)}` : "…"} />
              <Stat label="Positions" value={reading ? "…" : String(holdings.length)} />
            </dl>

            <section aria-labelledby="holdings-h">
              <h2 id="holdings-h" className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-dim">
                Holdings
              </h2>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] text-dim">
                      <th className="px-4 py-2.5 font-normal">Token</th>
                      <th className="px-4 py-2.5 text-right font-normal">Balance</th>
                      <th className="px-4 py-2.5 text-right font-normal">Price</th>
                      <th className="px-4 py-2.5 text-right font-normal">Value</th>
                      <th className="px-4 py-2.5 text-right font-normal">Avg entry</th>
                      <th className="px-4 py-2.5 text-right font-normal">Unrealized</th>
                      <th className="px-4 py-2.5 text-right font-normal">Sell</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {holdings.map((h) => (
                      <HoldingRow key={`v${h.launch.version}#${h.launch.id}`} position={h} me={address!} onMark={report} onSell={sell} sellsInWindow={viaAccount} />
                    ))}
                  </tbody>
                </table>
                {reading && holdings.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-dim">Reading your balances from Base Sepolia…</p>}
                {!reading && holdings.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[13px] text-muted">No Crux launch tokens in this {viaAccount ? "account" : "wallet"} yet.</p>
                    <Link href="/launches" className={buttonClass("outline", "sm", "mt-4")}>
                      Discover launches
                    </Link>
                  </div>
                )}
              </div>
              <div className="mt-2">
                <OneClickOrderStatus order={accountOrder} to="your Crux account" />
              </div>
            </section>

            {claims.length > 0 && (
              <section aria-labelledby="claims-h">
                <h2 id="claims-h" className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-dim">
                  Waiting to be claimed
                </h2>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {claims.map((c) => (
                    <li key={`v${c.launch.version}#${c.launch.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <span className="text-[13px] text-chrome">
                        ${c.launch.symbol ?? "TOKEN"}{" "}
                        <span className="text-muted">
                          ·{" "}
                          {[c.claimTokens > BigInt(0) && `${fmtTokens(c.claimTokens)} tokens`, c.claimRefund > BigInt(0) && `$${fmtUsdc(c.claimRefund)} refund`]
                            .filter(Boolean)
                            .join(" + ")}
                        </span>
                      </span>
                      <Link href={c.launch.href} className={buttonClass("signal", "sm", "font-semibold")}>
                        Claim
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-[11.5px] leading-relaxed text-dim">
              {viaAccount ? "Account sells sign silently with your login (no gas) and pay back into the account. " : ""}Sells are trade intents: the Crux solver fills them in the next 10-second batch at no worse than your signed minimum, or
              you&apos;re refunded after the deadline. ≈ entry priced at the solver&apos;s batch price · * part of the holding has no price (a
              plain transfer or an allocation).
            </p>
          </>
        )}
      </div>
      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} />
    </Shell>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "up" | "down"; hint?: string }) {
  return (
    <div className="bg-void px-4 py-4" title={hint}>
      <dt className="text-[11px] text-dim">{label}</dt>
      <dd className={`mt-1 font-mono text-[18px] ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-chrome"}`}>{value}</dd>
    </div>
  );
}

function HoldingRow({
  position,
  me,
  onMark,
  onSell,
  sellsInWindow,
}: {
  position: Position;
  me: Address;
  onMark: (key: string, mark: Mark) => void;
  onSell: (order: OrderDraft, input: bigint) => void;
  /** Crux account sells go through during a batch-only window too (the solver pays them up front). */
  sellsInWindow: boolean;
}) {
  const { launch, balance } = position;
  const auction = launch.v2;
  const key = `v${launch.version}#${launch.id}`;
  const symbol = launch.symbol ?? "TOKEN";
  const factory = batchFactory(launch.version)!;
  const market = useLaunchMarket(auction.token, auction.pair);
  const transfers = useTokenTransfers(auction.token, factory, BigInt(launch.id), auction.startTime - 86_400, true);
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);

  const mine = useMemo(() => {
    if (!transfers.data || !swaps.data) return null;
    const rows = buildHolders(transfers.data.items, swaps.data.trades, {
      totalSupply: auction.totalSupply,
      clearingPrice: Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS)),
      creator: auction.creator,
      factory,
      pair: auction.pair,
      solver: CRUX_SOLVER,
      destinationSettler: DESTINATION_SETTLER,
      me,
      batchPool: market.batchPool,
    });
    return rows.find((r) => r.tags.includes("you")) ?? null;
  }, [transfers.data, swaps.data, auction, factory, me, market.batchPool]);

  const qty = Number(formatUnits(balance, market.decimals));
  const price = market.price;
  const value = price !== null ? qty * price : null;
  const entry = mine?.entry ?? null;
  const pnlPct = entry !== null && price !== null ? (price / entry - 1) * 100 : null;
  const pnlUsd = entry !== null && price !== null ? (price - entry) * qty : null;

  useEffect(() => {
    onMark(key, { value, cost: entry !== null ? entry * qty : null, pricedValue: entry !== null ? value : null });
  }, [key, value, entry, qty, onMark]);

  // The same order the terminal's Sell tab signs: a share of the balance, quoted from the pool.
  const sellDraft = (share: number): { draft: OrderDraft | null; input: bigint; reason: string | null } => {
    const input = (balance * BigInt(share)) / BigInt(100);
    const r = sellReason(input);
    return { ...r, input };
  };
  const sellReason = (input: bigint): { draft: OrderDraft | null; reason: string | null } => {
    if (!SETTLER_DEPLOYED) return { draft: null, reason: "Intents aren't live in this build" };
    if (market.protected && !sellsInWindow) return { draft: null, reason: "Batch-only window: sell in the batch on the token page" };
    if (!market.reserves) return { draft: null, reason: market.loading ? "Reading the pool…" : "Pool unavailable" };
    if (!market.listedForSells) return { draft: null, reason: "Not listed for intents yet" };
    const risk = input > BigInt(0) ? tradeRisk("sell", input, market.reserves) : null;
    if (!risk) return { draft: null, reason: "Too small to sell" };
    if (risk.poolImpactPct > SOLVER_MAX_IMPACT_PCT) return { draft: null, reason: `Moves the pool more than ${SOLVER_MAX_IMPACT_PCT}%: trade smaller on the token page` };
    const q = Number(formatUnits(input, market.decimals));
    const notional = Number(formatUnits(risk.out, 6));
    return {
      draft: {
        side: "sell",
        symbol: symbol.replace(/^\$/, ""),
        qty: q,
        price: q > 0 ? notional / q : 0,
        notional,
        source: TEST_USDC_SOURCE,
        originLabel: "Base Sepolia",
        asset: { address: market.token, caip19: market.caip19, decimals: market.decimals },
      },
      reason: null,
    };
  };

  const td = "px-4 py-3 text-right font-mono text-[12.5px]";
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-4 py-3">
        <Link href={launch.href} className="group inline-flex flex-col">
          <span className="text-[13px] text-chrome group-hover:text-signal">${symbol}</span>
          <span className="text-[11px] text-dim">{launch.name ?? "Crux launch"}{market.protected ? " · batch-only" : ""}</span>
        </Link>
      </td>
      <td className={`${td} text-chrome/90`}>{fmtTokens(balance)}</td>
      <td className={`${td} text-muted`}>{price !== null ? fmtTokenPrice(price) : "…"}</td>
      <td className={`${td} text-chrome`}>{value !== null ? usd(value) : "…"}</td>
      <td
        className={`${td} text-muted`}
        title={
          mine === null
            ? "Reading this wallet's transfers…"
            : entry === null
              ? "No priced acquisition in the last three days: tokens arrived by transfer or allocation"
              : [mine.approxEntry && "Intent fills priced at the solver's batch price", mine.partialEntry && "Part of this holding has no price"].filter(Boolean).join(" · ") ||
                "From this wallet's own priced buys"
        }
      >
        {mine === null ? "…" : entry === null ? "—" : `${mine.approxEntry ? "≈" : ""}${fmtTokenPrice(entry)}${mine.partialEntry ? "*" : ""}`}
      </td>
      <td className={`${td} ${pnlPct === null ? "text-dim" : pnlPct >= 0 ? "text-up" : "text-down"}`}>
        {pnlPct === null || pnlUsd === null ? (
          "—"
        ) : (
          <span className="flex flex-col items-end leading-tight">
            <span>{signedPct(pnlPct)}</span>
            <span className="text-[11px] opacity-80">{signedUsd(pnlUsd)}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {SELL_SIZES.map((share) => {
            const { draft, input, reason } = sellDraft(share);
            return (
              <button
                key={share}
                type="button"
                disabled={!draft}
                title={reason ?? `Sell ${share}% · about ${usd(draft!.notional)} before slippage`}
                onClick={() => draft && onSell(draft, input)}
                className="h-7 min-w-[48px] rounded-[4px] border border-line-2 px-2 text-[11.5px] text-muted transition-colors hover:border-down/70 hover:text-down disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-2 disabled:hover:text-muted"
              >
                {share === 100 ? "All" : `${share}%`}
              </button>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
