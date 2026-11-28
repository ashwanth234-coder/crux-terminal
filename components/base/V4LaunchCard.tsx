"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, http, type Address } from "viem";
import { base } from "viem/chains";
import { BASE_RPCS, NETWORK } from "@/lib/network";
import { V4Receipt } from "@/components/base/V4Receipt";
import { feeAt, fmtQuote, quoteOf, readV4Launch, rulesText } from "@/lib/v4launch";

const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });
// The same Base reads typed without the chain's own transaction formatters (V4Receipt only reads contracts, logs and blocks).
const receiptClient = client as unknown as ComponentProps<typeof V4Receipt>["client"];

function fmtFee(bps: number): string {
  return bps >= 100 ? `${Math.round(bps / 100)}%` : `${(bps / 100).toFixed(1)}%`;
}

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** A Crux coin's launch rules, plain: the early buyers' fee (live), the locked floor and holders' share. Nothing for other coins. */
export function V4LaunchCard({ address }: { address: string }) {
  const enabled = !NETWORK.testnet;
  const q = useQuery({
    queryKey: ["v4-launch", address],
    queryFn: () => readV4Launch(client, address as Address),
    enabled,
    refetchInterval: 15_000,
  });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const l = q.data;
  const rules = useMemo(() => (l ? rulesText(l) : []), [l]);
  if (!l) return null;
  const eth = (v: bigint) => fmtQuote(v, quoteOf(l));
  const left = l.launchedAt + l.windowSec - now;
  const live = l.windowSec > 0 && left > 0;
  return (
    <section aria-label="Launch rules" className="mb-3 rounded-xl border border-line p-4">
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-dim">Launch rules{quoteOf(l) === "USDC" ? " · dollar coin" : ""}</p>
      <p className="mt-1.5 text-[12.5px] text-chrome">{rules.join(" ")}</p>
      <div className="mt-2 space-y-1 font-mono text-[11.5px]">
        {l.windowSec > 0 && (
          <p>
            {live ? `Early fee now: ${fmtFee(feeAt(l, now))} · ${clock(left)} left` : "Early fee: over, the normal 1% applies"}
          </p>
        )}
        {l.toLiquidityBps > 0 && (
          <p>
            {l.floorsPlaced > 0 ? "Locked floor: added" : "Locked floor: not added yet. It's added after the early fee ends."}
            {l.floorEth > BigInt(0) ? ` · ${eth(l.floorEth)} waiting to be added` : ""}
          </p>
        )}
        {l.toHoldersBps > 0 && (
          <p>
            Holders&rsquo; share: {eth(l.reward.posted ? l.reward.pot : l.holdersEth)}
            {!l.reward.posted ? " (paid to holders after 24 hours)" : l.reward.swept || (l.reward.pot > BigInt(0) && l.reward.claimed >= l.reward.pot) ? " · paid out" : " · being paid to holders"}
          </p>
        )}
      </div>
      {/* Anyone paid by this coin (a holder from the share, or the creator from theirs) can look up their receipt. */}
      {(l.toHoldersBps > 0 || l.toCreatorBps > 0) && (
        <div className="mt-3">
          <V4Receipt address={address} launch={l} client={receiptClient} />
        </div>
      )}
    </section>
  );
}
