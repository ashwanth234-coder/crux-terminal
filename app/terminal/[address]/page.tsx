import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAddress, isAddress } from "viem";
import { Notice } from "@/components/launch/LaunchView";
import { ExternalTerminalRoute } from "@/components/pro/ExternalTerminal";
import { readLaunches } from "@/lib/launchFeed";

export const metadata: Metadata = {
  title: "Terminal · Crux",
  description: "Chart and trade any Base Sepolia token with a Uniswap pool in the Crux Pro terminal.",
};

/** /terminal/0x…: a Crux launch opens its launch terminal; any other token opens on its own Uniswap pool. */
export default function TokenTerminalPage({ params }: { params: Promise<{ address: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) {
    return <Notice title="Not a contract address">That isn&apos;t a 0x… address. Paste a token contract address from Base Sepolia.</Notice>;
  }
  await connection();
  let href: string | null = null;
  try {
    const a = address.toLowerCase();
    const hit = (await readLaunches()).find((l) => l.token.toLowerCase() === a || l.pool?.toLowerCase() === a);
    if (hit) href = `/launch/v${hit.version}/${hit.auctionId}`;
  } catch {
    // The launch feed is unreachable: treat it as an outside token; its pool is found in the browser.
  }
  // Outside the try: redirect() works by throwing.
  if (href) redirect(href);
  return <ExternalTerminalRoute token={getAddress(address)} />;
}
