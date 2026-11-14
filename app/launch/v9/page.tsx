import type { Metadata } from "next";
import { TokenList } from "@/components/launch/TokenList";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = { title: "Discover · Crux", description: `Every token launched on Crux on ${NETWORK_LONG}: on its curve, in its fair opening, or trading on Uniswap.` };

export default function LaunchTokenListPage() {
  return <TokenList />;
}
