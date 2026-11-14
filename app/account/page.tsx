import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/AccountPanel";
import { NETWORK_LONG } from "@/lib/network";
import { USDC_WORD } from "@/lib/network";

export const metadata: Metadata = {
  title: "Account · Crux",
  description: `Your Crux account on ${NETWORK_LONG}: log in with email or Google, deposit ${USDC_WORD}, trade in one click, withdraw only to the wallet you bind.`,
};

export default function AccountPage() {
  return <AccountPanel />;
}
