"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { erc20Abi, formatUnits, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { IntentModal } from "@/components/terminal/IntentModal";
import { BatchOrderForm } from "@/components/pro/BatchOrderForm";
import { OneClickBar, OneClickOrderStatus, useOneClick, useOrderWatch, type OneClickOrder } from "@/components/pro/OneClick";
import { PresetKey, SubmitKey, useExecutionHotkeys } from "@/components/pro/hotkeys";
import { ProtectionRow, RiskPreview, type RiskRow } from "@/components/pro/RiskPreview";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { useLaunchMarket, type LaunchMarket } from "@/hooks/useLaunchMarket";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { tradeFromAccount } from "@/lib/account";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { LIVE_ORIGINS, originByKey, toUsdc6, type PayFrom } from "@/lib/crosschain";
import { SETTLER_DEPLOYED, SLIPPAGE_BPS, TESTNET_USDC } from "@/lib/intents";
import { USDC_DECIMALS, fmtTokens, fmtUsdc, formatRemaining, launchError, type TxStep } from "@/lib/launch";
import { fmtTokenPrice, launchCaip19 } from "@/lib/launchTrade";
import { NO_LIMIT, V3_TICK_STEP_PERCENT, parsePriceUsd, priceUsd, usesTicks, type AuctionV2, type BatchVersion, type PhaseV2 } from "@/lib/launchV2";
import { minReceived, sourceAsset, type OrderDraft, type Side } from "@/lib/order";
import { placeOneClick } from "@/lib/session";
import { SOLVER_MAX_IMPACT_PCT, bidRisk, tradeRisk } from "@/lib/risk";
import { PAY_SOURCES } from "@/lib/tokens";
import { useConnectModal } from "@/providers/Web3Provider";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (v: number) => `${v >= 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}%`;
const usd6 = (units: bigint) => `$${Number(formatUnits(units, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
const TEST_USDC_SOURCE = PAY_SOURCES.find((s) => s.id === "base-usdc") ?? PAY_SOURCES[0];

function parse(value: string, decimals: number): bigint | null {
  try {
    const v = value ? parseUnits(value, decimals) : null;
    return v !== null && v > BigInt(0) ? v : null;
  } catch {
    return null;
  }
}

function Presets({ items, onPick }: { items: { label: string; value: bigint | null }[]; onPick: (v: bigint) => void }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Size presets">
      {items.map((p, i) => (
        <button
          key={p.label}
          type="button"
          disabled={!p.value}
          onClick={() => p.value && onPick(p.value)}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-line-2 text-[11.5px] text-muted transition-colors hover:border-chrome/60 hover:text-chrome disabled:opacity-40"
        >
          {p.label}
          <PresetKey n={i + 1} />
        </button>
      ))}
    </div>
  );
}

function AmountField({ id, value, onChange, unit, compact }: { id: string; value: string; onChange: (v: string) => void; unit: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 focus-within:border-line-2 ${compact ? "py-2" : "py-2.5"}`}>
      {unit === "USDC" && <span className="font-mono text-dim">$</span>}
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className={`w-full min-w-0 bg-transparent font-mono text-chrome outline-none placeholder:text-dim ${compact ? "text-[16px]" : "text-[20px]"}`}
      />
      <span className="shrink-0 text-[12px] text-muted">{unit}</span>
    </div>
  );
}

/** Quick dollar sizes for buys: plain amounts of test USDC, unavailable beyond the wallet's balance. */
function DollarChips({ amounts, balance, onPick }: { amounts: number[]; balance: bigint | null; onPick: (v: bigint) => void }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Quick amounts">
      {amounts.map((usd) => {
        const value = BigInt(usd) * BigInt(1_000_000);
        return (
          <button
            key={usd}
            type="button"
            disabled={balance !== null && value > balance}
            onClick={() => onPick(value)}
            className="h-6 flex-1 rounded-[4px] border border-line font-mono text-[11px] text-dim transition-colors hover:border-chrome/60 hover:text-chrome disabled:opacity-40"
          >
            ${usd}
          </button>
        );
      })}
    </div>
  );
}

/** Mobile: the amount and the action stay pinned to the bottom of the screen. */
function MobileDock({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 backdrop-blur lg:hidden">
      {children}
    </div>
  );
}

type Busy = TxStep | null;

// ------------------------------------------------------------------ auction

function BidForm({ factory, id, model, auction, version, symbol }: { factory: Address; id: string; model: LaunchV2Model; auction: AuctionV2; version: BatchVersion; symbol: string }) {
  const uid = useId();
  const [amount, setAmount] = useState("");
  const [limitOn, setLimitOn] = useState(false);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash?: Hex } | null>(null);

  const parsed = parse(amount, USDC_DECIMALS);
  const rawLimit = limitOn ? parsePriceUsd(limit) : null;
  const limitTooLow = limitOn && limit !== "" && (!rawLimit || rawLimit < auction.floorPrice);
  // V3 rounds a limit down to its 1% step: show the price the contract will actually use.
  const tick = useReadContract({
    address: factory,
    abi: cruxBatchFactoryAbi,
    functionName: "tickAt",
    args: [BigInt(id), rawLimit ?? BigInt(0)],
    chainId: TESTNET.id,
    query: { enabled: usesTicks(version) && rawLimit !== null && !limitTooLow },
  });
  const effectiveLimit = !limitOn || !rawLimit || limitTooLow ? null : usesTicks(version) ? (tick.data?.[1] ?? null) : rawLimit;

  const capLeft = model.maxDeposit !== null ? (model.maxDeposit > model.myBid.quote ? model.maxDeposit - model.myBid.quote : BigInt(0)) : null;
  const balance = model.usdcBalance;
  const maxBid = balance === null ? null : capLeft !== null && capLeft < balance ? capLeft : balance;
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  const overCap = parsed !== null && capLeft !== null && parsed > capLeft;
  const needsApproval = parsed !== null && model.allowance !== null && parsed > model.allowance;

  const risk = parsed
    ? bidRisk({
        quote: parsed,
        limit: effectiveLimit,
        projected: model.indicativePrice,
        floor: auction.floorPrice,
        saleSupply: auction.saleSupply,
        totalSupply: auction.totalSupply,
      })
    : null;

  const rows: RiskRow[] = risk
    ? [
        {
          label: "If it closed now",
          value: risk.tokensAtProjected !== null ? `${fmtTokens(risk.tokensAtProjected)} ${symbol}` : "Not clearing yet",
          hint:
            risk.tokensAtProjected !== null
              ? `At the projected clearing price $${priceUsd(model.indicativePrice!)}, before anyone else bids.`
              : "Bids don't cover the sale at the floor yet. The price forms as bids arrive.",
        },
        {
          label: "Worst price",
          value: risk.worstPrice ? `$${priceUsd(risk.worstPrice)}` : "Any price",
          tone: risk.worstPrice ? "plain" : "caution",
          hint: risk.worstPrice
            ? `${usesTicks(version) ? `Your limit, rounded down to its ${V3_TICK_STEP_PERCENT}% step. ` : ""}If the batch clears above it, your whole bid is refunded.`
            : "No limit: you accept whatever price the batch clears at. Set a limit to cap it.",
        },
        {
          label: "Minimum received",
          value: risk.minTokens !== null ? `${fmtTokens(risk.minTokens)} ${symbol}` : "No minimum",
          tone: risk.minTokens !== null ? "plain" : "caution",
          hint: risk.minTokens !== null ? "If it fills at all. Otherwise you get your USDC back in full." : "Without a limit, a crowded batch can clear far higher.",
        },
        {
          label: "Exit liquidity",
          value: risk.exit ? `${usd6(risk.exit.usdcBack)} (${pct(risk.exit.lossPct)})` : "—",
          tone: risk.exit && risk.exit.lossPct > 25 ? "danger" : risk.exit && risk.exit.lossPct > 5 ? "caution" : "plain",
          hint: `Selling everything this bid buys into the new pool right at graduation${risk.basis === "floor" ? " (at the floor price)" : ""}. The pool starts with half the raise.`,
        },
      ]
    : [];

  const disabled = !parsed || overBalance || overCap || limitTooLow || (limitOn && !effectiveLimit) || busy !== null;
  const label = overBalance ? "Not enough test USDC" : overCap ? "Over this wallet's cap" : needsApproval ? "Approve & submit batch bid" : "Submit batch bid";

  const submit = async () => {
    if (disabled || !parsed) return;
    setError(null);
    setDone(null);
    try {
      const hash = await model.deposit(parsed, limitOn && rawLimit ? rawLimit : NO_LIMIT, setBusy);
      setDone({ text: `Bid placed: $${fmtUsdc(parsed)} ${limitOn ? `up to $${limit} per token` : "at any clearing price"}.`, hash });
      setAmount("");
      setLimit("");
      setLimitOn(false);
    } catch (err) {
      setError(launchError(err));
    } finally {
      setBusy(null);
    }
  };

  const pick = (v: bigint) => setAmount(formatUnits(v, USDC_DECIMALS));
  const preset = (n: number) => (maxBid ? (maxBid * BigInt(n)) / BigInt(100) : null);
  const presets = [
    { label: "25%", value: preset(25) },
    { label: "50%", value: preset(50) },
    { label: "75%", value: preset(75) },
    { label: "MAX", value: maxBid },
  ];
  useExecutionHotkeys({
    presets: presets.map((p) => () => p.value && pick(p.value)),
    onSubmit: () => (model.account ? void submit() : model.connect()),
  });

  if (!model.account) {
    return (
      <button type="button" onClick={model.connect} className={buttonClass("signal", "md", "w-full rounded-xl font-semibold")}>
        Connect wallet to bid
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between text-[11.5px] text-muted">
        <span>Paying with: Base Sepolia test USDC</span>
        <span className="font-mono text-chrome/80">{balance !== null ? `$${fmtUsdc(balance)}` : "…"}</span>
      </div>
      <p className="-mt-2 text-[11px] text-dim">Other chains: planned.</p>

      <label htmlFor={`${uid}-amt`} className="sr-only">
        Bid amount
      </label>
      <AmountField id={`${uid}-amt`} value={amount} onChange={setAmount} unit="USDC" />
      <Presets items={presets} onPick={pick} />
      {capLeft !== null && (
        <p className={`-mt-1.5 text-[11px] ${overCap ? "text-down" : "text-dim"}`}>
          {model.myBid.quote > BigInt(0) ? `You've bid $${fmtUsdc(model.myBid.quote)}; ` : ""}this wallet can add up to ${fmtUsdc(capLeft)}.
        </p>
      )}

      <button
        type="button"
        aria-expanded={limitOn}
        onClick={() => setLimitOn((v) => !v)}
        className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-chrome transition-colors hover:border-line-2"
      >
        <span>
          Limit price <span className="text-muted">(maxPricePerToken){limitOn ? "" : " · off"}</span>
        </span>
        <span className={`h-4 w-7 rounded-full border transition-colors ${limitOn ? "border-signal/60 bg-signal" : "border-line-2 bg-line"}`} aria-hidden="true" />
      </button>
      {limitOn && (
        <div>
          <label htmlFor={`${uid}-lim`} className="sr-only">
            Max price per token
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2 focus-within:border-line-2">
            <span className="font-mono text-dim">$</span>
            <input
              id={`${uid}-lim`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={priceUsd(auction.floorPrice * BigInt(2))}
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full min-w-0 bg-transparent font-mono text-[15px] text-chrome outline-none placeholder:text-dim"
            />
            <span className="shrink-0 text-[11.5px] text-muted">per token</span>
          </div>
          <p className={`mt-1 text-[11px] ${limitTooLow ? "text-down" : "text-dim"}`}>
            {limitTooLow
              ? `Set at least the floor, $${priceUsd(auction.floorPrice)}.`
              : effectiveLimit && usesTicks(version) && rawLimit && effectiveLimit < rawLimit
                ? `Rounds down to $${priceUsd(effectiveLimit)} (the ${V3_TICK_STEP_PERCENT}% step at or below your limit).`
                : `Floor $${priceUsd(auction.floorPrice)}.`}
          </p>
        </div>
      )}

      {rows.length > 0 && <RiskPreview rows={rows} />}
      <ProtectionRow>No front-running inside the batch: every filled bid pays the same price, whenever it arrived.</ProtectionRow>

      <button type="button" disabled={disabled} onClick={() => void submit()} className={buttonClass("signal", "md", "w-full rounded-xl font-semibold max-lg:hidden")}>
        {label} <ArrowUpRight />
        <SubmitKey />
      </button>
      <Status busy={busy} error={error} done={done} />

      <MobileDock>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AmountField id={`${uid}-dock`} value={amount} onChange={setAmount} unit="USDC" compact />
          </div>
          <button type="button" disabled={disabled} onClick={() => void submit()} className={buttonClass("signal", "md", "shrink-0 rounded-xl px-4 font-semibold")}>
            {busy ? "…" : overCap ? "Over cap" : "Bid"}
          </button>
        </div>
        {risk?.exit && (
          <p className="mt-1.5 truncate text-[11px] text-dim">
            Worst price {risk.worstPrice ? `$${priceUsd(risk.worstPrice)}` : "any"} · exit at graduation {pct(risk.exit.lossPct)}
          </p>
        )}
      </MobileDock>
    </div>
  );
}

function Status({ busy, error, done }: { busy: Busy; error: string | null; done: { text: string; hash?: Hex } | null }) {
  if (busy) {
    return (
      <p role="status" className="flex items-center gap-2 text-[12px] text-chrome">
        <KineticLoader className="text-signal" /> {busy.label}
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="rounded-lg border border-line-2 px-3 py-2 text-[12px] text-chrome">
        {done.text}{" "}
        {done.hash && (
          <a href={`${TESTNET_EXPLORER}/tx/${done.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-muted underline decoration-line-2">
            {short(done.hash)}
          </a>
        )}
      </p>
    );
  }
  return null;
}

// ------------------------------------------------------------------ graduated: the batch-only window (V5, V6)

/**
 * A graduated launch's desk. V5 and V6 launches start with a batch-only window in their batch pool (24 hours on V5,
 * 15 minutes by default on V6): orders go there directly (Batch order), or through a Crux intent the solver fills by
 * joining the batch (Via intent, which also takes payment from other chains). When the window ends the keeper moves
 * the liquidity to Uniswap, usually within seconds; after that, and for V2–V4 launches, it's the intent desk on the
 * Uniswap pool.
 */
function GraduatedDesk({ auction, symbol }: { auction: AuctionV2; symbol: string }) {
  const market = useLaunchMarket(auction.token, auction.pair);
  const [mode, setMode] = useState<"batch" | "intent">("batch");
  const now = useNow();
  if (market.protected && market.protectedUntil !== null && now >= market.protectedUntil) {
    return (
      <section aria-label="Moving to Uniswap" className="p-4">
        <h2 className="text-[14px] font-medium text-chrome">Moving to Uniswap</h2>
        <p role="status" className="mt-1.5 text-[11.5px] leading-snug text-muted">
          The batch-only window has closed. The keeper is clearing the last batch and moving the liquidity into the
          Uniswap pool with the LP burned, usually within seconds. Trading reopens here when it lands.
        </p>
      </section>
    );
  }
  if (!market.protected) {
    return (
      <section aria-label="Trade via intent" className="p-4">
        <h2 className="mb-3 text-[14px] font-medium text-chrome">Trade via intent</h2>
        <TradeForm auction={auction} symbol={symbol} />
      </section>
    );
  }
  return (
    <section aria-label="Batch trading" className="p-4">
      <h2 className="text-[14px] font-medium text-chrome">Batch trading</h2>
      <ProtectionNote market={market} />
      <div role="tablist" aria-label="How to trade" className="mb-3 mt-3 grid grid-cols-2 rounded-lg bg-void/60 p-1">
        {(
          [
            ["batch", "Batch order"],
            ["intent", "Via intent"],
          ] as const
        ).map(([m, text]) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`h-8 rounded-md text-[12.5px] transition-colors ${mode === m ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === "batch" ? <BatchOrderForm market={market} symbol={symbol} /> : <TradeForm auction={auction} symbol={symbol} />}
    </section>
  );
}

/** Unix seconds, ticking every second: the batch window is minutes long. */
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ProtectionNote({ market }: { market: LaunchMarket }) {
  const now = useNow();
  const left = market.protectedUntil !== null ? Math.max(0, market.protectedUntil - now) : null;
  return (
    <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
      Batch-only{left !== null ? ` for ${formatRemaining(left)} more` : ""}: every trade lands in a 60-second batch that clears at one price
      on-chain, so nobody can buy ahead of you. Then the liquidity moves to Uniswap, LP burned.
    </p>
  );
}

// ------------------------------------------------------------------ graduated: trade via intent

function TradeForm({ auction, symbol }: { auction: AuctionV2; symbol: string }) {
  const uid = useId();
  const { address, isConnected } = useConnection();
  const { openConnect } = useConnectModal();
  const market = useLaunchMarket(auction.token, auction.pair);
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [order, setOrder] = useState<OrderDraft | null>(null);
  // Buys can pay with test USDC on Base Sepolia, or on Arbitrum Sepolia (escrowed there, filled here on Base).
  const [payFrom, setPayFrom] = useState<PayFrom>("base");
  // Crux account (email / Google login): its trades sign silently with the login key, go through the relay, and fill
  // back into the account. Logged in, it's the default; the connected wallet stays one tap away.
  const crux = useCruxAccount();
  const [from, setFrom] = useState<"account" | "wallet">("account");
  const viaAccount = crux.loggedIn && crux.account !== null && from === "account";
  const accountTokens = useReadContract({
    address: market.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [crux.account ?? zeroAddress],
    chainId: TESTNET.id,
    query: { enabled: crux.account !== null, refetchInterval: 10_000 },
  });
  // A buy can pay from any live cross-chain origin; its USDC balance is shown and compared in 6-decimal units.
  const fromOrigin = side === "buy" && payFrom !== "base" && !viaAccount ? originByKey(payFrom) : null;
  // One-click (CruxSettlerV4 sessions): Base buys signed by this browser's session key, no wallet popup.
  const oneClick = useOneClick();
  const [oneClickOrder, setOneClickOrder] = useState<OneClickOrder | null>(null);
  useOrderWatch(oneClickOrder, setOneClickOrder);

  const usdc = useReadContract({
    address: fromOrigin ? fromOrigin.usdc : TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: fromOrigin ? fromOrigin.chain.id : TESTNET.id,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const usdcBalance = viaAccount ? crux.usdc : address && usdc.data !== undefined ? toUsdc6(usdc.data, fromOrigin?.decimals ?? 6) : null;
  const tokenBalance = viaAccount ? (accountTokens.data ?? null) : market.tokenBalance;

  const decimals = side === "buy" ? 6 : market.decimals;
  const input = parse(amount, decimals);
  const risk = input && market.reserves ? tradeRisk(side, input, market.reserves) : null;

  // The order exactly as IntentModal will sign it: same quote, and minReceived() is the signed floor.
  const draft: OrderDraft | null =
    risk && input
      ? (() => {
          const qty = side === "buy" ? Number(formatUnits(risk.out, market.decimals)) : Number(formatUnits(input, market.decimals));
          const notional = side === "buy" ? Number(formatUnits(input, 6)) : Number(formatUnits(risk.out, 6));
          return {
            side,
            symbol: symbol.replace(/^\$/, ""),
            qty,
            price: qty > 0 ? notional / qty : 0,
            notional,
            source: TEST_USDC_SOURCE,
            originLabel: fromOrigin ? fromOrigin.name : "Base Sepolia",
            asset: { address: market.token, caip19: market.caip19, decimals: market.decimals },
            ...(fromOrigin ? { payFrom: fromOrigin.key } : {}),
          };
        })()
      : null;
  const signedMin = draft ? minReceived(draft) : null;

  const listed = side === "buy" ? market.listedForBuys : market.listedForSells;
  const overBalance = input !== null && (side === "buy" ? usdcBalance !== null && input > usdcBalance : tokenBalance !== null && input > tokenBalance);
  const tooBig = risk !== null && risk.poolImpactPct > SOLVER_MAX_IMPACT_PCT;
  const blocked = !SETTLER_DEPLOYED
    ? "Intents aren't live in this build"
    : market.protected && side === "sell"
      ? "Sell in the batch directly (Batch order)"
      : !market.reserves
      ? market.loading
        ? "Reading the pool…"
        : "Pool unavailable"
      : !listed
        ? "Not listed for intents yet"
        : null;
  const oneClickReady = !viaAccount && side === "buy" && payFrom === "base" && oneClick.session !== null;
  const overCap = oneClickReady && input !== null && oneClick.remaining !== null && input > oneClick.remaining;
  const sending = oneClickOrder?.kind === "sending";
  const disabled = !input || !risk || overBalance || tooBig || overCap || sending || Boolean(blocked);
  const label =
    blocked ??
    (overBalance
      ? `Not enough ${side === "buy" ? "test USDC" : symbol}${viaAccount ? " in your account" : ""}`
      : tooBig
        ? "Too large for this pool"
        : overCap
          ? "Over your one-click cap"
          : viaAccount
            ? `${side === "buy" ? "Buy" : "Sell"} now · Crux account`
            : oneClickReady
              ? "Buy now · one-click"
              : "Sign trade intent");

  const rows: RiskRow[] =
    risk && draft && signedMin !== null
      ? [
          {
            label: "You receive",
            value: side === "buy" ? `${fmtTokens(risk.out)} ${symbol}` : usd6(risk.out),
            hint: "The solver's quote from the locked pool, alone in its batch.",
          },
          {
            label: "Expected slippage",
            value: pct(risk.slippagePct),
            tone: risk.slippagePct > 5 ? "danger" : risk.slippagePct > 2 ? "caution" : "plain",
            hint: `Versus the pool's mid price: ${risk.poolImpactPct.toFixed(2)}% pool impact (incl. Uniswap's 0.3% fee) plus the 0.3% solver spread.`,
          },
          {
            label: "Min. received",
            value: side === "buy" ? `${signedMin.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}` : `$${signedMin.toFixed(6)}`,
            hint: `Guaranteed on-chain: signed into your intent, ${(SLIPPAGE_BPS / 100).toFixed(1)}% under the quote. It can't fill below this.`,
          },
          {
            label: "Liquidity impact",
            value: pct(risk.poolImpactPct),
            tone: risk.poolImpactPct > 5 ? "caution" : "plain",
            hint: `How far this trade moves the locked pool's price. The solver skips anything over ${SOLVER_MAX_IMPACT_PCT}%.`,
          },
        ]
      : [];

  /** Signs in this browser with the session key and has the relay open it: no wallet popup. */
  const oneClickBuy = async () => {
    if (!address || !input || !draft || !oneClick.session) return;
    setOneClickOrder({ kind: "sending" });
    try {
      const orderId = await placeOneClick(oneClick.session, {
        user: address,
        chainId: TESTNET.id,
        inputCaip19: sourceAsset(TEST_USDC_SOURCE.id).caip19,
        inputToken: TESTNET_USDC,
        inputAmount: input,
        outputCaip19: market.caip19,
        // The same signed floor the wallet flow uses (IntentModal): the quote less the slippage allowance.
        minOutputAmount: parseUnits(minReceived(draft).toFixed(6), market.decimals),
        destinationChainId: TESTNET.id,
      });
      setOneClickOrder({ kind: "open", orderId });
      setAmount("");
      void oneClick.refresh();
    } catch (e) {
      setOneClickOrder({ kind: "error", message: (e as Error).message.split("\n")[0] });
    }
  };

  /** Signs with the Crux account's login key (no pop-up) and has the relay open it from the account. */
  const accountTrade = async () => {
    if (!input || !draft || !crux.sign || !crux.owner || !crux.account) return;
    setOneClickOrder({ kind: "sending" });
    try {
      const orderId = await tradeFromAccount(crux.sign, crux.owner, crux.account, {
        tokenIn: side === "buy" ? TESTNET_USDC : market.token,
        amountIn: input,
        tokenOut: side === "buy" ? market.caip19 : launchCaip19(TESTNET_USDC),
        // The same signed floor as the wallet flow: the quote less the slippage allowance.
        minAmountOut: parseUnits(minReceived(draft).toFixed(6), side === "buy" ? market.decimals : 6),
      });
      setOneClickOrder({ kind: "open", orderId });
      setAmount("");
      crux.refresh();
    } catch (e) {
      setOneClickOrder({ kind: "error", message: (e as Error).message.split("\n")[0] });
    }
  };

  const sign = () => {
    if (viaAccount) {
      if (!disabled && draft) void accountTrade();
      return;
    }
    if (!isConnected) {
      openConnect();
      return;
    }
    if (disabled || !draft) return;
    if (oneClickReady) void oneClickBuy();
    else setOrder(draft);
  };

  const pick = (v: bigint) => setAmount(formatUnits(v, decimals));
  const fraction = (v: bigint | null, n: number) => (v ? (v * BigInt(n)) / BigInt(100) : null);
  // The same three sizes on both sides: a share of what this wallet can spend (test USDC) or sell.
  const spendable = side === "buy" ? usdcBalance : tokenBalance;
  const presets = [
    { label: "25%", value: fraction(spendable, 25) },
    { label: "50%", value: fraction(spendable, 50) },
    { label: "75%", value: fraction(spendable, 75) },
    { label: "MAX", value: spendable },
  ];
  useExecutionHotkeys({ presets: presets.map((p) => () => p.value && pick(p.value)), onSubmit: sign });

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Order side" className="grid grid-cols-2 rounded-lg bg-void/60 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
            }}
            className={`h-8 rounded-md text-[12.5px] capitalize transition-colors ${side === s ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <label htmlFor={`${uid}-amt`} className="sr-only">
        {side === "buy" ? "USDC to spend" : `${symbol} to sell`}
      </label>
      <AmountField id={`${uid}-amt`} value={amount} onChange={setAmount} unit={side === "buy" ? "USDC" : symbol} />
      {crux.loggedIn && crux.account && (
        <div role="radiogroup" aria-label="Trade from" className="-mt-0.5 flex items-center gap-1.5 text-[11px]">
          <span className="mr-0.5 text-dim">Trade from</span>
          {(["account", "wallet"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={from === f}
              onClick={() => {
                setFrom(f);
                setAmount("");
              }}
              className={`h-6 rounded-[4px] border px-2 transition-colors ${from === f ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
            >
              {f === "account" ? "Crux account" : "Wallet"}
            </button>
          ))}
          {viaAccount && (
            <a href="/account" className={`ml-auto ${crux.withdrawalAddress ? "text-dim" : "text-down"} hover:text-chrome`}>
              {crux.withdrawalAddress ? "Deposit / withdraw" : "Not protected yet"}
            </a>
          )}
        </div>
      )}
      {side === "buy" && !viaAccount && (
        <div role="radiogroup" aria-label="Pay from" className="-mt-0.5 flex items-center gap-1.5 text-[11px]">
          <span className="mr-0.5 text-dim">Pay from</span>
          {(["base", ...LIVE_ORIGINS.map((o) => o.key)] as PayFrom[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={payFrom === c}
              onClick={() => {
                setPayFrom(c);
                setAmount("");
              }}
              className={`h-6 rounded-[4px] border px-2 transition-colors ${payFrom === c ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
            >
              {c === "base" ? "Base Sepolia" : originByKey(c)!.name}
            </button>
          ))}
        </div>
      )}
      <div className="-mt-1.5 flex items-baseline justify-between text-[11px] text-dim">
        <span>
          {side === "buy"
            ? fromOrigin
              ? `${fromOrigin.name} test USDC · delivered on Base · Hyperlane-proven`
              : "Base Sepolia test USDC"
            : `Selling ${symbol}`}
        </span>
        <span className="font-mono text-muted">
          Bal {side === "buy" ? (usdcBalance !== null ? usd6(usdcBalance) : "…") : tokenBalance !== null ? fmtTokens(tokenBalance) : "…"}
        </span>
      </div>

      <Presets items={presets} onPick={pick} />
      {side === "buy" && <DollarChips amounts={[5, 10, 25]} balance={usdcBalance} onPick={pick} />}

      {rows.length > 0 && <RiskPreview rows={rows} note={tooBig ? `The solver skips orders that move a pool more than ${SOLVER_MAX_IMPACT_PCT}% in one batch. Trade smaller.` : undefined} />}
      <ProtectionRow>Your signed minimum is enforced on-chain: the fill can&apos;t come in below it.</ProtectionRow>

      {side === "buy" && payFrom === "base" && !viaAccount && <OneClickBar oneClick={oneClick} />}

      <button type="button" disabled={(isConnected || viaAccount) && disabled} onClick={sign} className={buttonClass("signal", "md", "w-full rounded-xl font-semibold max-lg:hidden")}>
        {isConnected || viaAccount ? label : "Connect wallet to trade"} <ArrowUpRight />
        <SubmitKey />
      </button>
      <OneClickOrderStatus order={oneClickOrder} to={viaAccount ? "your Crux account" : undefined} />

      {market.protected ? (
        <p className="text-[11px] leading-snug text-dim">
          Route: your intent → Crux solver, which joins the batch pool&apos;s next 60-second batch for you and delivers your share of it (less
          the 0.3% spread) once it clears. Your signed minimum still holds; if the batch can&apos;t meet it, you&apos;re refunded after the
          deadline.
        </p>
      ) : (
      <p className="text-[11px] leading-snug text-dim">
        Route: your intent → Crux solver → Uniswap V2 pool{" "}
        <a href={`${TESTNET_EXPLORER}/address/${auction.pair}`} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-line-2">
          {short(auction.pair)}
        </a>
        {market.price !== null && <> at {fmtTokenPrice(market.price)}</>}.{" "}
        {fromOrigin
          ? `Escrowed on ${fromOrigin.name}, filled on Base in the next batch, and released to the solver only on a Hyperlane proof of that fill; refundable 6 hours after its deadline if unproven.`
          : "Filled in the next 10-second batch, or refundable after its deadline."}
      </p>
      )}

      <MobileDock>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AmountField id={`${uid}-dock`} value={amount} onChange={setAmount} unit={side === "buy" ? "USDC" : symbol} compact />
          </div>
          <button type="button" disabled={(isConnected || viaAccount) && disabled} onClick={sign} className={buttonClass("signal", "md", "shrink-0 rounded-xl px-4 font-semibold capitalize")}>
            {isConnected || viaAccount ? (tooBig ? "Too big" : overCap ? "Over cap" : oneClickReady || viaAccount ? `${side} now` : side) : "Connect"}
          </button>
        </div>
        {risk && signedMin !== null && (
          <p className="mt-1.5 truncate text-[11px] text-dim">
            Min {side === "buy" ? `${signedMin.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${symbol}` : `$${signedMin.toFixed(4)}`} · slippage {pct(risk.slippagePct)}
          </p>
        )}
      </MobileDock>

      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ panel

/**
 * The pro execution panel. Deposits open: a batch bid with a limit and a risk preview. Graduated: an intent
 * trade with a risk preview. Cancelled: a short note (refunds are claimed from the notice banner). Scheduled
 * and settling use the standard action panel passed in as `fallback`.
 */
export function ExecutionPanel({
  factory,
  id,
  model,
  auction,
  phase,
  version,
  fallback,
}: {
  factory: Address;
  id: string;
  model: LaunchV2Model;
  auction: AuctionV2;
  phase: PhaseV2;
  version: BatchVersion;
  fallback: ReactNode;
}) {
  const symbol = model.symbol ? `$${model.symbol}` : "tokens";

  if (phase === "open") {
    return (
      <section aria-label="Batch bid" className="p-4">
        <h2 className="mb-3 text-[14px] font-medium text-chrome">Batch bid</h2>
        <BidForm factory={factory} id={id} model={model} auction={auction} version={version} symbol={symbol} />
      </section>
    );
  }
  // Claims and creator vesting live in the notice banner above the terminal, so the desk stays the desk.
  if (phase === "graduated" && auction.pair !== zeroAddress) {
    return <GraduatedDesk auction={auction} symbol={symbol} />;
  }
  if (phase === "cancelled") {
    return (
      <section aria-label="Cancelled" className="p-4">
        <h2 className="text-[14px] font-medium text-chrome">Launch cancelled</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Demand stayed below the floor, so no tokens were sold and every deposit is refundable in full. If this wallet bid, its refund is
          in the notice above.
        </p>
      </section>
    );
  }
  return <div className="p-3">{fallback}</div>;
}
