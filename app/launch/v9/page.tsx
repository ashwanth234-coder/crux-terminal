import type { Metadata } from "next";
import { V9List } from "@/components/launch/V9Create";

export const metadata: Metadata = { title: "V9 launches · Crux", description: "Crux V9 launches on Base Sepolia testnet: tokens trading on their curve, then on Uniswap pools on Base." };

export default function LaunchV9ListPage() {
  return <V9List />;
}
