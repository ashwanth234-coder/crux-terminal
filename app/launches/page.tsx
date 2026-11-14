import type { Metadata } from "next";
import { LaunchesFeed } from "@/components/launch/LaunchesFeed";
import { TokenList } from "@/components/launch/TokenList";
import { V9_ON } from "@/lib/v9";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = {
  title: "Launches · Crux",
  description: `Every Crux token launch on ${NETWORK_LONG}: live uniform-price batch auctions, graduations and refunds.`,
};

export default function LaunchesPage() {
  return V9_ON ? <TokenList /> : <LaunchesFeed />;
}
