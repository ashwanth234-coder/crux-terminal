import type { ReactNode } from "react";
import { ArrowUpRight } from "@/components/ui/Button";
import { UnifiedBalanceCard } from "@/components/terminal/UnifiedBalanceCard";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { SETTLER, SLIPPAGE_BPS } from "@/lib/intents";
import { Chapter } from "./Chapter";

const DESTINATION = "0x300a835939D2beBed59C543470DCD9a9c8065822";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Contract({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1.5 font-mono text-[11.5px] text-muted transition-colors hover:text-chrome">
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

// The stages an intent passes through in this implementation, each with the on-chain fact that marks it.
const STAGES: { title: string; body: string; proof: ReactNode }[] = [
  {
    title: "Quote ready",
    body: `Priced from the locked Uniswap V2 pool at your size, with a ${(SLIPPAGE_BPS / 100).toFixed(2)}% price limit you can read before you sign.`,
    proof: <span className="font-mono text-[11.5px] text-dim">getReserves · Base Sepolia</span>,
  },
  {
    title: "Awaiting signature",
    body: "You sign one ERC-7683 order with EIP-712. Any approval is for the exact amount.",
    proof: <span className="font-mono text-[11.5px] text-dim">GaslessCrossChainOrder</span>,
  },
  {
    title: "Intent submitted",
    body: "openFor escrows your input in the origin settler. Nothing is bridged.",
    proof: <Contract href={`${TESTNET_EXPLORER}/address/${SETTLER}`}>CruxSettler {short(SETTLER)}</Contract>,
  },
  {
    title: "Destination execution",
    body: "A solver delivers your output from its own capital on the destination settler.",
    proof: <Contract href={`${TESTNET_EXPLORER}/address/${DESTINATION}`}>OrderFilled · {short(DESTINATION)}</Contract>,
  },
  {
    title: "Settlement confirmed",
    body: "The escrow is released to the solver that filled. If no solver fills in time, the escrow refunds to you.",
    proof: <span className="font-mono text-[11.5px] text-dim">OrderSettled</span>,
  },
];

/** 03 Execution: the intent lifecycle as it is implemented, beside the live terminal. */
export function Execution() {
  return (
    <Chapter
      id="terminal"
      index="03"
      name="Execution"
      title={
        <>
          Intent in.
          <br />
          Execution out.
        </>
      }
      intro="Sign what you want, not how to get it. A solver fills the order from its own capital and is repaid from escrow. On testnet both legs run on Base Sepolia."
    >
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <ol className="relative">
            {/* The track: stages are drawn as a path, never as progress */}
            <span aria-hidden="true" className="absolute bottom-3 left-[5px] top-3 w-px bg-line" />
            {STAGES.map((s, i) => (
              <li key={s.title} className="relative pb-9 pl-9 last:pb-0">
                <span aria-hidden="true" className="absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border border-line-2 bg-void" />
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-chrome">
                  <span className="text-dim">0{i + 1}</span> {s.title}
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
                <div className="mt-2">{s.proof}</div>
              </li>
            ))}
          </ol>
          <p className="mt-10 border-t border-line pt-4 text-[12px] leading-relaxed text-dim">
            These are the stages, not a status. Your own intent&apos;s review window marks each one only after Base Sepolia confirms it.
          </p>
        </div>

        <div className="lg:col-span-8">
          <UnifiedBalanceCard />
        </div>
      </div>
    </Chapter>
  );
}
