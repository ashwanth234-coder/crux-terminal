"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { formatUnits, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { SmartAccountNote } from "@/components/ui/SmartAccountNote";
import { Notice, Shell } from "@/components/launch/LaunchView";
import { TradeViaIntent } from "@/components/launch/TradeViaIntent";
import { ExecutionPanel } from "@/components/pro/ExecutionPanel";
import { ProTerminal } from "@/components/pro/ProTerminal";
import { useNow } from "@/hooks/useLaunchAuction";
import { useLaunchV2, type LaunchV2Model } from "@/hooks/useLaunchV2";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { batchFactory } from "@/lib/intents";
import { useCreatorVestingDays } from "@/hooks/useCreatorVesting";
import { VestingBadge } from "@/components/ui/VestingBadge";
import { USDC_DECIMALS, fmtTokens, fmtUsdc, formatRemaining, launchError, type TxStep } from "@/lib/launch";
import {
  NO_LIMIT,
  V2_FEE,
  V2_SPLIT,
  V2_VESTING_DAYS,
  V3_TICK_STEP_PERCENT,
  marketCapUsd,
  parsePriceUsd,
  phaseV2,
  priceUsd,
  windowLabel,
  type AuctionV2,
  type BatchVersion,
  type PhaseV2,
  usesTicks,
} from "@/lib/launchV2";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STATUS: Record<PhaseV2, { label: string; tone: string; dot: string }> = {
  scheduled: { label: "Scheduled", tone: "border-line-2 text-chrome", dot: "bg-chrome/50" },
  open: { label: "Deposits open", tone: "border-signal/40 text-chrome", dot: "bg-signal" },
  closed: { label: "Window closed · awaiting settlement", tone: "border-line-2 text-chrome", dot: "bg-dim" },
  graduated: { label: "Graduated", tone: "border-chrome/40 text-chrome", dot: "bg-chrome" },
  cancelled: { label: "Cancelled · refunds open", tone: "border-dashed border-line-2 text-chrome", dot: "border border-muted" },
};

/** /launch/v2|v3|v4/[id]: an auction on CruxFactoryV2, V3 or V4 (same launch, same screen; V4 adds the vesting choice). */
export function LaunchRouteV2({ version = 2 }: { version?: BatchVersion }) {
  const { id } = useParams<{ id: string }>();
  const factory = batchFactory(version);
  if (!/^\d+$/.test(id)) return <Notice title="That isn't an auction id">Auction ids are whole numbers, starting at 0.</Notice>;
  if (!factory) {
    return (
      <Notice title={`Auction #${id} can't be read here`}>
        This build has no V{version} factory configured (NEXT_PUBLIC_CRUX_FACTORY_V{version}).
      </Notice>
    );
  }
  return <LiveLaunchV2 factory={factory} id={id} version={version} />;
}

function LiveLaunchV2({ factory, id, version }: { factory: Address; id: string; version: BatchVersion }) {
  const model = useLaunchV2(factory, BigInt(id), version);
  // The pro terminal is the default; the original single-column view stays at ?view=classic.
  const pro = useSearchParams().get("view") !== "classic";
  if (model.loading) {
    return (
      <Shell mode="live">
        <div className="flex items-center gap-3 py-24 text-[14px] text-muted">
          <KineticLoader className="text-signal" /> Reading auction #{id} from Base Sepolia…
        </div>
      </Shell>
    );
  }
  if (model.error || !model.auction) {
    return <Notice title={`Auction #${id}`}>{model.error ?? "This auction could not be read."}</Notice>;
  }
  if (pro) return <ProViewV2 factory={factory} model={model} auction={model.auction} id={id} version={version} />;
  return <ViewV2 model={model} auction={model.auction} id={id} />;
}

/** The same launch in the pro terminal layout; execution reuses the bid / settle / claim panel. */
function ProViewV2({ factory, model, auction, id, version }: { factory: Address; model: LaunchV2Model; auction: AuctionV2; id: string; version: BatchVersion }) {
  const now = useNow();
  const phase = now === null ? "scheduled" : phaseV2(auction, now);
  const symbol = model.symbol ? `$${model.symbol}` : "tokens";
  return (
    <ProTerminal
      factory={factory}
      model={model}
      auction={auction}
      phase={phase}
      status={STATUS[phase]}
      version={version}
      id={id}
      execution={
        <ExecutionPanel
          factory={factory}
          id={id}
          model={model}
          auction={auction}
          phase={phase}
          version={version}
          fallback={<ActionPanelV2 model={model} auction={auction} phase={phase} symbol={symbol} />}
        />
      }
    />
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="font-mono text-[13px] text-chrome">{children}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-dim">{hint}</span>}
      </dd>
    </div>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-signal" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ViewV2({ model, auction, id }: { model: LaunchV2Model; auction: AuctionV2; id: string }) {
  const vestDays = useCreatorVestingDays(batchFactory(model.version), BigInt(id), model.version);
  const now = useNow();
  const phase = now === null ? "scheduled" : phaseV2(auction, now);
  const status = STATUS[phase];
  const symbol = model.symbol ? `$${model.symbol}` : "tokens";
  const opensIn = now === null ? 0 : auction.startTime - now;
  const closesIn = now === null ? auction.batchWindow : auction.startTime + auction.batchWindow - now;
  const raised = auction.graduationTarget > BigInt(0) ? Number((auction.totalDeposits * BigInt(10_000)) / auction.graduationTarget) / 10_000 : 0;
  const price = model.indicativePrice;
  const capShare = Number((auction.maxAllocationPerWallet * BigInt(10_000)) / auction.saleSupply) / 100;

  return (
    <Shell mode="live">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display-md text-[clamp(2rem,5vw,3.4rem)] leading-[0.95] text-chrome">
            {model.symbol ? `$${model.symbol}` : "Token launch"}
            {model.name && <span className="text-steel"> {model.name}</span>}
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            Auction <span className="font-mono">#{id}</span> on Base Sepolia · Graduates at{" "}
            <span className="font-mono text-chrome">${fmtUsdc(auction.graduationTarget)}</span> test USDC
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${status.tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </span>
          <VestingBadge days={vestDays} />
        </div>
      </div>

      {/* The anti-rug promise, stated once and plainly */}
      <p className="mt-6 flex items-center gap-2.5 rounded-xl border border-line bg-panel px-4 py-3 text-[13.5px] text-chrome">
        <LockIcon />
        <span>
          Liquidity is automatically paired and locked forever to 0x…dEaD upon graduation.{" "}
          <span className="text-muted">
            {V2_FEE.creatorShareBps / 100}% of the {V2_FEE.feeBps / 100}% protocol fee routes directly to the creator;{" "}
            {vestDays === 0
              ? "the creator chose an instant unlock, so their share of the raise and their tokens are released at graduation."
              : `their share of the raise vests over ${vestDays ?? V2_VESTING_DAYS} days.`}
          </span>
        </span>
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-label="Auction" className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-muted">{phase === "scheduled" ? "Opens in" : phase === "open" ? "Window closes in" : "Window"}</p>
              <p role="timer" aria-live="off" className="mt-2 font-mono text-[44px] leading-none text-chrome">
                {phase === "scheduled" ? formatRemaining(opensIn) : phase === "open" ? formatRemaining(closesIn) : "Closed"}
              </p>
            </div>
            <p className="pb-1 text-right text-[11.5px] text-dim">{windowLabel(auction.batchWindow)} uniform batch</p>
          </div>
          <div className="mt-4">
            <Bar value={phase === "open" ? 1 - closesIn / auction.batchWindow : phase === "scheduled" ? 0 : 1} className={phase === "open" ? "bg-chrome/60" : "bg-line-2"} />
          </div>
          <p className="mt-3 text-[12.5px] leading-snug text-muted">
            <span className="text-chrome">No front-running inside the batch.</span> Every bid clears at one price, so arriving first buys nothing.
          </p>

          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[12px] text-muted">Bids vs graduation target</p>
              <p className="font-mono text-[12px] text-muted">{(raised * 100).toFixed(1)}%</p>
            </div>
            <p className="mt-2 font-mono text-[22px] text-chrome">
              ${fmtUsdc(auction.totalDeposits)} <span className="text-[14px] text-dim">/ ${fmtUsdc(auction.graduationTarget)} USDC</span>
            </p>
            <div className="mt-3">
              <Bar value={raised} className={phase === "cancelled" ? "bg-down/70" : "bg-signal"} />
            </div>
          </div>

          <dl className="mt-6 divide-y divide-line border-t border-line">
            <Row
              label={phase === "graduated" || phase === "cancelled" ? "Clearing price" : "Clearing price if it closed now"}
              hint={
                phase === "graduated"
                  ? "Every filled bid paid this"
                  : phase === "cancelled"
                    ? "Demand didn't cover the sale at the floor; every deposit is refundable"
                    : "Live from the contract's clearing search"
              }
            >
              {phase === "cancelled" ? "None: launch cancelled" : price !== null ? `$${priceUsd(price)}` : model.wouldGraduate === false ? "Below the floor" : "No bids yet"}
            </Row>
            <Row label="Market cap at this price">{price !== null && phase !== "cancelled" ? marketCapUsd(price, auction.totalSupply) : "—"}</Row>
            <Row label="Floor price" hint="Bids must allow at least this">{`$${priceUsd(auction.floorPrice)}`}</Row>
            {model.maxDeposit !== null ? (
              <Row label="Max deposit per wallet" hint={`Buys at most ${fmtTokens(auction.maxAllocationPerWallet)} ${symbol} (${capShare.toFixed(1)}% of the sale)`}>
                {`$${fmtUsdc(model.maxDeposit)}`}
              </Row>
            ) : (
              <Row label="Max per wallet" hint={`${capShare.toFixed(1)}% of the sale`}>{`${fmtTokens(auction.maxAllocationPerWallet)} ${symbol}`}</Row>
            )}
            <Row label="Supply split" hint={vestDays === 0 ? "Creator share unlocks at graduation" : `Creator share vests over ${vestDays ?? V2_VESTING_DAYS} days`}>
              {`${V2_SPLIT.saleBps / 100}% sale · ${V2_SPLIT.lpBps / 100}% locked pool · ${V2_SPLIT.creatorBps / 100}% creator`}
            </Row>
            {phase === "graduated" && (
              <Row label="Pool" hint="Uniswap V2 · LP burned to 0x…dEaD">
                <a href={`${TESTNET_EXPLORER}/address/${auction.pair}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 hover:text-bright">
                  {short(auction.pair)}
                </a>
              </Row>
            )}
            <Row label="Token">
              <a href={`${TESTNET_EXPLORER}/token/${auction.token}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 hover:text-bright">
                {short(auction.token)}
              </a>
            </Row>
            <Row label="Creator">{short(auction.creator)}</Row>
          </dl>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <ActionPanelV2 model={model} auction={auction} phase={phase} symbol={symbol} vestDays={vestDays} />
          {phase === "graduated" && auction.pair !== zeroAddress && (
            <TradeViaIntent token={auction.token} pair={auction.pair} symbol={model.symbol ?? "TOKEN"} />
          )}
        </div>
      </div>
    </Shell>
  );
}

type Busy = TxStep | null;

function ActionPanelV2({ model, auction, phase, symbol, vestDays = null }: { model: LaunchV2Model; auction: AuctionV2; phase: PhaseV2; symbol: string; vestDays?: number | null }) {
  const uid = useId();
  const [amount, setAmount] = useState("");
  const [limitOn, setLimitOn] = useState(false);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash?: Hex } | null>(null);

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseUnits(amount, USDC_DECIMALS) : null;
  } catch {
    parsed = null;
  }
  const limitPrice = limitOn ? parsePriceUsd(limit) : NO_LIMIT;
  const limitError =
    limitOn && limit && (!limitPrice || limitPrice < auction.floorPrice) ? `Set at least the floor, $${priceUsd(auction.floorPrice)} per token.` : null;
  const overBalance = parsed !== null && model.usdcBalance !== null && parsed > model.usdcBalance;
  // V3 caps each wallet's total deposit; what this wallet can still add.
  const capLeft = model.maxDeposit !== null ? (model.maxDeposit > model.myBid.quote ? model.maxDeposit - model.myBid.quote : BigInt(0)) : null;
  const overCap = parsed !== null && capLeft !== null && parsed > capLeft;
  // Max: everything this wallet can bid. Bids are paid in USDC (gas is ETH), so no buffer is held back.
  const maxBid =
    model.usdcBalance === null ? null : capLeft !== null && capLeft < model.usdcBalance ? capLeft : model.usdcBalance;
  const needsApproval = parsed !== null && model.allowance !== null && parsed > model.allowance;
  const isCreator = model.account !== null && model.account.toLowerCase() === auction.creator.toLowerCase();

  const run = async (action: (onStep: (s: TxStep) => void) => Promise<Hex | undefined>, success: string) => {
    setError(null);
    setDone(null);
    try {
      const hash = await action(setBusy);
      setDone({ text: success, hash });
      return true;
    } catch (err) {
      setError(launchError(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  let body: ReactNode;
  if (!model.account) {
    body = (
      <>
        <p className="text-[13px] text-muted">Connect a wallet on Base Sepolia to bid, settle or claim.</p>
        <button type="button" onClick={model.connect} className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}>
          Connect wallet
        </button>
      </>
    );
  } else if (busy) {
    body = (
      <div className="flex items-start gap-3 py-2">
        <KineticLoader className="mt-1 text-signal" />
        <div>
          <p className="text-[14px] text-chrome">{busy.label}</p>
          {busy.hash && (
            <a href={`${TESTNET_EXPLORER}/tx/${busy.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-muted underline decoration-line-2">
              {short(busy.hash)} on Base Sepolia
            </a>
          )}
        </div>
      </div>
    );
  } else if (phase === "scheduled") {
    body = (
      <p className="text-[13px] leading-relaxed text-muted">
        Deposits open at{" "}
        <span className="text-chrome">{new Date(auction.startTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>. Every
        bid placed in the window clears at the same price.
      </p>
    );
  } else if (phase === "open") {
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed || parsed <= BigInt(0) || overBalance || overCap || !limitPrice || limitError) return;
          void run(
            (s) => model.deposit(parsed!, limitPrice, s),
            `Bid placed: $${fmtUsdc(parsed!)} ${limitOn ? `up to $${limit} per token` : "at any clearing price"}.`,
          ).then((ok) => {
            if (!ok) return;
            setAmount("");
            setLimit("");
            setLimitOn(false);
          });
        }}
      >
        <label htmlFor={`${uid}-amt`} className="text-[12.5px] text-muted">
          Amount
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 focus-within:border-line-2">
          <span className="font-mono text-dim">$</span>
          <input
            id={`${uid}-amt`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full min-w-0 bg-transparent font-mono text-[20px] text-chrome outline-none placeholder:text-dim"
          />
          <button
            type="button"
            disabled={!maxBid}
            onClick={() => maxBid && setAmount(formatUnits(maxBid, USDC_DECIMALS))}
            className="shrink-0 rounded-md border border-line-2 px-2 py-1 text-[11.5px] text-chrome transition-colors hover:border-chrome/50 disabled:opacity-40"
            aria-label={maxBid ? `Bid the maximum, $${fmtUsdc(maxBid)}` : "Bid the maximum"}
          >
            Max
          </button>
          <span className="text-[12px] text-muted">USDC</span>
        </div>
        {capLeft !== null ? (
          <p className={`mt-1.5 text-[11.5px] ${overCap ? "text-down" : "text-dim"}`}>
            Balance {model.usdcBalance !== null ? `$${fmtUsdc(model.usdcBalance)}` : "…"} test USDC · this wallet can deposit{" "}
            {model.myBid.quote > BigInt(0) ? `$${fmtUsdc(capLeft)} more` : `up to $${fmtUsdc(capLeft)}`}.
          </p>
        ) : (
          <p className="mt-1.5 text-[11.5px] text-dim">
            Balance {model.usdcBalance !== null ? `$${fmtUsdc(model.usdcBalance)}` : "…"} test USDC · each wallet gets at most{" "}
            {fmtTokens(auction.maxAllocationPerWallet)} {symbol}; anything beyond that is refunded.
          </p>
        )}

        {/* Advanced: a limit price */}
        <button
          type="button"
          aria-expanded={limitOn}
          onClick={() => setLimitOn((v) => !v)}
          className="mt-5 flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left text-[13px] text-chrome transition-colors hover:border-line-2"
        >
          <span>Limit price {limitOn ? "" : <span className="text-muted">· off, accept any clearing price</span>}</span>
          <span className={`h-4 w-7 rounded-full border transition-colors ${limitOn ? "border-signal/60 bg-signal" : "border-line-2 bg-line"}`} aria-hidden="true" />
        </button>
        {limitOn && (
          <div className="mt-3">
            <label htmlFor={`${uid}-lim`} className="text-[12.5px] text-muted">
              Max price per token
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 focus-within:border-line-2">
              <span className="font-mono text-dim">$</span>
              <input
                id={`${uid}-lim`}
                inputMode="decimal"
                autoComplete="off"
                placeholder={priceUsd(auction.floorPrice * BigInt(2))}
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full min-w-0 bg-transparent font-mono text-[16px] text-chrome outline-none placeholder:text-dim"
              />
            </div>
            <p className={`mt-1.5 text-[11.5px] ${limitError ? "text-down" : "text-dim"}`}>
              {limitError ??
                `If the batch clears above your limit, your whole bid is refunded. Floor $${priceUsd(auction.floorPrice)}.${
                  usesTicks(model.version) ? ` Limits round down to the nearest ${V3_TICK_STEP_PERCENT}% price step.` : ""
                }`}
            </p>
          </div>
        )}

        {model.myBid.quote > BigInt(0) && (
          <p className="mt-4 text-[12px] text-muted">
            Your bid: <span className="font-mono text-chrome">${fmtUsdc(model.myBid.quote)}</span>
            {model.myBid.maxPrice === NO_LIMIT || (model.topTickPrice !== null && model.myBid.maxPrice >= model.topTickPrice)
              ? " at any price"
              : ` up to $${priceUsd(model.myBid.maxPrice)} per token`}
            . Adding to it replaces the limit.
          </p>
        )}

        <button
          type="submit"
          disabled={!parsed || overBalance || overCap || Boolean(limitError) || (limitOn && !limitPrice)}
          className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}
        >
          {overBalance ? "Not enough test USDC" : overCap ? "Over this wallet's cap" : needsApproval ? "Approve & bid" : "Place bid"} <ArrowUpRight />
        </button>
      </form>
    );
  } else if (phase === "closed") {
    body = (
      <>
        <p className="text-[13px] leading-relaxed text-muted">
          The window has closed. Anyone can crank the settlement: it finds the clearing price, seeds the locked pool and pays
          the creator&apos;s {V2_FEE.creatorShareBps / 100}% share of the {V2_FEE.feeBps / 100}% fee.
        </p>
        <button type="button" onClick={() => void run(model.settle, "Settled.")} className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}>
          Settle batch auction <ArrowUpRight />
        </button>
      </>
    );
  } else {
    const has = model.myClaim.tokens > BigInt(0) || model.myClaim.refund > BigInt(0);
    body = has ? (
      <>
        <p className="text-[13px] leading-relaxed text-muted">
          {phase === "cancelled" ? (
            <>The target was missed. You get your full deposit back.</>
          ) : (
            <>
              You secured <span className="font-mono text-chrome">{fmtTokens(model.myClaim.tokens)}</span> {symbol} at{" "}
              <span className="font-mono text-chrome">${priceUsd(auction.clearingPrice)}</span> per token
              {model.myClaim.refund > BigInt(0) && (
                <>
                  , plus <span className="font-mono text-chrome">${fmtUsdc(model.myClaim.refund)}</span> refunded
                </>
              )}
              .
            </>
          )}
        </p>
        <button type="button" onClick={() => void run(model.claim, "Claimed.")} className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}>
          {phase === "cancelled" ? `Claim refund · $${fmtUsdc(model.myClaim.refund)}` : "Claim tokens"} <ArrowUpRight />
        </button>
      </>
    ) : (
      <p className="text-[13px] text-muted">This wallet has nothing to claim in this auction.</p>
    );
  }

  return (
    <section aria-label="Your position" className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <h2 className="text-[15px] font-medium text-chrome">{phase === "open" || phase === "scheduled" ? "Bid" : phase === "closed" ? "Settle" : "Claim"}</h2>
      <p className="mt-1 text-[12px] text-muted">Base Sepolia testnet · test USDC only</p>
      <div className="mt-5">{body}</div>
      {model.account && (phase === "open" || phase === "closed" || phase === "graduated" || phase === "cancelled") && (
        <SmartAccountNote address={model.account} className="mt-4" />
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12.5px] text-down">
          {error}
        </p>
      )}
      {done && !busy && (
        <p role="status" className="mt-4 rounded-lg border border-line-2 px-3 py-2 text-[12.5px] text-chrome">
          {done.text}{" "}
          {done.hash && (
            <a href={`${TESTNET_EXPLORER}/tx/${done.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-muted underline decoration-line-2">
              {short(done.hash)}
            </a>
          )}
        </p>
      )}

      {isCreator && phase === "graduated" && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[13.5px] font-medium text-chrome">Your creator share</h3>
          <p className="mt-1 text-[12px] text-muted">
            {V2_FEE.creatorShareBps / 100}% of the protocol fee was paid to you at graduation.{" "}
            {vestDays === 0 ? "You chose an instant unlock, so the rest is releasable now." : `The rest vests linearly over ${vestDays ?? V2_VESTING_DAYS} days.`}
          </p>
          <p className="mt-3 text-[12.5px] text-muted">
            Releasable now: <span className="font-mono text-chrome">${fmtUsdc(model.creatorVested.quote)}</span> USDC and{" "}
            <span className="font-mono text-chrome">{fmtTokens(model.creatorVested.tokens)}</span> {symbol}
          </p>
          <button
            type="button"
            disabled={model.creatorVested.quote === BigInt(0) && model.creatorVested.tokens === BigInt(0)}
            onClick={() => void run(model.claimVesting, "Vested funds released.")}
            className={buttonClass("outline", "sm", "mt-4 w-full rounded-lg")}
          >
            Release vested funds
          </button>
        </div>
      )}
    </section>
  );
}

