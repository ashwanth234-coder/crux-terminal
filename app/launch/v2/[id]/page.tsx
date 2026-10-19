import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRouteV2 } from "@/components/launch/LaunchViewV2";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description: "A Crux V2 launch on Base Sepolia testnet: limit-price bids, per-wallet caps and liquidity locked forever on graduation.",
};

export default function LaunchV2Page() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRouteV2 />
    </Suspense>
  );
}
