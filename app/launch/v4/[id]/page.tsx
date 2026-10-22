import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRouteV2 } from "@/components/launch/LaunchViewV2";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description:
    "A Crux V4 launch on Base Sepolia testnet: limit-price bids on 1% price steps, per-wallet caps, liquidity locked forever on graduation, and the creator's vesting shown up front.",
};

export default function LaunchV4Page() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRouteV2 version={4} />
    </Suspense>
  );
}
