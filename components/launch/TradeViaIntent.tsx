"use client";

import { useState } from "react";
import type { Address } from "viem";
import { ArrowRight, buttonClass } from "@/components/ui/Button";
import { TradeWidget } from "@/components/terminal/TradeWidget";
import { useLaunchMarket } from "@/hooks/useLaunchMarket";
import { BATCH_WINDOW_SECONDS } from "@/lib/intents";
import { fmtTokenPrice } from "@/lib/launchTrade";

/**
 * Graduated launches only: trade the token by ERC-7683 intent. The Crux solver fills it from the launch's
 * locked Uniswap V2 pool at one uniform price per batch. Opens the terminal's own TradeWidget → IntentModal.
 */
export function TradeViaIntent({ token, pair, symbol }: { token: Address; pair: Address; symbol: string }) {
  const market = useLaunchMarket(token, pair);
  const [open, setOpen] = useState(false);
  const listed = market.listedForBuys || market.listedForSells;

  return (
    <section aria-label="Trade via intent" className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-chrome">Trade via intent</h2>
          <p className="mt-1 text-[12px] text-muted">Base Sepolia testnet · test USDC only</p>
        </div>
        {market.price !== null && <span className="shrink-0 font-mono text-[12px] text-muted">{fmtTokenPrice(market.price)}</span>}
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-muted">
        Sign one intent to buy or sell ${symbol}. A solver fills it from the locked pool at the next {BATCH_WINDOW_SECONDS}-second batch, where every
        order clears at one price. If nobody fills it, your escrow is refunded.
      </p>
      {!market.loading && !listed && (
        <p className="mt-3 rounded-lg border border-line-2 px-3 py-2 text-[12px] text-muted">
          ${symbol} isn&apos;t listed on the intent settlers yet. The settlers&apos; owner lists graduated launches; until then, intents for it can&apos;t open.
        </p>
      )}
      {open ? (
        <div className="mt-4">
          <TradeWidget launch={{ symbol, market }} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline", "md", "mt-4 w-full rounded-xl")} aria-expanded={false}>
          Trade via intent <ArrowRight />
        </button>
      )}
    </section>
  );
}
