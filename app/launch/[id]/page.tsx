import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRoute } from "@/components/launch/LaunchView";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description: "Uniform-price batch auction for a Crux token launch on Base Sepolia testnet.",
};

export default function LaunchPage() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRoute />
    </Suspense>
  );
}
