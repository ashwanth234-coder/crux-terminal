import { connection } from "next/server";
import { checkLaunch, conflictLine, normalizeTicker, type GuardLaunch } from "@/lib/antiVamp";
import { artworkOf } from "@/lib/artwork";
import { readLaunches } from "@/lib/launchFeed";
import { MAX_IMAGE_DATA_URI } from "@/lib/tokenMeta";

/**
 * POST /api/launch-check { symbol, image?, x? }: whether a proposed launch copies an existing Crux token (lib/antiVamp):
 * its ticker (normalised), its artwork (exact file or near-identical picture) or its X account.
 *   → { ok, line, conflicts: [{ kind, symbol, token, href }], artwork: "matched" | "unique" | "unreadable" | "none" }
 * Used by the launch form as the creator types, and by the gasless launch relay before it sends a launch.
 */
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" } });
}

export async function POST(request: Request) {
  await connection();
  let body: { symbol?: unknown; image?: unknown; x?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON: { symbol, image?, x? }" }, 400);
  }
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v.trim() : "");
  const symbol = str(body.symbol, 32);
  // An https URL, or an uploaded display image (a small data: URI).
  const image = str(body.image, MAX_IMAGE_DATA_URI);
  const x = str(body.x, 512);
  if (!normalizeTicker(symbol)) return json({ error: "symbol is required" }, 400);

  let launches;
  try {
    launches = await readLaunches();
  } catch {
    return json({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
  const now = Math.floor(Date.now() / 1000);
  // Artwork only counts for tokens still active or graduated; read those (cached per URL) alongside the proposal's.
  const [art, guarded] = await Promise.all([
    image ? artworkOf(image) : Promise.resolve(null),
    Promise.all(
      launches.map(
        async (l): Promise<GuardLaunch> => ({
          symbol: l.symbol,
          token: l.token,
          href: `/launch/v${l.version}/${l.auctionId}`,
          phase: l.phase,
          closesAt: l.closesAt,
          x: l.metadata.links.x,
          art: image && l.phase !== "cancelled" && l.metadata.image ? await artworkOf(l.metadata.image) : null,
        }),
      ),
    ),
  ]);
  const conflicts = checkLaunch({ symbol, x, art }, guarded, now);
  const artwork = !image ? "none" : !art ? "unreadable" : conflicts.some((c) => c.kind.startsWith("artwork")) ? "matched" : "unique";
  return json({ ok: conflicts.length === 0, line: conflictLine(conflicts), conflicts, artwork });
}
