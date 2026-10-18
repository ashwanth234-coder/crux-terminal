"use client";

import { useEffect, useState } from "react";

const WINDOW = 60;

/** Live countdown for the current 60s batch window, synced to wall-clock minutes. */
export function AuctionClock() {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(WINDOW - (Math.floor(Date.now() / 1000) % WINDOW));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 text-center">
      <p className="font-display-md text-[46px] font-light leading-none tracking-tight text-chrome">
        60<span className="text-[30px] text-chrome/70">s</span>
      </p>
      <p className="mt-2 text-[12px] text-muted">Batch auction</p>
      <p className="mt-1 text-[12px] text-chrome/70" suppressHydrationWarning>
        Clears in <span className="font-mono tabular-nums text-acid">00:{left === null ? "--" : String(left).padStart(2, "0")}</span>
      </p>
    </div>
  );
}
