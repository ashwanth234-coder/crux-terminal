"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useAuctionBids } from "@/hooks/useAuctionBids";
import { curvePoints, curveRange, demandAt, type BookBid } from "@/lib/demand";
import { priceUsd, type AuctionV2, type BatchVersion } from "@/lib/launchV2";

const PAD = { l: 52, r: 14, t: 18, b: 26 };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const tok = (v: bigint) => compact.format(Number(v) / 1e18);

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/**
 * The Demand Curve: cumulative bid demand at every price (from the auction's BidPlaced events), against the
 * tokens on sale. Where demand falls below the sale is where the batch clears; the lime line is the contract's
 * own findClearingPrice, so the drawing and the settlement can't disagree.
 */
export function DemandCurve({
  factory,
  id,
  auction,
  version,
  clearing,
  wouldGraduate,
  live,
  symbol,
}: {
  factory: Address;
  id: string;
  auction: AuctionV2;
  version: BatchVersion;
  /** findClearingPrice (or the settled price); null when it wouldn't clear. */
  clearing: bigint | null;
  wouldGraduate: boolean | null;
  live: boolean;
  symbol: string;
}) {
  const bids = useAuctionBids(factory, auction, BigInt(id), live);
  const { ref, w, h } = useSize<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const book: BookBid[] = bids.data?.book ?? [];
  const cap = version === 2 ? auction.maxAllocationPerWallet : null;
  const sale = auction.saleSupply;
  const floor = auction.floorPrice;
  const noLimitAbove = floor * BigInt(1_000_000); // V3's top tick and V2's 2^160-1 both mean "no limit" here
  const shownClearing = wouldGraduate === false ? null : clearing;
  const { lo, hi } = curveRange(book, floor, shownClearing, noLimitAbove);
  const points = curvePoints(book, lo, hi, cap);
  const atFloor = demandAt(book, floor, cap);
  const coverage = sale > BigInt(0) ? Number((atFloor * BigInt(10_000)) / sale) / 100 : 0;
  const noLimit = book.filter((b) => b.maxPrice >= noLimitAbove).length;

  const plotW = Math.max(0, w - PAD.l - PAD.r);
  const plotH = Math.max(0, h - PAD.t - PAD.b);
  const peak = points.length ? points[0].tokens : BigInt(0);
  const yMax = Number(peak > sale ? peak : sale) * 1.12 || 1;
  const logSpan = Math.log(Number(hi) / Number(lo));
  const x = (p: bigint) => PAD.l + (Math.log(Number(p) / Number(lo)) / logSpan) * plotW;
  const y = (t: bigint) => PAD.t + (1 - Number(t) / yMax) * plotH;
  const ready = w > 0 && h > 0 && plotW > 0 && plotH > 0;

  // Between limits demand falls smoothly (quote ÷ price); at a limit it drops sharply, because curvePoints
  // samples both sides of every limit (L and L + 1), which straight segments render as a vertical edge.
  let line = "";
  let area = "";
  if (ready && points.length) {
    line = `M ${x(points[0].price)} ${y(points[0].tokens)}`;
    for (let i = 1; i < points.length; i++) line += ` L ${x(points[i].price)} ${y(points[i].tokens)}`;
    area = `${line} V ${PAD.t + plotH} H ${x(points[0].price)} Z`;
  }

  // Phones get three price ticks; mono price labels are wide.
  const narrow = w < 520;
  const tickCount = narrow ? 3 : 5;
  const xTicks = ready
    ? Array.from({ length: tickCount }, (_, i) => BigInt(Math.round(Number(lo) * (Number(hi) / Number(lo)) ** (i / (tickCount - 1)))))
    : [];
  // The clearing label flips to the left of its line when it wouldn't fit on the right.
  const clearX = shownClearing ? x(shownClearing) : 0;
  const clearLabel = shownClearing ? `${auction.status === 1 ? "Cleared" : narrow ? "Clearing" : "Projected clearing"} ` : "";
  const clearPrice = shownClearing ? `$${priceUsd(shownClearing)}` : "";
  const flipLabel = clearX + (clearLabel.length + clearPrice.length) * 6.6 + 12 > w;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => BigInt(Math.round(yMax * f)));

  const hover = (() => {
    if (!ready || hoverX === null || hoverX < PAD.l || hoverX > PAD.l + plotW) return null;
    const price = BigInt(Math.round(Number(lo) * Math.exp(((hoverX - PAD.l) / plotW) * logSpan)));
    const d = demandAt(book, price, cap);
    const n = book.filter((b) => b.maxPrice >= price).length;
    return { price, d, n, pct: sale > BigInt(0) ? Number((d * BigInt(1000)) / sale) / 10 : 0 };
  })();

  return (
    <div className="flex h-full min-h-[inherit] flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pb-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-medium text-chrome">Demand curve</h2>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-px w-3 bg-acid" aria-hidden="true" /> Demand
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-px w-3 border-t border-dashed border-chrome/50" aria-hidden="true" /> Sale
          </span>
        </div>
        <p className="text-[11px] text-dim">
          <span className="font-mono text-muted">{book.length}</span> bidders · demand at floor{" "}
          <span className="font-mono text-muted">{coverage.toFixed(1)}%</span> of the sale
          {noLimit > 0 && (
            <>
              {" "}
              · <span className="font-mono text-muted">{noLimit}</span> no-limit
            </>
          )}
        </p>
      </div>

      <div
        ref={ref}
        className="relative min-h-[260px] flex-1 select-none"
        onPointerMove={(e) => setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setHoverX(null)}
        role="img"
        aria-label={`Demand curve: ${book.length} bidders; demand at the floor is ${coverage.toFixed(1)}% of the sale${
          shownClearing ? `; projected clearing price $${priceUsd(shownClearing)}` : "; not clearing yet"
        }.`}
      >
        {ready && (
          <svg width={w} height={h} className="absolute inset-0">
            {/* Grid */}
            {yTicks.map((t) => (
              <g key={`y${t}`}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
                <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-dim font-mono text-[10px]">
                  {tok(t)}
                </text>
              </g>
            ))}
            {xTicks.map((p, i) => (
              <text key={`x${i}`} x={x(p)} y={h - 8} textAnchor={i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle"} className="fill-dim font-mono text-[10px]">
                ${priceUsd(p)}
              </text>
            ))}

            {/* Demand: translucent area under a crisp line */}
            {area && <path d={area} className="fill-acid/[0.07]" />}
            {line && <path d={line} className="fill-none stroke-acid" strokeWidth={1.5} strokeLinejoin="round" />}

            {/* Tokens on sale */}
            <line x1={PAD.l} x2={PAD.l + plotW} y1={y(sale)} y2={y(sale)} className="stroke-chrome/50" strokeWidth={1} strokeDasharray="4 4" />
            <text x={PAD.l + plotW} y={y(sale) - 5} textAnchor="end" className="fill-muted text-[10.5px]">
              Sale {tok(sale)} {symbol}
            </text>

            {/* Floor */}
            <line x1={x(floor)} x2={x(floor)} y1={PAD.t} y2={PAD.t + plotH} className="stroke-line-2" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(floor) + 4} y={PAD.t + 10} className="fill-dim text-[10px]">
              Floor
            </text>

            {/* The contract's projected clearing price */}
            {shownClearing && shownClearing >= lo && shownClearing <= hi && (
              <g>
                <line x1={x(shownClearing)} x2={x(shownClearing)} y1={PAD.t} y2={PAD.t + plotH} className="stroke-acid" strokeWidth={1} />
                <text x={clearX + (flipLabel ? -6 : 6)} y={PAD.t + 24} textAnchor={flipLabel ? "end" : "start"} className="fill-chrome text-[11px]">
                  {clearLabel}
                  <tspan className="font-mono">{clearPrice}</tspan>
                </text>
              </g>
            )}

            {/* Crosshair */}
            {hover && (
              <line x1={hoverX!} x2={hoverX!} y1={PAD.t} y2={PAD.t + plotH} className="stroke-chrome/30" strokeWidth={1} />
            )}
          </svg>
        )}

        {hover && (
          <div
            className="pointer-events-none absolute top-8 z-10 rounded-md border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[11px] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.9)]"
            style={hoverX! > w / 2 ? { right: w - hoverX! + 10 } : { left: hoverX! + 10 }}
          >
            <p className="text-muted">
              At <span className="font-mono text-chrome">${priceUsd(hover.price)}</span>
            </p>
            <p className="text-muted">
              Demand <span className="font-mono text-chrome">{tok(hover.d)}</span> (<span className="font-mono">{hover.pct.toFixed(1)}%</span> of sale)
            </p>
            <p className="text-muted">
              From <span className="font-mono text-chrome">{hover.n}</span> {hover.n === 1 ? "bid" : "bids"}
            </p>
          </div>
        )}

        {/* States */}
        {bids.isPending && <p className="absolute inset-x-0 top-1/2 text-center text-[12px] text-dim">Reading bids from Base Sepolia…</p>}
        {bids.isError && !bids.data && (
          <p className="absolute inset-x-0 top-1/2 text-center text-[12px] text-dim">Couldn&apos;t read the bids. Retrying…</p>
        )}
        {bids.data && book.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-[12px] text-dim">No bids yet. The curve forms as bids arrive.</p>
        )}
      </div>

      <p className="px-1 pt-1.5 text-[11px] leading-snug text-dim">
        {shownClearing
          ? `Demand covers the sale up to $${priceUsd(shownClearing)}: every filled bid pays that one price.`
          : book.length > 0
            ? `Not clearing yet: demand at the floor covers ${coverage.toFixed(1)}% of the sale. Below 100% when the window closes, the launch cancels and everyone is refunded.`
            : "Each bid adds demand up to its limit price. The batch clears where demand meets the sale line."}
        {bids.data?.truncated && " Bids older than about six days aren't shown."}
      </p>
    </div>
  );
}
