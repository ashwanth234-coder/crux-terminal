import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAddress } from "viem";
import { Notice } from "@/components/launch/LaunchView";
import { readLaunches } from "@/lib/launchFeed";

export const metadata: Metadata = {
  title: "Token · Crux",
  description: "Open a Crux launch on Base Sepolia testnet by its token or pool contract address.",
};

/** /token/0x…: the launch page for a Crux token (or its pool) address, else the terminal for any other token. */
export default function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) {
    return <Notice title="Not a contract address">That isn&apos;t a 0x… address. Paste a token or pool contract address from Base Sepolia.</Notice>;
  }
  await connection();
  let href: string | null = null;
  try {
    const a = address.toLowerCase();
    const hit = (await readLaunches()).find((l) => l.token.toLowerCase() === a || l.pool?.toLowerCase() === a);
    if (hit) href = `/launch/v${hit.version}/${hit.auctionId}`;
  } catch {
    return <Notice title="Couldn't read Base Sepolia">The chain didn&apos;t answer just now. Reload in a moment.</Notice>;
  }
  // Outside the try: redirect() works by throwing. Any other token opens on its own Uniswap pool.
  redirect(href ?? `/terminal/${address}`);
}
