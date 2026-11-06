import { Suspense } from "react";
import type { Metadata } from "next";
import { V9LaunchRoute } from "@/components/launch/V9Launch";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description:
    "A Crux V9 launch on Base Sepolia testnet (token address ending in 5afe): an optional fair opening at one price, then live trading on its curve, then a Uniswap pool on Base with its liquidity burned.",
};

export default function LaunchV9Page() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <V9LaunchRoute />
    </Suspense>
  );
}
