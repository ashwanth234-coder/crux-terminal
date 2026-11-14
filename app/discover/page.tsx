import type { Metadata } from "next";
import { LaunchesFeed } from "@/components/launch/LaunchesFeed";
import { TokenList } from "@/components/launch/TokenList";
import { V9_ON } from "@/lib/v9";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = {
  title: "Discover · Crux",
  description: `Every token launched on Crux on ${NETWORK_LONG}: on its curve, in its fair opening, or trading on Uniswap.`,
};

export default function DiscoverPage() {
  return V9_ON ? <TokenList /> : <LaunchesFeed />;
}
