"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { erc20Abi, formatUnits, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { IntentModal } from "@/components/terminal/IntentModal";
import { SolanaIntentModal, type SolanaOrderRequest } from "@/components/terminal/SolanaIntentModal";
import { useSolanaPayer } from "@/hooks/useSolanaPayer";
import { useT } from "@/providers/I18nProvider";
import { BatchOrderForm } from "@/components/pro/BatchOrderForm";
import { OneClickBar, OneClickOrderStatus, useOneClick, useOrderWatch, type OneClickOrder } from "@/components/pro/OneClick";
import { PresetKey, SubmitKey, useExecutionHotkeys } from "@/components/pro/hotkeys";
import { ProtectionRow, RiskPreview, type RiskRow } from "@/components/pro/RiskPreview";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { useLaunchMarket, type LaunchMarket } from "@/hooks/useLaunchMarket";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useBuyingPower } from "@/hooks/useBuyingPower";
import { tradeFromAccount } from "@/lib/account";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { LIVE_ORIGINS, originByKey, toUsdc6, type PayFrom } from "@/lib/crosschain";
import { SETTLER_DEPLOYED, TESTNET_USDC } from "@/lib/intents";
import { TradeSettingsButton } from "@/components/pro/TradeSettingsButton";
import { StandingOrderForm, type OrderType } from "@/components/pro/StandingOrderForm";
import { useTradeSettings } from "@/hooks/useTradeSettings";
import { USDC_DECIMALS, fmtTokens, fmtUsdc, formatRemaining, launchError, type TxStep } from "@/lib/launch";
import { fmtTokenPrice, launchCaip19 } from "@/lib/launchTrade";
import { NO_LIMIT, V3_TICK_STEP_PERCENT, parsePriceUsd, priceUsd, usesTicks, type AuctionV2, type BatchVersion, type PhaseV2 } from "@/lib/launchV2";
import { minReceived, sourceAsset, type OrderDraft, type Side } from "@/lib/order";
import { placeOneClick } from "@/lib/session";
import { SOLVER_MAX_IMPACT_PCT, bidRisk, tradeRisk } from "@/lib/risk";
import { PAY_SOURCES } from "@/lib/tokens";
import { useConnectModal } from "@/providers/Web3Provider";
import { ORIGIN_NAMES, SOON_MAINNET, SOON_NETWORKS } from "@/lib/networks";
import { SOLANA_OPEN_SOL, SOLANA_RETURNED_SOL, solAmount } from "@/lib/solanaEscrow";

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
    <div className={`glow-focus flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 transition-[border-color,box-shadow] ${compact ? "py-2" : "py-2.5"}`}>
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

/**
 * Where a wallet buy is paid from: one chip per chain (Base, each live origin, Solana) with that wallet's test USDC
 * when it can be read, and the networks coming at mainnet. The total is the wallet's buying power across all of them.
 * Chips show even before a wallet on that chain is connected, so the chain can be picked first.
 */
function PayFromPicker({ active, onPick }: { active: PayFrom; onPick: (k: PayFrom) => void }) {
  const t = useT();
  const { sources } = useBuyingPower();
  const known = new Map(sources.map((s) => [s.key, s.usdc6]));
  const chips: { key: PayFrom; name: string; usdc6: bigint | null }[] = [
    { key: "base", name: "Base", usdc6: known.get("base") ?? null },
    ...LIVE_ORIGINS.map((o) => ({ key: o.key as PayFrom, name: o.name.replace(/ (Sepolia|testnet)$/, ""), usdc6: known.get(o.key) ?? null })),
    { key: "solana", name: "Solana", usdc6: known.get("solana") ?? null },
  ];
  const balances = chips.filter((c) => c.usdc6 !== null);
  const total = balances.length ? balances.reduce((sum, c) => sum + (c.usdc6 as bigint), BigInt(0)) : null;
  return (
    <div role="radiogroup" aria-label={t("ticket.payFrom")} className="-mt-0.5 rounded-lg border border-line px-3 py-2">
      <p className="flex items-baseline justify-between text-[11px]">
        <span className="text-dim">{t("ticket.payFrom")}</span>
        {total !== null && (
          <span className="text-dim">
            all chains <span className="font-mono text-[13px] text-chrome">${fmtUsdc(total)}</span>
          </span>
        )}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={active === c.key}
            onClick={() => onPick(c.key)}
            title={
              c.key === "base"
                ? "Pay from your wallet on Base: an approval if needed, then one transaction, paid in a little Base Sepolia ETH"
                : c.key === "solana"
                  ? `Pay with USDC on Solana devnet, filled on Base in about 20 s. Needs ${solAmount(SOLANA_OPEN_SOL)} for fees and storage; ${solAmount(SOLANA_RETURNED_SOL)} comes back when the order fills or is refunded`
                  : `Pay from your wallet on ${c.name}, filled on Base: an approval if needed, then one transaction, paid in a little ${originByKey(c.key as Exclude<PayFrom, "base" | "solana">)?.chain.nativeCurrency.symbol ?? "test gas"} on ${c.name}`
            }
            className={`inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-2 font-mono text-[10.5px] transition-colors ${
              active === c.key ? "border-signal text-signal" : "border-line-2 text-muted hover:text-chrome"
            }`}
          >
            <span className="font-sans">{c.name}</span>
            {c.usdc6 !== null && <span>${fmtUsdc(c.usdc6)}</span>}
          </button>
        ))}
        {SOON_NETWORKS.map((n) => (
          <span key={n.key} title={n.network} className="inline-flex h-6 items-center rounded-[4px] border border-dashed border-line-2 px-2 text-[10.5px] text-dim">
            {n.name} · {SOON_MAINNET}
          </span>
        ))}
      </div>
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
      <button type="button" onClick={model.connect} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold")}>
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
      <p className="-mt-2 text-[11px] text-dim">Bids come from your wallet on Base Sepolia for now: Crux accounts can&apos;t bid in auctions yet (that needs an account contract update, after the audit). Once the token trades, your Crux account, or a wallet on {ORIGIN_NAMES}, can buy it.</p>

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

      <button type="button" disabled={disabled} onClick={() => void submit()} className={buttonClass("buy", "md", "w-full rounded-xl font-semibold max-lg:hidden")}>
        {label} <ArrowUpRight />
        <SubmitKey />
      </button>
      <Status busy={busy} error={error} done={done} />

      <MobileDock>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AmountField id={`${uid}-dock`} value={amount} onChange={setAmount} unit="USDC" compact />
          </div>
          <button type="button" disabled={disabled} onClick={() => void submit()} className={buttonClass("buy", "md", "shrink-0 rounded-xl px-4 font-semibold")}>
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
  const t = useT();
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
      <section aria-label="Trade on Crux" className="p-4">
        <h2 className="mb-3 text-[14px] font-medium text-chrome">{t("ticket.title")}</h2>
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
            ["intent", "Crux order"],
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
  const t = useT();
  const uid = useId();
  const { address, isConnected } = useConnection();
  const { openConnect } = useConnectModal();
  const market = useLaunchMarket(auction.token, auction.pair);
  const trade = useTradeSettings();
  const [side, setSide] = useState<Side>("buy");
  // Market, or a standing order the keeper sends at its price (Crux account only): FOMO's Buy Dip / Stop Loss /
  // Take Profit, plus a trailing stop and take profit + stop loss together.
  const [orderType, setOrderType] = useState<OrderType>("market");
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
  const fromOrigin = side === "buy" && payFrom !== "base" && payFrom !== "solana" && !viaAccount ? originByKey(payFrom) : null;
  // Pay from Solana: USDC on devnet, escrowed by crux_escrow and filled here on Base (SolanaIntentModal). Delivered to
  // the connected Base wallet, else the Crux account.
  const viaSolana = side === "buy" && payFrom === "solana" && !viaAccount;
  const solana = useSolanaPayer();
  const solanaPayee = address ?? crux.account ?? null;
  const [solanaRequest, setSolanaRequest] = useState<SolanaOrderRequest | null>(null);
  /** Solana payer and Base recipient both set: the ticket then validates like any other. */
  const solanaReady = viaSolana && solana.payer !== null && solanaPayee !== null;
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
  const usdcBalance = viaAccount
    ? crux.usdc
    : viaSolana
      ? solana.usdc
      : address && usdc.data !== undefined
        ? toUsdc6(usdc.data, fromOrigin?.decimals ?? 6)
        : null;
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
            originLabel: viaSolana ? "Solana devnet" : fromOrigin ? fromOrigin.name : "Base Sepolia",
            asset: { address: market.token, caip19: market.caip19, decimals: market.decimals },
            slippageBps: trade.slippageBps,
            ...(fromOrigin ? { payFrom: fromOrigin.key } : {}),
          };
        })()
      : null;
  const signedMin = draft ? minReceived(draft) : null;

  const listed = side === "buy" ? market.listedForBuys : market.listedForSells;
  const overBalance = input !== null && (side === "buy" ? usdcBalance !== null && input > usdcBalance : tokenBalance !== null && input > tokenBalance);
  const tooBig = risk !== null && risk.poolImpactPct > SOLVER_MAX_IMPACT_PCT;
  const blocked = !SETTLER_DEPLOYED
    ? "Crux orders aren't live in this build"
    : market.protected && side === "sell" && !viaAccount
      ? "Sell in the batch directly (Batch order)"
      : !market.reserves
      ? market.loading
        ? "Reading the pool…"
        : "Pool unavailable"
      : !listed
        ? "Not listed for Crux orders yet"
        : null;
  const oneClickReady = !viaAccount && side === "buy" && payFrom === "base" && oneClick.session !== null;
  const overCap = oneClickReady && input !== null && oneClick.remaining !== null && input > oneClick.remaining;
  const sending = oneClickOrder?.kind === "sending";
  const disabled = !input || !risk || overBalance || tooBig || overCap || sending || Boolean(blocked);
  const label =
    blocked ??
    (overBalance
      ? `Not enough ${side === "buy" ? (viaSolana ? "USDC on Solana" : "test USDC") : symbol}${viaAccount ? " in your account" : ""}`
      : tooBig
        ? t("ticket.tooLarge")
        : overCap
          ? "Over your one-click cap"
          : viaAccount
            ? `${side === "buy" ? "Buy" : "Sell"} now · Crux account`
            : viaSolana
              ? !solana.payer
                ? t("ticket.connectSolana")
                : !solanaPayee
                  ? "Connect a Base wallet to receive"
                  : t("ticket.payFromSolana")
            : oneClickReady
              ? "Buy now · one-click"
              : t("ticket.sign"));

  const rows: RiskRow[] =
    risk && draft && signedMin !== null
      ? [
          {
            label: t("ticket.youReceive"),
            value: side === "buy" ? `${fmtTokens(risk.out)} ${symbol}` : usd6(risk.out),
            hint: "Crux's quote from the locked pool, if you were alone in the batch.",
          },
          {
            label: "Expected slippage",
            value: pct(risk.slippagePct),
            tone: risk.slippagePct > 5 ? "danger" : risk.slippagePct > 2 ? "caution" : "plain",
            hint: `Versus the pool's mid price: ${risk.poolImpactPct.toFixed(2)}% pool impact (incl. Uniswap's 0.3% fee) plus the 0.3% Crux spread.`,
          },
          {
            label: t("ticket.minReceived"),
            value: side === "buy" ? `${signedMin.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}` : `$${signedMin.toFixed(6)}`,
            hint: `Guaranteed on-chain: signed into your intent, ${(trade.slippageBps / 100).toFixed(trade.slippageBps % 100 === 0 ? 0 : 1)}% under the quote (your slippage setting). It can't fill below this.`,
          },
          {
            label: t("ticket.liquidityImpact"),
            value: pct(risk.poolImpactPct),
            tone: risk.poolImpactPct > 5 ? "caution" : "plain",
            hint: `How far this trade moves the locked pool's price. Crux skips anything over ${SOLVER_MAX_IMPACT_PCT}%.`,
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
    if (viaSolana) {
      if (!solana.payer) return solana.connect();
      if (!solanaPayee) return openConnect(); // somewhere on Base to deliver to
      if (disabled || !draft || !input) return;
      setSolanaRequest({
        draft,
        amount: input,
        minAmountOut: parseUnits(minReceived(draft).toFixed(6), market.decimals),
        tokenOut: market.caip19,
        payee: solanaPayee,
      });
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
  // Buys: the trader's four dollar sizes (the gear sets them), unavailable beyond the balance. Sells: a share of the bag.
  const usdcUnits = (usd: number) => BigInt(Math.round(usd * 1e6));
  const presets =
    side === "buy"
      ? trade.buyPresets.map((usd) => ({
          label: `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
          value: usdcBalance !== null && usdcUnits(usd) > usdcBalance ? null : usdcUnits(usd),
        }))
      : [25, 50, 75, 100].map((n) => ({ label: `${n}%`, value: fraction(tokenBalance, n) }));
  useExecutionHotkeys({ presets: presets.map((p) => () => p.value && pick(p.value)), onSubmit: sign });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <div role="tablist" aria-label="Order side" className="grid flex-1 grid-cols-2 rounded-lg bg-void/60 p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={side === s}
              onClick={() => {
                setSide(s);
                setAmount("");
                setOrderType("market");
              }}
              className={`h-8 rounded-md text-[12.5px] capitalize transition-colors ${
                side === s ? (s === "buy" ? "bg-up/15 text-up ring-1 ring-inset ring-up/60" : "bg-down/15 text-down ring-1 ring-inset ring-down/60") : "text-muted hover:text-chrome"
              }`}
            >
              {s === "buy" ? t("ticket.buy") : t("ticket.sell")}
            </button>
          ))}
        </div>
        <label className="relative">
          <span className="sr-only">Order type</span>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as OrderType)}
            className="h-10 appearance-none rounded-lg border border-line bg-void/60 pl-3 pr-7 text-[12.5px] text-chrome outline-none focus:border-line-2"
          >
            <option value="market">{t("ticket.market")}</option>
            {side === "buy" ? (
              <option value="dip">{t("ticket.buyDip")}</option>
            ) : (
              <>
                <option value="stopLoss">{t("ticket.stopLoss")}</option>
                <option value="takeProfit">{t("ticket.takeProfit")}</option>
                <option value="trailing">{t("ticket.trailing")}</option>
                <option value="bracket">{t("ticket.bracket")}</option>
              </>
            )}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-dim" aria-hidden="true">
            ▾
          </span>
        </label>
      </div>

      {orderType !== "market" ? (
        <StandingOrderForm
          type={orderType}
          crux={crux}
          token={market.token}
          decimals={market.decimals}
          symbol={symbol}
          price={market.price}
          supply={Number(auction.totalSupply) / 1e18}
          tokenBalance={accountTokens.data ?? null}
          reserves={market.reserves}
        />
      ) : (
      <>

      <label htmlFor={`${uid}-amt`} className="sr-only">
        {side === "buy" ? "USDC to spend" : `${symbol} to sell`}
      </label>
      <AmountField id={`${uid}-amt`} value={amount} onChange={setAmount} unit={side === "buy" ? "USDC" : symbol} />
      {/* The Crux account is the default way to trade; a wallet is the secondary path. */}
      {crux.loggedIn && crux.account ? (
        viaAccount && (
          <div className="-mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-signal/40 bg-signal/5 px-3 py-2 text-[11.5px]">
            <span className="text-chrome">Crux account</span>
            <span className="font-mono text-chrome/85">{crux.usdc !== null ? `$${fmtUsdc(crux.usdc)}` : "…"}</span>
            <span className="text-dim">· no gas, no pop-up</span>
            <a href="/account" className={`ml-auto ${crux.withdrawalAddress ? "text-dim" : "text-down"} hover:text-chrome`}>
              {crux.withdrawalAddress ? "Deposit / withdraw" : "Not protected yet"}
            </a>
          </div>
        )
      ) : (
        <p className="-mt-0.5 rounded-lg border border-line px-3 py-2 text-[11.5px] leading-snug text-muted">
          <span className="text-chrome">Trade from a Crux account:</span> deposit once from any chain, then trade with no gas or pop-ups.{" "}
          <button type="button" onClick={crux.login} className="text-signal hover:underline">
            Log in
          </button>
        </p>
      )}
      {crux.loggedIn && crux.account && (
        <button
          type="button"
          onClick={() => {
            setFrom(viaAccount ? "wallet" : "account");
            setAmount("");
          }}
          className="-mt-1 self-start text-[11px] text-dim underline decoration-line-2 underline-offset-2 transition-colors hover:text-chrome"
        >
          {viaAccount ? "Pay from a wallet instead" : "← Back to Crux account"}
        </button>
      )}
      {side === "buy" && !viaAccount && (
        <PayFromPicker
          active={payFrom}
          onPick={(k) => {
            setPayFrom(k);
            setAmount("");
          }}
        />
      )}
      <div className="-mt-1.5 flex items-baseline justify-between text-[11px] text-dim">
        <span>
          {side === "buy"
            ? viaSolana
              ? "USDC on Solana devnet · settled from Solana in about 20 s"
              : fromOrigin
                ? `${fromOrigin.name} test USDC · delivered on Base, no bridge`
                : "Base Sepolia test USDC"
            : `Selling ${symbol}`}
        </span>
        <span className="font-mono text-muted">
          Bal {side === "buy" ? (usdcBalance !== null ? usd6(usdcBalance) : "…") : tokenBalance !== null ? fmtTokens(tokenBalance) : "…"}
        </span>
      </div>

      <Presets items={presets} onPick={pick} />
      <div className="-mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-dim">{side === "buy" ? t("ticket.quickBuy") : t("ticket.shareOfBag")}</span>
        <TradeSettingsButton />
      </div>

      {rows.length > 0 && <RiskPreview rows={rows} note={tooBig ? `Crux skips orders that move a pool more than ${SOLVER_MAX_IMPACT_PCT}% in one batch. Trade smaller.` : undefined} />}
      <ProtectionRow>{t("ticket.minEnforced")}</ProtectionRow>

      {side === "buy" && payFrom === "base" && !viaAccount && <OneClickBar oneClick={oneClick} />}

      <button type="button" disabled={(isConnected || viaAccount || solanaReady) && disabled} onClick={sign} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold max-lg:hidden")}>
        {isConnected || viaAccount || viaSolana ? label : t("ticket.connect")} <ArrowUpRight />
        <SubmitKey />
      </button>
      <OneClickOrderStatus order={oneClickOrder} to={viaAccount ? "your Crux account" : undefined} />

      {market.protected ? (
        <p className="text-[11px] leading-snug text-dim">
          Route: your order → Crux, which joins the batch pool&apos;s next 60-second batch for you (everyone in it pays the same price) and delivers your share (less
          the 0.3% spread) once it clears. Your signed minimum still holds; if the batch can&apos;t meet it, you&apos;re refunded after the
          deadline.
        </p>
      ) : (
      <p className="text-[11px] leading-snug text-dim">
        Route: your order → Crux → Uniswap V2 pool{" "}
        <a href={`${TESTNET_EXPLORER}/address/${auction.pair}`} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-line-2">
          {short(auction.pair)}
        </a>
        {market.price !== null && <> at {fmtTokenPrice(market.price)}</>}.{" "}
        {fromOrigin
          ? `Held on ${fromOrigin.name}, filled on Base in the next batch at the price everyone pays, and released only once that fill is confirmed on ${fromOrigin.name}; refundable 6 hours after its deadline otherwise.`
          : "Filled in the next 10-second batch, where everyone pays the same price, or refundable after its deadline."}
      </p>
      )}

      <MobileDock>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AmountField id={`${uid}-dock`} value={amount} onChange={setAmount} unit={side === "buy" ? "USDC" : symbol} compact />
          </div>
          <button type="button" disabled={(isConnected || viaAccount || solanaReady) && disabled} onClick={sign} className={buttonClass("primary", "md", "shrink-0 rounded-xl px-4 font-semibold capitalize")}>
            {viaSolana
              ? solana.payer
                ? solanaPayee
                  ? "Pay"
                  : "Connect Base"
                : "Connect Solana"
              : isConnected || viaAccount
                ? tooBig
                  ? "Too big"
                  : overCap
                    ? "Over cap"
                    : oneClickReady || viaAccount
                      ? `${side} now`
                      : side
                : "Connect"}
          </button>
        </div>
        {risk && signedMin !== null && (
          <p className="mt-1.5 truncate text-[11px] text-dim">
            Min {side === "buy" ? `${signedMin.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${symbol}` : `$${signedMin.toFixed(4)}`} · slippage {pct(risk.slippagePct)}
          </p>
        )}
      </MobileDock>

      </>
      )}

      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} />
      <SolanaIntentModal
        request={solanaRequest}
        onClose={() => {
          setSolanaRequest(null);
          setAmount("");
        }}
      />
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
