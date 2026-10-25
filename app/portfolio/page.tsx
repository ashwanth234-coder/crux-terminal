import type { Metadata } from "next";
import { Portfolio } from "@/components/portfolio/Portfolio";

export const metadata: Metadata = {
  title: "Portfolio · Crux",
  description: "Your Crux launch tokens on Base Sepolia testnet: value at the pool price, average entry, unrealized PnL and one-click sell sizes.",
};

export default function PortfolioPage() {
  return <Portfolio />;
}
