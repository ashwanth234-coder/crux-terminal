import type { Metadata } from "next";
import { V4Create } from "@/components/launch/V4Create";

// Not linked from the nav until the demo is recorded (founder rule): reachable at /launch/new only.
export const metadata: Metadata = { title: "Launch a coin · Crux", description: "Launch a coin on Base from your Crux wallet: a 5afe address, an early buyers' fee and liquidity locked forever.", robots: { index: false } };

export default function LaunchNewPage() {
  return <V4Create />;
}
