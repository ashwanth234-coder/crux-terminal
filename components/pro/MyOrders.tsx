"use client";

import type { Address } from "viem";
import { useConnection } from "wagmi";
import { IntentRow } from "@/components/terminal/MyIntentsPanel";
import { useMyIntents, type MyIntent } from "@/hooks/useMyIntents";
import { useBatchClock } from "@/lib/batch";
import { SETTLER_DEPLOYED, assetId } from "@/lib/intents";
import { launchCaip19 } from "@/lib/launchTrade";
import { SolanaOrders } from "./SolanaOrders";

/** A buy delivers this token (its output asset id); a sell escrows it (its input token). */
export function isOrderFor(intent: MyIntent, token: Address, tokenAsset = assetId(launchCaip19(token))) {
  const input = intent.token ?? intent.inToken;
  return intent.outAsset?.toLowerCase() === tokenAsset.toLowerCase() || input?.toLowerCase() === token.toLowerCase();
}

/**
 * This wallet's intents for one launch token, read from the settler: open, filled or refunded, with the
 * refund button once an unfilled order's grace period has passed. Orders paid from Solana are listed above them.
 */
export function MyOrders({ token, symbol }: { token: Address; symbol: string }) {
  const { isConnected } = useConnection();
  const clock = useBatchClock();
  const { enabled, intents, isLoading, error, refetch } = useMyIntents();
  const tokenAsset = assetId(launchCaip19(token));
  const mine = intents.filter((i) => isOrderFor(i, token, tokenAsset));

  const note = (text: string) => <p className="px-3 py-6 text-center text-[12px] text-dim">{text}</p>;

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
      <SolanaOrders token={token} />
      {!SETTLER_DEPLOYED
        ? note("The intent settler isn't deployed on this build.")
        : !isConnected || !enabled
          ? note(`Connect a wallet to see your ${symbol} orders.`)
          : error && intents.length === 0
            ? note("Couldn't read the settler on Base Sepolia. Retrying…")
            : isLoading
              ? note("Reading your orders from Base Sepolia…")
              : mine.length === 0
                ? note(`No ${symbol} orders from this wallet yet. Signed trade intents show here until a solver fills them.`)
                : (
                    <ul className="divide-y divide-line px-3">
                      {mine.map((intent) => (
                        <IntentRow key={intent.orderId} intent={intent} now={clock?.now ?? null} onRefunded={() => void refetch()} />
                      ))}
                    </ul>
                  )}
    </div>
  );
}
