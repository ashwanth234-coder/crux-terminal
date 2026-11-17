import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { BnbCoinPage } from "@/components/bnb/BnbCoinPage";

export const metadata: Metadata = {
  title: "BNB Chain coin · Crux",
  description: "Buy and sell this BNB Chain coin from your one Crux account. No BNB needed, no bridging.",
};

/** /bnb/<address>: a BNB Chain coin's page (chart and Buy/Sell from the one Crux account). */
export default function BnbCoin({ params }: { params: Promise<{ address: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  return <BnbCoinPage address={address} />;
}
