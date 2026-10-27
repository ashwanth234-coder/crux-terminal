/**
 * The anti-vamp launch guard's rules (pure, no chain or network reads; shared by /api/launch-check and its tests):
 * a new launch may not reuse a ticker that another Crux token holds, its artwork, or its X account.
 *
 * - Tickers compare after normalisation (case, spaces, symbols and common leetspeak removed), so PEPE, pepe, P.E.P.E
 *   and P3P3 are one ticker. A graduated token holds its ticker for good; a live auction holds it while it runs; a
 *   cancelled one for an hour after it closed, so a failed launch can't be re-sniped by a copy at once.
 * - Artwork compares by exact file hash (SHA-256) and by an 8x8 difference hash (dHash), so a re-encoded or resized
 *   copy is caught too. Only active and graduated tokens' artwork counts.
 * - X / Twitter links compare after normalisation (twitter.com and x.com, case, query and trailing slash ignored).
 *
 * The guard runs where Crux launches are made (the launch form and the gasless relay). The factories themselves are
 * permissionless, so a launch sent straight to the contract isn't stopped by it.
 */

export const TICKER_LOCK_AFTER_CANCEL_SECONDS = 3_600;
/** Two dHashes this close (bits of 64) are the same picture. */
export const NEAR_ARTWORK_BITS = 5;

const LEET: Record<string, string> = { "0": "o", "1": "i", l: "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a" };

/** A ticker reduced to what a reader sees: "$P3P3 " and "pepe" are both "pepe" ("l" and "1" read as "i"). */
export function normalizeTicker(raw: string): string {
  const plain = raw
    .trim()
    .replace(/^\$+/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of plain) {
    const c = LEET[ch] ?? ch;
    if (/[a-z0-9]/.test(c)) out += c;
  }
  return out;
}

/**
 * An X / Twitter profile or post link as "x.com/handle" or "x.com/handle/status/123", lower-cased; null when it
 * isn't one. "@handle" counts as the profile.
 */
export function normalizeXUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const at = /^@([a-z0-9_]{1,15})$/i.exec(s);
  if (at) return `x.com/${at[1].toLowerCase()}`;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0 || !/^[a-z0-9_]{1,15}$/i.test(parts[0])) return null;
  const handle = parts[0].toLowerCase();
  if (parts[1] === "status" && /^\d+$/.test(parts[2] ?? "")) return `x.com/${handle}/status/${parts[2]}`;
  return `x.com/${handle}`;
}

/** Differing bits between two 64-bit hashes written as 16 hex characters. */
export function hammingHex(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x > BigInt(0)) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}

/**
 * dHash of a 9x8 grayscale image (72 bytes, row by row): one bit per pixel, set when it is darker than its right
 * neighbour, as 16 hex characters.
 */
export function dHashOf(gray9x8: Uint8Array): string {
  if (gray9x8.length !== 72) throw new Error("dHash needs a 9x8 grayscale image");
  let h = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      h = (h << BigInt(1)) | (gray9x8[y * 9 + x] < gray9x8[y * 9 + x + 1] ? BigInt(1) : BigInt(0));
    }
  }
  return h.toString(16).padStart(16, "0");
}

export type Artwork = { sha256: string; dhash: string };

export type GuardLaunch = {
  symbol: string;
  token: string;
  /** The token's terminal page. */
  href: string;
  phase: "scheduled" | "open" | "closed" | "graduated" | "cancelled";
  /** Unix seconds the auction closes(d). */
  closesAt: number;
  x: string | null;
  art: Artwork | null;
};

export type ConflictKind = "ticker" | "artwork" | "artwork-near" | "x";
export type Conflict = { kind: ConflictKind; symbol: string; token: string; href: string };

const LABEL: Record<ConflictKind, string> = {
  ticker: "Ticker reserved on CRUX",
  artwork: "Exact artwork already used",
  "artwork-near": "Near-identical artwork already used",
  x: "X account already used",
};

/** The banner line for a set of conflicts, e.g. "Ticker reserved on CRUX · Exact artwork already used". */
export function conflictLine(conflicts: Conflict[]): string {
  return [...new Set(conflicts.map((c) => c.kind))].map((k) => LABEL[k]).join(" · ");
}

/** Whether a launch holds its ticker at `now`. */
export function holdsTicker(l: Pick<GuardLaunch, "phase" | "closesAt">, now: number): boolean {
  return l.phase !== "cancelled" || now < l.closesAt + TICKER_LOCK_AFTER_CANCEL_SECONDS;
}

/** Everything a proposed launch would copy from an existing Crux token, at `now`. */
export function checkLaunch(proposal: { symbol: string; x?: string | null; art?: Artwork | null }, launches: GuardLaunch[], now: number): Conflict[] {
  const ticker = normalizeTicker(proposal.symbol);
  const x = normalizeXUrl(proposal.x);
  const out: Conflict[] = [];
  for (const l of launches) {
    const at = { symbol: l.symbol, token: l.token, href: l.href };
    if (ticker && normalizeTicker(l.symbol) === ticker && holdsTicker(l, now)) out.push({ kind: "ticker", ...at });
    if (l.phase === "cancelled") continue;
    if (proposal.art && l.art) {
      if (proposal.art.sha256 === l.art.sha256) out.push({ kind: "artwork", ...at });
      else if (hammingHex(proposal.art.dhash, l.art.dhash) <= NEAR_ARTWORK_BITS) out.push({ kind: "artwork-near", ...at });
    }
    if (x && normalizeXUrl(l.x) === x) out.push({ kind: "x", ...at });
  }
  return out;
}
