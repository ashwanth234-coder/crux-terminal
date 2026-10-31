/**
 * Pay-from-Solana orders this browser placed, per Solana wallet (localStorage), so they stay findable after the review
 * modal closes: My orders lists them with their status and, if no one fills one, when its refund opens. The chain is
 * the source of truth for status; this only remembers which orders to look at.
 */
export type SolanaOrderRecord = {
  /** keccak of the order details (hex, no 0x): the order account's seed. */
  fillHash: string;
  /** The paying Solana wallet (base58). */
  user: string;
  /** The token bought on Base (lowercase address), and its ticker. */
  token: string;
  symbol: string;
  /** USDC escrowed, 6 decimals, as a decimal string. */
  amount: string;
  fillDeadline: number;
  signature: string;
  /** Once the order account has closed: filled, or refunded to the wallet. */
  outcome?: "filled" | "refunded";
  refundSignature?: string;
};

export const SOLANA_ORDERS_EVENT = "crux-solana-orders";
const KEEP = 25;
const key = (wallet: string) => `crux.solanaOrders.${wallet}`;

export function readSolanaOrdersRaw(wallet: string): string {
  try {
    return window.localStorage.getItem(key(wallet)) ?? "";
  } catch {
    return "";
  }
}

export function parseSolanaOrders(raw: string): SolanaOrderRecord[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((o) => typeof o?.fillHash === "string" && typeof o?.fillDeadline === "number") : [];
  } catch {
    return [];
  }
}

function write(wallet: string, list: SolanaOrderRecord[]) {
  try {
    window.localStorage.setItem(key(wallet), JSON.stringify(list.slice(0, KEEP)));
  } catch {
    // Not remembered (private window, storage full): the modal still tracks the order while it's open.
  }
  window.dispatchEvent(new Event(SOLANA_ORDERS_EVENT));
}

export function rememberSolanaOrder(record: SolanaOrderRecord) {
  const list = parseSolanaOrders(readSolanaOrdersRaw(record.user)).filter((o) => o.fillHash !== record.fillHash);
  write(record.user, [record, ...list]);
}

export function updateSolanaOrder(wallet: string, fillHash: string, patch: Partial<SolanaOrderRecord>) {
  const list = parseSolanaOrders(readSolanaOrdersRaw(wallet));
  if (!list.some((o) => o.fillHash === fillHash)) return;
  write(wallet, list.map((o) => (o.fillHash === fillHash ? { ...o, ...patch } : o)));
}

/** "eip155:84532/erc20:0xAbC…" → "0xabc…". */
export const tokenFromCaip19 = (caip19: string) => (caip19.split("erc20:")[1] ?? "").toLowerCase();
