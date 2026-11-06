/** (Copied from crux-solver scripts/logtime.ts.)
 *
 * Base's Denim upgrade (live on Base Sepolia) seals a block every 200 ms and dates every log with `blockTimestampMs`
 * (blocks with `timestampMs`). Five blocks share one whole-second `timestamp`, so trades in the same second only get
 * their real order in time from these. viem passes the fields through as the node sent them (hex strings); a node
 * without Denim leaves them out, and callers fall back to the second.
 */
function parseMs(v: unknown): number | undefined {
  try {
    const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : typeof v === "string" && v ? Number(BigInt(v)) : NaN;
    // Anything before 2020 or past 2100 isn't a millisecond Unix time.
    return Number.isFinite(n) && n > 1.5e12 && n < 4.2e12 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** A log's block time in milliseconds, or undefined when the node didn't send it. */
export const logTimeMs = (log: unknown): number | undefined => parseMs((log as { blockTimestampMs?: unknown } | null)?.blockTimestampMs);

/** A block's time in milliseconds, or undefined when the node didn't send it. */
export const blockTimeMs = (block: unknown): number | undefined => parseMs((block as { timestampMs?: unknown } | null)?.timestampMs);
