import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { createPublicClient, erc20Abi, fallback, http, getAddress, type Address } from "viem";
import { base } from "viem/chains";
import { CRUX_MARK_PATH } from "@/components/site/Logo";
import { BASE_RPCS, NETWORK } from "@/lib/network";
import { noReceiptPossible, parseReceiptParams, rateLimiter } from "@/lib/receiptGuard";
import { RELAY_URL } from "@/lib/readCache";
import { ttlCache } from "@/lib/ttlCache";
import { V4_HOOK, V4_REWARDS, readCreator, readV4Launch, type V4Launch } from "@/lib/v4launch";
import { buildReceipt, fetchRewards, readEarlyFees, readEthUsd, readWalletPaid, type RewardsResult } from "@/lib/v4receipt";

const size = { width: 1200, height: 800 };
const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });

type Cached = { status: number; body: ArrayBuffer | string; type: string; maxAge: number };
/** Finished answers (images and 404s) by coin and wallet, so a repeat or a random-wallet flood costs nothing. */
const answers = ttlCache<Cached>(2_000, 120_000);
const launches = ttlCache<V4Launch | null>(500, 60_000);
const files = ttlCache<RewardsResult>(500, 60_000);
const creators = ttlCache<Address>(500, 600_000);
const symbols = ttlCache<string>(500, 3_600_000);
/** 12 images a minute per client address; at most 4 reads in flight at once. */
const allow = rateLimiter(12, 60_000);
const MAX_IN_FLIGHT = 4;
let inFlight = 0;

function reply(c: Cached): Response {
  return new Response(c.body, {
    status: c.status,
    headers: { "Content-Type": c.type, "Cache-Control": `public, max-age=${c.maxAge}, s-maxage=${c.maxAge}` },
  });
}
const text = (status: number, body: string, maxAge: number): Cached => ({ status, body, type: "text/plain; charset=utf-8", maxAge });

/**
 * GET /api/receipt?coin=0x…&wallet=0x…: the holders' receipt as a shareable image. Only the two addresses come from
 * the query; the list, the logs and every number on the card are read here. A wallet with no line in the posted list
 * that isn't the coin's creator is answered 404 before any log is read, and every answer is cached briefly.
 */
export async function GET(request: Request) {
  await connection();
  const p = parseReceiptParams(new URL(request.url).searchParams);
  if (!p.ok) return reply(text(400, p.message, 300));
  if (NETWORK.testnet) return reply(text(404, "Receipts are on Base mainnet only", 300));
  const coin = getAddress(p.coin);
  const wallet = getAddress(p.wallet);
  const key = `${coin}:${wallet}`;
  const done = answers.get(key);
  if (done) return reply(done);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!allow(ip)) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  if (inFlight >= MAX_IN_FLIGHT) return new Response("Busy, retry shortly", { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });
  inFlight++;
  try {
    const out = await build(coin, wallet);
    answers.set(key, out);
    return reply(out);
  } catch {
    return reply(text(503, "Couldn't read Base right now. Retry shortly.", 15));
  } finally {
    inFlight--;
  }
}

async function build(coin: Address, wallet: Address): Promise<Cached> {
  let launch = launches.get(coin);
  if (launch === undefined) {
    launch = await readV4Launch(client, coin);
    launches.set(coin, launch, launch ? 60_000 : 300_000);
  }
  if (!launch) return text(404, "Not a Crux coin", 300);

  let list = files.get(coin);
  if (!list) {
    list = await fetchRewards(RELAY_URL, coin);
    if (list.status !== "error") files.set(coin, list);
  }
  if (list.status === "error") throw new Error("list unreachable");
  const file = list.status === "ok" ? list.file : null;

  let creator = creators.get(coin) ?? null;
  if (!creator) {
    creator = await readCreator(client, coin);
    if (!creator) throw new Error("creator unreadable");
    creators.set(coin, creator);
  }
  // No line in the list and not the creator: nothing to show, and no log is read.
  if (noReceiptPossible(file, wallet, creator)) return text(404, "No receipt for this wallet", 300);

  let symbol = symbols.get(coin);
  if (symbol === undefined) {
    symbol = await client.readContract({ address: coin, abi: erc20Abi, functionName: "symbol" }).catch(() => "COIN");
    symbols.set(coin, symbol);
  }
  const [earlyFees, paid, ethUsd] = await Promise.all([
    readEarlyFees(client, V4_HOOK, coin, launch),
    readWalletPaid(client, V4_HOOK, V4_REWARDS, coin, wallet, launch, file?.snapshotAt ?? launch.launchedAt + 86_400),
    readEthUsd(client),
  ]);
  const r = buildReceipt({ symbol, launch, file, wallet, logs: { earlyFees, ...paid }, ethUsd });
  if (!r) return text(404, "No receipt for this wallet", 300);

  const line = (label: string, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #292B2F", paddingBottom: 12, fontSize: 26 }}>
      <div style={{ display: "flex", color: "#A7ADB5" }}>{label}</div>
      <div style={{ display: "flex", maxWidth: 700, textAlign: "right" }}>{value}</div>
    </div>
  );
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#000000", color: "#F5F3EE", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontSize: 30, letterSpacing: 14, fontWeight: 500 }}>CRU</div>
            <svg width="27" height="27" viewBox="0 0 24 24">
              <path d={CRUX_MARK_PATH} fill="#ff5500" fillRule="evenodd" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#A7ADB5" }}>{r.kind === "creator" ? "CREATOR PAYOUT" : "HOLDER PAYOUT"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 40, color: "#A7ADB5" }}>{`${r.coin} · launched ${r.launchDate}`}</div>
          <div style={{ display: "flex", fontSize: 110, lineHeight: 1, letterSpacing: -2, color: "#ff5500", marginTop: 8 }}>{r.shareEth}</div>
          {r.shareUsd && <div style={{ display: "flex", fontSize: 40, marginTop: 6 }}>{r.shareUsd}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {r.heldAmount && line("Held through day one", r.heldAmount)}
          {line("Early buyers' fees collected", r.earlyFees)}
          {line("Status", r.paid ? "Paid" : "Not paid yet")}
        </div>
      </div>
    ),
    size,
  );
  // Once paid the card is final; until then it can change, so it's cached for a minute only.
  return { status: 200, body: await image.arrayBuffer(), type: "image/png", maxAge: r.paid ? 3600 : 60 };
}
