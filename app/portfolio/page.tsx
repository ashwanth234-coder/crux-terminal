import type { Metadata } from "next";
import { Portfolio } from "@/components/portfolio/Portfolio";
import { NETWORK_LONG } from "@/lib/network";

export const metadata: Metadata = {
  title: "Portfolio · Crux",
  description: `Your Crux launch tokens on ${NETWORK_LONG}: value at the pool price, average entry, unrealized PnL and one-click sell sizes.`,
};

export default function PortfolioPage() {
  return <Portfolio />;
}
