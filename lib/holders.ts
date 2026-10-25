import { getAddress, zeroAddress, type Address } from "viem";
import type { PoolTrade } from "@/hooks/usePoolSwaps";
import type { TokenTransfer } from "@/hooks/useTokenTransfers";

export type HolderTag = "you" | "creator" | "whale" | "pool" | "auction" | "solver" | "settler" | "burn";

export type Holder = {
  address: Address;
  balance: bigint;
  /** Share of total supply, percent. */
  pct: number;
  /** Average USDC per token over the acquisitions we can price; null when none can be priced. */
  entry: number | null;
  /** Some of the holding arrived in ways with no price (plain transfers, the creator's allocation). */
  partialEntry: boolean;
  /** Some prices are the solver's batch price rather than this wallet's own fill. */
  approxEntry: boolean;
  /** Unix seconds of the first token this address received. */
  since: number;
  tags: HolderTag[];
};

export type HolderContext = {
  totalSupply: bigint;
  /** Clearing price, USDC per token: what every auction claim paid. */
  clearingPrice: number;
  creator: Address;
  factory: Address;
  pair: Address;
  solver: Address;
  destinationSettler: Address;
  me: Address | undefined;
  /** V5 / V6: the launch's batch pool, which pays out its anti-sniper batch fills. */
  batchPool?: Address | null;
};

/** A holder with more than this share of supply (and not a protocol address) is tagged a whale. */
export const WHALE_SUPPLY_PCT = 5;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ONE = 1e18;

type Acc = { balance: bigint; pricedQty: number; pricedCost: number; unpriced: boolean; approx: boolean; since: number };

/**
 * Holder balances rebuilt from Transfer logs, with an average entry from the acquisitions that have a price:
 * an auction claim (a factory transfer in a Claimed transaction) pays the clearing price, a creator vesting
 * release is free, a direct pool buy pays its own swap's price, a batch-pool fill pays its batch's price, and an intent fill
 * (tokens sent by the solver) is priced at the solver's latest pool buy, marked approximate. Anything else is
 * unpriced and flags the entry as partial. Outflows reduce the holding at average cost.
 */
export function buildHolders(transfers: TokenTransfer[], swapsNewestFirst: PoolTrade[], ctx: HolderContext): Holder[] {
  const key = (a: Address) => a.toLowerCase();
  const swapByTx = new Map(swapsNewestFirst.filter((s) => s.venue !== "batch-pool").map((s) => [s.txHash, s]));
  // One clear pays many batch fills in one transaction: match each payout to its owner's fill.
  const batchFill = new Map(swapsNewestFirst.filter((s) => s.venue === "batch-pool").map((s) => [`${s.txHash}:${s.to.toLowerCase()}`, s]));
  const solverBuys = swapsNewestFirst.filter((s) => s.viaIntent && s.side === "buy");
  const solverPriceAt = (block: bigint) => solverBuys.find((s) => s.blockNumber <= block)?.price ?? null;
  const claimTxs = new Set(transfers.filter((t) => t.kind === "claim").map((t) => t.txHash));

  const system: Record<string, HolderTag> = {
    [key(ctx.pair)]: "pool",
    [key(ctx.factory)]: "auction",
    [key(ctx.solver)]: "solver",
    [key(ctx.destinationSettler)]: "settler",
    [key(DEAD)]: "burn",
    ...(ctx.batchPool ? { [key(ctx.batchPool)]: "pool" as const } : {}),
  };

  const accs = new Map<string, Acc>();
  const acc = (a: Address) => {
    let x = accs.get(key(a));
    if (!x) {
      x = { balance: BigInt(0), pricedQty: 0, pricedCost: 0, unpriced: false, approx: false, since: 0 };
      accs.set(key(a), x);
    }
    return x;
  };

  for (const t of transfers) {
    if (t.kind === "claim" || t.value === BigInt(0)) continue;
    const qty = Number(t.value) / ONE;
    if (t.from !== zeroAddress) {
      const s = acc(t.from);
      const held = Number(s.balance) / ONE;
      // Average cost: what leaves takes its proportional share of the priced quantity and cost.
      if (held > 0) {
        const keep = Math.max(0, 1 - qty / held);
        s.pricedQty *= keep;
        s.pricedCost *= keep;
      }
      s.balance -= t.value;
    }
    if (t.to === zeroAddress) continue;
    const r = acc(t.to);
    if (r.since === 0) r.since = t.time;
    r.balance += t.value;

    const fromKey = key(t.from);
    let price: number | null = null;
    if (fromKey === key(ctx.factory) && (claimTxs.has(t.txHash) || key(t.to) !== key(ctx.creator))) {
      price = ctx.clearingPrice;
    } else if (fromKey === key(ctx.pair)) {
      price = swapByTx.get(t.txHash)?.price ?? null;
    } else if (ctx.batchPool && fromKey === key(ctx.batchPool)) {
      price = batchFill.get(`${t.txHash}:${key(t.to)}`)?.price ?? null;
    } else if (fromKey === key(ctx.solver) || fromKey === key(ctx.destinationSettler)) {
      price = solverPriceAt(t.blockNumber);
      if (price !== null) r.approx = true;
    }
    if (price !== null && price > 0) {
      r.pricedQty += qty;
      r.pricedCost += qty * price;
    } else {
      r.unpriced = true;
    }
  }

  const supply = Number(ctx.totalSupply) / ONE;
  const rows: Holder[] = [];
  for (const [k, x] of accs) {
    if (x.balance <= BigInt(0)) continue;
    const address = getAddress(k);
    const pct = supply > 0 ? ((Number(x.balance) / ONE) / supply) * 100 : 0;
    const tags: HolderTag[] = [];
    if (ctx.me && key(ctx.me) === k) tags.push("you");
    if (system[k]) tags.push(system[k]);
    if (key(ctx.creator) === k) tags.push("creator");
    if (!system[k] && pct > WHALE_SUPPLY_PCT) tags.push("whale");
    rows.push({
      address,
      balance: x.balance,
      pct,
      entry: x.pricedQty > 0 ? x.pricedCost / x.pricedQty : null,
      partialEntry: x.unpriced && x.pricedQty > 0,
      approxEntry: x.approx,
      since: x.since,
      tags,
    });
  }
  return rows.sort((a, b) => (a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1));
}
