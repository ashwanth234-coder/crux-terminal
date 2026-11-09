import { Chapter } from "./Chapter";
import { ORIGIN_NAMES } from "@/lib/networks";

// How Crux is built on Base, for readers who want the mechanism. Each claim is live on Base Sepolia today.
const PARTS = [
  {
    n: "01",
    title: "One pool, not five.",
    body: "Each launch trades on its own USDC curve, then graduates to exactly one Uniswap pool on Base, with its liquidity burned. A buyer on Solana and a buyer on Base trade against the same depth at the same price.",
    tag: "Uniswap · Base",
  },
  {
    n: "02",
    title: "Intents, not bridges.",
    body: `A buy from ${ORIGIN_NAMES} is an ERC-7683 order. A solver fills it on Base from its own USDC within seconds and is repaid on the chain you paid from.`,
    tag: "ERC-7683 · Hyperlane",
  },
  {
    n: "03",
    title: "A smart account on Base.",
    body: "Your CRUX Account is a contract on Base at an address fixed by your login and your withdrawal wallet. A login key signs your trades, gas is paid for you, and money can only leave to the wallet you bound.",
    tag: "Smart account · Gas paid",
  },
  {
    n: "04",
    title: "Fairness in the contract.",
    body: "A launch can open with a one-minute fair opening: everyone in it pays the same price, so there is no first block to snipe. The creator's tokens vest on-chain, and the curve's graduation and fee split are enforced by the contracts.",
    tag: "Fair opening · On-chain vesting",
  },
];

/** Measured on Base Sepolia, on the solver that runs today. */
const FACTS = [
  { value: "5", label: "chains pay in" },
  { value: "1", label: "pool per token, on Base" },
  { value: "~3 s", label: "typical account fill" },
  { value: "30%", label: "of the fee to creators" },
];

/** The architecture in four parts: every chain pays in, Base is where it all settles. */
export function OnBase() {
  return (
    <Chapter
      id="base"
      title={
        <>
          Every chain pays in.
          <br />
          Base settles it all.
        </>
      }
      intro="Crux doesn't split a token's liquidity across chains. Each token has one pool on Base, and every other chain reaches it through intents filled on Base."
    >
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PARTS.map((p) => (
          <li key={p.n} className="flex flex-col rounded-xl border border-line bg-panel p-6">
            <span className="font-mono text-[11px] text-signal">{p.n}</span>
            <h3 className="mt-4 text-[19px] font-medium text-chrome">{p.title}</h3>
            <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-muted">{p.body}</p>
            <span className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{p.tag}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-10 grid grid-cols-2 border-t border-line md:grid-cols-4">
        {FACTS.map((f) => (
          <div key={f.label} className="border-b border-line py-6 pr-4 md:border-b-0">
            <dt className="sr-only">{f.label}</dt>
            <dd className="font-display text-[clamp(2rem,3.4vw,2.8rem)] text-bright">{f.value}</dd>
            <dd className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{f.label}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-chrome/90">
        Wherever the money comes from, every trade on Crux ends as a transaction on Base.{" "}
        <span className="text-dim">Measured on Base Sepolia (testnet).</span>
      </p>
    </Chapter>
  );
}
