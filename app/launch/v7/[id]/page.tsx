import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRouteV2 } from "@/components/launch/LaunchViewV2";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description:
    "A Crux V7 launch on Base Sepolia testnet: a fair batch auction, then a short window (15 minutes by default) of on-chain 60-second batches at one uniform price (nothing to snipe), then a locked Uniswap pool.",
};

export default function LaunchV7Page() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRouteV2 version={7} />
    </Suspense>
  );
}
