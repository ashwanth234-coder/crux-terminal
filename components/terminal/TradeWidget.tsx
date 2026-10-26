"use client";

import { useId, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { ArrowRight, buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { TokenGlyph } from "./TokenGlyph";
import { PayWithSelect } from "./PayWithSelect";
import { IntentModal } from "./IntentModal";
import { useUnifiedBalance } from "@/hooks/useUnifiedBalance";
import { useFarcaster } from "@/providers/FarcasterProvider";
import { useConnectModal } from "@/providers/Web3Provider";
import type { LaunchMarket } from "@/hooks/useLaunchMarket";
import type { CruxIntentResult } from "@/lib/farcaster";
import { TESTNET } from "@/lib/chains";
import { SETTLER_DEPLOYED, TESTNET_ESCROW_ASSETS, TESTNET_USDC } from "@/lib/intents";
import { buyCost, fmtTokenPrice, solverQuote } from "@/lib/launchTrade";
import { NOVA_ASSET, sourceAsset, type OrderDraft, type Side } from "@/lib/order";
import { ORB_TOKENS, PAY_SOURCES, usd, type PaySourceId } from "@/lib/tokens";

type Status = { kind: "idle" } | { kind: "pending" } | { kind: "done"; result: CruxIntentResult };

const NOVA = ORB_TOKENS[0];

const ORIGIN: Record<PaySourceId, string> = {
  unified: "Auto-routed",
  "base-usdc": "Base",
  "solana-usdc": "Solana",
  "robinhood-usdc": "Robinhood Chain",
};

const STATUS_COPY: Record<CruxIntentResult["status"], (r: CruxIntentResult) => string> = {
  submitted: (r) => `Swap submitted · ${r.status === "submitted" ? r.transactions.length : 0} tx`,
  rejected: () => "Swap cancelled in wallet",
  failed: (r) => (r.status === "failed" ? r.message : "Swap failed"),
  unsupported: () => "Swap form is only available inside Farcaster.",
};

/** A graduated Crux launch to trade instead of the demo NOVA: Base Sepolia only, priced from its locked pool. */
export type LaunchTrade = { symbol: string; market: LaunchMarket };

const NOT_LISTED = "Not listed for intents yet";

const TEST_USDC_SOURCE = PAY_SOURCES.find((s) => s.id === "base-usdc") ?? PAY_SOURCES[0];

export function TradeWidget({ launch }: { launch?: LaunchTrade } = {}) {
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState(launch ? "" : "100");
  const [source, setSource] = useState<PaySourceId>("unified");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [order, setOrder] = useState<OrderDraft | null>(null);
  const inputId = useId();

  const balance = useUnifiedBalance();
  const { address, isConnected } = useConnection();
  const { isFarcaster, triggerSwap } = useFarcaster();
  const { openConnect } = useConnectModal();

  // With the testnet settler live, browser intents escrow Base Sepolia USDC,
  // so buying power for the USDC rails is that test balance, not mainnet.
  // Launch tokens only exist on Base Sepolia, so they always take the testnet intent path.
  const testnet = SETTLER_DEPLOYED && isConnected && (!isFarcaster || Boolean(launch));
  const testUsdc = useReadContract({
    address: TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: TESTNET.id,
    query: { enabled: testnet && !!address, refetchInterval: 15_000 },
  });
  const testUsdcBalance = Number(formatUnits(testUsdc.data ?? BigInt(0), 6));
  const availableFor = (id: PaySourceId) =>
    testnet ? (TESTNET_ESCROW_ASSETS.has(sourceAsset(id).caip19) ? testUsdcBalance : 0) : balance.availableFor(id);

  const qty = Number.parseFloat(amount) || 0;
  const market = launch?.market;
  // A launch token's price depends on the size: the pool's quote for it (impact and Uniswap's fee) less the
  // solver's spread, exactly as the solver clears an order alone in its batch.
  const launchNotional = (() => {
    if (!market?.reserves || qty <= 0) return null;
    let tokens: bigint;
    try {
      tokens = parseUnits(qty.toFixed(6), market.decimals);
    } catch {
      return null;
    }
    const usdcUnits = side === "buy" ? buyCost(tokens, market.reserves) : solverQuote("sell", tokens, market.reserves);
    return usdcUnits === null ? null : Number(formatUnits(usdcUnits, 6));
  })();
  const symbol = launch?.symbol ?? NOVA.symbol;
  const unitPrice = launch ? (launchNotional && qty > 0 ? launchNotional / qty : (market?.price ?? 0)) : NOVA.price;
  const notional = launch ? (launchNotional ?? 0) : qty * NOVA.price;
  const tokenHeld = market?.tokenBalance != null ? Number(formatUnits(market.tokenBalance, market.decimals)) : 0;
  const available = launch ? testUsdcBalance : availableFor(source);
  // Launch balances are this wallet's real testnet holdings, so they only count once one is connected.
  const overBudget = launch && !isConnected ? false : side === "buy" ? notional > available : Boolean(launch) && qty > tokenHeld;
  const paySource = launch ? TEST_USDC_SOURCE : (PAY_SOURCES.find((s) => s.id === source) ?? PAY_SOURCES[0]);
  // Why a launch token can't be traded by intent right now (shown on the button).
  const blocked = !launch
    ? null
    : !SETTLER_DEPLOYED
      ? "Intents aren't live in this build"
      : !market?.reserves
        ? market?.loading
          ? "Reading the pool…"
          : "Pool unavailable"
        : !(side === "buy" ? market.listedForBuys : market.listedForSells)
          ? NOT_LISTED
          : qty > 0 && launchNotional === null
            ? "More than the pool holds"
            : null;

  const largestChain = [...balance.chains].sort((a, b) => b.usd - a.usd)[0];
  const originLabel = launch
    ? "Base Sepolia"
    : source === "unified"
      ? `Auto-routed · ${largestChain?.usd ? largestChain.label : "Base"}`
      : ORIGIN[source];

  const review = async () => {
    if (qty <= 0 || overBudget || blocked) return;

    // 1. Inside Farcaster: hand off to the host's native swap form.
    if (isFarcaster && !launch) {
      setStatus({ kind: "pending" });
      const pay = sourceAsset(source);
      const result =
        side === "buy"
          ? await triggerSwap({ buyToken: NOVA_ASSET.caip19, sellToken: pay.caip19, sellAmount: Number(notional.toFixed(2)), sellDecimals: pay.decimals })
          : await triggerSwap({ buyToken: pay.caip19, sellToken: NOVA_ASSET.caip19, sellAmount: qty, sellDecimals: NOVA_ASSET.decimals });
      setStatus({ kind: "done", result });
      return;
    }

    // 2. Browser without a wallet: connect first.
    if (!isConnected) {
      openConnect();
      return;
    }

    // 3. Browser with a wallet: review and sign the ERC-7683 intent.
    setOrder({
      side,
      symbol,
      qty,
      price: unitPrice,
      notional,
      source: paySource,
      originLabel,
      asset: market ? { address: market.token, caip19: market.caip19, decimals: market.decimals } : undefined,
    });
  };

  // Validate the amount parses at token precision so signing can't throw later.
  const invalid = (() => {
    try {
      parseUnits(qty.toFixed(6), market?.decimals ?? NOVA_ASSET.decimals);
      return false;
    } catch {
      return true;
    }
  })();

  const disabled = status.kind === "pending" || qty <= 0 || overBudget || invalid || Boolean(blocked);

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-void/60 p-3">
      <div role="tablist" aria-label="Order side" className="grid grid-cols-2 rounded-lg bg-panel-2 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            type="button"
            onClick={() => {
              setSide(s);
              setStatus({ kind: "idle" });
            }}
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
        <span className="font-mono text-[11px] text-muted">
          {launch ? (market?.price != null ? `${fmtTokenPrice(market.price)} · pool` : "…") : usd.format(NOVA.price)}
        </span>
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
              setStatus({ kind: "idle" });
            }}
            className="w-full min-w-0 bg-transparent font-mono text-[22px] text-chrome outline-none placeholder:text-dim"
            placeholder="0"
          />
          <span className="shrink-0 rounded-[3px] border border-line-2 px-2 py-1 font-mono text-[10px] text-muted">{symbol}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between font-mono text-[11px]">
          <span className={overBudget ? "text-down" : "text-muted"}>
            ≈{usd.format(notional)}
            {launch && side === "sell" && market?.tokenBalance != null && ` · you hold ${tokenHeld.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
          </span>
          {launch && market?.reserves ? (
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
          ) : (
            side === "buy" &&
            !launch && (
              <button
                type="button"
                onClick={() => setAmount(available > 0 ? (Math.floor((available / NOVA.price) * 100) / 100).toString() : "0")}
                className="text-dim transition-colors hover:text-signal"
              >
                Max
              </button>
            )
          )}
        </div>
      </div>

      <div className="mt-2">
        {launch ? (
          <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[12px]">
            <span className="text-muted">{side === "buy" ? "Pay with" : "Receive"}</span>
            <span className="font-mono text-chrome">
              Base Sepolia test USDC{side === "buy" && isConnected ? ` · ${usd.format(testUsdcBalance)}` : ""}
            </span>
          </div>
        ) : (
          <PayWithSelect
            value={source}
            onChange={setSource}
            availableFor={availableFor}
            label={side === "buy" ? "Pay with" : "Receive to"}
            unavailable={balance.mode === "live" && !balance.solana.connected ? { "solana-usdc": "Connect a Solana wallet to use" } : {}}
          />
        )}
      </div>

      <button
        type="button"
        onClick={review}
        disabled={disabled}
        className={buttonClass("primary", "sm", "mt-3 h-10 w-full rounded-lg text-[13px] font-semibold")}
      >
        {status.kind === "pending" ? (
          <>
            <KineticLoader /> Opening swap…
          </>
        ) : blocked && isConnected ? (
          blocked
        ) : overBudget ? (
          side === "sell" ? `Not enough $${symbol}` : testnet ? "Insufficient test USDC" : "Insufficient buying power"
        ) : (
          <>
            Review Intent <ArrowRight />
          </>
        )}
      </button>

      <p aria-live="polite" className="mt-2 min-h-[30px] text-center text-[11px] leading-snug text-muted">
        {status.kind === "done" ? (
          <span className={status.result.status === "submitted" ? "text-signal" : status.result.status === "failed" ? "text-down" : ""}>
            {STATUS_COPY[status.result.status](status.result)}
          </span>
        ) : launch ? (
          blocked === NOT_LISTED ? (
            <>This launch isn&apos;t listed on the intent settlers yet · Base Sepolia testnet</>
          ) : (
            <>Base Sepolia testnet · priced from the locked Uniswap pool · test funds only</>
          )
        ) : !isConnected && !isFarcaster ? (
          <>Connect a wallet to sign</>
        ) : testnet ? (
          <>Testnet · pays with Base Sepolia test USDC · no real funds</>
        ) : (
          <>Fast execution · Best price · Powered by Solvers</>
        )}
      </p>

      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} />
    </div>
  );
}
