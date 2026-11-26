"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, http, type Address } from "viem";
import { base } from "viem/chains";
import { BASE_RPCS, NETWORK } from "@/lib/network";
import { earlyFeeNote, readV4Launch } from "@/lib/v4launch";

const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });

/**
 * A Crux V4 coin's early fee while its window is on (the buy panel warns about it, and a buyer ticks it before
 * buying), counted down each second; null once it's over and for any other coin. Shares its read with the coin's
 * launch card.
 */
export function useEarlyFee(address: string): { bps: number; left: number; text: string } | null {
  const q = useQuery({
    queryKey: ["v4-launch", address],
    queryFn: () => readV4Launch(client, address as Address),
    enabled: !NETWORK.testnet,
    refetchInterval: 15_000,
  });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const l = q.data;
  const live = !!l && l.windowSec > 0 && l.launchedAt + l.windowSec > now;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [live]);
  return l ? earlyFeeNote(l, now) : null;
}
