"use client";

import { useMemo } from "react";
import { formatUnits, type Address } from "viem";
import { useConnection } from "wagmi";
import { DESTINATION_SETTLER, useLaunchMarket } from "@/hooks/useLaunchMarket";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useTokenTransfers } from "@/hooks/useTokenTransfers";
import { buildLedger } from "@/lib/holders";
import { CRUX_SOLVER, PREVIOUS_SETTLERS, SETTLER } from "@/lib/intents";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";

/**
 * Every wallet's position in a graduated launch, rebuilt from its Transfer logs and trades (lib/holders): balances,
 * average entries, realized PnL. Shared by the Holders, Top traders and Swaps tabs and the chart's marks; the reads
 * are the same cached queries, so each extra user costs nothing on the chain.
 */
export function useLedger(factory: Address, id: string, auction: AuctionV2) {
  const { address } = useConnection();
  const transfers = useTokenTransfers(auction.token, factory, BigInt(id), auction.startTime - 86_400, true);
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const market = useLaunchMarket(auction.token, auction.pair);
  const ledger = useMemo(
    () =>
      transfers.data && swaps.data
        ? buildLedger(transfers.data.items, swaps.data.trades, {
            totalSupply: auction.totalSupply,
            clearingPrice: Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS)),
            creator: auction.creator,
            factory,
            pair: auction.pair,
            solver: CRUX_SOLVER,
            destinationSettler: DESTINATION_SETTLER,
            me: address,
            batchPool: market.batchPool,
            settlers: [SETTLER, ...PREVIOUS_SETTLERS.map((p) => p.address)],
          })
        : null,
    [transfers.data, swaps.data, auction, factory, address, market.batchPool],
  );
  const holders = useMemo(() => ledger?.filter((h) => h.balance > BigInt(0)) ?? null, [ledger]);
  return { ledger, holders, transfers, swaps, market, price: market.price };
}
