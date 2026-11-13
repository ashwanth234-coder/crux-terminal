// Base Builder Code attribution (ERC-8021) for the transactions a trader's own wallet sends from the site (deposits,
// approvals, a cross-chain order's open): a suffix appended to the calldata, so Base credits Crux with the activity.
// Contracts never see it (ABI decoding ignores trailing bytes); the solver appends the same one to everything it sends
// (crux-solver scripts/attribution.ts).
//
// Schema 0 (the canonical registry), read from the end of the calldata:
//   codes (ASCII, comma-separated) · codes length (1 byte) · schema id 0x00 (1 byte) · 0x8021 × 8 (16 bytes)
import { concat, toHex, type Hex } from "viem";

/** Crux's Base Builder Code. */
export const BUILDER_CODE = "bc_n7i0zwf4";
export const ERC8021_MARKER: Hex = "0x80218021802180218021802180218021";

/** The ERC-8021 schema 0 suffix for `codes`. */
export function attributionSuffix(codes: readonly string[]): Hex {
  if (codes.length === 0) throw new Error("attribution needs at least one code");
  for (const c of codes) if (!/^[\x21-\x2b\x2d-\x7e]+$/.test(c)) throw new Error(`invalid builder code ${JSON.stringify(c)}`);
  const text = codes.join(",");
  if (text.length > 255) throw new Error("builder codes are over 255 bytes together");
  return concat([toHex(text), toHex(text.length, { size: 1 }), "0x00", ERC8021_MARKER]);
}

/** The suffix for NEXT_PUBLIC_BUILDER_CODE (comma-separated for several, "off" for none), Crux's own by default. */
export function suffixFor(value: string | undefined): Hex | undefined {
  const v = value?.trim() || BUILDER_CODE;
  if (v.toLowerCase() === "off") return undefined;
  return attributionSuffix(v.split(",").map((c) => c.trim()).filter(Boolean));
}

/** What every wallet write on the site appends (wagmi/viem's `dataSuffix`). */
export const BUILDER_SUFFIX = suffixFor(process.env.NEXT_PUBLIC_BUILDER_CODE);
