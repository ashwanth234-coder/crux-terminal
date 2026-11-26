import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { createPublicClient, erc20Abi, fallback, getAddress, http } from "viem";
import { base } from "viem/chains";
import { CRUX_MARK_PATH } from "@/components/site/Logo";
import { BASE_RPCS, NETWORK } from "@/lib/network";
import { RELAY_URL } from "@/lib/readCache";
import { V4_HOOK, V4_REWARDS, readV4Launch } from "@/lib/v4launch";
import { buildReceipt, fetchRewards, isAddress40, readEthUsd, readReceiptLogs } from "@/lib/v4receipt";

const size = { width: 1200, height: 800 };

/**
 * GET /api/receipt?coin=0x…&wallet=0x…: the holders' receipt as a shareable image. Only the two addresses come from
 * the query; the list, the logs and every number on the card are read here.
 */
export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams;
  const coinParam = q.get("coin");
  const walletParam = q.get("wallet");
  if (!isAddress40(coinParam) || !isAddress40(walletParam)) return new Response("coin and wallet must be 0x addresses", { status: 400 });
  if (NETWORK.testnet) return new Response("Receipts are on Base mainnet only", { status: 404 });
  const coin = getAddress(coinParam);
  const wallet = getAddress(walletParam);

  try {
    const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });
    const launch = await readV4Launch(client, coin);
    if (!launch) return new Response("Not a Crux coin", { status: 404 });
    const [file, symbol, ethUsd] = await Promise.all([
      fetchRewards(RELAY_URL, coin),
      client.readContract({ address: coin, abi: erc20Abi, functionName: "symbol" }).catch(() => "COIN"),
      readEthUsd(client),
    ]);
    const logs = await readReceiptLogs(client, V4_HOOK, V4_REWARDS, coin, wallet, launch, file?.snapshotAt ?? launch.launchedAt + 86_400);
    const r = buildReceipt({ symbol, launch, file, wallet, logs, ethUsd });
    if (!r) return new Response("No receipt for this wallet", { status: 404 });

    const line = (label: string, value: string) => (
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #292B2F", paddingBottom: 12, fontSize: 26 }}>
        <div style={{ color: "#A7ADB5" }}>{label}</div>
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
            <div style={{ fontSize: 22, letterSpacing: 4, color: "#A7ADB5" }}>{r.kind === "creator" ? "CREATOR PAYOUT" : "HOLDER PAYOUT"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 40, color: "#A7ADB5" }}>{`${r.coin} · launched ${r.launchDate}`}</div>
            <div style={{ display: "flex", fontSize: 110, lineHeight: 1, letterSpacing: -2, color: "#ff5500", marginTop: 8 }}>{r.shareEth}</div>
            {r.shareUsd && <div style={{ display: "flex", fontSize: 40, marginTop: 6 }}>{r.shareUsd}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {r.held && line("Held through day one", r.held.replace(/^You held an average of /, "").replace(/ through day one$/, ""))}
            {line("Early buyers' fees collected", r.earlyFees)}
            {line("Status", r.paid ? "Paid" : "Not paid yet")}
          </div>
        </div>
      ),
      size,
    );
    // The card changes once (when it's paid); a short cache keeps shares cheap without freezing "not paid yet".
    image.headers.set("Cache-Control", r.paid ? "public, max-age=3600, s-maxage=3600" : "public, max-age=60, s-maxage=60");
    return image;
  } catch {
    return new Response("Couldn't read Base right now. Retry shortly.", { status: 503 });
  }
}
