"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CoinTerminal } from "@/components/coin/CoinTerminal";
import { BaseTicket } from "@/components/coin/CoinTradeTicket";
import { baseCoin, type BnbCoin } from "@/lib/bnbCoins";
import { V4LaunchCard } from "@/components/base/V4LaunchCard";
import { cruxV4Facts } from "@/hooks/useBuyCheck";

type FeedRow = { version: number; auctionId: number; token: string };

/**
 * /base/[address]: any Base coin in the pro terminal (chart, trades, Buy/Sell), traded from the one Crux account's
 * Base cash through KyberSwap (crux-solver /v1/base/*). A Crux launch opens its own launch page instead.
 */
export function BaseCoinPage({ address }: { address: string }) {
  const router = useRouter();
  const coin = useQuery({ queryKey: ["base-coin", address], queryFn: () => baseCoin(address), refetchInterval: 30_000 });
  // Crux's own launches (the same cached list as search): their page has the curve, the creator lock and more.
  const feed = useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: FeedRow[] }).launches;
    },
    staleTime: 60_000,
  });
  const crux = feed.data?.find((l) => l.token.toLowerCase() === address.toLowerCase());
  useEffect(() => {
    if (crux) router.replace(`/launch/v${crux.version}/${crux.auctionId}`);
  }, [crux, router]);

  // A Crux V4 coin trades on Crux from its first block, straight in its own pool; the market sites list it minutes later.
  const v4 = useQuery({ queryKey: ["v4-facts", address], queryFn: () => cruxV4Facts(address), enabled: coin.data === null, staleTime: Infinity });
  const fresh = coin.data === null ? (v4.data ?? null) : null;
  const c: BnbCoin | null | undefined = coin.data === null ? fresh : coin.data;
  return (
    <CoinTerminal
      network="base"
      token={address}
      coin={c}
      path={`/base/${address}`}
      trade={
        <>
          {fresh && <p className="mb-3 text-[12.5px] text-muted">Just launched: you can trade it here now. Its chart and trades show up in a few minutes.</p>}
          {c === null && !v4.isPending && <p className="mb-3 text-[12.5px] text-down">This coin has no market on Base yet, so it can&rsquo;t be traded here.</p>}
          <V4LaunchCard address={address} />
          <BaseTicket address={address} symbol={c?.symbol} price={c?.price} />
        </>
      }
    />
  );
}
