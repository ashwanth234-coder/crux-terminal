import type { Metadata } from "next";
import { SolanaTrade } from "@/components/solana/SolanaTrade";

export const metadata: Metadata = {
  title: "Solana · Crux",
  description: "Buy and sell Solana coins from your one Crux account. Crux pays every Solana fee.",
};

export default function SolanaPage() {
  return <SolanaTrade />;
}
