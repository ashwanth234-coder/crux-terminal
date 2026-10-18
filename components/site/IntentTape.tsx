"use client";

import { useMemo } from "react";
import { seeded, useBatchClock } from "@/lib/batch";

const TOKENS = [
  { symbol: "NOVA", price: 2.463 },
  { symbol: "CRUX", price: 1.184 },
  { symbol: "FORM", price: 0.372 },
  { symbol: "MIND", price: 0.918 },
];
const CHAINS = ["Base", "Solana", "BSC", "Robinhood"];
const HEX = "0123456789abcdef";

type Fill = { id: string; wallet: string; side: "BUY" | "SELL"; qty: string; symbol: string; route: string; ms: number };

function makeFills(batch: number): Fill[] {
  const r = seeded(batch * 7919 + 13);
  const hex = (n: number) => Array.from({ length: n }, () => HEX[Math.floor(r() * 16)]).join("");
  return Array.from({ length: 16 }, (_, i) => {
    const t = TOKENS[Math.floor(r() * TOKENS.length)];
    const usd = 40 + r() * 4200;
    return {
      id: `${batch}-${i}`,
      wallet: `0x${hex(2)}…${hex(2)}`,
      side: r() > 0.28 ? "BUY" : "SELL",
      qty: (usd / t.price).toLocaleString("en-US", { maximumFractionDigits: 1 }),
      symbol: t.symbol,
      route: `${CHAINS[Math.floor(r() * 4)]} → Base`,
      ms: Math.round(380 + r() * 900),
    };
  });
}

/**
 * A running tape of intents filling inside the current batch. The data is
 * simulated (seeded per batch) and labelled as such: the protocol is not live.
 */
export function IntentTape({ className = "" }: { className?: string }) {
  const clock = useBatchClock();
  const batch = clock?.batch ?? 0;
  const fills = useMemo(() => makeFills(batch), [batch]);
  const clearing = clock !== null && clock.left <= 1;

  return (
    <div
      className={`relative flex items-stretch overflow-hidden border-y bg-void/70 backdrop-blur-md transition-colors duration-500 ${
        clearing ? "border-acid/50" : "border-line"
      } ${className}`}
    >
      <div className="relative z-10 flex shrink-0 items-center gap-2 border-r border-line bg-void px-4 text-[11px] text-muted sm:px-6">
        <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse-soft" aria-hidden="true" />
        {clearing ? <span className="text-acid">Batch clearing</span> : "Simulated feed"}
      </div>
      <div className="relative min-w-0 flex-1 [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
        <ul
          aria-label="Simulated intent fills"
          className="flex w-max animate-tape items-center gap-10 py-3 pl-8 motion-reduce:animate-none"
        >
          {[...fills, ...fills].map((f, i) => (
            <li key={`${f.id}-${i}`} aria-hidden={i >= fills.length} className="flex items-center gap-3 whitespace-nowrap font-mono text-[11px] tabular-nums">
              <span className="text-dim">{f.wallet}</span>
              <span className={f.side === "BUY" ? "text-acid" : "text-down"}>{f.side}</span>
              <span className="text-chrome">
                {f.qty} ${f.symbol}
              </span>
              <span className="text-muted">{f.route}</span>
              <span className="text-dim">{(f.ms / 1000).toFixed(2)}s</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
