"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { logClient, pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CLAIMED = parseAbiItem("event Claimed(uint256 indexed auctionId, address indexed account, uint256 tokens, uint256 refund)");

export type TokenTransfer = {
  /** "claim" marks an auction Claimed event: the token transfer in the same transaction was paid for at the clearing price. */
  kind: "transfer" | "claim";
  from: Address;
  to: Address;
  value: bigint;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  time: number;
};

/**
 * Every Transfer of a launch token since shortly before its auction opened, plus the auction's Claimed events
 * (so a claim can be told apart from a creator vesting release), oldest first, read incrementally like the bids
 * and swaps (lib/logs scanLogs). Enough to rebuild holder balances while the history fits the six-day log window;
 * `truncated` says when it doesn't.
 */
export function useTokenTransfers(token: Address, factory: Address, auctionId: bigint, since: number, enabled: boolean) {
  const queryKey = ["token-transfers", token];
  const pollId = queryKey.join(":");
  return useQuery({
    queryKey,
    queryFn: ({ client }) =>
      tracked(pollId, () =>
        scanLogs(client.getQueryData<LogScan<TokenTransfer>>(queryKey), since, async (fromBlock, toBlock, timeOf) => {
          const [logs, claims] = await Promise.all([
            logClient.getLogs({ address: token, event: TRANSFER, fromBlock, toBlock }),
            logClient.getLogs({ address: factory, event: CLAIMED, args: { auctionId }, fromBlock, toBlock }),
          ]);
          const claimItems: TokenTransfer[] = claims.map(
            (l) =>
              ({
                kind: "claim",
                from: factory,
                to: (l.args.account ?? zeroAddress) as Address,
                value: l.args.tokens ?? BigInt(0),
                txHash: l.transactionHash,
                blockNumber: l.blockNumber,
                logIndex: l.logIndex,
                time: timeOf(l.blockNumber),
              }) satisfies TokenTransfer,
          );
          const transferItems: TokenTransfer[] = logs.map(
            (l) =>
              ({
                kind: "transfer",
                from: (l.args.from ?? zeroAddress) as Address,
                to: (l.args.to ?? zeroAddress) as Address,
                value: l.args.value ?? BigInt(0),
                txHash: l.transactionHash,
                blockNumber: l.blockNumber,
                logIndex: l.logIndex,
                time: timeOf(l.blockNumber),
              }) satisfies TokenTransfer,
          );
          return [...transferItems, ...claimItems];
        }),
      ),
    enabled: enabled && token !== zeroAddress,
    refetchInterval: () => pollInterval(pollId, 15_000),
    retry: false,
  });
}
