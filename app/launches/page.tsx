import type { Metadata } from "next";
import { LaunchesFeed } from "@/components/launch/LaunchesFeed";

export const metadata: Metadata = {
  title: "Launches · Crux",
  description: "Every Crux token launch on Base Sepolia testnet: live 60-second uniform-price batches, graduations and refunds.",
};

export default function LaunchesPage() {
  return <LaunchesFeed />;
}
