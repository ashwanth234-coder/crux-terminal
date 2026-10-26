import type { Candle } from "./candles";

export type ProfileRow = { lo: number; hi: number; buy: number; sell: number };
export type Profile = { rows: ProfileRow[]; poc: number; vaLo: number; vaHi: number; total: number };

/**
 * Volume at each price level over `candles`: each candle's USDC volume is spread evenly over the rows its low–high
 * range covers, split into buying and selling by its own buy / sell volume (or its direction when that isn't known).
 * The point of control is the busiest row; the value area grows out from it until it holds `vaPct` of the volume.
 */
export function volumeProfile(candles: Candle[], buyUsd: number[], sellUsd: number[], rowsN: number, vaPct: number, offset = 0): Profile | null {
  if (candles.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  if (!(hi > lo)) hi = lo * 1.001 + 1e-18;
  const step = (hi - lo) / rowsN;
  const rows: ProfileRow[] = Array.from({ length: rowsN }, (_, i) => ({ lo: lo + i * step, hi: lo + (i + 1) * step, buy: 0, sell: 0 }));
  candles.forEach((c, j) => {
    if (c.volume <= 0) return;
    const b = buyUsd[j + offset] ?? 0;
    const s = sellUsd[j + offset] ?? 0;
    const buyShare = b + s > 0 ? b / (b + s) : c.close >= c.open ? 1 : 0;
    const first = Math.max(0, Math.min(rowsN - 1, Math.floor((c.low - lo) / step)));
    const last = Math.max(0, Math.min(rowsN - 1, Math.floor((c.high - lo) / step)));
    const each = c.volume / (last - first + 1);
    for (let i = first; i <= last; i++) {
      rows[i].buy += each * buyShare;
      rows[i].sell += each * (1 - buyShare);
    }
  });
  const vol = (r: ProfileRow) => r.buy + r.sell;
  const total = rows.reduce((t, r) => t + vol(r), 0);
  if (total <= 0) return null;
  let poc = 0;
  rows.forEach((r, i) => vol(r) > vol(rows[poc]) && (poc = i));
  let vaLo = poc;
  let vaHi = poc;
  let inside = vol(rows[poc]);
  while (inside < (total * vaPct) / 100 && (vaLo > 0 || vaHi < rowsN - 1)) {
    const below = vaLo > 0 ? vol(rows[vaLo - 1]) : -1;
    const above = vaHi < rowsN - 1 ? vol(rows[vaHi + 1]) : -1;
    if (above >= below) inside += vol(rows[++vaHi]);
    else inside += vol(rows[--vaLo]);
  }
  return { rows, poc, vaLo, vaHi, total };
}
