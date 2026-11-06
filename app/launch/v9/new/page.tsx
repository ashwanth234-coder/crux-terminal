import type { Metadata } from "next";
import { V9Create } from "@/components/launch/V9Create";

export const metadata: Metadata = { title: "Launch a token (V9) · Crux", description: "Launch a token on a Crux V9 curve on Base Sepolia testnet: free, 5afe address, optional fair opening, graduation into a Uniswap pool on Base." };

export default function LaunchV9NewPage() {
  return <V9Create />;
}
