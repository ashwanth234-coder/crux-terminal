import type { Metadata } from "next";
import { LaunchesFeed } from "@/components/launch/LaunchesFeed";

export const metadata: Metadata = {
  title: "Launches · Crux",
  description: "Every Crux token launch on Base Sepolia testnet: live uniform-price batch auctions, graduations and refunds.",
};

export default function LaunchesPage() {
  return <LaunchesFeed />;
}
