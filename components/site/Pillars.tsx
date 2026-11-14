import { Chapter } from "./Chapter";
import { IS_TESTNET } from "@/lib/network";

// What the CRUX Account gives you. The first two are live on testnet; the third says plainly what waits for mainnet.
const PILLARS = [
  {
    n: "01",
    title: "Fund from anywhere.",
    body: "USDC from five chains lands in one CRUX Account, with no fee and no bridge. Withdrawals only ever go to the wallet you bind.",
    tag: IS_TESTNET ? "Live on testnet" : "Live",
  },
  {
    n: "02",
    title: "Trade and launch in one place.",
    body: "Launch a token, buy at open, set take-profit and stop-loss, all from the same balance. No gas, no pop-ups.",
    tag: IS_TESTNET ? "Live on testnet" : "Live",
  },
  {
    n: "03",
    title: "Every token, every chain.",
    body: "Every launch has one deep pool on Base, and anyone can buy it from the chain they're on today: Ethereum, Solana, BNB Chain or Arbitrum.",
    tag: "Buy from any chain today",
  },
];

/** The CRUX Account, in three cards: fund it from anywhere, do everything from it, reach every chain. */
export function Pillars() {
  return (
    <Chapter id="account" title="One account for everything." intro="Sign in with email or Google. Your CRUX Account is a smart account on Base that only ever pays out to your own wallet.">
      <ul className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((p) => (
          <li key={p.n} className="flex flex-col rounded-xl border border-line bg-panel p-6">
            <span className="font-mono text-[11px] text-signal">{p.n}</span>
            <h3 className="mt-4 text-[19px] font-medium text-chrome">{p.title}</h3>
            <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-muted">{p.body}</p>
            <span className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{p.tag}</span>
          </li>
        ))}
      </ul>
    </Chapter>
  );
}
