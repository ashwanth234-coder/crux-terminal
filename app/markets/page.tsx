import type { Metadata } from "next";
import { MarketsView } from "@/components/markets/MarketsView";
import { NETWORK_NAME } from "@/lib/network";
import { IS_TESTNET } from "@/lib/network";

export const metadata: Metadata = {
  title: "Markets · Crux",
  description: `Crux launches, established tokens your Crux account can trade with no gas, and the busiest ${NETWORK_NAME} pools of the last hour.${IS_TESTNET ? " Testnet only." : ""}`,
};

export default function MarketsPage() {
  return <MarketsView />;
}
