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
  /** USDC paid for the priced acquisitions (auction claims, pool and batch buys, intent fills). */
  boughtUsd: number;
  /** USDC received for the priced part of what was sold into the market (pool, batch pool, intent escrow). */
  soldUsd: number;
  /** Profit taken: what the priced part of each sale brought in, less that part's average cost. */
  realized: number;
  /** Average cost of the priced part of what's still held (USDC). Unrealized PnL = pricedQty × price − basis. */
  basis: number;
  /** Tokens still held that have a price (the rest arrived unpriced). */
  pricedQty: number;
  buys: number;
  sells: number;
  /** Some tokens left by a plain transfer, or a sale's proceeds couldn't be priced: realized PnL leaves them out. */
  partialRealized: boolean;
  /** Some sale proceeds are priced at the solver's fill rather than this wallet's own. */
  approxRealized: boolean;
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
  /** Origin settlers on Base that escrow the tokens of an intent sell (the current one and earlier ones). */
  settlers?: Address[];
};

/** A holder with more than this share of supply (and not a protocol address) is tagged a whale. */
export const WHALE_SUPPLY_PCT = 5;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ONE = 1e18;

type Acc = {
  balance: bigint;
  pricedQty: number;
  pricedCost: number;
  unpriced: boolean;
  approx: boolean;
  since: number;
  boughtUsd: number;
  soldUsd: number;
  realized: number;
  buys: number;
  sells: number;
  partialRealized: boolean;
  approxRealized: boolean;
};

/**
 * Holder balances rebuilt from Transfer logs, with an average entry from the acquisitions that have a price:
 * an auction claim (a factory transfer in a Claimed transaction) pays the clearing price, a creator vesting
 * release is free, a direct pool buy pays its own swap's price, a batch-pool fill pays its batch's price, and an intent fill
 * (tokens sent by the solver) is priced at the solver's latest pool buy, marked approximate. Anything else is
 * unpriced and flags the entry as partial. Outflows reduce the holding at average cost.
 *
 * Sales are priced the same way: tokens into the pool at their swap's price, into the batch pool at the wallet's own
 * sell fill (the first one at or after the order), into an origin settler (an intent sell) at the solver's next pool
 * sell, marked approximate. Realized PnL counts only the priced share of each sale against that share's average cost,
 * so a wallet that was sent free tokens can't show their sale as profit. Returns every wallet that ever held, sold-out
 * ones included (balance 0), largest balance first; buildHolders keeps the ones still holding.
 */
export function buildLedger(transfers: TokenTransfer[], swapsNewestFirst: PoolTrade[], ctx: HolderContext): Holder[] {
  const key = (a: Address) => a.toLowerCase();
  const swapByTx = new Map(swapsNewestFirst.filter((s) => s.venue !== "batch-pool").map((s) => [s.txHash, s]));
  // One clear pays many batch fills in one transaction: match each payout to its owner's fill.
  const batchFill = new Map(swapsNewestFirst.filter((s) => s.venue === "batch-pool").map((s) => [`${s.txHash}:${s.to.toLowerCase()}`, s]));
  const solverBuys = swapsNewestFirst.filter((s) => s.viaIntent && s.side === "buy");
  const solverPriceAt = (block: bigint) => solverBuys.find((s) => s.blockNumber <= block)?.price ?? null;
  const claimTxs = new Set(transfers.filter((t) => t.kind === "claim").map((t) => t.txHash));
  const oldestFirst = [...swapsNewestFirst].reverse();
  // A batch-pool sell is escrowed when placed and paid when its batch clears: the owner's first sell fill from then on.
  const batchSellAt = (owner: string, block: bigint) =>
    oldestFirst.find((s) => s.venue === "batch-pool" && s.side === "sell" && s.to.toLowerCase() === owner && s.blockNumber >= block)?.price ?? null;
  // An intent sell is escrowed in the settler, then the solver sells into the pool: its next sell from then on.
  const solverSellAt = (block: bigint) => oldestFirst.find((s) => s.viaIntent && s.side === "sell" && s.blockNumber >= block)?.price ?? null;
  const settlers = new Set((ctx.settlers ?? []).map(key));

  const system: Record<string, HolderTag> = {
    [key(ctx.pair)]: "pool",
    [key(ctx.factory)]: "auction",
    [key(ctx.solver)]: "solver",
    [key(ctx.destinationSettler)]: "settler",
    [key(DEAD)]: "burn",
    ...(ctx.batchPool ? { [key(ctx.batchPool)]: "pool" as const } : {}),
    ...Object.fromEntries([...settlers].map((s) => [s, "settler" as const])),
  };

  const accs = new Map<string, Acc>();
  const acc = (a: Address) => {
    let x = accs.get(key(a));
    if (!x) {
      x = {
        balance: BigInt(0),
        pricedQty: 0,
        pricedCost: 0,
        unpriced: false,
        approx: false,
        since: 0,
        boughtUsd: 0,
        soldUsd: 0,
        realized: 0,
        buys: 0,
        sells: 0,
        partialRealized: false,
        approxRealized: false,
      };
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
      const fromKey = key(t.from);
      const toKey = key(t.to);
      // A sale into the market, and its price where one can be found.
      let sold = false;
      let sale: number | null = null;
      if (!system[fromKey]) {
        if (toKey === key(ctx.pair)) {
          sold = true;
          sale = swapByTx.get(t.txHash)?.price ?? null;
        } else if (ctx.batchPool && toKey === key(ctx.batchPool)) {
          sold = true;
          sale = batchSellAt(fromKey, t.blockNumber);
        } else if (settlers.has(toKey)) {
          sold = true;
          sale = solverSellAt(t.blockNumber);
          if (sale !== null) s.approxRealized = true;
        }
      }
      // Average cost: what leaves takes its proportional share of the priced quantity and cost.
      if (held > 0) {
        const share = Math.min(1, qty / held);
        const pricedOut = s.pricedQty * share;
        const costOut = s.pricedCost * share;
        if (sold && sale !== null && sale > 0) {
          s.soldUsd += pricedOut * sale;
          s.realized += pricedOut * sale - costOut;
          if (pricedOut < qty * 0.999_999) s.partialRealized = true;
        } else if (pricedOut > 0) {
          s.partialRealized = true;
        }
        s.pricedQty -= pricedOut;
        s.pricedCost -= costOut;
      }
      if (sold) s.sells += 1;
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
      r.boughtUsd += qty * price;
      r.buys += 1;
    } else {
      r.unpriced = true;
    }
  }

  const supply = Number(ctx.totalSupply) / ONE;
  const rows: Holder[] = [];
  for (const [k, x] of accs) {
    if (x.balance < BigInt(0) || k === key(zeroAddress)) continue;
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
      boughtUsd: x.boughtUsd,
      soldUsd: x.soldUsd,
      realized: x.realized,
      basis: x.pricedCost,
      pricedQty: x.pricedQty,
      buys: x.buys,
      sells: x.sells,
      partialRealized: x.partialRealized,
      approxRealized: x.approxRealized,
    });
  }
  return rows.sort((a, b) => (a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1));
}

/** Holders with a balance, largest first. */
export function buildHolders(transfers: TokenTransfer[], swapsNewestFirst: PoolTrade[], ctx: HolderContext): Holder[] {
  return buildLedger(transfers, swapsNewestFirst, ctx).filter((h) => h.balance > BigInt(0));
}

const SYSTEM: ReadonlySet<HolderTag> = new Set(["pool", "auction", "solver", "settler", "burn"]);
export const isSystem = (h: Holder) => h.tags.some((t) => SYSTEM.has(t));

/** Unrealized PnL in USDC at `price`: the priced tokens still held, marked to market, less their cost. */
export const unrealizedUsd = (h: Holder, price: number | null) => (price === null ? null : h.pricedQty * price - h.basis);

export type TraderRow = Holder & { unrealized: number | null; total: number };

/**
 * Top traders: every non-protocol wallet that bought or sold at a price, ranked by realized + unrealized PnL at
 * `price` (USDC per token), best first.
 */
export function topTraders(ledger: Holder[], price: number | null): TraderRow[] {
  return ledger
    .filter((h) => !isSystem(h) && (h.buys > 0 || h.sells > 0))
    .map((h) => {
      const unrealized = unrealizedUsd(h, price);
      return { ...h, unrealized, total: h.realized + (unrealized ?? 0) };
    })
    .sort((a, b) => b.total - a.total);
}
