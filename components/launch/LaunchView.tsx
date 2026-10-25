"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/site/Logo";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { SiteNav } from "@/components/site/SiteNav";
import { TokenSearch } from "@/components/site/TokenSearch";
import { WalletChip } from "@/components/terminal/WalletChip";
import { AccountButton } from "@/components/account/AccountButton";
import { StatusTag } from "@/components/ui/StatusTag";
import { useLiveLaunch, useNow, useSimulatedLaunch, type PreviewParams } from "@/hooks/useLaunchAuction";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { FACTORY } from "@/lib/intents";
import {
  USDC_DECIMALS,
  auctionPhase,
  fmtTokens,
  fmtUsdc,
  formatRemaining,
  impliedMarketCap,
  impliedPrice,
  launchError,
  type AuctionState,
  type LaunchModel,
  type Phase,
  type TxStep,
} from "@/lib/launch";

// ------------------------------------------------------------------ route

function previewParams(q: URLSearchParams): PreviewParams | null {
  const whole = (v: string | null) => (v && /^\d+$/.test(v.replace(/,/g, "")) ? BigInt(v.replace(/,/g, "")) : null);
  const supply = whole(q.get("supply"));
  const target = whole(q.get("target"));
  const window = Number(q.get("window"));
  const start = Number(q.get("start"));
  const symbol = q.get("symbol");
  if (!supply || !target || !symbol || !Number.isFinite(window) || window <= 0 || !Number.isFinite(start) || start <= 0) return null;
  return { name: q.get("name") || symbol, symbol, supply, target, window, start };
}

/** /launch/[id]: an auction on the deployed factory, or /launch/preview for the simulated flow. */
export function LaunchRoute() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();

  if (id === "preview") {
    const params = previewParams(new URLSearchParams(search.toString()));
    return params ? (
      <SimulatedLaunch params={params} />
    ) : (
      <Notice title="This preview link is incomplete">Launch a token to open a fresh simulated auction.</Notice>
    );
  }
  if (!/^\d+$/.test(id)) {
    return <Notice title="That isn't an auction id">Auction ids are whole numbers, starting at 0.</Notice>;
  }
  if (!FACTORY) {
    return (
      <Notice title={`Auction #${id} can't be read here`}>
        This build has no Crux factory configured (NEXT_PUBLIC_CRUX_FACTORY), so only the simulated launch flow is available.
      </Notice>
    );
  }
  return <LiveLaunch factory={FACTORY} id={id} />;
}

function LiveLaunch({ factory, id }: { factory: Address; id: string }) {
  const model = useLiveLaunch(factory, BigInt(id));
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
  return <LaunchView model={model} auction={model.auction} id={id} />;
}

function SimulatedLaunch({ params }: { params: PreviewParams }) {
  const model = useSimulatedLaunch(params);
  return <LaunchView model={model} auction={model.auction!} id="preview" />;
}

// ------------------------------------------------------------------ chrome

/** Page chrome shared by /launch/[id] and /launches. */
export function Shell({ mode, children }: { mode: LaunchModel["mode"] | null; children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-6 sm:gap-10">
            <Link href="/" aria-label="Crux home" className="shrink-0">
              <Logo />
            </Link>
            <nav aria-label="Primary" className="hidden lg:block">
              <SiteNav variant="inline" />
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {mode && (
              <StatusTag
                status={mode === "simulated" ? "demo" : "testnet"}
                label={mode === "simulated" ? "Simulated preview" : "Base Sepolia"}
                className="hidden sm:inline-flex"
              />
            )}
            <TokenSearch className="hidden w-[260px] md:block" />
            <AccountButton />
            <WalletChip variant="header" />
          </div>
        </div>
        {/* Below lg the routes sit on their own slim row, scrolling sideways if they must */}
        <nav aria-label="Primary" className="overflow-x-auto border-t border-line px-4 sm:px-8 lg:hidden">
          <SiteNav variant="inline" />
        </nav>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">{children}</main>
    </div>
  );
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Shell mode={null}>
      <div className="mx-auto max-w-[560px] py-16 text-center">
        <h1 className="font-display-md text-[28px] text-chrome">{title}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">{children}</p>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <LaunchTokenButton className={buttonClass("signal", "md", "font-semibold")} />
          <Link href="/" className={buttonClass("outline", "md")}>
            Back to Crux
          </Link>
        </div>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------- view

const STATUS: Record<Phase, { label: string; live: boolean }> = {
  scheduled: { label: "Scheduled", live: false },
  open: { label: "Deposits open", live: true },
  closed: { label: "Window closed · awaiting settlement", live: false },
  settled: { label: "Settled", live: false },
  graduated: { label: "Graduated", live: false },
  cancelled: { label: "Cancelled · refunds open", live: false },
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="min-w-0 text-[12px] text-muted">{label}</dt>
      <dd className="shrink-0 text-right font-mono text-[12.5px] text-chrome">{children}</dd>
    </div>
  );
}

function Bar({ value, className = "bg-signal" }: { value: number; className?: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${className}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

function LaunchView({ model, auction, id }: { model: LaunchModel; auction: AuctionState; id: string }) {
  const now = useNow();
  const phase = now === null ? "open" : auctionPhase(auction, now);
  const closesAt = auction.startTime + auction.batchWindow;
  const left = now === null ? auction.batchWindow : Math.max(0, closesAt - now);
  const raised = auction.graduationTarget > BigInt(0) ? Number((auction.totalDeposits * BigInt(10000)) / auction.graduationTarget) / 10_000 : 0;
  const symbol = model.symbol ? `$${model.symbol}` : "tokens";
  const simulated = model.mode === "simulated";
  const status = STATUS[phase];
  // Same formula as the contract's clearingPrice, at more precision for sub-cent prices.
  const price = impliedPrice(auction.totalDeposits, model.saleSupply);

  return (
    <Shell mode={model.mode}>
      {simulated && (
        <p className="mb-6 rounded-xl border border-line-2 bg-void/60 px-4 py-3 text-[12.5px] leading-snug text-muted">
          <span className="text-chrome">Simulated.</span> Nothing on this page is on-chain: deposits, settlement and claims run in your
          browser against the CruxFactory rules, with a simulated 100,000 USDC balance.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display-md text-[clamp(2rem,5vw,3.4rem)] leading-[0.95] text-chrome">
            {model.symbol ? `$${model.symbol}` : "Token launch"}
            {model.name && <span className="text-steel"> {model.name}</span>}
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {simulated ? "Simulated auction" : <>Auction <span className="font-mono">#{id}</span> on Base Sepolia</>} · Graduates at{" "}
            <span className="font-mono tabular-nums text-chrome">${fmtUsdc(auction.graduationTarget)}</span> {simulated ? "simulated USDC" : "test USDC"}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${
            status.live ? "border-signal/40 text-chrome" : phase === "cancelled" ? "border-down/40 text-chrome" : "border-line-2 text-chrome"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.live ? "bg-signal" : phase === "cancelled" ? "bg-down" : phase === "graduated" ? "bg-signal" : "bg-dim"}`}
            aria-hidden="true"
          />
          {status.label}
          {simulated && <span className="text-dim">· simulated</span>}
        </span>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Instrument: clock, raise, price */}
        <section aria-label="Auction" className="panel-sheen rounded-2xl border border-line p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-muted">{phase === "open" ? "Window closes in" : "Window"}</p>
              <p role="timer" aria-live="off" className="mt-2 font-mono text-[44px] leading-none tabular-nums text-chrome">
                {phase === "open" ? formatRemaining(left) : "Closed"}
              </p>
            </div>
            <p className="pb-1 text-right text-[11.5px] text-dim">
              {auction.batchWindow >= 3600 ? `${auction.batchWindow / 3600}-hour pro-rata sale` : `${auction.batchWindow}s uniform batch`}
            </p>
          </div>
          <div className="mt-4">
            <Bar value={phase === "open" ? 1 - left / auction.batchWindow : 1} className={phase === "open" ? "bg-chrome/60" : "bg-line-2"} />
          </div>
          {/* The guarantee, in one line */}
          <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-muted">
            <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true">
              <path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4l5-2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="m5.6 8 1.7 1.7 3.1-3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              <span className="text-chrome">No front-running inside the batch.</span> Every deposit in the window clears at one price.
              Arriving first buys nothing.
            </span>
          </p>

          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[12px] text-muted">Deposits vs graduation target</p>
              <p className="font-mono text-[12px] tabular-nums text-muted">{(raised * 100).toFixed(1)}%</p>
            </div>
            <p className="mt-2 font-mono text-[22px] tabular-nums text-chrome">
              ${fmtUsdc(auction.totalDeposits)} <span className="text-[14px] text-dim">/ ${fmtUsdc(auction.graduationTarget)} USDC</span>
            </p>
            <div className="mt-3">
              <Bar value={raised} className={phase === "cancelled" ? "bg-down/70" : "bg-signal"} />
            </div>
          </div>

          <dl className="mt-6 divide-y divide-line border-t border-line">
            <Row label={phase === "graduated" || phase === "cancelled" ? "Clearing price" : "Clearing price so far"}>
              {phase === "cancelled" ? "None: target missed" : price ? `$${price} per token` : "—"}
            </Row>
            <Row label="Market cap at this price">{phase === "cancelled" ? "—" : (impliedMarketCap(auction.totalDeposits) ?? "—")}</Row>
            <Row label="On sale (80% of supply)">{model.saleSupply !== null ? `${fmtTokens(model.saleSupply)} ${symbol}` : "—"}</Row>
            <Row label="Token">
              {simulated ? (
                "Not deployed (simulated)"
              ) : (
                <a href={`${TESTNET_EXPLORER}/token/${auction.token}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 hover:text-bright">
                  {short(auction.token)} ↗
                </a>
              )}
            </Row>
            {!simulated && <Row label="Creator">{short(auction.creator)}</Row>}
          </dl>
          <p className="mt-4 text-[11.5px] leading-snug text-dim">
            Price = total deposits ÷ tokens on sale. If the target is missed, every deposit is refunded exactly.
          </p>
        </section>

        <ActionPanel model={model} auction={auction} phase={phase} symbol={symbol} />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- actions

type Busy = TxStep | null;

function TxLink({ hash }: { hash: Hex }) {
  return (
    <a
      href={`${TESTNET_EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all font-mono text-[11px] text-muted underline decoration-line-2 hover:text-chrome"
    >
      {short(hash)} on Base Sepolia ↗
    </a>
  );
}

function ActionPanel({ model, auction, phase, symbol }: { model: LaunchModel; auction: AuctionState; phase: Phase; symbol: string }) {
  const uid = useId();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash?: Hex } | null>(null);
  const [claimed, setClaimed] = useState(false);
  const simulated = model.mode === "simulated";
  const unit = simulated ? "simulated USDC" : "test USDC";

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseUnits(amount, USDC_DECIMALS) : null;
  } catch {
    parsed = null;
  }
  const overBalance = parsed !== null && model.usdcBalance !== null && parsed > model.usdcBalance;
  const needsApproval = parsed !== null && model.allowance !== null && parsed > model.allowance;
  const share = auction.totalDeposits > BigInt(0) ? Number((model.myDeposit * BigInt(10000)) / auction.totalDeposits) / 100 : 0;
  // Exact uniform price; the contract's integer clearingPrice rounds to 0 for sub-cent tokens.
  const clearing = impliedPrice(auction.totalDeposits, model.saleSupply);

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

  const position = (
    <dl className="mt-5 divide-y divide-line border-y border-line">
      <Row label="Your deposit">${fmtUsdc(model.myDeposit)}</Row>
      <Row label={phase === "graduated" ? "Your tokens to claim" : "Your allocation if it graduates now"}>
        {fmtTokens(model.allocation)} {symbol}
      </Row>
      <Row label="Your share of the sale">{share.toFixed(2)}%</Row>
    </dl>
  );

  let body: ReactNode;
  if (busy) {
    body = (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <KineticLoader className="h-5 text-signal" />
        <p className="text-[14px] text-chrome">{busy.label}</p>
        {busy.hash && <TxLink hash={busy.hash} />}
      </div>
    );
  } else if (!model.account) {
    body = (
      <>
        <p className="text-[13px] leading-relaxed text-muted">Connect a wallet on Base Sepolia to deposit, settle or claim.</p>
        <button type="button" onClick={model.connect} className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}>
          Connect wallet
        </button>
      </>
    );
  } else if (phase === "open") {
    body = (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed === null || parsed === BigInt(0)) {
            setError("Enter an amount above zero.");
            return;
          }
          if (overBalance) return;
          const value = parsed;
          void run((onStep) => model.deposit(value, onStep), `Deposited $${fmtUsdc(value)} into the batch.`).then((ok) => ok && setAmount(""));
        }}
      >
        <label htmlFor={uid} className="block text-[12px] text-chrome/85">
          Amount
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[15px] text-dim">$</span>
          <input
            id={uid}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            aria-invalid={overBalance}
            aria-describedby={`${uid}-msg`}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
            className="w-full rounded-lg border border-line bg-void/60 py-3 pl-7 pr-28 font-mono text-[16px] text-chrome outline-none placeholder:text-dim focus:border-signal/60 aria-[invalid=true]:border-down/60"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <span className="text-[12px] text-dim">USDC</span>
            {model.usdcBalance !== null && model.usdcBalance > BigInt(0) && (
              <button
                type="button"
                onClick={() => setAmount(formatUnits(model.usdcBalance!, USDC_DECIMALS))}
                className="rounded-full border border-line-2 px-2 py-0.5 text-[11px] text-muted hover:border-chrome/40 hover:text-chrome"
              >
                Max
              </button>
            )}
          </span>
        </div>
        <p id={`${uid}-msg`} className={`mt-1.5 text-[11.5px] ${overBalance ? "text-down" : "text-dim"}`}>
          {overBalance ? "More than your balance. " : ""}
          Balance {model.usdcBalance !== null ? `$${fmtUsdc(model.usdcBalance)}` : "—"} {unit}
          {model.allowance !== null && ` · approved $${fmtUsdc(model.allowance)}`}
        </p>
        {!simulated && model.usdcBalance === BigInt(0) && (
          <p className="mt-1.5 text-[11.5px] text-dim">
            Get free test USDC at{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-chrome/80 underline decoration-line-2">
              faucet.circle.com ↗
            </a>
          </p>
        )}

        <button type="submit" disabled={overBalance} className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}>
          {needsApproval ? "Approve & deposit" : "Deposit"} <ArrowUpRight />
        </button>
        <p className="mt-2 text-center text-[11.5px] text-dim">
          {needsApproval
            ? `Approves exactly $${amount} for the factory, then deposits: two ${simulated ? "simulated steps" : "wallet prompts"}.`
            : "Deposits are sealed until the window closes."}
        </p>
        {position}
      </form>
    );
  } else if (phase === "closed") {
    const willGraduate = auction.totalDeposits > BigInt(0) && auction.totalDeposits >= auction.graduationTarget;
    body = (
      <>
        <p className="text-[13px] leading-relaxed text-muted">
          The window has closed. Anyone can crank the settlement to finalize the clearing price and distribute tokens.{" "}
          <span className="text-chrome">
            {willGraduate ? "Target met: settling graduates the token." : "Target missed: settling cancels the launch and opens exact refunds."}
          </span>
        </p>
        <button
          type="button"
          onClick={() => void run(model.settle, willGraduate ? "Settled: the token graduated." : "Settled: the launch was cancelled.")}
          className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}
        >
          Settle auction <ArrowUpRight />
        </button>
        {position}
      </>
    );
  } else if (phase === "graduated" || phase === "cancelled") {
    const refund = phase === "cancelled";
    body =
      model.myDeposit > BigInt(0) ? (
        <>
          <p className="text-[13px] leading-relaxed text-muted">
            {refund ? (
              <>
                The target was missed. <span className="text-chrome">You get a refund</span> of your full ${fmtUsdc(model.myDeposit)} {unit}.
              </>
            ) : (
              <>
                The launch graduated. You secured <span className="text-chrome">{fmtTokens(model.allocation)} {symbol}</span>
                {clearing ? (
                  <>
                    {" "}at <span className="font-mono tabular-nums text-chrome">${clearing}</span> USDC per token, the same price as every other buyer.
                  </>
                ) : (
                  " at the uniform clearing price."
                )}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() =>
              void run(
                model.claim,
                refund ? `Refunded $${fmtUsdc(model.myDeposit)} ${unit}.` : `Claimed ${fmtTokens(model.allocation)} ${symbol}.`,
              ).then(setClaimed)
            }
            className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold")}
          >
            {refund ? `Claim refund · $${fmtUsdc(model.myDeposit)}` : `Claim ${fmtTokens(model.allocation)} ${symbol}`} <ArrowUpRight />
          </button>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted">
          {claimed ? "Nothing left to claim from this wallet." : "This wallet has no deposit to claim in this auction."}
        </p>
      );
  } else {
    body = <p className="text-[13px] leading-relaxed text-muted">This auction is settled.</p>;
  }

  const heading: Record<Phase, string> = {
    scheduled: "Deposit",
    open: "Deposit",
    closed: "Settle",
    settled: "Settled",
    graduated: "Claim tokens",
    cancelled: "Claim refund",
  };

  return (
    <section aria-label="Your position" className="panel-sheen rounded-2xl border border-line p-5 sm:p-6">
      <h2 className="font-display-md text-[22px] text-chrome">{heading[phase]}</h2>
      <p className="mb-5 mt-1 text-[12px] text-dim">{simulated ? "Simulated · no wallet needed" : "Base Sepolia testnet · test USDC only"}</p>
      {body}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
          {error}
        </p>
      )}
      {done && !busy && (
        <p role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-signal/30 bg-signal/[0.06] px-3 py-2 text-[12px] text-chrome">
          {done.text}
          {done.hash && <TxLink hash={done.hash} />}
        </p>
      )}
    </section>
  );
}
