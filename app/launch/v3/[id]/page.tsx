import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRouteV2 } from "@/components/launch/LaunchViewV2";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description:
    `A Crux V3 launch on ${NETWORK_LONG}: limit-price bids on 1% price steps, per-wallet caps, no bidder limit and liquidity locked forever on graduation.`,
};

export default function LaunchV3Page() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRouteV2 version={3} />
    </Suspense>
  );
}
