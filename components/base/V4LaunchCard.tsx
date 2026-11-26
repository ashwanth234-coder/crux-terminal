"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, formatEther, http, type Address } from "viem";
import { base } from "viem/chains";
import { BASE_RPCS, NETWORK } from "@/lib/network";
import { feeAt, readV4Launch, rulesText } from "@/lib/v4launch";

const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });

function eth(v: bigint): string {
  const n = Number(formatEther(v));
  return `${n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toFixed(4).replace(/\.?0+$/, "")} ETH`;
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
  const left = l.launchedAt + l.windowSec - now;
  const live = l.windowSec > 0 && left > 0;
  return (
    <section aria-label="Launch rules" className="mb-3 rounded-xl border border-line p-4">
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-dim">Launch rules</p>
      <p className="mt-1.5 text-[12.5px] text-chrome">{rules.join(" ")}</p>
      <div className="mt-2 space-y-1 font-mono text-[11.5px]">
        {l.windowSec > 0 && (
          <p>
            {live ? `Early fee now: ${(feeAt(l, now) / 100).toFixed(0)}% · ${clock(left)} left` : "Early fee: over, the normal 1% applies"}
          </p>
        )}
        {l.toLiquidityBps > 0 && (
          <p>
            Locked floor: {l.floorsPlaced > 0 ? "placed" : "not yet"}
            {l.floorEth > BigInt(0) ? ` · ${eth(l.floorEth)} waiting to be added` : ""}
          </p>
        )}
        {l.toHoldersBps > 0 && <p>Holders&rsquo; share: {eth(l.holdersEth)} (paid to holders after 24 hours)</p>}
      </div>
    </section>
  );
}
