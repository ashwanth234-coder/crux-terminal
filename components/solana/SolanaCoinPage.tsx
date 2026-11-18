"use client";

import { useQuery } from "@tanstack/react-query";
import { CoinTerminal } from "@/components/coin/CoinTerminal";
import { SolanaTicket } from "@/components/coin/CoinTradeTicket";
import { solanaCoin } from "@/lib/solanaCoins";

/** /sol/[mint]: a Solana coin in the pro terminal, traded from the one Crux account. */
export function SolanaCoinPage({ mint }: { mint: string }) {
  const coin = useQuery({ queryKey: ["solana-coin", mint], queryFn: () => solanaCoin(mint), refetchInterval: 30_000 });
  return (
    <CoinTerminal
      network="solana"
      token={mint}
      coin={coin.data}
      path={`/sol/${mint}`}
      trade={
        <>
          {coin.data === null && <p className="mb-3 text-[12.5px] text-down">This coin isn&rsquo;t listed on Solana&rsquo;s exchanges, so it can&rsquo;t be traded here.</p>}
          <SolanaTicket mint={mint} symbol={coin.data?.symbol} price={coin.data?.price} />
        </>
      }
    />
  );
}
