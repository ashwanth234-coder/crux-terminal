/**
 * A coin's own links (website, X, Telegram, Discord) and the launchpad it came from, for the coin page header. Links
 * come from Jupiter's token list (Solana) and DexScreener's pool info (every chain); both are written by the coin's
 * team, so only plain https links are kept. Pure, for tests.
 */

export type CoinLink = { kind: "website" | "x" | "telegram" | "discord"; label: string; url: string };

const LABEL: Record<CoinLink["kind"], string> = { website: "Website", x: "X", telegram: "Telegram", discord: "Discord" };

/** `u` when it's an https link of a sane length, else null (no other scheme ever becomes a link). */
export function safeLink(u: string | null | undefined): string | null {
  const s = (u ?? "").trim();
  if (s.length === 0 || s.length > 512) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

type JupiterLinks = { website?: string | null; twitter?: string | null; telegram?: string | null; discord?: string | null };
type DexInfo = { websites?: { label?: string; url?: string }[]; socials?: { type?: string; url?: string }[] };

const kindOf = (type: string | undefined): CoinLink["kind"] | null => {
  const t = (type ?? "").toLowerCase();
  if (t === "twitter" || t === "x") return "x";
  if (t === "telegram") return "telegram";
  if (t === "discord") return "discord";
  return null;
};

/** The coin's links, each kind once, in the order website, X, Telegram, Discord: Jupiter's first, DexScreener's after. */
export function coinLinks(jupiter: JupiterLinks | null | undefined, dex: DexInfo | null | undefined): CoinLink[] {
  const found = new Map<CoinLink["kind"], string>();
  const add = (kind: CoinLink["kind"] | null, url: string | null | undefined) => {
    const ok = safeLink(url);
    if (kind && ok && !found.has(kind)) found.set(kind, ok);
  };
  add("website", jupiter?.website);
  add("x", jupiter?.twitter);
  add("telegram", jupiter?.telegram);
  add("discord", jupiter?.discord);
  for (const w of dex?.websites ?? []) add("website", w.url);
  for (const s of dex?.socials ?? []) add(kindOf(s.type), s.url);
  return (["website", "x", "telegram", "discord"] as const).filter((k) => found.has(k)).map((k) => ({ kind: k, label: LABEL[k], url: found.get(k)! }));
}

/**
 * The launchpad a coin came from, as traders know it, or null when it isn't known for sure: Jupiter's own field
 * (Solana), the launchpads' address endings (pump.fun mints end in "pump", LetsBonk's in "bonk", four.meme's tokens in
 * "4444", Crux's in "5afe"), or the market DexScreener lists it on.
 */
export function launchpadOf(c: { network: string; token: string; dexId?: string; jupiter?: string | null }): string | null {
  const jup = (c.jupiter ?? "").trim();
  if (jup) return jup;
  const t = c.token.toLowerCase();
  const dex = (c.dexId ?? "").toLowerCase();
  if (c.network === "solana") {
    if (t.endsWith("pump") || dex === "pumpfun") return "pump.fun";
    if (t.endsWith("bonk") || dex === "launchlab") return "LetsBonk";
    if (dex === "moonshot") return "Moonshot";
    return null;
  }
  if (t.endsWith("5afe")) return "Crux";
  if (c.network === "bsc" && (dex === "fourmeme" || t.endsWith("4444"))) return "four.meme";
  if (c.network === "base" && dex === "zora") return "Zora";
  return null;
}
