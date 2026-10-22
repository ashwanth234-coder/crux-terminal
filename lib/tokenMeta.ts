import { parseAbi } from "viem";

/** CruxToken.metadataURI: the creator's description, links and logo, stored with the token at launch. */
export const tokenMetaAbi = parseAbi(["function metadataURI() view returns (string)"]);

export type TokenMeta = {
  description: string | null;
  /** https URL of the logo the creator gave at launch, if any. */
  image: string | null;
  links: { x: string | null; farcaster: string | null; website: string | null };
};

const EMPTY: TokenMeta = { description: null, image: null, links: { x: null, farcaster: null, website: null } };

/** Only plain https URLs are ever turned into links or images. */
function https(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "@crux", "crux" or a full URL → a profile link on `host`. */
function handle(value: unknown, host: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (/^https:\/\//i.test(v)) return https(v);
  const name = v.replace(/^@/, "");
  return /^[A-Za-z0-9_.-]{1,40}$/.test(name) ? `https://${host}/${name}` : null;
}

/** Decodes the data: URI the Crux launch form stores in CruxToken.metadataURI (never fetches a remote URI). */
export function parseTokenMeta(uri: string | undefined): TokenMeta {
  if (!uri) return EMPTY;
  const m = /^data:application\/json;base64,(.+)$/.exec(uri);
  if (!m) return EMPTY;
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    const links = json?.links ?? {};
    const description = typeof json?.description === "string" && json.description.trim() ? json.description.trim().slice(0, 500) : null;
    return {
      description,
      image: https(json?.image),
      links: { x: handle(links.x, "x.com"), farcaster: handle(links.farcaster, "farcaster.xyz"), website: https(links.website) },
    };
  } catch {
    return EMPTY;
  }
}
