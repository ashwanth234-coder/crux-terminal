"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isCruxV4Coin, useHolders, type CheckChain } from "@/hooks/useBuyCheck";
import { useCoinCreator } from "@/hooks/useCoinCreator";
import { relay } from "@/hooks/useSolanaTrading";
import { solanaFacts } from "@/lib/coinScan";
import { evmSafety } from "@/lib/tokenSafety";
import { RISKY, stripOf, type Liquidity } from "@/lib/safetyStrip";
import type { CoinTrade } from "@/lib/coinMarket";
import type { LaunchHistory } from "@/lib/launchHistory";
import type { ChartNetwork } from "@/lib/solanaCoins";

const CHECK: Record<ChartNetwork, CheckChain> = { solana: "solana", bsc: "bnb", base: "base" };

/** The dev's share and whether the pool's money is locked, from the free sources the buy check already reads. */
function useOwnership(network: ChartNetwork, token: string) {
  return useQuery({
    queryKey: ["coin-ownership", network, token],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ devPct?: number; liquidity?: Liquidity }> => {
      if (network === "solana") {
        const f = await solanaFacts(token);
        // pump.fun coins: the launch curve holds the money until graduation, then the new pool's shares are burned.
        const liquidity: Liquidity | undefined = token.endsWith("pump") ? { kind: "locked", why: "pump.fun coin: its pool money can't be pulled by anyone" } : undefined;
        return { devPct: f?.creatorPct, liquidity };
      }
      if (network === "base" && (await isCruxV4Coin(token))) return { liquidity: { kind: "locked", why: "Crux launch: its pool money is locked forever" } };
      const s = (await evmSafety(network, [token]))[token.toLowerCase()];
      // Before anyone has bought, the creator "holds 100%": not a sign of anything.
      return { devPct: s && (s.holders ?? 0) >= 2 ? s.creatorPct : undefined, liquidity: s?.lpLockedPct !== undefined ? { kind: "pct", pct: s.lpLockedPct } : undefined };
    },
  });
}

/**
 * Five numbers a trader checks before buying, under the coin's name: how much the 10 biggest wallets and the dev hold,
 * how much snipers grabbed in the first seconds, whether wallets look bundled, and whether the pool money is locked.
 * Amber when it's worth a second look; "—" when it isn't known (never guessed).
 */
export function SafetyStrip({ network, token, trades, startedAt, supply }: { network: ChartNetwork; token: string; trades: readonly CoinTrade[]; startedAt?: number; supply: number }) {
  const holders = useHolders(CHECK[network], token);
  const own = useOwnership(network, token);
  const creator = useCoinCreator(network, token);
  // The launch phase's trades (shared with the chart's read): the only ones that reach a Solana coin's first seconds.
  const launch = useQuery({
    queryKey: ["launch-history", network, token],
    enabled: network === "solana",
    staleTime: 10_000,
    queryFn: () => relay<LaunchHistory>("/v1/launch-history", { chain: network, coin: token }),
  });
  const all = useMemo(() => {
    const l = launch.data && !launch.data.loading && !launch.data.none ? launch.data.trades : [];
    return l.length ? [...trades, ...l] : trades;
  }, [trades, launch.data]);
  const s = useMemo(
    () => stripOf({ holders: holders.data, devPct: own.data?.devPct, trades: all, startedAt, supply, creator, liquidity: own.data?.liquidity }),
    [holders.data, own.data, all, startedAt, supply, creator],
  );
  const p = (v: number) => `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;
  const liq = s.liquidity;
  return (
    <dl aria-label="Who holds this coin" className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 font-mono text-[11.5px] sm:px-5">
      <Item label="Top 10" title="How much the 10 biggest wallets hold (pools left out)" value={s.top10 !== undefined ? p(s.top10) : "—"} risky={(s.top10 ?? 0) >= RISKY.top10} />
      <Item label="Dev" title="How much the coin's creator still holds" value={s.dev !== undefined ? p(s.dev) : "—"} risky={(s.dev ?? 0) >= RISKY.dev} />
      <Item
        label="Snipers"
        title="Wallets that bought in the first 15 seconds of trading, and how much of the coin they bought"
        value={s.snipers ? (s.snipers.wallets ? `${p(s.snipers.pct)} · ${s.snipers.wallets}` : "none") : "—"}
        risky={(s.snipers?.pct ?? 0) >= RISKY.snipers}
      />
      <Item
        label="Bundled"
        title="Many wallets holding almost the same amount: likely one buyer split across wallets"
        value={s.bundle ? (s.bundle.wallets ? `${p(s.bundle.pct)} · ${s.bundle.wallets}` : "none") : "—"}
        risky={!!s.bundle?.wallets}
      />
      <Item
        label="Liquidity"
        title={liq?.kind === "locked" ? liq.why : liq ? "Share of the pool's money that can't be pulled out" : "Not known for this coin's pool"}
        value={!liq ? "—" : liq.kind === "locked" ? "Locked" : liq.pct >= 99.5 ? "Locked" : liq.pct < 0.5 ? "Not locked" : `${p(liq.pct)} locked`}
        risky={liq?.kind === "pct" && liq.pct < RISKY.liquidityPct}
      />
    </dl>
  );
}

function Item({ label, value, title, risky }: { label: string; value: string; title: string; risky: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-dim">{label}</dt>
      <dd className={risky ? "text-signal" : "text-chrome"}>{value}</dd>
    </div>
  );
}
