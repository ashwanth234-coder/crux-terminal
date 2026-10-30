import { createHash } from "node:crypto";
import sharp from "sharp";
import { dHashOf, type Artwork } from "@/lib/antiVamp";
import { imageDataUri } from "@/lib/tokenMeta";

/**
 * A token image's fingerprints for the anti-vamp guard (server only): the exact file's SHA-256 and an 8x8 dHash of
 * the picture. Images are fetched from https URLs on public hostnames only, at most 5 MB within 6 seconds, or decoded
 * from an uploaded display image (a small data: URI), and remembered per server instance.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 6_000;

/** https on a public hostname: no IP literals, localhost or internal names (so the guard can't probe private hosts). */
export function fetchableImageUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".")) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) return null;
  return url;
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("image over 5 MB");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function fetchImage(raw: string): Promise<Uint8Array | null> {
  const url = fetchableImageUrl(raw);
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow", headers: { "User-Agent": "CruxLaunchGuard/1.0 (+https://cruxprotocol.xyz)", Accept: "image/*" } });
  // A redirect must land on a public https host too.
  if (!res.ok || !fetchableImageUrl(res.url || url.toString())) return null;
  return readCapped(res);
}

const cache = new Map<string, Promise<Artwork | null>>();

/** The image's fingerprints, or null when it can't be fetched or decoded as an image. */
export function artworkOf(raw: string): Promise<Artwork | null> {
  let p = cache.get(raw);
  if (!p) {
    p = (async () => {
      const bytes = imageDataUri(raw) ? new Uint8Array(Buffer.from(raw.slice(raw.indexOf(",") + 1), "base64")) : await fetchImage(raw);
      if (!bytes) return null;
      const gray = await sharp(bytes, { limitInputPixels: 50_000_000 }).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
      return { sha256: createHash("sha256").update(bytes).digest("hex"), dhash: dHashOf(new Uint8Array(gray)) };
    })().catch(() => null);
    cache.set(raw, p);
  }
  return p;
}
