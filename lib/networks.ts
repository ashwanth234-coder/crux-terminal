import { NETWORK_NAME } from "./network.ts";
import { IS_TESTNET, SOLANA_LIVE } from "./network.ts";
import { SOLANA_NAME } from "./network.ts";
/**
 * The chains Crux names to users, in one place: every page, tooltip and modal that lists chains reads this, so the list
 * and the "Mainnet ready" badge never drift apart. `live` means it works today on testnet; Robinhood Chain is
 * mainnet-only and arrives after the audit. Everything settles on Base.
 */
export type NetworkKey = "base" | "arbitrum" | "ethereum" | "bnb" | "solana" | "robinhood";

export type Network = {
  key: NetworkKey;
  /** The chain's name, as users say it. */
  name: string;
  /** Where it runs today (the testnet), or why it isn't live. */
  network: string;
  live: boolean;
  /** The network's own colour, used on its mark only. */
  color: string;
};

/** A chain that isn't live yet: "Coming at mainnet" on testnet, "Coming soon" on mainnet. */
export const SOON_MAINNET = IS_TESTNET ? "Coming at mainnet" : "Coming soon";

const TESTNET_NETWORKS: Network[] = [
  { key: "base", name: "Base", network: `${NETWORK_NAME} (testnet). Tokens, auctions and pools live here.`, live: true, color: "#0052ff" },
  { key: "ethereum", name: "Ethereum", network: "Ethereum Sepolia (testnet)", live: true, color: "#627eea" },
  { key: "solana", name: "Solana", network: `${SOLANA_NAME} (USDC)`, live: true, color: "#14f195" },
  { key: "bnb", name: "BNB Chain", network: "BNB Chain testnet", live: true, color: "#f0b90b" },
  { key: "arbitrum", name: "Arbitrum", network: "Arbitrum Sepolia (testnet)", live: true, color: "#28a0f0" },
  {
    key: "robinhood",
    name: "Robinhood Chain",
    network: `${SOON_MAINNET}: not on testnet. Crux settles cross-chain through Hyperlane, which runs on Robinhood Chain mainnet (4663) but not its testnet, so it turns on with Crux's mainnet launch, after the audit.`,
    live: false,
    color: "#ccff00",
  },
];

/**
 * Base mainnet: Base, and each other chain once its settler there is set (Robinhood Chain's settler; Solana's escrow
 * program); Ethereum, Arbitrum and BNB Chain need mainnet settlers of their own first.
 */
const robinhoodLive = Boolean(process.env.NEXT_PUBLIC_CRUX_ROBINHOOD_SETTLER);
const MAINNET_NETWORKS: Network[] = TESTNET_NETWORKS.map((n): Network => {
  const live = n.key === "base" || (n.key === "solana" && SOLANA_LIVE) || (n.key === "robinhood" && robinhoodLive);
  const network = n.key === "base" ? "Base. Tokens, curves and pools live here." : live ? n.name : SOON_MAINNET;
  return { ...n, live, network };
});

export const NETWORKS: Network[] = IS_TESTNET ? TESTNET_NETWORKS : MAINNET_NETWORKS;

export const LIVE_NETWORKS = NETWORKS.filter((n) => n.live);
export const SOON_NETWORKS = NETWORKS.filter((n) => !n.live);

/** "A, B and C". */
export const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The live chains as a sentence fragment: "Base, Ethereum, Solana, BNB Chain and Arbitrum". */
export const LIVE_NAMES = listNames(LIVE_NETWORKS.map((n) => n.name));

/** The live chains you can pay from besides Base: "Ethereum, Solana, BNB Chain and Arbitrum". */
export const ORIGIN_NAMES = listNames(LIVE_NETWORKS.filter((n) => n.key !== "base").map((n) => n.name));

/** "Robinhood Chain: Mainnet ready". */
export const SOON_LINE = SOON_NETWORKS.map((n) => `${n.name}: ${SOON_MAINNET}`).join(" · ");
