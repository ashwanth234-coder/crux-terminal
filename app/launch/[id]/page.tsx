import { Suspense } from "react";
import type { Metadata } from "next";
import { LaunchRoute } from "@/components/launch/LaunchView";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = {
  title: "Token launch · Crux",
  description: `Uniform-price batch auction for a Crux token launch on ${NETWORK_LONG}.`,
};

export default function LaunchPage() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <LaunchRoute />
    </Suspense>
  );
}
