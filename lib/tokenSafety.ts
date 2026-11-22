/**
 * Warning signs for BNB Chain and Base coins, from GoPlus's free token-security API (read in the browser; it allows
 * cruxprotocol.xyz). Solana coins get theirs from Jupiter (lib/solanaCoins.ts). A coin GoPlus hasn't scanned yet (often
 * the first minutes) comes back unknown: nothing is claimed either way.
 */
export type EvmSafety = { warnings: string[]; holders?: number };

const CHAIN_ID = { bsc: 56, base: 8453 } as const;
type Network = keyof typeof CHAIN_ID;

type GoPlus = {
  is_honeypot?: string;
  cannot_sell_all?: string;
  cannot_buy?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_mintable?: string;
  owner_address?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  can_take_back_ownership?: string;
  is_blacklisted?: string;
  transfer_pausable?: string;
  trading_cooldown?: string;
  is_open_source?: string;
  creator_percent?: string;
  holder_count?: string;
};

const ZERO = /^0x0{40}$|^0x0{36}dead$/i;
const on = (v?: string) => v === "1";
const pct = (v?: string) => (v === undefined || v === "" ? 0 : Number(v) * 100);

/** The warning signs, worst first, in plain words. */
export function warningsOf(g: GoPlus): string[] {
  const w: string[] = [];
  const owned = !!g.owner_address && !ZERO.test(g.owner_address);
  if (on(g.is_honeypot)) w.push("Can't be sold (honeypot)");
  if (on(g.cannot_sell_all)) w.push("Can't sell everything");
  if (on(g.cannot_buy)) w.push("Can't be bought");
  const sell = pct(g.sell_tax), buy = pct(g.buy_tax);
  if (sell >= 5) w.push(`Sell tax ${sell.toFixed(0)}%`);
  if (buy >= 5) w.push(`Buy tax ${buy.toFixed(0)}%`);
  if (on(g.owner_change_balance)) w.push("Owner can change balances");
  if (on(g.hidden_owner)) w.push("Hidden owner");
  if (on(g.can_take_back_ownership)) w.push("Owner can take control back");
  if (on(g.is_mintable) && owned) w.push("More can be printed");
  if (on(g.is_blacklisted) && owned) w.push("Can block sellers");
  if (on(g.transfer_pausable) && owned) w.push("Trading can be paused");
  if (g.is_open_source === "0") w.push("Code not public");
  // Before GoPlus has counted holders, every coin's creator "holds 100%" (nothing's been bought yet): not a sign.
  const creator = pct(g.creator_percent);
  if (creator >= 10 && Number(g.holder_count ?? 0) >= 2) w.push(`Creator holds ${creator.toFixed(0)}%`);
  return w;
}

/** Answers kept per coin for 10 minutes (a coin's code doesn't change; its creator's share rarely does). */
const cache = new Map<string, { at: number; v: EvmSafety | null }>();
const TTL = 10 * 60_000;

/**
 * The warning signs for these coins. GoPlus's free API answers one coin per read (a list gets only its first), so
 * coins not yet known are read 4 at a time, at most 25 per call; the rest stay unknown (null) until the next call.
 * Null also means GoPlus hasn't scanned the coin yet.
 */
export async function evmSafety(network: Network, addresses: string[]): Promise<Record<string, EvmSafety | null>> {
  const now = Date.now();
  const want = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const missing = want.filter((a) => {
    const c = cache.get(`${network}:${a}`);
    // An unknown answer is asked again after a minute (GoPlus scans new coins within minutes).
    return !c || now - c.at > (c.v ? TTL : 60_000);
  });
  const queue = missing.slice(0, 25);
  const one = async (a: string) => {
    try {
      const r = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${CHAIN_ID[network]}?contract_addresses=${a}`);
      const j = r.ok ? ((await r.json()) as { result?: Record<string, GoPlus> }) : null;
      if (!j) return;
      const g = j.result?.[a];
      const known = g && (g.is_open_source !== undefined || g.is_honeypot !== undefined);
      cache.set(`${network}:${a}`, { at: now, v: known ? { warnings: warningsOf(g), holders: Number(g.holder_count ?? 0) > 0 ? Number(g.holder_count) : undefined } : null });
    } catch {
      // Unreachable now: the coin stays unknown and is asked again next time.
    }
  };
  for (let i = 0; i < queue.length; i += 4) await Promise.all(queue.slice(i, i + 4).map(one));
  return Object.fromEntries(want.map((a) => [a, cache.get(`${network}:${a}`)?.v ?? null]));
}
