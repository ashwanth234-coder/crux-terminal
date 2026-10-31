"use client";

import { useId, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { ArrowRight, buttonClass } from "@/components/ui/Button";
import { TokenGlyph } from "./TokenGlyph";
import { IntentModal } from "./IntentModal";
import { useConnectModal } from "@/providers/Web3Provider";
import type { LaunchMarket } from "@/hooks/useLaunchMarket";
import { TESTNET } from "@/lib/chains";
import { SETTLER_DEPLOYED, TESTNET_USDC } from "@/lib/intents";
import { buyCost, fmtTokenPrice, solverQuote } from "@/lib/launchTrade";
import type { OrderDraft, Side } from "@/lib/order";
import { PAY_SOURCES, usd } from "@/lib/tokens";

/** A graduated Crux launch: Base Sepolia only, priced from its locked pool, paid in Base Sepolia test USDC. */
export type LaunchTrade = { symbol: string; market: LaunchMarket };

const NOT_LISTED = "Not listed for Crux orders yet";

const TEST_USDC_SOURCE = PAY_SOURCES.find((s) => s.id === "base-usdc") ?? PAY_SOURCES[0];

/** Buy or sell a graduated launch token by signed order, paid in Base Sepolia test USDC. */
export function TradeWidget({ launch }: { launch: LaunchTrade }) {
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [order, setOrder] = useState<OrderDraft | null>(null);
  const inputId = useId();

  const { address, isConnected } = useConnection();
  const { openConnect } = useConnectModal();

  // Launch tokens only exist on Base Sepolia: orders escrow its test USDC.
  const testUsdc = useReadContract({
    address: TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: TESTNET.id,
    query: { enabled: SETTLER_DEPLOYED && !!address, refetchInterval: 15_000 },
  });
  const available = Number(formatUnits(testUsdc.data ?? BigInt(0), 6));

  const qty = Number.parseFloat(amount) || 0;
  const market = launch.market;
  // The price depends on the size: the pool's quote for it (impact and Uniswap's fee) less the solver's spread,
  // exactly as the solver clears an order alone in its batch.
  const launchNotional = (() => {
    if (!market.reserves || qty <= 0) return null;
    let tokens: bigint;
    try {
      tokens = parseUnits(qty.toFixed(6), market.decimals);
    } catch {
      return null;
    }
    const usdcUnits = side === "buy" ? buyCost(tokens, market.reserves) : solverQuote("sell", tokens, market.reserves);
    return usdcUnits === null ? null : Number(formatUnits(usdcUnits, 6));
  })();
  const symbol = launch.symbol;
  const unitPrice = launchNotional && qty > 0 ? launchNotional / qty : (market.price ?? 0);
  const notional = launchNotional ?? 0;
  const tokenHeld = market.tokenBalance != null ? Number(formatUnits(market.tokenBalance, market.decimals)) : 0;
  // Balances are this wallet's real testnet holdings, so they only count once one is connected.
  const overBudget = !isConnected ? false : side === "buy" ? notional > available : qty > tokenHeld;
  // Why this token can't be traded right now (shown on the button).
  const blocked = !SETTLER_DEPLOYED
    ? "Crux orders aren't live in this build"
    : !market.reserves
      ? market.loading
        ? "Reading the pool…"
        : "Pool unavailable"
      : !(side === "buy" ? market.listedForBuys : market.listedForSells)
        ? NOT_LISTED
        : qty > 0 && launchNotional === null
          ? "More than the pool holds"
          : null;

  const review = () => {
    if (qty <= 0 || overBudget || blocked) return;
    if (!isConnected) {
      openConnect();
      return;
    }
    setOrder({
      side,
      symbol,
      qty,
      price: unitPrice,
      notional,
      source: TEST_USDC_SOURCE,
      originLabel: "Base Sepolia",
      asset: { address: market.token, caip19: market.caip19, decimals: market.decimals },
    });
  };

  // Validate the amount parses at token precision so signing can't throw later.
  const invalid = (() => {
    try {
      parseUnits(qty.toFixed(6), market.decimals);
      return false;
    } catch {
      return true;
    }
  })();

  const disabled = qty <= 0 || overBudget || invalid || Boolean(blocked);

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-void/60 p-3">
      <div role="tablist" aria-label="Order side" className="grid grid-cols-2 rounded-lg bg-panel-2 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            type="button"
            onClick={() => setSide(s)}
            className={`h-8 rounded-md text-[12px] capitalize transition-colors ${
              side === s ? (s === "buy" ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "bg-down/15 text-down") : "text-muted hover:text-chrome"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
        <span className="flex items-center gap-2.5">
          <TokenGlyph symbol={symbol} className="h-6 w-6" />
          <span className="font-mono text-[12px] font-semibold">${symbol}</span>
        </span>
        <span className="font-mono text-[11px] text-muted">{market.price != null ? `${fmtTokenPrice(market.price)} · pool` : "…"}</span>
      </div>

      <div className="mt-2 rounded-lg border border-line px-3 py-2.5 focus-within:border-line-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="sr-only">
            Amount of {symbol} to {side}
          </label>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              const next = e.target.value.replace(/[^0-9.]/g, "");
              // Allow a single decimal point.
              if (next.split(".").length <= 2) setAmount(next);
            }}
            className="w-full min-w-0 bg-transparent font-mono text-[22px] text-chrome outline-none placeholder:text-dim"
            placeholder="0"
          />
          <span className="shrink-0 rounded-[3px] border border-line-2 px-2 py-1 font-mono text-[10px] text-muted">{symbol}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between font-mono text-[11px]">
          <span className={overBudget ? "text-down" : "text-muted"}>
            ≈{usd.format(notional)}
            {side === "sell" && market.tokenBalance != null && ` · you hold ${tokenHeld.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
          </span>
          {market.reserves && (
            <button
              type="button"
              onClick={() => {
                const reserves = market.reserves!;
                // Buy: what the whole test USDC balance gets, after the spread. Sell: the whole balance.
                const max =
                  side === "buy"
                    ? Number(formatUnits(solverQuote("buy", parseUnits(available.toFixed(6), 6), reserves), market.decimals))
                    : tokenHeld;
                setAmount(max > 0 ? (Math.floor(max * 100) / 100).toString() : "0");
              }}
              className="text-dim transition-colors hover:text-signal"
            >
              Max
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[12px]">
        <span className="text-muted">{side === "buy" ? "Pay with" : "Receive"}</span>
        <span className="font-mono text-chrome">
          Base Sepolia test USDC{side === "buy" && isConnected ? ` · ${usd.format(available)}` : ""}
        </span>
      </div>

      <button
        type="button"
        onClick={review}
        disabled={disabled}
        className={buttonClass("primary", "sm", "mt-3 h-10 w-full rounded-lg text-[13px] font-semibold")}
      >
        {blocked && isConnected ? (
          blocked
        ) : overBudget ? (
          side === "sell" ? `Not enough $${symbol}` : "Insufficient test USDC"
        ) : (
          <>
            Review order <ArrowRight />
          </>
        )}
      </button>

      <p aria-live="polite" className="mt-2 min-h-[30px] text-center text-[11px] leading-snug text-muted">
        {blocked === NOT_LISTED ? (
          <>This launch isn&apos;t listed for Crux orders yet · Base Sepolia testnet</>
        ) : (
          <>Base Sepolia testnet · priced from the locked Uniswap pool · test funds only</>
        )}
      </p>

      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} />
    </div>
  );
}
