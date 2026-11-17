import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SolanaCoinPage } from "@/components/solana/SolanaCoinPage";
import { isSolanaAddress } from "@/lib/solanaCoins";

export const metadata: Metadata = {
  title: "Solana coin · Crux",
  description: "Buy and sell this Solana coin from your one Crux account. No SOL, no bridging.",
};

/** /sol/<mint>: a Solana coin's page (chart and Buy/Sell from the one Crux account). */
export default function SolanaCoin({ params }: { params: Promise<{ mint: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!isSolanaAddress(mint)) notFound();
  return <SolanaCoinPage mint={mint} />;
}
