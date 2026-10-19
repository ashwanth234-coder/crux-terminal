import type { ReactNode } from "react";
import { ArrowUpRight } from "@/components/ui/Button";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { SETTLER } from "@/lib/intents";

// Static mechanism diagrams: hairlines, real names, no motion. They read the
// same with animations off, and cost nothing after first paint.

const DESTINATION = "0x300a835939D2beBed59C543470DCD9a9c8065822";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Chain({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-3 inline-flex items-center gap-1.5 font-mono text-[11.5px] text-muted transition-colors hover:text-chrome"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

// ------------------------------------------------------------------ 02 Execution

const STEPS = [
  {
    title: "Sign",
    body: "A gasless ERC-7683 order, signed with EIP-712. Nothing moves yet.",
    proof: <p className="mt-3 font-mono text-[11.5px] text-dim">GaslessCrossChainOrder</p>,
  },
  {
    title: "Escrow",
    body: "openFor pulls the USDC into the origin settler.",
    proof: <Chain href={`${TESTNET_EXPLORER}/address/${SETTLER}`}>CruxSettler {short(SETTLER)}</Chain>,
  },
  {
    title: "Fill",
    body: "A solver delivers the output to you from its own capital.",
    proof: <Chain href={`${TESTNET_EXPLORER}/address/${DESTINATION}`}>Destination {short(DESTINATION)}</Chain>,
  },
  {
    title: "Settle",
    body: "The escrow is released to the solver that filled. You never bridge.",
    proof: <p className="mt-3 font-mono text-[11.5px] text-dim">OrderSettled</p>,
  },
];

export function ExecutionDiagram() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex flex-col bg-panel p-5">
          <span className="flex items-center gap-2.5">
            <span className={`grid h-6 w-6 place-items-center rounded-full border font-mono text-[11px] ${i === 3 ? "border-acid/60 text-acid" : "border-line-2 text-muted"}`}>
              {i + 1}
            </span>
            <span className="text-[15px] font-medium text-chrome">{s.title}</span>
          </span>
          <p className="mt-3 text-[13px] leading-relaxed text-chrome/60">{s.body}</p>
          <div className="mt-auto pt-2">{s.proof}</div>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ 03 Fair launch

// Bids land anywhere in the window; every one clears at the same line.
const BIDS = [
  { at: 1, label: "Block 0 sniper" },
  { at: 14 },
  { at: 27 },
  { at: 38 },
  { at: 46 },
  { at: 59, label: "Last-second buyer" },
];

export function BatchWindowDiagram() {
  return (
    <figure className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <div className="relative h-44 sm:h-48">
        {/* Bid stems from arrival time down to the single clearing price */}
        {BIDS.map((b) => (
          <span key={b.at} className="absolute top-7 bottom-10 w-px bg-line-2" style={{ left: `${(b.at / 60) * 100}%` }} aria-hidden="true">
            <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full border border-chrome/50 bg-panel" />
            <span className="absolute -bottom-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-acid" />
            {b.label && (
              <span className={`absolute -top-7 whitespace-nowrap text-[11.5px] text-muted ${b.at > 30 ? "right-0" : "left-0"}`}>{b.label}</span>
            )}
          </span>
        ))}
        {/* The clearing price */}
        <span className="absolute inset-x-0 bottom-10 h-px bg-acid/70" aria-hidden="true" />
        <span className="absolute bottom-3 left-0 text-[12px] text-chrome">One uniform price for every bid</span>
        {/* Time axis */}
        <span className="absolute inset-x-0 top-7 h-px bg-line" aria-hidden="true" />
      </div>
      <figcaption className="mt-2 flex justify-between border-t border-line pt-3 font-mono text-[11px] text-dim">
        <span>0s</span>
        <span>Sealed window</span>
        <span>60s</span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ 04 Liquidity (planned)

export function LiquidityDiagram() {
  return (
    <figure className="rounded-xl border border-dashed border-line-2 p-5 sm:p-6">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <ul className="space-y-3">
          {["Graduated token", "RWA yield asset"].map((t) => (
            <li key={t} className="rounded-lg border border-line px-4 py-3 text-[13.5px] text-chrome/85">
              {t}
            </li>
          ))}
        </ul>
        <svg viewBox="0 0 40 60" className="mx-auto hidden h-16 w-10 text-line-2 sm:block" aria-hidden="true">
          <path d="M0 14h14q6 0 6 6v20q0 6-6 6H0M20 30h18m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        </svg>
        <div className="rounded-lg border border-line-2 px-4 py-4">
          <p className="text-[14px] text-chrome">Crux Spot DEX</p>
          <p className="mt-1 text-[12.5px] text-muted">Canonical pool on Base</p>
        </div>
      </div>
      <figcaption className="mt-5 border-t border-line pt-3 text-[12px] text-muted">Planned. Not deployed on testnet yet.</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ 05 Derivatives (planned)

const CAP = [8, 14, 12, 22, 30, 27, 41, 52, 61, 74, 88];

export function SyndicationDiagram() {
  const thresholdIndex = CAP.findIndex((v) => v >= 50);
  return (
    <figure className="rounded-xl border border-dashed border-line-2 p-5 sm:p-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="font-display text-[clamp(2.2rem,4vw,3.4rem)] leading-none text-bright">$37M+</p>
          <p className="mt-2 max-w-[16rem] text-[12.5px] leading-snug text-muted">Recent deployer fees across the Hyperliquid HIP-3 ecosystem</p>
        </div>
        <p className="shrink-0 text-right text-[12px] text-muted">
          Powered by
          <span className="block text-[13.5px] text-chrome">Hyperliquid</span>
        </p>
      </div>

      {/* Market cap over time, and the line it must cross to syndicate */}
      <div className="relative mt-8 h-32" aria-hidden="true">
        <span className="absolute inset-x-0 border-t border-dashed border-chrome/30" style={{ bottom: "50%" }} />
        <span className="absolute right-0 text-[11.5px] text-muted" style={{ bottom: "calc(50% + 6px)" }}>
          $10M market cap
        </span>
        <div className="absolute inset-0 flex items-end gap-1.5">
          {CAP.map((v, i) => (
            <span
              key={i}
              className={`flex-1 rounded-sm ${i === thresholdIndex ? "bg-acid" : i > thresholdIndex ? "bg-chrome/25" : "bg-line-2"}`}
              style={{ height: `${v}%` }}
            />
          ))}
        </div>
      </div>
      <figcaption className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-3 text-[12px] text-muted">
        <span>Crosses $10M: syndicated to HIP-3 deployers for perpetual markets.</span>
        <span className="shrink-0">Planned</span>
      </figcaption>
    </figure>
  );
}
