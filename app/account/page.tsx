import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/AccountPanel";

export const metadata: Metadata = {
  title: "Account · Crux",
  description: "Your Crux account on Base Sepolia testnet: log in with email or Google, deposit test USDC, trade in one click, withdraw only to the wallet you bind.",
};

export default function AccountPage() {
  return <AccountPanel />;
}
