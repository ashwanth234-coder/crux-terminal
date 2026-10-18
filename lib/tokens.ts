import type { ChainKey } from "./chains";

export type ChainBalance = { chain: ChainKey; label: string; usd: number };

/** Shown when no wallet is connected. Sums to $12,480.32. */
export const DEMO_BALANCES: ChainBalance[] = [
  { chain: "base", label: "Base", usd: 4230.5 },
  { chain: "solana", label: "Solana", usd: 3120.21 },
  { chain: "bsc", label: "BSC", usd: 2891.14 },
  { chain: "robinhood", label: "Robinhood", usd: 2238.47 },
];

export const DEMO_CHANGE_24H = 2.4;

export type OrbToken = {
  symbol: string;
  change: number;
  price: number;
  position: [number, number, number];
  highlight?: boolean;
};

export const ORB_TOKENS: OrbToken[] = [
  { symbol: "NOVA", change: 52.3, price: 2.463, position: [-1.05, 0.78, 0.7], highlight: true },
  { symbol: "CRUX", change: 12.8, price: 1.184, position: [1.3, 0.55, 0.5] },
  { symbol: "FORM", change: -4.1, price: 0.372, position: [-1.4, -0.55, 0.6] },
  { symbol: "MIND", change: 28.4, price: 0.918, position: [1.05, -0.8, 0.7] },
];

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
  { id: "robinhood-usdc", label: "Robinhood USDC", detail: "USDC on Robinhood Chain", chain: "robinhood" },
];

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
