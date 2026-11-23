"use client";

import { useMemo } from "react";
import { useHolders, type CheckChain } from "@/hooks/useBuyCheck";
import { findBundle, walletShare, type MapHolder } from "@/lib/holderMap";

const W = 560;
const H = 300;

type Placed = MapHolder & { x: number; y: number; r: number; bundled: boolean };

/**
 * Bubbles packed from the middle out, biggest first, each the area of its holder's share: a spiral walk finds the first
 * spot that overlaps nothing. Pure, for the map.
 */
export function packBubbles(holders: MapHolder[], bundled: Set<string>): Placed[] {
  const top = Math.max(...holders.map((h) => h.pct), 1);
  const scale = 70 / Math.sqrt(top);
  const out: Placed[] = [];
  for (const h of holders) {
    const r = Math.max(7, Math.sqrt(h.pct) * scale);
    let x = W / 2;
    let y = H / 2;
    for (let t = 0; t < 4_000; t++) {
      const a = t * 0.35;
      const d = t * 0.9;
      x = W / 2 + Math.cos(a) * d;
      y = H / 2 + Math.sin(a) * d * 0.6;
      if (out.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r + 2)) break;
    }
    out.push({ ...h, x, y, r, bundled: bundled.has(h.owner) });
  }
  return out;
}

const COLOR = { pool: "var(--color-dim, #6b7280)", creator: "var(--color-down, #ef4444)", bundled: "var(--color-signal, #ff6a00)", wallet: "var(--color-up, #22c55e)" };

/**
 * A coin's holder map: its biggest holders as bubbles sized by their share. Pools grey, the creator red, wallets that
 * look like one buyer split across them orange, other wallets green. A click opens the wallet on the chain's explorer.
 */
export function HolderMap({ chain, coin, accountUrl }: { chain: CheckChain; coin: string; accountUrl: (a: string) => string }) {
  const q = useHolders(chain, coin);
  const holders = useMemo(() => q.data ?? [], [q.data]);
  const bundle = useMemo(() => findBundle(holders), [holders]);
  const placed = useMemo(() => packBubbles(holders, new Set(bundle?.wallets ?? [])), [holders, bundle]);

  if (q.isLoading) return <p className="py-6 text-center text-[12.5px] text-dim">Reading the biggest holders…</p>;
  if (!q.data || holders.length === 0) return <p className="py-6 text-center text-[12.5px] text-dim">{"Couldn't read this coin's holders yet. Try again in a minute."}</p>;

  const creator = holders.find((h) => h.kind === "creator");
  const pools = holders.filter((h) => h.kind === "pool").reduce((s, h) => s + h.pct, 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-h-[320px]" role="img" aria-label="Holder map: the biggest holders as bubbles">
        {placed.map((p) => {
          const fill = p.bundled ? COLOR.bundled : COLOR[p.kind];
          return (
            <a key={p.owner} href={accountUrl(p.owner)} target="_blank" rel="noopener noreferrer">
              <circle cx={p.x} cy={p.y} r={p.r} fill={fill} fillOpacity={0.22} stroke={fill} strokeWidth={1.4}>
                <title>{`${p.owner} · ${p.pct.toFixed(2)}% · ${p.bundled ? "maybe one buyer split across wallets" : p.kind}`}</title>
              </circle>
              {p.r >= 16 && (
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fill="currentColor" className="pointer-events-none font-mono text-chrome">
                  {p.pct >= 10 ? p.pct.toFixed(0) : p.pct.toFixed(1)}%
                </text>
              )}
            </a>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        {(
          [
            ["Pool", COLOR.pool],
            ["Creator", COLOR.creator],
            ["Maybe one buyer", COLOR.bundled],
            ["Wallet", COLOR.wallet],
          ] as const
        ).map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-[12.5px]">
        <li className="text-muted">
          {`The top ${holders.length} holders: wallets own ${walletShare(holders).toFixed(1)}% of the supply`}
          {pools > 0 ? `, pools ${pools.toFixed(1)}%` : ""}.
        </li>
        {creator && <li className={creator.pct >= 10 ? "text-down" : "text-muted"}>{`The creator holds ${creator.pct.toFixed(1)}%.`}</li>}
        {bundle ? (
          <li className="text-signal">{`⚠ ${bundle.wallets.length} wallets hold almost the same amount (${bundle.pct.toFixed(1)}% together): likely one buyer split across wallets.`}</li>
        ) : (
          <li className="text-muted">No group of wallets holding identical amounts among the top holders.</li>
        )}
        <li className="text-dim">{"Shows the biggest holders only; wallets linked by who funded them aren't traced yet."}</li>
      </ul>
    </div>
  );
}
