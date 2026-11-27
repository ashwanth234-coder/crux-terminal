/**
 * When a coin really started trading (ms), for its "Age" and "Trading since": the market sites' own date is when its
 * market was created, which can be hours off either way.
 *   - A pump.fun coin traded on its curve before its market existed: its first curve trade (launch history) is earlier.
 *   - A market can be created empty and trade hours later ($POLO, 2026-11-27: created 06:27, first trade 10:42): when the
 *     market's first traded hour is more than an hour after its creation, that hour is the start. Only when the hourly
 *     history reaches back to the start (fewer than `HOURS_READ` candles), else it was cut and says nothing.
 */
export const HOURS_READ = 1_000;

export function tradingSince(o: { marketCreatedAt?: number; firstHour?: number; hours: number; launchFirst?: number }): number | undefined {
  if (o.launchFirst !== undefined && (o.marketCreatedAt === undefined || o.launchFirst < o.marketCreatedAt)) return o.launchFirst;
  const firstHourMs = o.firstHour !== undefined ? o.firstHour * 1000 : undefined;
  if (firstHourMs !== undefined && o.hours > 0 && o.hours < HOURS_READ && (o.marketCreatedAt === undefined || firstHourMs > o.marketCreatedAt + 3_600_000)) return firstHourMs;
  return o.marketCreatedAt;
}
