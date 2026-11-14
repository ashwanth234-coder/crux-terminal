import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRouteV2 } from "@/components/launch/LaunchViewV2";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description:
    `A Crux V8 launch on ${NETWORK_LONG} (token address ending in 5afe): a fair batch auction, then a short window (15 minutes by default) of on-chain 60-second batches at one uniform price (nothing to snipe), then a locked Uniswap pool.`,
};

export default function LaunchV8Page() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRouteV2 version={8} />
    </Suspense>
  );
}
