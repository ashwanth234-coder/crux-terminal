import type { ChainKey } from "./chains";

export type PaySourceId = "unified" | "base-usdc" | "solana-usdc" | "robinhood-usdc";

export type PaySource = {
  id: PaySourceId;
  label: string;
  detail: string;
  /** Chain the funds sit on; null means solvers route from wherever is cheapest. */
  chain: ChainKey | null;
};

export const PAY_SOURCES: PaySource[] = [
  { id: "unified", label: "Unified Balance", detail: "Auto-routed across every chain", chain: null },
  { id: "base-usdc", label: "Base USDC", detail: "Native USDC on Base", chain: "base" },
  { id: "solana-usdc", label: "Solana USDC", detail: "SPL USDC on Solana", chain: "solana" },
  { id: "robinhood-usdc", label: "Robinhood USDG", detail: "USDG on Robinhood Chain", chain: "robinhood" },
];

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
