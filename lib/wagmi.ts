import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { base, bsc } from "wagmi/chains";
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
  chains: [base, bsc, robinhoodChain],
  connectors,
  transports: {
    [base.id]: http(),
    [bsc.id]: http(),
    [robinhoodChain.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
