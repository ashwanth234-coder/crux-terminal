import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { BaseCoinPage } from "@/components/base/BaseCoinPage";

export const metadata: Metadata = {
  title: "Base coin · Crux",
  description: "Buy and sell this Base coin from your one Crux account. No ETH needed, no bridging.",
};

/** /base/<address>: a Base coin's page (chart and Buy/Sell from the one Crux account). */
export default function BaseCoin({ params }: { params: Promise<{ address: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  return <BaseCoinPage address={address} />;
}
