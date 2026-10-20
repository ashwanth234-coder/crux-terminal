import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { base, baseSepolia, bsc } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { injected } from "wagmi/connectors/injected";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { robinhoodChain } from "./chains";
import { SITE_URL } from "./site";

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
  // Mainnets for live balances and Farcaster swaps; Base Sepolia for testnet settlement.
  chains: [base, bsc, robinhoodChain, baseSepolia],
  connectors,
  transports: {
    [base.id]: http(),
    [bsc.id]: http(),
    [robinhoodChain.id]: http(),
    // Optional override (e.g. a local Anvil fork for testing); unset uses the chain's public RPC.
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || undefined),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
