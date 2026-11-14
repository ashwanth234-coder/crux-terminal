"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { erc20Abi, formatUnits, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { IntentModal } from "@/components/terminal/IntentModal";
import { SolanaIntentModal, type SolanaOrderRequest } from "@/components/terminal/SolanaIntentModal";
import { useSolanaPayer } from "@/hooks/useSolanaPayer";
import { useT } from "@/providers/I18nProvider";
import { BatchOrderForm } from "@/components/pro/BatchOrderForm";
import { OneClickBar, OneClickOrderStatus, sendTime, sentOrder, useOneClick, useOrderWatch, type OneClickOrder } from "@/components/pro/OneClick";
import { PresetKey, SubmitKey, useExecutionHotkeys } from "@/components/pro/hotkeys";
import { ProtectionRow, RiskPreview, type RiskRow } from "@/components/pro/RiskPreview";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { useLaunchMarket, type LaunchMarket } from "@/hooks/useLaunchMarket";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useBuyingPower } from "@/hooks/useBuyingPower";
import { signTrade, tradeFromAccount, type SignedTrade } from "@/lib/account";
import { StillConfirming } from "@/lib/session";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { LIVE_ORIGINS, originByKey, toUsdc6, type PayFrom } from "@/lib/crosschain";
import { SETTLER_DEPLOYED, TESTNET_USDC } from "@/lib/intents";
import { TradeSettingsButton } from "@/components/pro/TradeSettingsButton";
import { StandingOrderForm, type OrderType } from "@/components/pro/StandingOrderForm";
import { useOrderRequests, type ChartOrderKind, type ChartOrderRequest } from "@/lib/chartOrders";
import { slippageFor, useTradeSettings } from "@/hooks/useTradeSettings";
import { USDC_DECIMALS, fmtTokens, fmtUsdc, formatRemaining, launchError, type TxStep } from "@/lib/launch";
import { SOLVER_SPREAD_BPS, fmtTokenPrice, launchCaip19, priceAfter, sellFor, solverQuote } from "@/lib/launchTrade";
import { PRICE_DECIMALS, V3_TICK_STEP_PERCENT, fmtUsdcExact, goesLiveForSure, graduationNeeds, maxDepositV3, parsePriceUsd, priceUsd, priceUsdPlain, usesTicks, type AuctionV2, type BatchVersion, type PhaseV2 } from "@/lib/launchV2";
import { cancelStanding, placeStanding, standingFloor, type StandingView } from "@/lib/standing";
import { useStandingOrders } from "@/hooks/useStandingOrders";
import { useCreatorVestingDays } from "@/hooks/useCreatorVesting";
import { useAntiSniperSeconds } from "@/hooks/useAntiSniper";
import { minReceived, sourceAsset, type OrderDraft, type Side } from "@/lib/order";
import { placeOneClick, warmRelay } from "@/lib/session";
import { SOLVER_MAX_IMPACT_PCT, bidRisk, tradeRisk } from "@/lib/risk";
import { PAY_SOURCES } from "@/lib/tokens";
import { useConnectModal } from "@/providers/Web3Provider";
import { ORIGIN_NAMES, SOON_MAINNET, SOON_NETWORKS } from "@/lib/networks";
import { SOLANA_OPEN_SOL, SOLANA_RETURNED_SOL, solAmount } from "@/lib/solanaEscrow";
import { LaunchSteps, stepOf } from "@/components/launch/LaunchSteps";
import { firstBuyFailed, launchChecked } from "@/lib/firstBuy";
import { addPendingTrade } from "@/lib/pendingTrades";
import { NETWORK_NAME } from "@/lib/network";
import { SOLANA_LIVE } from "@/lib/network";
import { SOLANA_NAME, USDC_WORD } from "@/lib/network";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** The few seconds between the fair first minute and open trading, or before a new token is ready to trade. */
const OPENING_TRADES = "Opening trading… a few seconds";
const pct = (v: number) => `${v >= 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}%`;
const usd6 = (units: bigint) => `$${Number(formatUnits(units, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
const TEST_USDC_SOURCE = PAY_SOURCES.find((s) => s.id === "base-usdc") ?? PAY_SOURCES[0];

/** An amount this close under a buyer's cap is taken as the cap itself (1 cent, in USDC base units). */
const CAP_DUST = BigInt(10_000);

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
    ...(SOLANA_LIVE ? [{ key: "solana" as PayFrom, name: "Solana", usdc6: known.get("solana") ?? null }] : []),
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
                ? `Pay from your wallet on Base: an approval if needed, then one transaction, paid in a little ${NETWORK_NAME} ETH`
                : c.key === "solana"
                  ? `Pay with USDC on ${SOLANA_NAME}, filled on Base in about 20 s. Needs ${solAmount(SOLANA_OPEN_SOL)} for fees and storage; ${solAmount(SOLANA_RETURNED_SOL)} comes back when the order fills or is refunded`
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

/** The automatic max price of a fair-launch buy: this many times today's projected price (or the floor, if higher). */
const AUTO_CAP_MULTIPLE = BigInt(10);
/** A buy at open waits this long past the opening for the launch to trade, then expires unspent. */
const AT_OPEN_GRACE_SECONDS = 2 * 3_600;
/** Crux launch tokens (CruxToken) have 18 decimals. */
const LAUNCH_DECIMALS = 18;
const unixNow = () => Math.floor(Date.now() / 1000);

function BidForm({
  factory,
  id,
  model,
  auction,
  version,
  symbol,
  scheduled = false,
}: {
  factory: Address;
  id: string;
  model: LaunchV2Model;
  auction: AuctionV2;
  version: BatchVersion;
  symbol: string;
  /** Before the opening starts: only the account's buy at open can be placed (the auction takes deposits from then). */
  scheduled?: boolean;
}) {
  const uid = useId();
  const [amount, setAmount] = useState("");
  // ⚙️ Advanced: the manual max price and the full preview, for those who want them.
  const [advanced, setAdvanced] = useState(false);
  const [limitOn, setLimitOn] = useState(false);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash?: Hex } | null>(null);
  // Account first: a logged-in CRUX Account queues a buy at open (the opening auction takes deposits from wallets only).
  // The Crux solver bids it in the opening (crux-solver openingbids.ts), so it counts toward the launch's target, and
  // fills it at the opening price from the tokens it claims, up to the same max price. No gas, no pop-ups.
  const crux = useCruxAccount();
  const trade = useTradeSettings();
  const hasAccount = crux.loggedIn && crux.account !== null;
  const [payWith, setPayWith] = useState<"account" | "wallet">("account");
  const viaAccount = hasAccount && (scheduled || payWith === "account");

  const typed = parse(amount, USDC_DECIMALS);
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
  // Nobody has to price the launch: without a manual limit the order carries a ceiling of 10x today's projected price.
  // It still pays the one clearing price everyone pays; the ceiling only stops a frenzy from charging far more.
  const basis = model.indicativePrice !== null && model.indicativePrice > auction.floorPrice ? model.indicativePrice : auction.floorPrice;
  const autoCap = basis * AUTO_CAP_MULTIPLE;

  // The wallet cap is the auction's; an account's buy at open joins the trading batches, which have none.
  // This launch's buys at open from the account: queued, sent, or ended, each cancellable while it waits.
  const standing = useStandingOrders();
  const queued = (standing.orders ?? []).filter((o) => o.atOpen && o.token.toLowerCase() === auction.token.toLowerCase());
  // A wallet's cap is its own deposit limit. The account's buys at open are bid by the Crux solver as one wallet, so
  // together they fit the same limit: what's left after the ones already waiting (the relay refuses more, counting
  // every account's).
  const queuedOpen = queued.filter((o) => o.status === "open").reduce((sum, o) => sum + BigInt(o.amountIn), BigInt(0));
  const capLeft =
    model.maxDeposit === null
      ? null
      : viaAccount
        ? model.maxDeposit > queuedOpen
          ? model.maxDeposit - queuedOpen
          : BigInt(0)
        : model.maxDeposit > model.myBid.quote
          ? model.maxDeposit - model.myBid.quote
          : BigInt(0);
  const balance = viaAccount ? crux.usdc : model.usdcBalance;
  // The cap rounds up with the floor price ($1.000001 on a $1 goal): an amount typed within a cent under it means the
  // cap, so "$1" on a $1 launch really reaches its goal instead of falling a millionth short and cancelling.
  const parsed =
    typed !== null && capLeft !== null && typed < capLeft && capLeft - typed < CAP_DUST && (balance === null || capLeft <= balance) ? capLeft : typed;
  const maxBid = balance === null ? null : capLeft !== null && capLeft < balance ? capLeft : balance;
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  const overCap = parsed !== null && capLeft !== null && parsed > capLeft;
  // This buyer already holds the most the opening takes: not an error, a done deal until it goes live.
  const wholeOpening = capLeft !== null && capLeft === BigInt(0) && (viaAccount ? queuedOpen : model.myBid.quote) > BigInt(0);
  const liveIn = useNow();
  const liveLeft = Math.max(0, auction.startTime + auction.batchWindow - liveIn);
  const needsApproval = !viaAccount && parsed !== null && model.allowance !== null && parsed > model.allowance;

  const risk = parsed
    ? bidRisk({
        quote: parsed,
        limit: effectiveLimit ?? autoCap,
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
            : "No limit: you accept whatever price the opening clears at. Set a limit to cap it.",
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
          hint: `Selling everything this buys into the new pool right at the open${risk.basis === "floor" ? " (at the floor price)" : ""}. The pool starts with half the raise.`,
        },
      ]
    : [];

  const disabled = wholeOpening || !parsed || overBalance || overCap || limitTooLow || (limitOn && !effectiveLimit) || busy !== null;
  const label = wholeOpening
    ? "You've got the whole opening ✓"
    : overBalance
    ? `Not enough ${USDC_WORD}${viaAccount ? " in your account" : ""}`
    : overCap
      ? viaAccount
        ? "More than this opening can take"
        : "More than one wallet can buy"
      : needsApproval
        ? "Approve & buy"
        : "Buy";

  /** The account's buy at open: a buy-the-dip standing order whose trigger is the max price, kept by the Crux keeper. */
  const queueAtOpen = async (quote: bigint, cap: bigint) => {
    if (!crux.sign || !crux.owner || !crux.account) return;
    const capUsd = Number(formatUnits(cap, PRICE_DECIMALS));
    const opensAt = auction.startTime + auction.batchWindow;
    setBusy({ label: "Signing your buy at open…" });
    await placeStanding(crux.sign, crux.owner, crux.account, {
      kind: "dip",
      tokenIn: TESTNET_USDC,
      amountIn: quote,
      tokenOut: launchCaip19(auction.token),
      minAmountOut: standingFloor("buy", quote, capUsd, LAUNCH_DECIMALS, slippageFor(trade, "buy")),
      triggerUsd: capUsd,
      lifetime: Math.max(0, opensAt - unixNow()) + AT_OPEN_GRACE_SECONDS,
    });
    setDone({
      text: `✅ You're in: $${fmtUsdc(quote)} from your CRUX Account. You'll get ${symbol} at the opening price, the same as everyone, as soon as it goes live. If the launch doesn't go ahead, nothing is spent. You can cancel below until then.`,
    });
    standing.refresh();
  };
  const cancelQueued = async (o: StandingView) => {
    if (!crux.sign || !crux.owner || !crux.account) return;
    try {
      await cancelStanding(crux.sign, crux.owner, crux.account, [BigInt(o.nonce)], []);
      standing.refresh();
    } catch (err) {
      setError(launchError(err));
    }
  };

  const submit = async () => {
    if (disabled || !parsed) return;
    setError(null);
    setDone(null);
    try {
      const cap = limitOn && rawLimit ? rawLimit : autoCap;
      if (viaAccount) {
        await queueAtOpen(parsed, cap);
        setAmount("");
        return;
      }
      const hash = await model.deposit(parsed, cap, setBusy);
      setDone({
        text: `✅ You're in: $${fmtUsdc(parsed)}. You'll get ${symbol} at the opening price, the same as everyone. If the launch doesn't go ahead, you get it all back.`,
        hash,
      });
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
    onSubmit: () => (viaAccount || model.account ? void submit() : model.connect()),
  });

  if (!viaAccount && !model.account) {
    return (
      <button type="button" onClick={model.connect} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold")}>
        Connect wallet to buy
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasAccount && (
        <div role="radiogroup" aria-label="Pay from" className="flex gap-1 text-[11.5px]">
          {(["account", "wallet"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={(viaAccount ? "account" : "wallet") === k}
              disabled={scheduled && k === "wallet"}
              title={scheduled && k === "wallet" ? "A wallet pays into the opening once its countdown starts" : undefined}
              onClick={() => setPayWith(k)}
              className={`h-7 flex-1 rounded-[4px] border transition-colors disabled:opacity-40 ${(viaAccount ? "account" : "wallet") === k ? "border-signal text-signal" : "border-line-2 text-muted hover:text-chrome"}`}
            >
              {k === "account" ? "CRUX Account" : "Wallet"}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-baseline justify-between text-[11.5px] text-muted">
        <span>{viaAccount ? "From your CRUX Account" : "From your wallet on Base"}</span>
        <span className="font-mono text-chrome/80">{balance !== null ? `$${fmtUsdc(balance)} ${USDC_WORD}` : "…"}</span>
      </div>
      <p className="-mt-2 text-[11px] leading-snug text-dim">
        {viaAccount
          ? "You pay the opening price, the same as everyone. No gas, no pop-ups. If the launch doesn't go ahead, nothing is spent."
          : `You pay the opening price, the same as everyone. If the launch doesn't go ahead, you get it all back. Paying from ${ORIGIN_NAMES} works once it's live.`}
      </p>

      <label htmlFor={`${uid}-amt`} className="-mb-2 text-[11px] text-muted">
        How much to spend (USDC)
      </label>
      <div className={wholeOpening ? "pointer-events-none flex flex-col gap-3 opacity-40" : "contents"} aria-disabled={wholeOpening || undefined}>
        <AmountField id={`${uid}-amt`} value={amount} onChange={setAmount} unit="USDC" />
        <Presets items={presets} onPick={pick} />
      </div>
      {wholeOpening ? (
        <p className="-mt-1.5 text-[11.5px] text-up">
          You&apos;ve got the whole opening ✓ Buy more once it&apos;s live{liveLeft > 0 ? ` in ${formatRemaining(liveLeft)}` : ""}.
        </p>
      ) : capLeft !== null && (
        <p className={`-mt-1.5 text-[11px] ${overCap ? "text-down" : "text-dim"}`}>
          {viaAccount
            ? queuedOpen > BigInt(0)
              ? `You're in for $${fmtUsdc(queuedOpen)}${capLeft > BigInt(0) ? `; you can add up to $${fmtUsdc(capLeft)} more` : ", the most this opening takes from one buyer"}.`
              : `You can buy up to $${fmtUsdc(capLeft)} in this opening.`
            : model.myBid.quote > BigInt(0)
              ? `You're in for $${fmtUsdc(model.myBid.quote)}${capLeft > BigInt(0) ? `; you can add up to $${fmtUsdc(capLeft)} more` : ""}.`
              : `You can buy up to $${fmtUsdc(capLeft)} in this opening.`}
        </p>
      )}

      {risk?.tokensAtProjected != null && (
        <p className="-mt-1 text-[11.5px] text-muted">
          You&apos;d get about <span className="font-mono text-chrome">{fmtTokens(risk.tokensAtProjected)} {symbol}</span> at today&apos;s price
        </p>
      )}
      <button
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced((v) => !v)}
        className="-mt-1 self-start text-[11.5px] text-dim transition-colors hover:text-chrome"
      >
        <span aria-hidden="true">⚙️</span> Advanced {advanced ? "▴" : "▾"}
      </button>
      {advanced && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <p className="text-[11px] leading-snug text-dim">
            Max price: {limitOn ? "yours, below" : `automatic, $${priceUsd(autoCap)} per token (10x today's projected price)`}. If the
            opening price lands above it, you&apos;re refunded in full.
          </p>
          <button
            type="button"
            aria-expanded={limitOn}
            onClick={() => setLimitOn((v) => !v)}
            className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-chrome transition-colors hover:border-line-2"
          >
            <span>
              Set my own max price <span className="text-muted">{limitOn ? "" : " · off (auto)"}</span>
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
                  placeholder={priceUsdPlain(auction.floorPrice * BigInt(2))}
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
        </div>
      )}
      <ProtectionRow>
        Fair price: everyone who buys before it goes live pays the same price, so bots can&apos;t jump ahead of you.
      </ProtectionRow>

      <button type="button" disabled={disabled} onClick={() => void submit()} className={buttonClass("buy", "md", "w-full rounded-xl font-semibold max-lg:hidden")}>
        {label} <ArrowUpRight />
        <SubmitKey />
      </button>
      <Status busy={busy} error={error} done={done} />
      {hasAccount && queued.length > 0 && <QueuedAtOpen orders={queued} onCancel={(o) => void cancelQueued(o)} />}

      <MobileDock>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AmountField id={`${uid}-dock`} value={amount} onChange={setAmount} unit="USDC" compact />
          </div>
          <button type="button" disabled={disabled} onClick={() => void submit()} className={buttonClass("buy", "md", "shrink-0 rounded-xl px-4 font-semibold")}>
            {busy ? "…" : wholeOpening ? "Got it all ✓" : overCap ? "Over cap" : "Buy"}
          </button>
        </div>
        {risk?.exit && (
          <p className="mt-1.5 truncate text-[11px] text-dim">
            Max price {risk.worstPrice ? `$${priceUsd(risk.worstPrice)}` : "auto"} · if you sold at the open {pct(risk.exit.lossPct)}
          </p>
        )}
      </MobileDock>
    </div>
  );
}

const QUEUED_STATUS: Record<StandingView["status"], string> = {
  open: "waiting for the open",
  submitted: "arriving",
  // The keeper's release when the launch cancels (one the trader cancelled reads "cancelled").
  cancelled: "released",
  expired: "expired",
  failed: "not sent",
};

/** The account's buys at open on this launch: what each will spend, its max price, where it stands. */
function QueuedAtOpen({ orders, onCancel }: { orders: StandingView[]; onCancel: (o: StandingView) => void }) {
  return (
    <div>
      <p className="text-[11px] text-dim">Your buys</p>
      <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
        {orders.slice(0, 6).map((o) => (
          <li key={o.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
            <span className="font-mono text-chrome">${fmtUsdc(BigInt(o.amountIn))}</span>
            <span className="font-mono text-muted" title="The most you'll pay per token. If the opening price is higher, nothing is spent.">max {fmtTokenPrice(o.triggerUsd)}</span>
            <span className={`ml-auto text-[10.5px] ${o.status === "open" ? "text-signal" : "text-dim"}`} title={o.note ?? undefined}>
              {o.status === "cancelled" && !o.note?.startsWith("Launch cancelled") ? "cancelled" : QUEUED_STATUS[o.status]}
            </span>
            {o.status === "open" && (
              <button type="button" onClick={() => onCancel(o)} aria-label="Cancel this buy at open" className="text-dim hover:text-down">
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
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

/**
 * Moves a shown number toward its latest value over about a second, so the pot climbs between reads instead of
 * jumping. Reduced motion: it jumps.
 */
function useCountUp(target: number) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const v = begin + (target - begin) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return reduced ? target : shown;
}

/**
 * One line on where the opening is heading, from its pace so far: met, on track at this rate, or what it still needs in
 * the time left (in buyers at the per-wallet cap), so buyers can see a launch about to fill, or about to miss.
 */
function momentum(a: AuctionV2, now: number, short: bigint): { text: string; tone: "good" | "warn" | "plain" } {
  const elapsed = Math.max(0, now - a.startTime);
  const left = Math.max(0, a.startTime + a.batchWindow - now);
  if (short === BigInt(0)) return { text: "Goal reached ✓ It goes live when the timer ends. Buying now still gets the same price.", tone: "good" };
  // A small launch the Crux backstop always takes live: no "needs more" or refund talk, because it can't happen.
  if (goesLiveForSure(graduationNeeds(a), maxDepositV3(a)))
    return left === 0
      ? { text: "Time's up: setting the opening price now.", tone: "plain" }
      : { text: "Goes live when the timer ends, even if nobody else buys: Crux puts in the rest. Buying now gets the same opening price.", tone: "good" };
  if (left === 0) return { text: "Time's up: setting the opening price now. If it fell short of the goal, everyone gets a full refund.", tone: "plain" };
  // Buys placed before the start join in the first seconds: say so instead of a bare $0.
  if (elapsed < 15) return { text: "Starting… buys placed before the timer are joining now.", tone: "plain" };
  const shortUsd = Number(formatUnits(short, USDC_DECIMALS));
  const perWallet = maxDepositV3(a);
  const buyers = perWallet > BigInt(0) ? Number((short + perWallet - BigInt(1)) / perWallet) : null;
  const need = `Needs ${shortUsd < 0.01 ? "$0.01" : wholeUsd.format(Math.ceil(shortUsd))} more in ${formatRemaining(left)} to go live${buyers !== null ? ` (${buyers}+ more buyer${buyers === 1 ? "" : "s"})` : ""}. If it falls short, everyone is refunded.`;
  // A pace once a few seconds have passed: deposits so far per second, carried to the end of the window.
  if (elapsed >= 5 && a.totalDeposits > BigInt(0)) {
    const projected = Number(formatUnits(a.totalDeposits, USDC_DECIMALS)) * (1 + left / elapsed);
    if (projected >= Number(formatUnits(a.totalDeposits + short, USDC_DECIMALS))) return { text: `On track to go live. ${need}`, tone: "good" };
  }
  return { text: need, tone: "warn" };
}

const potFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const wholeUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const capFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

/**
 * The opening as it builds: the countdown, the pot (test USDC committed), how many buyers, and the market cap it
 * implies at today's projected clearing price. Read every 4 s; the numbers count up between reads.
 */
function OpeningPot({ model, auction }: { model: LaunchV2Model; auction: AuctionV2 }) {
  const now = useNow();
  const left = Math.max(0, auction.startTime + auction.batchWindow - now);
  const pot = Number(formatUnits(auction.totalDeposits, USDC_DECIMALS));
  // What deposits must total (the floor price rounds up: a $2 target over 600M tokens needs $2.000001).
  const needs = graduationNeeds(auction);
  const short = needs > auction.totalDeposits ? needs - auction.totalDeposits : BigInt(0);
  const target = Number(formatUnits(needs, USDC_DECIMALS));
  const price = Number(formatUnits(model.indicativePrice ?? auction.floorPrice, PRICE_DECIMALS));
  const cap = price * Number(formatUnits(auction.totalSupply, LAUNCH_DECIMALS));
  const shownPot = useCountUp(pot);
  const shownCap = useCountUp(cap);
  const filled = target > 0 ? Math.min(100, (pot / target) * 100) : 0;
  const pace = momentum(auction, now, short);
  return (
    <div className="mb-3 rounded-lg border border-line bg-void/60 p-3" role="group" aria-label="Opening pot">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-dim">Raised so far</span>
        <span className="font-mono text-[12px] text-signal" aria-live="off">
          {left > 0 ? `live in ${formatRemaining(left)}` : "going live…"}
        </span>
      </div>
      <p className="mt-1 font-mono text-[24px] leading-none text-chrome" aria-label={`${potFmt.format(pot)} committed`}>
        {potFmt.format(shownPot)}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${filled}%` }} />
      </div>
      <p className={`mt-1.5 text-[11.5px] leading-snug ${pace.tone === "good" ? "text-up" : pace.tone === "warn" ? "text-signal" : "text-muted"}`} aria-live="polite">
        {pace.text}
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-dim">Buyers</dt>
          <dd className="font-mono text-[13px] text-chrome">{auction.bidderCount}</dd>
        </div>
        <div>
          <dt className="text-dim">Market cap</dt>
          <dd className="font-mono text-[13px] text-chrome" title={model.indicativePrice === null ? "At the floor price: the opening price is set when the countdown ends" : "At the price the opening would clear at now"}>
            {model.indicativePrice === null ? "≥ " : ""}
            {capFmt.format(shownCap)}
          </dd>
        </div>
        <div>
          <dt className="text-dim">Goal</dt>
          <dd className="whitespace-nowrap font-mono text-[13px] text-chrome">{short === BigInt(0) ? "reached ✓" : goesLiveForSure(needs, maxDepositV3(auction)) ? "covered ✓" : short < BigInt(10_000) ? `$${fmtUsdcExact(short)} to go` : `${wholeUsd.format(Math.ceil(Number(formatUnits(short, USDC_DECIMALS))))} to go`}</dd>
        </div>
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------ graduated: the batch-only window (V5, V6)

/**
 * A graduated launch's desk. V5 and V6 launches start with a batch-only window in their batch pool (24 hours on V5,
 * 15 minutes by default on V6): orders go there directly (Batch order), or through a Crux intent the solver fills by
 * joining the batch (Via intent, which also takes payment from other chains). When the window ends the keeper moves
 * the liquidity to Uniswap, usually within seconds; after that, and for V2–V4 launches, it's the intent desk on the
 * Uniswap pool.
 */
/**
 * Just after a launch goes live: the account's buys at open, on their way (the solver delivers them from the opening's
 * tokens within seconds). Shows what's coming at the opening price, so the balance doesn't look empty meanwhile.
 */
function AtOpenArriving({ auction, symbol }: { auction: AuctionV2; symbol: string }) {
  const now = useNow();
  const standing = useStandingOrders();
  if (auction.settledAt === 0 || now - auction.settledAt > 45 || auction.clearingPrice === BigInt(0)) return null;
  const mine = (standing.orders ?? []).filter((o) => o.atOpen && o.status === "submitted" && o.token.toLowerCase() === auction.token.toLowerCase());
  if (mine.length === 0) return null;
  const usdc = mine.reduce((sum, o) => sum + BigInt(o.amountIn), BigInt(0));
  // Tokens at the opening's price, less the solver's spread (what each buy at open is filled with).
  const tokens = (((usdc * BigInt(10) ** BigInt(36)) / auction.clearingPrice) * BigInt(10_000 - SOLVER_SPREAD_BPS)) / BigInt(10_000);
  return (
    <p role="status" className="mb-2 flex items-center gap-2 rounded-lg border border-up/30 bg-up/[0.06] px-3 py-2 text-[11.5px] text-chrome">
      <KineticLoader className="text-up" /> Your opening buy (${fmtUsdc(usdc)}): about {fmtTokens(tokens)} {symbol} arriving in your account now.
    </p>
  );
}

function GraduatedDesk({ auction, symbol }: { auction: AuctionV2; symbol: string }) {
  const t = useT();
  const market = useLaunchMarket(auction.token, auction.pair);
  const [mode, setMode] = useState<"batch" | "intent">("intent");
  const now = useNow();
  // The first minute's batches hand over to the open pool on their own, usually within seconds: a short wait, not a step.
  if (market.protected && market.protectedUntil !== null && now >= market.protectedUntil) {
    return (
      <section aria-label="Trade on Crux" className="p-4">
        <h2 className="text-[14px] font-medium text-chrome">{t("ticket.title")}</h2>
        <p role="status" className="mt-1.5 flex items-center gap-2 text-[11.5px] leading-snug text-muted">
          <KineticLoader className="text-signal" /> Open trading starts in a few seconds. Buy now and it fills as soon as it does.
        </p>
        <div className="mt-3" />
        <AtOpenArriving auction={auction} symbol={symbol} />
        <TradeForm auction={auction} symbol={symbol} handover />
      </section>
    );
  }
  if (!market.protected) {
    return (
      <section aria-label="Trade on Crux" className="p-4">
        <h2 className="mb-3 text-[14px] font-medium text-chrome">{t("ticket.title")}</h2>
        <AtOpenArriving auction={auction} symbol={symbol} />
        <TradeForm auction={auction} symbol={symbol} />
      </section>
    );
  }
  return (
    <section aria-label="Trade on Crux" className="p-4">
      <h2 className="text-[14px] font-medium text-chrome">{t("ticket.title")}</h2>
      <ProtectionNote market={market} />
      <div className="mt-3" />
      {mode === "batch" ? <BatchOrderForm market={market} symbol={symbol} /> : <TradeForm auction={auction} symbol={symbol} />}
      <button
        type="button"
        aria-expanded={mode === "batch"}
        onClick={() => setMode((m) => (m === "batch" ? "intent" : "batch"))}
        className="mt-3 text-[11.5px] text-dim transition-colors hover:text-chrome"
      >
        <span aria-hidden="true">⚙️</span> {mode === "batch" ? "Back to the simple buy" : "Advanced: trade straight from a wallet"}
      </button>
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
      🛡️ Fair first minute{left !== null ? ` · ${formatRemaining(left)} left` : ""}: buys made together get the same price, so bots can&apos;t jump
      ahead of you. Open trading follows on its own.
    </p>
  );
}

// ------------------------------------------------------------------ graduated: trade via intent

function TradeForm({ auction, symbol, handover = false }: { auction: AuctionV2; symbol: string; handover?: boolean }) {
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
  // A trigger picked on the chart (right-click → take profit / stop loss / buy the dip): the form reopens at it.
  const [preset, setPreset] = useState<{ kind: ChartOrderKind; price: number; n: number } | null>(null);
  const onChartOrder = useCallback((r: ChartOrderRequest) => {
    setOrderType(r.kind);
    setPreset((p) => ({ kind: r.kind, price: r.price, n: (p?.n ?? 0) + 1 }));
    document.querySelector('[aria-label="Execution"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useOrderRequests(auction.token, onChartOrder);
  // The box is in USDC both ways: a buy spends it, a sell brings it in (the tokens it takes are worked out from the
  // pool). A % of the bag sells exactly that many tokens, the box showing what they bring.
  const [amount, setAmountText] = useState("");
  const [sellTokens, setSellTokens] = useState<bigint | null>(null);
  const setAmount = (v: string) => {
    setSellTokens(null);
    setAmountText(v);
  };
  const [order, setOrder] = useState<OrderDraft | null>(null);
  // Buys can pay with test USDC on Base Sepolia, or on Arbitrum Sepolia (escrowed there, filled here on Base).
  const [payFrom, setPayFrom] = useState<PayFrom>("base");
  // Crux account (email / Google login): its trades sign silently with the login key, go through the relay, and fill
  // back into the account. Logged in, it's the default; the connected wallet stays one tap away.
  const crux = useCruxAccount();
  const [from, setFrom] = useState<"account" | "wallet">("account");
  const [externalOpen, setExternalOpen] = useState(false);
  /** After a buy from an external wallet, the next trade starts from the CRUX Account again. */
  const backToAccount = useCallback(() => {
    if (crux.loggedIn && crux.account) {
      setFrom("account");
      setExternalOpen(false);
    }
  }, [crux.loggedIn, crux.account]);
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
  // the CRUX Account, else the connected Base wallet.
  const viaSolana = side === "buy" && payFrom === "solana" && !viaAccount;
  const solana = useSolanaPayer();
  const solanaPayee = crux.account ?? address ?? null;
  const [solanaRequest, setSolanaRequest] = useState<SolanaOrderRequest | null>(null);
  /** Solana payer and Base recipient both set: the ticket then validates like any other. */
  const solanaReady = viaSolana && solana.payer !== null && solanaPayee !== null;
  // One-click (CruxSettlerV4 sessions): Base buys signed by this browser's session key, no wallet popup.
  const oneClick = useOneClick();
  const [oneClickOrder, setOneClickOrder] = useState<OneClickOrder | null>(null);
  useOrderWatch(oneClickOrder, setOneClickOrder);
  // The trade on the chart from the moment it's sent (lib/pendingTrades), cleared when it resolves.
  const clearPending = useRef<(() => void) | null>(null);
  const showPending = (side: Side, input: bigint, avgFill?: number) => {
    clearPending.current?.();
    if (market.price === null) return;
    // The candle ends where the real one will: the trade's average price on the pool, the price a candle is drawn from
    // (not the buyer's fill, which carries the spread, nor the pool's price after it, far higher on a thin pool).
    const expected = (market.reserves && priceAfter(side, input, market.reserves, market.decimals)) ?? avgFill;
    const label = side === "buy" ? `Buying $${fmtUsdc(input)}…` : `Selling ${fmtTokens(input)} ${symbol}…`;
    const at = avgFill ?? market.price;
    const usdc = side === "buy" ? Number(input) / 1e6 : (Number(input) / 1e18) * at;
    const tokens = side === "buy" ? (at > 0 ? usdc / at : undefined) : Number(input) / 1e18;
    clearPending.current = addPendingTrade({ token: market.token, side, label, price: market.price, usdc, ...(tokens !== undefined ? { tokens } : {}), ...(expected ? { expected } : {}) });
  };
  // When the order resolves: off the chart, and on a fill the balances re-read at once (not on their 10 s timer).
  const resolved =
    oneClickOrder && oneClickOrder.kind !== "sending" && oneClickOrder.kind !== "open" ? `${oneClickOrder.kind}:${"orderId" in oneClickOrder ? oneClickOrder.orderId : ""}` : null;
  const afterFill = useRef(() => {});
  useLayoutEffect(() => {
    afterFill.current = () => {
      crux.refresh();
      void accountTokens.refetch();
    };
  });
  useEffect(() => {
    if (!resolved) return;
    const clear = clearPending.current;
    clearPending.current = null;
    if (resolved.startsWith("filled:")) {
      afterFill.current();
      // It stays until the real trade is on the chart (ProChart takes it away then), so the two never leave a gap; this
      // only tidies up if that never shows, say on a chart that isn't open.
      setTimeout(() => clear?.(), 10_000);
    } else {
      clear?.();
    }
  }, [resolved]);

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

  // What's typed is USDC; a sell's input is the tokens that bring it in (or, from a % button, exactly that share).
  const typedUsdc = parse(amount, 6);
  const input = side === "buy" ? typedUsdc : (sellTokens ?? (typedUsdc && market.reserves ? sellFor(typedUsdc, market.reserves) : null));
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
            originLabel: viaSolana ? `${SOLANA_NAME}` : fromOrigin ? fromOrigin.name : `${NETWORK_NAME}`,
            asset: { address: market.token, caip19: market.caip19, decimals: market.decimals },
            slippageBps: slippageFor(trade, side),
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
    : handover && side === "sell"
      ? "Selling opens in a few seconds"
    : market.protected && side === "sell" && !viaAccount
      ? "Sell into the batch under ⚙️ Advanced"
      : !market.reserves
      ? market.loading
        ? "Reading the pool…"
        : "Pool unavailable"
      : !listed
        ? OPENING_TRADES
        : null;
  const oneClickReady = !viaAccount && side === "buy" && payFrom === "base" && oneClick.session !== null;
  const overCap = oneClickReady && input !== null && oneClick.remaining !== null && input > oneClick.remaining;
  const sending = oneClickOrder?.kind === "sending";
  const disabled = !input || !risk || overBalance || tooBig || overCap || sending || Boolean(blocked);
  const label =
    blocked ??
    (overBalance
      ? `Not enough ${side === "buy" ? (viaSolana ? "USDC on Solana" : `${USDC_WORD}`) : symbol}${viaAccount ? " in your account" : ""}`
      : tooBig
        ? t("ticket.tooLarge")
        : overCap
          ? "Over your one-click cap"
          : market.protected && side === "buy" && (viaAccount || oneClickReady)
            ? "Buy"
            : viaAccount
            ? side === "buy" ? "Buy" : "Sell"
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
            hint: `Guaranteed on-chain: signed into your intent, ${(slippageFor(trade, side) / 100).toFixed(slippageFor(trade, side) % 100 === 0 ? 0 : 1)}% under the quote (your ${side} slippage). It can't fill below this.`,
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
    const sentAt = sendTime();
    setOneClickOrder({ kind: "sending" });
    showPending("buy", input, draft?.price);
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
      setOneClickOrder(sentOrder(orderId, false, sentAt));
      setAmount("");
      void oneClick.refresh();
      backToAccount();
    } catch (e) {
      setOneClickOrder({ kind: "error", message: (e as Error).message.split("\n")[0] });
    }
  };

  /** Signs with the Crux account's login key (no pop-up) and has the relay open it from the account. */
  // The trade the button would send right now (null when it can't): signed on press, sent on click.
  const accountTradeFields = () =>
    input && draft
      ? {
          tokenIn: side === "buy" ? TESTNET_USDC : market.token,
          amountIn: input,
          tokenOut: side === "buy" ? market.caip19 : launchCaip19(TESTNET_USDC),
          // The same signed floor as the wallet flow: the quote less the slippage allowance.
          minAmountOut: parseUnits(minReceived(draft).toFixed(6), side === "buy" ? market.decimals : 6),
        }
      : null;
  const presigned = useRef<{ key: string; signed: Promise<SignedTrade> } | null>(null);
  const tradeKey = (f: NonNullable<ReturnType<typeof accountTradeFields>>) => `${f.tokenIn}:${f.amountIn}:${f.tokenOut}:${f.minAmountOut}`;
  /** Pointer down on Buy / Sell: the signature starts now, about 100 ms before the click lands. */
  const pressTrade = () => {
    warmRelay();
    if (!viaAccount || disabled || !crux.sign || !crux.account) return;
    const f = accountTradeFields();
    if (!f) return;
    const signed = signTrade(crux.sign, crux.account, f);
    signed.catch(() => {}); // a press that never becomes a click
    presigned.current = { key: tradeKey(f), signed };
  };
  const accountTrade = async () => {
    const f = accountTradeFields();
    if (!f || !draft || !crux.sign || !crux.owner || !crux.account) return;
    const sentAt = sendTime();
    setOneClickOrder({ kind: "sending" });
    showPending(side, f.amountIn, draft?.price);
    // The press's signature when it's for exactly this trade (the quote can move between press and click).
    const pre = presigned.current?.key === tradeKey(f) ? presigned.current.signed : undefined;
    presigned.current = null;
    try {
      const { orderId, filled, timing } = await tradeFromAccount(crux.sign, crux.owner, crux.account, f, pre);
      // How long each step took, for checking a buy's speed (browser console): click → signed → relay → … → candle.
      console.info("[crux] trade timing", Object.fromEntries(Object.entries(timing).map(([key, v]) => [key, v - timing.t_click])));
      // Usually filled by the time the relay answers: shown at once, and the balances re-read (the watch is for the rest).
      setOneClickOrder(sentOrder(orderId, filled, sentAt));
      setAmount("");
      crux.refresh();
    } catch (e) {
      setOneClickOrder({ kind: "error", message: (e as Error).message.split("\n")[0] });
      // Out on the chain, not seen confirmed yet: the balances are read again as it lands, so the holding catches up.
      if (e instanceof StillConfirming) for (const ms of [4_000, 12_000, 30_000]) setTimeout(() => crux.refresh(), ms);
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

  // A buy's value is USDC; a sell's is tokens (a share of the bag): the box shows the USDC it brings.
  const usdcText = (tokens: bigint) => (market.reserves ? formatUnits(solverQuote("sell", tokens, market.reserves), 6) : "");
  const pick = (v: bigint) => {
    if (side === "buy") return setAmount(formatUnits(v, 6));
    setAmountText(usdcText(v));
    setSellTokens(v);
  };
  // One-click trading (the gear's switch): a quick size places the order as soon as the ticket has priced it, which is
  // the next render, or at once when that size is already in the box. From a wallet it opens the review to confirm.
  // The latest submit, priced for whatever is in the box (refreshed after every render).
  const submitLatest = useRef(sign);
  useLayoutEffect(() => {
    submitLatest.current = sign;
  });
  const quick = (v: bigint) => {
    // Nothing to trade from yet (logged out, no wallet): a quick size only fills the box.
    if (!trade.instant || !(viaAccount || isConnected)) return pick(v);
    // Render the new size now, so the submit below sees the order priced for it.
    flushSync(() => pick(v));
    submitLatest.current();
  };
  const fraction = (v: bigint | null, n: number) => (v ? (v * BigInt(Math.round(n * 100))) / BigInt(10_000) : null);
  // Buys: the trader's four dollar sizes (the gear sets them), unavailable beyond the balance. Sells: a share of the bag.
  const usdcUnits = (usd: number) => BigInt(Math.round(usd * 1e6));
  const presets =
    side === "buy"
      ? trade.buyPresets.map((usd) => ({
          label: `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
          value: usdcBalance !== null && usdcUnits(usd) > usdcBalance ? null : usdcUnits(usd),
        }))
      : trade.sellPresets.map((n) => ({ label: `${n}%`, value: fraction(tokenBalance, n) }));
  useExecutionHotkeys({ presets: presets.map((p) => () => p.value && quick(p.value)), onSubmit: sign });

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
          key={preset ? `chart-${preset.n}` : "form"}
          preset={preset}
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
        {side === "buy" ? "USDC to spend" : `USDC to sell ${symbol} for`}
      </label>
      <AmountField id={`${uid}-amt`} value={amount} onChange={setAmount} unit="USDC" />
      {/* Account-first: the CRUX Account is the default; external wallets (any chain) are one tap away. */}
      {crux.loggedIn && crux.account ? (
        <button
          type="button"
          role="radio"
          aria-checked={viaAccount}
          onClick={() => {
            setFrom("account");
            setExternalOpen(false);
            setAmount("");
          }}
          className={`-mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-left text-[11.5px] transition-colors ${
            viaAccount ? "border-signal/60 bg-signal/5" : "border-line hover:border-line-2"
          }`}
        >
          <span className="text-chrome">CRUX Account</span>
          <span className="font-mono text-chrome/85">({crux.usdc !== null ? `$${fmtUsdc(crux.usdc)}` : "…"})</span>
          <span className="text-dim">— Instant • 0 Gas</span>
          {viaAccount && (
            <a href="/account" onClick={(e) => e.stopPropagation()} className={`ml-auto ${crux.withdrawalAddress ? "text-dim" : "text-down"} hover:text-chrome`}>
              {crux.withdrawalAddress ? "Deposit / withdraw" : "Not protected yet"}
            </a>
          )}
        </button>
      ) : crux.setup.needed ? (
        <p className="-mt-0.5 rounded-lg border border-signal/40 bg-signal/5 px-3 py-2 text-[11.5px] leading-snug text-muted">
          <span className="text-chrome">One step left:</span> create your CRUX Account (one account that trades and launches, address ending in 5afe).{" "}
          <a href="/account" className="text-signal hover:underline">
            Create it
          </a>
        </p>
      ) : (
        <p className="-mt-0.5 rounded-lg border border-line px-3 py-2 text-[11.5px] leading-snug text-muted">
          <span className="text-chrome">CRUX Account:</span> deposit once from any chain, then trade instantly with 0 gas and no pop-ups.{" "}
          <button type="button" onClick={crux.login} className="text-signal hover:underline">
            Log in
          </button>
        </p>
      )}
      <button
        type="button"
        aria-expanded={!viaAccount && (externalOpen || !(crux.loggedIn && crux.account))}
        onClick={() => {
          if (viaAccount) {
            setFrom("wallet");
            setExternalOpen(true);
          } else setExternalOpen((v) => !v);
          setAmount("");
        }}
        className="-mt-1 self-start text-[11px] text-dim transition-colors hover:text-chrome"
      >
        {side === "buy" ? "Or pay directly from external wallet" : "Or sell from an external wallet"} {!viaAccount && (externalOpen || !(crux.loggedIn && crux.account)) ? "▴" : "▾"}
      </button>
      {side === "buy" && !viaAccount && (externalOpen || !(crux.loggedIn && crux.account)) && (
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
              ? `USDC on ${SOLANA_NAME} · settled from Solana in about 20 s`
              : fromOrigin
                ? `${fromOrigin.name} ${USDC_WORD} · delivered on Base, no bridge`
                : `${NETWORK_NAME} ${USDC_WORD}`
            : `Selling ${symbol}`}
        </span>
        <span className="font-mono text-muted">
          {/* Nothing connected to read a balance from: a dash, not a loading ellipsis that never resolves. */}
          Balance{" "}
          {!viaAccount && (viaSolana ? !solana.payer : !address)
            ? "—"
            : side === "buy"
              ? usdcBalance !== null
                ? usd6(usdcBalance)
                : "…"
              : tokenBalance !== null
                ? fmtTokens(tokenBalance)
                : "…"}
        </span>
      </div>

      <Presets items={presets} onPick={quick} />
      <div className="-mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-dim">
          {side === "buy" ? t("ticket.quickBuy") : t("ticket.shareOfBag")}
          {trade.instant && <span className="text-signal"> · one click</span>}
        </span>
        <TradeSettingsButton side={side} />
      </div>

      {rows.length > 0 && <RiskPreview rows={rows} note={tooBig ? `This pool is still small: a trade this size would move the price more than ${SOLVER_MAX_IMPACT_PCT}%, so Crux won't place it. Try a smaller amount.` : undefined} />}
      <ProtectionRow>{t("ticket.minEnforced")}</ProtectionRow>

      {side === "buy" && payFrom === "base" && !viaAccount && <OneClickBar oneClick={oneClick} />}

      <button type="button" disabled={(isConnected || viaAccount || solanaReady) && disabled} onClick={sign} onPointerDown={pressTrade} onPointerEnter={warmRelay} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold max-lg:hidden")}>
        {isConnected || viaAccount || viaSolana ? label : t("ticket.connect")} <ArrowUpRight />
        <SubmitKey />
      </button>
      <OneClickOrderStatus order={oneClickOrder} to={viaAccount ? "your Crux account" : undefined} />

      {market.protected ? (
        <p className="text-[11px] leading-snug text-dim">
          Your buy is grouped with everyone else&apos;s this minute and all of it fills at one price. Tokens land {viaAccount ? "in your CRUX Account" : "in your wallet"} within
          about a minute. If the price moves past your limit, you get your money back.
        </p>
      ) : (
      <p className="text-[11px] leading-snug text-dim">
        Trades against the token&apos;s{" "}
        <a href={`${TESTNET_EXPLORER}/address/${auction.pair}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2" title={`Uniswap V2 pool ${auction.pair}`}>
          locked pool
        </a>
        {market.price !== null && <> at {fmtTokenPrice(market.price)}</>}.{" "}
        {fromOrigin
          ? `Held on ${fromOrigin.name}, filled on Base in the next batch at the price everyone pays, and released only once that fill is confirmed on ${fromOrigin.name}; refundable 6 hours after its deadline otherwise.`
          : "Fills within seconds at one fair price. If it can't fill within your limit, you get your money back."}
      </p>
      )}

      <MobileDock>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AmountField id={`${uid}-dock`} value={amount} onChange={setAmount} unit="USDC" compact />
          </div>
          <button type="button" disabled={(isConnected || viaAccount || solanaReady) && disabled} onClick={sign} onPointerDown={pressTrade} onPointerEnter={warmRelay} className={buttonClass("primary", "md", "shrink-0 rounded-xl px-4 font-semibold capitalize")}>
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

      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} onPlaced={backToAccount} />
      <SolanaIntentModal
        request={solanaRequest}
        onPlaced={backToAccount}
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
  const crux = useCruxAccount();
  // An instant-unlock launch: said in the buy box itself, not only in the token bar's badge.
  const vestDays = useCreatorVestingDays(factory, BigInt(id), version);
  const antiSniperSeconds = useAntiSniperSeconds(factory, BigInt(id), version);
  const unlocked = vestDays === 0 ? <UnlockedWarning /> : null;

  // Before the opening: the account can already queue its buy at open (wallets pay in once the countdown starts).
  // The standard panel asks for a wallet to buy, settle or claim; an account user needs none of that, only the time.
  const steps = stepOf(phase);
  const guide =
    steps !== null && steps < 2 ? (
      <>
        <LaunchSteps current={steps} className="mb-3" />
        <FirstBuyMissed token={auction.token} />
      </>
    ) : null;
  if (phase === "scheduled" && crux.loggedIn && crux.account) {
    return (
      <div className="p-3">
        {guide}
        <OpensIn
          at={auction.startTime}
          token={auction.token}
          vestDays={vestDays}
          antiSniperSeconds={antiSniperSeconds}
          forSure={goesLiveForSure(graduationNeeds(auction), maxDepositV3(auction))}
        />
        {unlocked && <div className="mt-3 px-1">{unlocked}</div>}
        <section aria-label="Buy" className="mt-3 px-1">
          <h2 className="mb-3 text-[14px] font-medium text-chrome">Buy {symbol}</h2>
          <BidForm factory={factory} id={id} model={model} auction={auction} version={version} symbol={symbol} scheduled />
        </section>
      </div>
    );
  }
  if (phase === "open") {
    return (
      <section aria-label="Buy" className="p-4">
        {guide}
        <h2 className="mb-3 text-[14px] font-medium text-chrome">Buy {symbol}</h2>
        {unlocked}
        <OpeningPot model={model} auction={auction} />
        <BidForm factory={factory} id={id} model={model} auction={auction} version={version} symbol={symbol} />
      </section>
    );
  }
  // Claims and creator vesting live in the notice banner above the terminal, so the desk stays the desk.
  if (phase === "graduated" && auction.pair !== zeroAddress) {
    return (
      <>
        {unlocked && <div className="px-4 pt-4">{unlocked}</div>}
        <GraduatedDesk auction={auction} symbol={symbol} />
      </>
    );
  }
  if (phase === "cancelled") {
    return (
      <section aria-label="Cancelled" className="p-4">
        <h2 className="text-[14px] font-medium text-chrome">This launch didn&apos;t go ahead</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          It didn&apos;t reach its goal in time, so no tokens were sold and everyone gets their money back in full. If you bought from a
          wallet, your refund is in the notice above.
        </p>
        {crux.loggedIn && crux.account && <ReleasedBuysAtOpen token={auction.token} />}
      </section>
    );
  }
  return (
    <div className="p-3">
      {guide}
      {fallback}
    </div>
  );
}

/** Just after a launch whose creator's first buy couldn't be placed: say so, so they buy it here before the opening. */
function FirstBuyMissed({ token }: { token: Address }) {
  // The panel only renders in the browser, once the launch is read: storage is there to read on the first render.
  const [missed] = useState(() => (typeof window === "undefined" ? null : firstBuyFailed(token)));
  if (missed === null) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg border border-signal/40 bg-signal/[0.06] px-3 py-2 text-[11.5px] leading-snug text-chrome">
      Your launch is live, but your ${fmtUsdc(missed)} first buy didn&apos;t go through. Buy it below before the opening ends. Nothing was spent.
    </p>
  );
}

/**
 * Before the opening, for a CRUX Account: what's already done (a checklist that ticks as it happens) and when it opens.
 * Only what's true is listed: the copycat check for a launch this browser made, the creator's lock when there is one,
 * and this account's buy once it's queued.
 */
function OpensIn({
  at,
  token,
  vestDays,
  antiSniperSeconds,
  forSure,
}: {
  at: number;
  token: Address;
  vestDays: number | null;
  antiSniperSeconds: number | null;
  forSure: boolean;
}) {
  const now = useNow();
  const standing = useStandingOrders();
  const [checked] = useState(() => (typeof window === "undefined" ? false : launchChecked(token)));
  const mine = (standing.orders ?? []).filter((o) => o.atOpen && o.status === "open" && o.token.toLowerCase() === token.toLowerCase());
  const queuedUsd = mine.reduce((sum, o) => sum + BigInt(o.amountIn), BigInt(0));
  const done = [
    checked && "Copycat check passed",
    // Every opening is one batch at one price: true of every launch, so always listed.
    "Anti-sniper batch: one price for everyone",
    antiSniperSeconds !== null && antiSniperSeconds > 0 && `Fair first ${antiSniperSeconds >= 120 ? `${Math.round(antiSniperSeconds / 60)} minutes` : "minute"} after it goes live`,
    vestDays !== null && vestDays > 0 && `Creator's share locked for ${vestDays} days`,
    queuedUsd > BigInt(0) && `Your $${fmtUsdc(queuedUsd)} buy is in`,
    forSure && "Goes live for sure: Crux tops up the opening",
  ].filter((x): x is string => Boolean(x));
  return (
    <section aria-label="Opens in" className="rounded-xl border border-line px-4 py-3">
      {done.length > 0 && (
        <ul className="mb-2.5 flex flex-col gap-1">
          {done.map((d) => (
            <li key={d} className="flex items-center gap-2 text-[12px] text-chrome">
              <span className="text-up" aria-hidden="true">
                ✓
              </span>
              {d}
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-chrome">Opens in</span>
        <span className="font-mono text-[15px] text-signal">{formatRemaining(Math.max(0, at - now))}</span>
      </p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-dim">
        {queuedUsd > BigInt(0)
          ? "Nothing else to do: your buy goes in when it opens, at the same price as everyone."
          : "Buy now from your CRUX Account and you get in at the opening price, the same as everyone. No wallet needed."}
      </p>
    </section>
  );
}

/** The buy box's warning on a launch whose creator chose an instant unlock (no vesting). */
function UnlockedWarning() {
  return (
    <p role="note" className="mb-3 rounded-lg border border-down/40 bg-down/[0.06] px-3 py-2 text-[11.5px] leading-snug text-down">
      ⚠️ The creator can sell right away: their 10% of the tokens and 49% of the money raised are not locked up. Most launches
      lock these for 30 days.
    </p>
  );
}

/**
 * A cancelled launch's buys at open from the account: the keeper releases them as soon as it sees the cancellation (no
 * USDC ever left the account); one it hasn't reached yet can be cancelled here.
 */
function ReleasedBuysAtOpen({ token }: { token: Address }) {
  const crux = useCruxAccount();
  const standing = useStandingOrders();
  const [error, setError] = useState<string | null>(null);
  const mine = (standing.orders ?? []).filter((o) => o.atOpen && o.token.toLowerCase() === token.toLowerCase());
  if (mine.length === 0) return null;
  const cancel = async (o: StandingView) => {
    if (!crux.sign || !crux.owner || !crux.account) return;
    try {
      await cancelStanding(crux.sign, crux.owner, crux.account, [BigInt(o.nonce)], []);
      standing.refresh();
    } catch (err) {
      setError(launchError(err));
    }
  };
  return (
    <div className="mt-3">
      <p className="text-[12px] leading-relaxed text-muted">
        {mine.some((o) => o.status === "open")
          ? "Your buy is being cancelled: nothing was spent, and the money stays in your CRUX Account."
          : "Your buy was cancelled: nothing was spent, and the money stayed in your CRUX Account."}
      </p>
      <div className="mt-2">
        <QueuedAtOpen orders={mine} onCancel={(o) => void cancel(o)} />
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-down">{error}</p>}
    </div>
  );
}
