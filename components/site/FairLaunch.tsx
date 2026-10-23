"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatUnits } from "viem";
import { ArrowUpRight } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { useAllLaunches, type LaunchSummary } from "@/hooks/useLaunches";
import { useNow } from "@/hooks/useLaunchAuction";
import { FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5 } from "@/lib/intents";
import { fmtUsdc, type Phase } from "@/lib/launch";
import { describeLaunch } from "@/lib/launchSummary";
import { V2_SPLIT, V3_TICK_STEP_PERCENT, priceUsd } from "@/lib/launchV2";
import { Chapter } from "./Chapter";

// CruxFactoryV2/V3: what one batch does, in the order the contract does it.
const STEPS = [
  {
    title: "Bid with a limit",
    body: `Deposit test USDC with the highest price you will pay. On V3, limits sit on a grid ${V3_TICK_STEP_PERCENT}% apart and each wallet has a cap.`,
  },
  {
    title: "The window closes",
    body: "Deposits stop at the scheduled close. After that anyone can settle the batch; no one chooses who goes first.",
  },
  {
    title: "One clearing price",
    body: "Settlement finds the highest price at which the bids at or above it buy the whole sale. Below the floor, the launch cancels and everyone is refunded.",
  },
  {
    title: "Allocate and seed",
    body: "Every filled bid pays that same price; the marginal step fills pro rata and unspent USDC is refunded. 30% of supply and half the raise seed the locked pool.",
  },
];

const PHASE_LABEL: Record<Phase, string> = {
  scheduled: "Scheduled",
  open: "Bidding open",
  closed: "Window closed · awaiting settlement",
  settled: "Settled",
  graduated: "Graduated",
  cancelled: "Cancelled · refunds open",
};

const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const tokens = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[13px] text-chrome">{children}</dd>
    </div>
  );
}

/** The newest batch auction, as the factory reports it. Times are the contract's own; there is no countdown. */
function Latest({ launch, now }: { launch: LaunchSummary; now: number | null }) {
  const d = describeLaunch(launch, now);
  const a = launch.auction;
  const v = launch.v2;
  const opens = new Date(a.startTime * 1000);
  const closes = new Date((a.startTime + a.batchWindow) * 1000);
  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <Link href={launch.href} className="group inline-flex items-baseline gap-2 text-[15px] font-medium text-chrome hover:text-signal">
          {launch.symbol ? `$${launch.symbol}` : `Auction #${launch.id}`}
          <span className="font-mono text-[12px] font-normal text-dim">
            V{launch.version} #{launch.id}
          </span>
          <ArrowUpRight className="h-3 w-3 self-center" />
        </Link>
        {d.phase === "open" ? <StatusTag status="live" label="Bidding open" /> : <StatusTag status="testnet" />}
      </div>
      <dl>
        <Fact label="Status">
          <span className="font-sans">{PHASE_LABEL[d.phase]}</span>
        </Fact>
        <Fact label="Window">
          {now === null ? "—" : `${when.format(opens)} → ${when.format(closes)}`}
        </Fact>
        <Fact label="Allocation">
          {launch.saleSupply ? `${tokens.format(Number(formatUnits(launch.saleSupply, 18)))} tokens` : "—"}
          <span className="text-dim"> · {launch.version === 1 ? "80%" : `${V2_SPLIT.saleBps / 100}%`} of supply</span>
        </Fact>
        <Fact label="Raised">
          ${fmtUsdc(a.totalDeposits)} <span className="text-dim">/ ${fmtUsdc(a.graduationTarget)}</span>
        </Fact>
        {v && <Fact label="Bidders">{v.bidderCount}</Fact>}
        <Fact label={d.phase === "cancelled" ? "Clearing price" : d.priceLabel}>
          {d.phase === "cancelled" ? "None: below the floor" : (d.price ?? "No bids yet")}
        </Fact>
        {v && d.phase === "graduated" && <Fact label="Floor price">${priceUsd(v.floorPrice)}</Fact>}
      </dl>
    </div>
  );
}

/** 02 Fair launch: the uniform-price batch auction as implemented, and the newest real one. */
export function FairLaunch() {
  const now = useNow();
  const configured = Boolean(FACTORY || FACTORY_V2 || FACTORY_V3 || FACTORY_V4 || FACTORY_V5);
  const { launches, loading, error } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5);
  const latest = launches[0];

  return (
    <Chapter
      id="protocol"
      index="02"
      name="Fair launch"
      title={
        <>
          One auction.
          <br />
          One clearing price.
        </>
      }
      intro="Bids gather in one window and clear together at one uniform price, so arriving first inside the window buys nothing. It removes ordering games within the batch; it does not make settlement or the pool afterwards immune to MEV."
    >
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <ol className="grid gap-px overflow-hidden border-y border-line bg-line sm:grid-cols-2 lg:col-span-7">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-void py-6 sm:p-6">
              <p className="font-mono text-[11px] tracking-[0.18em] text-dim">
                <span className={i === 2 ? "text-signal" : ""}>0{i + 1}</span>
              </p>
              <h3 className="mt-3 text-[16px] font-medium text-chrome">{s.title}</h3>
              <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="lg:col-span-4 lg:col-start-9">
          <p className="label-mono mb-5">Newest auction</p>
          {!configured ? (
            <p className="text-[13.5px] text-muted">No factory is configured for this build.</p>
          ) : loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Reading the newest auction">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="block h-4 rounded-sm bg-line/60" />
              ))}
            </div>
          ) : error && !latest ? (
            <p role="status" className="text-[13.5px] text-muted">
              Couldn&apos;t reach Base Sepolia. Retrying shortly.
            </p>
          ) : !latest ? (
            <p className="text-[13.5px] text-muted">No auctions yet. The first launch will appear here.</p>
          ) : (
            <Latest launch={latest} now={now} />
          )}
        </div>
      </div>
    </Chapter>
  );
}
