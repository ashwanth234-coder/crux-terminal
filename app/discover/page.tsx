import type { Metadata } from "next";
import { LaunchesFeed } from "@/components/launch/LaunchesFeed";

export const metadata: Metadata = {
  title: "Discover · Crux",
  description: "Crux leaderboards and every token launch on Base Sepolia testnet: top memecoins, smart-money traders, live batch auctions and graduations.",
};

export default function DiscoverPage() {
  return <LaunchesFeed />;
}
