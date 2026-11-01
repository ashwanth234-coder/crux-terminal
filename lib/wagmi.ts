import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { arbitrumSepolia, base, baseSepolia, bsc, bscTestnet, sepolia } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { injected } from "wagmi/connectors/injected";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { robinhoodChain } from "./chains";
import { SITE_URL } from "./site";
import { cachedReads } from "./readCache";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

const connectors: CreateConnectorFn[] = [
  // Picked up automatically inside a Farcaster client.
  farcasterMiniApp(),
  // Coinbase Smart Wallet: passkey accounts, no extension needed.
  coinbaseWallet({ appName: "Crux", appLogoUrl: `${SITE_URL}/icon.svg`, preference: { options: "smartWalletOnly" } }),
  injected({ shimDisconnect: true }),
  // WalletConnect needs a Reown project id; skip it rather than crash without one.
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          metadata: { name: "Crux", description: "Omnichain execution protocol", url: SITE_URL, icons: [`${SITE_URL}/icon.svg`] },
          showQrModal: true,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  // Mainnets for live balances and Farcaster swaps; Base Sepolia for testnet settlement; Arbitrum Sepolia, Ethereum
  // Sepolia and BSC testnet to pay into cross-chain orders (lib/crosschain.ts).
  chains: [base, bsc, robinhoodChain, baseSepolia, arbitrumSepolia, sepolia, bscTestnet],
  connectors,
  transports: {
    [base.id]: http(),
    [bsc.id]: http(),
    [robinhoodChain.id]: http(),
    // Optional override (e.g. a local Anvil fork for testing, read directly); unset reads through the relay's shared
    // cache, then the chain's public RPC.
    [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC
      ? http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC)
      : cachedReads(http(undefined, { batch: { batchSize: 50, wait: 16 } })),
    [arbitrumSepolia.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || "https://arbitrum-sepolia-rpc.publicnode.com"),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com"),
    [bscTestnet.id]: http(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com"),
  },
  ssr: true,
  // Separate reads stay separate calls (sent as one JSON-RPC batch), so identical reads on different pages match in
  // the relay's cache; useReadContracts still makes its own (identical for every viewer) multicall.
  batch: { multicall: false },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
