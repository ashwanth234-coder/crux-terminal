import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { ShowcasePage } from "@/components/coin/ShowcasePage";

export const metadata: Metadata = {
  title: "Showcase · Crux",
  description: "One Crux coin, one Base pool, tradeable on Base, Solana and BNB Chain at once.",
};

/** /showcase/<base coin>: the Layer 2 mirror showcase on Base mainnet. */
export default function Showcase({ params }: { params: Promise<{ coin: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ coin: string }> }) {
  const { coin } = await params;
  if (!isAddress(coin, { strict: false })) notFound();
  return <ShowcasePage coin={coin} />;
}
