import { createPublicClient, fallback, http, isAddress, type Address, type Chain, type PublicClient } from "viem";
import { arbitrumSepolia, bscTestnet, sepolia } from "viem/chains";

/**
 * Cross-chain intents (testnet): pay with test USDC on another chain, receive on Base Sepolia.
 *
 * The order is escrowed on its origin chain in CruxCrossChainSettler. The Crux solver fills it on Base through the
 * same destination settler as every other order, then CruxFillProver on Base sends a Hyperlane message back with who
 * filled those exact order details. The origin settler pays only that filler, and only on a message from the
 * prover. With no proof, the user can refund 6 hours after the fill deadline.
 *
 * Origins: Arbitrum Sepolia (Phase A, live 2026-10-22), Ethereum Sepolia and BSC testnet (Phase B). The settler sits
 * at the same address on each (the deployer's first transaction there); one with `settler: null` isn't deployed yet
 * and isn't offered. NEXT_PUBLIC_CRUX_{CROSS_CHAIN,SEPOLIA,BSC}_SETTLER override them (e.g. a local fork).
 */
export type OriginKey = "arbitrum" | "sepolia" | "bsc";
export type OriginChainId = typeof arbitrumSepolia.id | typeof sepolia.id | typeof bscTestnet.id;

export type CrossChainOrigin = {
  key: OriginKey;
  name: string;
  chain: Chain & { id: OriginChainId };
  explorer: string;
  /** CruxCrossChainSettler there, or null while it isn't deployed. */
  settler: Address | null;
  /** Its deploy block: My intents scans from here. */
  deployBlock: bigint;
  /** The test USDC it escrows, and its decimals (BSC testnet's has 18). */
  usdc: Address;
  decimals: number;
  /** Where users get that USDC. */
  faucet: string;
  logClient: PublicClient;
};

const env = (v: string | undefined) => (v && isAddress(v) ? v : null);
/** A deploy-block override (NEXT_PUBLIC_CRUX_*_SETTLER_BLOCK); anything but a plain number is ignored. */
const block = (v: string | undefined, fallback: number) => BigInt(v?.trim() && /^\d+$/.test(v.trim()) ? v.trim() : fallback);

const logClientFor = (chain: Chain, urls: (string | undefined)[]) =>
  createPublicClient({
    chain,
    transport: fallback(urls.filter((u): u is string => Boolean(u)).map((u) => http(u, { timeout: 20_000 }))),
  }) as PublicClient;

export const CROSS_CHAIN_ORIGINS: CrossChainOrigin[] = [
  {
    key: "arbitrum",
    name: "Arbitrum Sepolia",
    chain: arbitrumSepolia,
    explorer: "https://sepolia.arbiscan.io",
    settler: env(process.env.NEXT_PUBLIC_CRUX_CROSS_CHAIN_SETTLER) ?? "0x570b679cBeDA67322B7d6a348985B6189E8C9e82",
    deployBlock: BigInt(321708017),
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    decimals: 6,
    faucet: "faucet.circle.com (pick Arbitrum Sepolia)",
    // publicnode allows 50k blocks per call; the official RPC is the fallback.
    logClient: logClientFor(arbitrumSepolia, [process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_LOGS_RPC, "https://arbitrum-sepolia-rpc.publicnode.com", "https://sepolia-rollup.arbitrum.io/rpc"]),
  },
  {
    key: "sepolia",
    name: "Ethereum Sepolia",
    chain: sepolia,
    explorer: "https://sepolia.etherscan.io",
    settler: env(process.env.NEXT_PUBLIC_CRUX_SEPOLIA_SETTLER) ?? null,
    deployBlock: block(process.env.NEXT_PUBLIC_CRUX_SEPOLIA_SETTLER_BLOCK, 0),
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    decimals: 6,
    faucet: "faucet.circle.com (pick Ethereum Sepolia)",
    logClient: logClientFor(sepolia, [process.env.NEXT_PUBLIC_SEPOLIA_LOGS_RPC, "https://ethereum-sepolia-rpc.publicnode.com"]),
  },
  {
    key: "bsc",
    name: "BSC testnet",
    chain: bscTestnet,
    explorer: "https://testnet.bscscan.com",
    settler: env(process.env.NEXT_PUBLIC_CRUX_BSC_SETTLER) ?? null,
    deployBlock: block(process.env.NEXT_PUBLIC_CRUX_BSC_SETTLER_BLOCK, 0),
    usdc: "0x64544969ed7EBf5f083679233325356EbE738930",
    decimals: 18,
    faucet: "the BNB Chain testnet faucet",
    logClient: logClientFor(bscTestnet, [process.env.NEXT_PUBLIC_BSC_TESTNET_LOGS_RPC, "https://bsc-testnet-rpc.publicnode.com"]),
  },
];

/** The origins whose settler is deployed: what "Pay from" offers and My intents scans. */
export const LIVE_ORIGINS = CROSS_CHAIN_ORIGINS.filter((o): o is CrossChainOrigin & { settler: Address } => o.settler !== null);

export function originByKey(key: OriginKey) {
  return LIVE_ORIGINS.find((o) => o.key === key) ?? null;
}

/** Where a buy's USDC comes from: Base Sepolia, or a cross-chain origin. */
export type PayFrom = "base" | OriginKey;

/** refund() succeeds once block.timestamp > fillDeadline + 6 hours (REFUND_GRACE) with no proof. */
export const CROSS_CHAIN_REFUND_GRACE_SECONDS = 6 * 3600 + 1;

/** CruxFillProver on Base Sepolia: the only sender the origin settlers accept fill proofs from. */
export const FILL_PROVER = "0x7cb1aDd4975CbF1a5a3FA4fd60F11b010E4b29e8" as Address;

/** A settler's EIP-712 domain, pinned like SETTLER_DOMAIN and checked against eip712Domain() before signing. */
export function crossChainDomain(o: CrossChainOrigin & { settler: Address }) {
  return { name: "CruxCrossChainSettler", version: "1", chainId: o.chain.id, verifyingContract: o.settler } as const;
}

/** An origin USDC amount in 6-decimal USDC units (rounded down), to compare with what a quote is priced in. */
export function toUsdc6(amount: bigint, decimals: number): bigint {
  return decimals >= 6 ? amount / BigInt(10) ** BigInt(decimals - 6) : amount * BigInt(10) ** BigInt(6 - decimals);
}
