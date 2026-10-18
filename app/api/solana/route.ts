/**
 * Read-only Solana JSON-RPC relay.
 *
 * Solana's public RPC rejects requests that carry a browser Origin, so the
 * terminal can't read balances from the client directly. This forwards a small
 * allowlist of read methods server-side. Set SOLANA_RPC_URL (e.g. a Helius or
 * Triton endpoint with its key) to use a private, rate-limit-free upstream;
 * the key never reaches the browser.
 */
const UPSTREAM = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

const ALLOWED = new Set([
  "getBalance",
  "getParsedTokenAccountsByOwner",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getAccountInfo",
  "getLatestBlockhash",
  "getSlot",
  "getHealth",
  "getVersion",
  "getGenesisHash",
]);

type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown };

function rejected(id: unknown, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } };
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 16_384) return Response.json(rejected(null, "Request too large"), { status: 413 });

  let body: RpcCall | RpcCall[];
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(rejected(null, "Invalid JSON"), { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 10) return Response.json(rejected(null, "Batch size not allowed"), { status: 400 });
  const blocked = calls.find((c) => typeof c.method !== "string" || !ALLOWED.has(c.method));
  if (blocked) return Response.json(rejected(blocked.id, `Method not allowed: ${String(blocked.method)}`), { status: 403 });

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
