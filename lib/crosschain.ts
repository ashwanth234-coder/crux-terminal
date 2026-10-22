import { createPublicClient, fallback, http, isAddress, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";

/**
 * Cross-chain Phase A (testnet): pay with Circle test USDC on Arbitrum Sepolia, receive on Base Sepolia.
 *
 * The order is escrowed on Arbitrum in CruxCrossChainSettler. The Crux solver fills it on Base through the same
 * destination settler as every other order, then CruxFillProver on Base sends a Hyperlane message back with who
 * filled those exact order details. The Arbitrum settler pays only that filler, and only on a message from the
 * prover. With no proof, the user can refund 6 hours after the fill deadline.
 *
 * Deployed 2026-10-22: crux-contracts broadcast/DeployCrossChainSettler.s.sol/421614 and
 * broadcast/DeployFillProver.s.sol/84532. NEXT_PUBLIC_CRUX_CROSS_CHAIN_SETTLER overrides the settler (e.g. a fork).
 */
export const ARBITRUM = arbitrumSepolia;
export const ARBITRUM_EXPLORER = "https://sepolia.arbiscan.io";

const override = process.env.NEXT_PUBLIC_CRUX_CROSS_CHAIN_SETTLER;
export const CROSS_CHAIN_SETTLER: Address = override && isAddress(override) ? override : "0x570b679cBeDA67322B7d6a348985B6189E8C9e82";
export const CROSS_CHAIN_DEPLOY_BLOCK = BigInt(321708017);
/** Circle USDC on Arbitrum Sepolia: what the cross-chain settler escrows. */
export const ARBITRUM_USDC = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as Address;
/** CruxFillProver on Base Sepolia: the only sender the Arbitrum settler accepts fill proofs from. */
export const FILL_PROVER = "0x7cb1aDd4975CbF1a5a3FA4fd60F11b010E4b29e8" as Address;

/** refund() succeeds once block.timestamp > fillDeadline + 6 hours (REFUND_GRACE) with no proof. */
export const CROSS_CHAIN_REFUND_GRACE_SECONDS = 6 * 3600 + 1;

/** CruxCrossChainSettler's EIP-712 domain, pinned like SETTLER_DOMAIN and checked against eip712Domain() before signing. */
export const CROSS_CHAIN_DOMAIN = {
  name: "CruxCrossChainSettler",
  version: "1",
  chainId: arbitrumSepolia.id,
  verifyingContract: CROSS_CHAIN_SETTLER,
} as const;

/** Where a buy's USDC comes from. */
export type PayFrom = "base" | "arbitrum";

// Wide log scans (My intents): publicnode allows 50k blocks per call; the official RPC is the fallback.
const LOGS_RPCS = [
  process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_LOGS_RPC,
  "https://arbitrum-sepolia-rpc.publicnode.com",
  "https://sepolia-rollup.arbitrum.io/rpc",
].filter((u): u is string => Boolean(u));

export const arbitrumLogClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: fallback(LOGS_RPCS.map((u) => http(u, { timeout: 20_000 }))),
});
