import { Chapter } from "./Chapter";
import { IS_TESTNET } from "@/lib/network";

const LIVE = IS_TESTNET ? "Live on testnet" : "Live";

// What the CRUX Account gives you, one line each.
const PILLARS = [
  IS_TESTNET
    ? { n: "01", title: "Fund from anywhere.", body: "USDC from five chains, one balance. Withdrawals only to your wallet.", tag: LIVE }
    : { n: "01", title: "One balance.", body: "Add USDC on Base. Withdrawals only to your wallet.", tag: LIVE },
  { n: "02", title: "Launch and trade.", body: "Launch, buy, take profit, stop loss. One balance, no gas.", tag: LIVE },
  IS_TESTNET
    ? { n: "03", title: "Every chain.", body: "Buy any Crux coin from Ethereum, Solana, BNB Chain or Arbitrum.", tag: LIVE }
    : { n: "03", title: "Three chains.", body: "Trade Base, Solana and BNB Chain coins from the same account.", tag: LIVE },
];

/** The CRUX Account, in three cards. */
export function Pillars() {
  return (
    <Chapter id="account" title="One account for everything." intro="Sign in with email or Google.">
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
