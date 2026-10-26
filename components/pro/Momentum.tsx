"use client";

import { useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";
import { orderflow, priceChange, share, usdAmount } from "@/lib/orderflow";

const WINDOWS = [
  { id: "5m", label: "5M", seconds: 300, span: "5 minutes" },
  { id: "1h", label: "1H", seconds: 3_600, span: "hour" },
  { id: "4h", label: "4H", seconds: 14_400, span: "4 hours" },
  { id: "24h", label: "24H", seconds: 86_400, span: "24 hours" },
] as const;
type WindowId = (typeof WINDOWS)[number]["id"];

const pctText = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(Math.abs(p) >= 100 ? 0 : 2)}%`;

/** One side against the other: counts or amounts above, the split as a bar below. */
function Pressure({ label, left, right, leftText, rightText }: { label: string; left: number; right: number; leftText: string; rightText: string }) {
  const pct = share(left, right);
  const empty = left + right === 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-mono text-up">{leftText}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-dim">{label}</span>
        <span className="font-mono text-down">{rightText}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-px overflow-hidden rounded-[2px] bg-line" role="img" aria-label={`${label}: ${leftText} against ${rightText}`}>
        {!empty && (
          <>
            <span className="h-full bg-up" style={{ width: `${pct}%` }} />
            <span className="h-full flex-1 bg-down" />
          </>
        )}
      </div>
    </div>
  );
}

function Pill({ href, children, title }: { href: string; children: ReactNode; title: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-line-2 px-2.5 text-[11.5px] text-muted transition-colors hover:border-chrome/50 hover:text-chrome"
    >
      {children}
    </a>
  );
}

/**
 * Momentum, beside the order ticket: the price change over 5 minutes, 1, 4 and 24 hours (pick one to see its flow),
 * then buy against sell pressure in that window by trades, by USDC and by distinct wallets, how much went through
 * Crux, and the token's links. Every number is an executed trade on its liquidity.
 */
export function Momentum({ auction, symbol }: { auction: AuctionV2; symbol: string | null }) {
  const now = useNow();
  const meta = useTokenMeta(auction.token);
  const [win, setWin] = useState<WindowId>("1h");
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const openPrice = Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS));
  const { seconds, span } = WINDOWS.find((w) => w.id === win)!;
  const trades = swaps.data?.trades;
  const flow = trades && now !== null ? orderflow(trades, now - seconds) : null;
  const total = flow ? flow.buys + flow.sells : 0;
  const net = flow ? flow.buyUsdc - flow.sellUsdc : BigInt(0);
  const ticker = symbol ? `$${symbol}` : null;

  return (
    <section aria-labelledby="momentum-title" className="border-t border-line px-4 py-4">
      <h2 id="momentum-title" className="text-[13px] font-medium text-chrome">
        Momentum
      </h2>

      <div role="tablist" aria-label="Window" className="mt-2.5 grid grid-cols-4 gap-1">
        {WINDOWS.map((w) => {
          const pct = trades && now !== null ? priceChange(trades, now, w.seconds, openPrice) : null;
          const tone = pct === null || Math.abs(pct) < 0.005 ? "text-muted" : pct > 0 ? "text-up" : "text-down";
          return (
            <button
              key={w.id}
              role="tab"
              type="button"
              aria-selected={win === w.id}
              onClick={() => setWin(w.id)}
              className={`flex flex-col items-center gap-0.5 rounded-[4px] border py-1.5 transition-colors ${
                win === w.id ? "border-signal/60 bg-panel-2" : "border-line hover:border-line-2"
              }`}
            >
              <span className="font-mono text-[10px] text-dim">{w.label}</span>
              <span className={`font-mono text-[12px] ${tone}`}>{pct === null ? "…" : pctText(pct)}</span>
            </button>
          );
        })}
      </div>

      {!flow ? (
        <p className="mt-3 text-[12px] text-dim">{swaps.isError ? "Couldn't read the pool. Retrying…" : "Reading the pool…"}</p>
      ) : total === 0 ? (
        <p className="mt-3 text-[12px] text-dim">No trades in the last {span}.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          <Pressure label="Txns" left={flow.buys} right={flow.sells} leftText={`${flow.buys} buy${flow.buys === 1 ? "" : "s"}`} rightText={`${flow.sells} sell${flow.sells === 1 ? "" : "s"}`} />
          <Pressure label="Volume" left={Number(flow.buyUsdc)} right={Number(flow.sellUsdc)} leftText={usdAmount(flow.buyUsdc)} rightText={usdAmount(flow.sellUsdc)} />
          <Pressure
            label="Makers"
            left={flow.buyers}
            right={flow.sellers}
            leftText={`${flow.buyers} buyer${flow.buyers === 1 ? "" : "s"}`}
            rightText={`${flow.sellers} seller${flow.sellers === 1 ? "" : "s"}`}
          />
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5 text-[11.5px]">
            <span className="text-muted">
              Net{" "}
              <span className={`font-mono ${net >= BigInt(0) ? "text-up" : "text-down"}`}>
                {net >= BigInt(0) ? "+" : "−"}
                {usdAmount(net >= BigInt(0) ? net : -net)}
              </span>
            </span>
            <span
              className="text-dim"
              title="Volume filled for signed intents by the Crux solver, in a batch at one price. Makers counts direct traders only: intent fills settle through the solver."
            >
              via Crux <span className="font-mono text-chrome">{share(flow.intentUsdc, flow.buyUsdc + flow.sellUsdc - flow.intentUsdc).toFixed(0)}%</span>
              {flow.intentTrades > 0 && <span className="font-mono"> · {flow.intentTrades}</span>}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {meta.links.website && (
          <Pill href={meta.links.website} title="The project's website, as the creator set it at launch">
            Website
          </Pill>
        )}
        {meta.links.x && (
          <Pill href={meta.links.x} title="The project's X account, as the creator set it at launch">
            X
          </Pill>
        )}
        {ticker && (
          <Pill href={`https://x.com/search?q=${encodeURIComponent(`${ticker} OR ${auction.token}`)}&f=live`} title={`Latest posts mentioning ${ticker} or its contract`}>
            Search X
          </Pill>
        )}
        <Pill href={`${TESTNET_EXPLORER}/token/${auction.token}`} title="The token on the Base Sepolia explorer">
          Explorer
        </Pill>
      </div>
    </section>
  );
}
