import type { ReactNode } from "react";

/**
 * The chains Crux reaches, for the landing page. Marks are simple single-colour glyphs (currentColor) drawn on a 24-unit
 * grid; each network's own colour appears only on its mark, on hover. `live` is what works today on testnet; the rest
 * is labelled Soon. Everything settles on Base.
 */
export type ChainKey = "base" | "ethereum" | "bnb" | "solana" | "robinhood";

export type LandingChain = {
  key: ChainKey;
  name: string;
  /** Where it runs today, for the tooltip (never implies mainnet). */
  network: string;
  live: boolean;
  /** The network's own colour, shown on its mark only. */
  color: string;
};

export const LANDING_CHAINS: LandingChain[] = [
  { key: "base", name: "Base", network: "Base Sepolia (testnet). Tokens, auctions and pools live here.", live: true, color: "#0052ff" },
  { key: "ethereum", name: "Ethereum", network: "Ethereum Sepolia (testnet)", live: true, color: "#627eea" },
  { key: "bnb", name: "BNB Chain", network: "BNB Chain testnet", live: true, color: "#f0b90b" },
  { key: "solana", name: "Solana", network: "Solana devnet (USDC)", live: true, color: "#14f195" },
  { key: "robinhood", name: "Robinhood Chain", network: "After the audit (mainnet-only chain)", live: false, color: "#ccff00" },
];

const MARKS: Record<ChainKey, ReactNode> = {
  base: (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <rect x="0" y="10.6" width="12.6" height="2.8" fill="var(--notch, var(--color-void))" />
    </>
  ),
  ethereum: (
    <>
      <path d="M12 1.8 5.6 12.4 12 16.2l6.4-3.8Z" fill="currentColor" />
      <path d="M12 17.5 5.6 13.7 12 22.2l6.4-8.5Z" fill="currentColor" opacity="0.7" />
    </>
  ),
  bnb: (
    <path
      d="M12 9.2 14.8 12 12 14.8 9.2 12ZM12 2.6l4.4 4.4-1.6 1.6L12 5.8 9.2 8.6 7.6 7ZM12 21.4l-4.4-4.4 1.6-1.6 2.8 2.8 2.8-2.8 1.6 1.6ZM5.2 9.9 7.3 12l-2.1 2.1L3.1 12ZM18.8 9.9l2.1 2.1-2.1 2.1-2.1-2.1Z"
      fill="currentColor"
    />
  ),
  solana: <path d="M6.8 5h13.4l-2.8 3.1H4ZM4 10.45h13.4l2.8 3.1H6.8ZM6.8 15.9h13.4l-2.8 3.1H4Z" fill="currentColor" />,
  robinhood: (
    <path d="M19.6 2.6c-7.4.5-12.6 5.3-14 14.2l-1.7 3.9 1.5.7 1.8-4c3.4-.4 6.1-1.8 8-4.2-1.8.4-3.4.4-4.9.1 2.5-1 4.6-2.7 6-5-1.4.5-2.7.7-3.9.6 3-1.6 5.8-3.6 7.2-6.3Z" fill="currentColor" />
  ),
};

/** The bare glyph (24-unit grid), for placing inside another SVG. */
export const chainGlyph = (chain: ChainKey) => MARKS[chain];

export function ChainMark({ chain, className = "h-4 w-4" }: { chain: ChainKey; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {MARKS[chain]}
    </svg>
  );
}
