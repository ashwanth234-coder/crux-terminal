import type { Metadata } from "next";
import { V9Create } from "@/components/launch/V9Create";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = { title: "Launch a token · Crux", description: `Launch a token on a Crux curve on ${NETWORK_LONG}: free, 5afe address, optional fair opening, graduation into a Uniswap pool on Base.` };

export default function LaunchV9NewPage() {
  return <V9Create />;
}
