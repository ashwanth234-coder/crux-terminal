import { defineChain, type Address } from "viem";
import { base, baseSepolia, bsc } from "viem/chains";

/**
 * Robinhood Chain (EVM spoke). The default RPC host does not resolve publicly
 * yet; point NEXT_PUBLIC_ROBINHOOD_RPC at a live endpoint (or a local node).
 * Balance reads against it fail soft, see hooks/useUnifiedBalance.ts.
 */
/** Robinhood Chain mainnet (Arbitrum Orbit, ETH gas; its testnet is 46630, without Hyperlane). */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC ?? "https://rpc.mainnet.chain.robinhood.com"] },
  },
});

export const SUPPORTED_CHAINS = [base, bsc, robinhoodChain, baseSepolia] as const;

/** Testnet home of the Crux settler and batch-auction factory. */
export const TESTNET = baseSepolia;
export const TESTNET_EXPLORER = "https://sepolia.basescan.org";

export type ChainKey = "base" | "solana" | "bsc" | "robinhood";

type UsdcSpec = { address: Address; decimals: number };

/** USDC per EVM chain. Robinhood's is only known once configured. */
export const USDC: Partial<Record<Exclude<ChainKey, "solana">, UsdcSpec>> = {
  base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  // Binance-peg USDC on BSC uses 18 decimals.
  bsc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  ...(process.env.NEXT_PUBLIC_ROBINHOOD_USDC
    ? { robinhood: { address: process.env.NEXT_PUBLIC_ROBINHOOD_USDC as Address, decimals: 6 } }
    : {}),
};

/** Chainlink USD feeds (8 decimals) used to value native gas balances. */
export const PRICE_FEEDS = {
  ethUsd: { chainId: base.id, address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as Address },
  bnbUsd: { chainId: bsc.id, address: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE" as Address },
  solUsd: { chainId: base.id, address: "0x975043adBb80fc32276CbF9Bbcfd4A601a12462D" as Address },
} as const;

export const CHAIN_ID: Record<Exclude<ChainKey, "solana">, number> = {
  base: base.id,
  bsc: bsc.id,
  robinhood: robinhoodChain.id,
};
