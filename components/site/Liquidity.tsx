import { ArrowUpRight } from "@/components/ui/Button";
import { StatusTag, type Status } from "@/components/ui/StatusTag";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { FACTORY_V3 } from "@/lib/intents";
import { Chapter } from "./Chapter";

const LAYERS: { name: string; status: Status; body: string }[] = [
  {
    name: "Native market",
    status: "testnet",
    body: "Graduation pairs 30% of supply with half the raise in one Uniswap V2 pool on the home chain, opening at the clearing price. The LP tokens are minted to 0x…dEaD, so that liquidity can never be withdrawn.",
  },
  {
    name: "External discovery",
    status: "testnet",
    body: "The pool is a plain Uniswap V2 pair, so any router, explorer or aggregator that reads V2 pairs can find and price it without an integration. On a testnet, few of them look.",
  },
  {
    name: "Cross-chain expansion",
    status: "planned",
    body: "Extending a token beyond its home chain (OFT or NTT) only once it clears economic gates: deep executable liquidity, sustained volume and low volatility. Not built.",
  },
];

// The graduation path, left to right; the burn address is where the line ends.
const FLOW = ["Batch auction", "One Uniswap V2 pool", "LP to 0x…dEaD"];

/** 04 Liquidity: the home-chain pool that exists today, and what does not exist yet. */
export function Liquidity() {
  return (
    <Chapter
      id="liquidity"
      index="04"
      name="Liquidity"
      title="Liquidity has a home."
      intro="Each launch keeps its depth in one place: one canonical pool on its home chain, locked at graduation. Other venues and chains read from it rather than splitting it."
    >
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-0" aria-label="Graduation path">
        {FLOW.map((step, i) => (
          <li key={step} className="flex items-center gap-4 sm:flex-1">
            <span className={`h-2 w-2 shrink-0 ${i === FLOW.length - 1 ? "bg-signal" : "border border-muted"}`} aria-hidden="true" />
            <span className="whitespace-nowrap text-[13.5px] text-chrome">{step}</span>
            {i < FLOW.length - 1 && <span className="hidden h-px flex-1 bg-line-2 sm:mx-4 sm:block" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="mt-12 grid border-t border-line md:grid-cols-3">
        {LAYERS.map((l, i) => (
          <article key={l.name} className={`border-b border-line py-8 md:border-b-0 md:py-10 ${i > 0 ? "md:border-l md:pl-8" : ""} ${i < LAYERS.length - 1 ? "md:pr-8" : ""}`}>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[16px] font-medium text-chrome">{l.name}</h3>
              <StatusTag status={l.status} />
            </div>
            <p className="mt-4 text-[13.5px] leading-relaxed text-muted">{l.body}</p>
          </article>
        ))}
      </div>

      {FACTORY_V3 && (
        <a
          href={`${TESTNET_EXPLORER}/address/${FACTORY_V3}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-8 inline-flex items-center gap-1.5 font-mono text-[11.5px] text-muted transition-colors hover:text-chrome"
        >
          CruxFactoryV3 {FACTORY_V3.slice(0, 6)}…{FACTORY_V3.slice(-4)} on Basescan
          <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </Chapter>
  );
}
