/**
 * The chains Crux names to users, in one place: every page, tooltip and modal that lists chains reads this, so the list
 * and the "Soon (Mainnet)" badge never drift apart. `live` means it works today on testnet; Robinhood Chain is
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

export const SOON_MAINNET = "Soon (Mainnet)";

export const NETWORKS: Network[] = [
  { key: "base", name: "Base", network: "Base Sepolia (testnet). Tokens, auctions and pools live here.", live: true, color: "#0052ff" },
  { key: "arbitrum", name: "Arbitrum", network: "Arbitrum Sepolia (testnet)", live: true, color: "#28a0f0" },
  { key: "ethereum", name: "Ethereum", network: "Ethereum Sepolia (testnet)", live: true, color: "#627eea" },
  { key: "bnb", name: "BNB Chain", network: "BNB Chain testnet", live: true, color: "#f0b90b" },
  { key: "solana", name: "Solana", network: "Solana devnet (USDC)", live: true, color: "#14f195" },
  { key: "robinhood", name: "Robinhood Chain", network: `${SOON_MAINNET}: mainnet-only, after the audit`, live: false, color: "#ccff00" },
];

export const LIVE_NETWORKS = NETWORKS.filter((n) => n.live);
export const SOON_NETWORKS = NETWORKS.filter((n) => !n.live);

/** "A, B and C". */
export const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The live chains as a sentence fragment: "Base, Arbitrum, Ethereum, BNB Chain and Solana". */
export const LIVE_NAMES = listNames(LIVE_NETWORKS.map((n) => n.name));

/** The live chains you can pay from besides Base: "Arbitrum, Ethereum, BNB Chain and Solana". */
export const ORIGIN_NAMES = listNames(LIVE_NETWORKS.filter((n) => n.key !== "base").map((n) => n.name));

/** "Robinhood Chain: Soon (Mainnet)". */
export const SOON_LINE = SOON_NETWORKS.map((n) => `${n.name}: ${SOON_MAINNET}`).join(" · ");
