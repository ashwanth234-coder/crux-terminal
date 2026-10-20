"use client";

import Link from "next/link";
import { useState } from "react";
import { KineticLoader } from "@/components/ui/Modal";
import { useGraduatedLaunches, useLaunchMarket, type GraduatedLaunch } from "@/hooks/useLaunchMarket";
import { TradeWidget } from "./TradeWidget";

/**
 * The terminal's trade panel. It offers every graduated Crux launch (V2 and V3, found on-chain, so a new
 * graduation appears without a deploy), each priced from its locked Uniswap pool. The demo NOVA market is a
 * fallback, shown only while no launch has graduated.
 */
export function TerminalTrade() {
  const { launches, loading } = useGraduatedLaunches();
  const [picked, setPicked] = useState<string | null>(null);

  if (launches.length === 0) {
    if (loading) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center gap-2 rounded-xl border border-line bg-void/60 text-[12px] text-muted">
          <KineticLoader className="text-acid" /> Reading graduated launches…
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col gap-2">
        <p className="px-1 text-[11.5px] text-dim">No Crux launch has graduated yet · showing the demo NOVA market</p>
        <TradeWidget />
      </div>
    );
  }

  const selected = launches.find((l) => l.key === picked) ?? launches[0];
  return (
    <div className="flex h-full flex-col gap-2">
      {launches.length > 1 && (
        <div role="radiogroup" aria-label="Graduated launch to trade" className="flex gap-1.5 overflow-x-auto pb-0.5">
          {launches.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={l.key === selected.key}
              onClick={() => setPicked(l.key)}
              className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                l.key === selected.key ? "border-acid/50 text-chrome" : "border-line-2 text-muted hover:text-chrome"
              }`}
            >
              ${l.symbol}
              {!l.listed && <span className="ml-1 text-dim">· not listed</span>}
            </button>
          ))}
        </div>
      )}
      <LaunchPane key={selected.key} launch={selected} />
    </div>
  );
}

function LaunchPane({ launch }: { launch: GraduatedLaunch }) {
  const market = useLaunchMarket(launch.token, launch.pair);
  return (
    <>
      <p className="px-1 text-[11.5px] text-dim">
        Graduated Crux launch ·{" "}
        <Link href={launch.href} className="underline decoration-line-2 hover:text-chrome">
          {launch.version === 3 ? "V3" : "V2"} #{launch.id}
        </Link>{" "}
        · locked Uniswap pool
      </p>
      <TradeWidget launch={{ symbol: launch.symbol, market }} />
    </>
  );
}
