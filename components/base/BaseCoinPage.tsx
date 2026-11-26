"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CoinTerminal } from "@/components/coin/CoinTerminal";
import { BaseTicket } from "@/components/coin/CoinTradeTicket";
import { baseCoin } from "@/lib/bnbCoins";
import { V4LaunchCard } from "@/components/base/V4LaunchCard";

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

  const c = coin.data;
  return (
    <CoinTerminal
      network="base"
      token={address}
      coin={c}
      path={`/base/${address}`}
      trade={
        <>
          {c === null && <p className="mb-3 text-[12.5px] text-down">This coin has no market on Base yet, so it can&rsquo;t be traded here.</p>}
          <V4LaunchCard address={address} />
          <BaseTicket address={address} symbol={c?.symbol} price={c?.price} />
        </>
      }
    />
  );
}
