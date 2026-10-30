"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { useAllLaunches, type LaunchSummary } from "@/hooks/useLaunches";
import { useNow } from "@/hooks/useLaunchAuction";
import { FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7 } from "@/lib/intents";
import { fmtUsdc, type Phase } from "@/lib/launch";
import { describeLaunch } from "@/lib/launchSummary";
import { CruxMark } from "./Logo";
import { Chapter } from "./Chapter";

const SHOWN = 6;

const PHASE: Record<Phase, { label: string; tone: string }> = {
  scheduled: { label: "Scheduled", tone: "text-chrome/80" },
  open: { label: "Bidding open", tone: "text-chrome" },
  closed: { label: "Awaiting settlement", tone: "text-chrome/80" },
  settled: { label: "Settled", tone: "text-chrome/80" },
  graduated: { label: "Graduated", tone: "text-chrome" },
  cancelled: { label: "Cancelled · refunds", tone: "text-dim" },
};

function Status({ phase }: { phase: Phase }) {
  if (phase === "open") return <StatusTag status="live" label="Bidding open" />;
  const p = PHASE[phase];
  return (
    <span className={`inline-flex items-center gap-2 text-[12.5px] ${p.tone}`}>
      <span className={`h-[5px] w-[5px] rounded-full ${phase === "graduated" ? "bg-chrome" : phase === "cancelled" ? "border border-dim" : "bg-muted"}`} aria-hidden="true" />
      {p.label}
    </span>
  );
}

function Row({ launch, now }: { launch: LaunchSummary; now: number | null }) {
  const d = describeLaunch(launch, now);
  const a = launch.auction;
  const ticker = launch.symbol ? `$${launch.symbol}` : `Auction #${launch.id}`;
  return (
    <tr className="group relative border-b border-line transition-colors duration-200 hover:bg-tint/[0.02]">
      <td className="py-4 pl-1 pr-4">
        <Link href={launch.href} className="block after:absolute after:inset-0 after:content-['']">
          <span className="block text-[15px] font-medium text-chrome">{ticker}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted">
            {launch.name ?? "Unnamed token"} <span className="font-mono text-dim">· V{launch.version} #{launch.id}</span>
          </span>
        </Link>
      </td>
      <td className="py-4 pr-4">
        <Status phase={d.phase} />
      </td>
      <td className="py-4 pr-4 text-right">
        <span className="block font-mono text-[13.5px] text-chrome">{d.phase === "cancelled" || !d.price ? "—" : d.price}</span>
        <span className="mt-0.5 block text-[11.5px] text-dim">{d.phase === "cancelled" ? "No price" : d.priceLabel}</span>
      </td>
      <td className="hidden py-4 pr-4 text-right sm:table-cell">
        <span className="block font-mono text-[13.5px] text-chrome">${fmtUsdc(a.totalDeposits)}</span>
        <span className="mt-0.5 block font-mono text-[11.5px] text-dim">of ${fmtUsdc(a.graduationTarget)}</span>
      </td>
      <td className="w-8 py-4 pr-1 text-right text-muted transition-colors group-hover:text-chrome">
        <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
      </td>
    </tr>
  );
}

function Empty({ title, body, action = false }: { title: string; body: string; action?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-6 border-y border-line py-14 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-5">
        <CruxMark className="mt-1 h-6 w-6 shrink-0 text-line-2" />
        <div>
          <p className="font-display-md text-[24px] text-chrome">{title}</p>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>
      {action && <LaunchTokenButton className={buttonClass("outline", "sm")} label="Launch a token" />}
    </div>
  );
}

/** The real launch list from the deployed factories, newest and open first. */
export function Discover() {
  const now = useNow();
  const configured = Boolean(FACTORY || FACTORY_V2 || FACTORY_V3 || FACTORY_V4 || FACTORY_V5);
  const { total, launches, loading, error } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7);
  const rows = launches
    .map((launch) => ({ launch, open: describeLaunch(launch, now).phase === "open" }))
    .sort((a, b) => Number(b.open) - Number(a.open))
    .slice(0, SHOWN);

  return (
    <Chapter
      id="discover"
      title="Live markets."
      intro="Every Crux launch, read from Base Sepolia as you look."
    >
      {!configured ? (
        <Empty title="No factory configured." body="This build has no Crux factory address, so there are no on-chain launches to list." />
      ) : loading ? (
        <ul aria-busy="true" aria-label="Reading launches from Base Sepolia" className="border-t border-line">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center justify-between gap-6 border-b border-line py-5">
              <span className="space-y-2">
                <span className="block h-3.5 w-24 rounded-sm bg-line" />
                <span className="block h-2.5 w-40 rounded-sm bg-line/60" />
              </span>
              <span className="h-3 w-20 rounded-sm bg-line/60" />
            </li>
          ))}
        </ul>
      ) : error && launches.length === 0 ? (
        <Empty title="Base Sepolia is not answering." body="The launch list could not be read. It retries on its own every few seconds." />
      ) : launches.length === 0 ? (
        <Empty title="No markets yet." body="Launch a token to open the first uniform-price batch auction." action />
      ) : (
        <>
          <table className="w-full table-fixed border-t border-line text-left">
            <caption className="sr-only">Newest Crux launches on Base Sepolia testnet</caption>
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
                <th scope="col" className="w-[44%] py-3 pl-1 pr-4 font-normal sm:w-[34%] md:w-[30%]">Token</th>
                <th scope="col" className="py-3 pr-4 font-normal">Status</th>
                <th scope="col" className="py-3 pr-4 text-right font-normal">Price</th>
                <th scope="col" className="hidden py-3 pr-4 text-right font-normal sm:table-cell">Raised</th>
                <th scope="col" className="w-8 py-3 pr-1 font-normal">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ launch }) => (
                <Row key={`${launch.version}-${launch.id}`} launch={launch} now={now} />
              ))}
            </tbody>
          </table>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[12px] text-muted">
              Showing {rows.length} of {total}. Prices are testnet USDC.
            </p>
            <Link href="/launches" className="group inline-flex items-center gap-2 text-[13px] font-medium text-chrome hover:text-chrome/80">
              All launches <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </>
      )}
    </Chapter>
  );
}
