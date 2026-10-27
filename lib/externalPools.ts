import { erc20Abi, getAddress, parseAbi, parseAbiItem, zeroAddress, type Address } from "viem";
import { TESTNET_USDC } from "@/lib/intents";
import { logClient, type ReadLogs } from "@/lib/logs";
import type { PoolTrade } from "@/lib/tradeDecode";

/**
 * Any Base Sepolia token that isn't a Crux launch: its deepest Uniswap pool (V2 or V3, against test USDC or WETH),
 * found from the factories, and its swaps decoded into the same trades the Crux terminal charts. Prices are in USD:
 * exact for USDC-quoted pools; WETH-quoted pools are converted at the ETH price when the pool was found (labelled).
 */

export const UNISWAP_V2_FACTORY: Address = "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e";
export const UNISWAP_V2_ROUTER: Address = "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602";
export const UNISWAP_V3_FACTORY: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
/** SwapRouter02: exactInputSingle with no deadline field; wraps ETH sent with a WETH-in swap. */
export const UNISWAP_V3_ROUTER: Address = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
export const UNISWAP_V3_QUOTER: Address = "0xC5290058841028F1614F3A6F0F5816cAd0df5E27";
export const WETH: Address = "0x4200000000000000000000000000000000000006";
const V3_FEES = [100, 500, 3000, 10_000] as const;

export type ExternalPool = {
  pool: Address;
  dex: "uniswap-v2" | "uniswap-v3";
  /** V3 fee tier in hundredths of a bip (3000 = 0.3%); V2 pools are 0.3%. */
  fee: number;
  token: Address;
  quote: Address;
  quoteSymbol: "USDC" | "WETH";
  quoteDecimals: number;
  tokenDecimals: number;
  tokenIsToken0: boolean;
  /** USD per whole quote token when the pool was found: 1 for USDC, WETH's price in the deepest WETH/USDC pool. */
  quoteUsd: number;
  /** The pool's quote-token balance in USD: half its liquidity, roughly. */
  quoteLiquidityUsd: number;
};

const v2FactoryAbi = parseAbi(["function getPair(address, address) view returns (address)"]);
const v3FactoryAbi = parseAbi(["function getPool(address, address, uint24) view returns (address)"]);
const v3PoolAbi = parseAbi(["function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"]);
const v2PairAbi = parseAbi(["function getReserves() view returns (uint112, uint112, uint32)"]);

export const V2_SWAP = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
export const V3_SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);

const Q192 = 2 ** 192;
/** Uniswap orders a pool's tokens by address value. */
const below = (a: Address, b: Address) => BigInt(a) < BigInt(b);

type Candidate = { pool: Address; dex: ExternalPool["dex"]; fee: number; quote: Address };

async function candidates(token: Address, quote: Address): Promise<Candidate[]> {
  const calls = [
    { address: UNISWAP_V2_FACTORY, abi: v2FactoryAbi, functionName: "getPair", args: [token, quote] } as const,
    ...V3_FEES.map((fee) => ({ address: UNISWAP_V3_FACTORY, abi: v3FactoryAbi, functionName: "getPool", args: [token, quote, fee] }) as const),
  ];
  const res = await logClient.multicall({ contracts: calls, allowFailure: true });
  return res.flatMap((r, i) =>
    r.status === "success" && r.result !== zeroAddress
      ? [{ pool: getAddress(r.result as Address), dex: i === 0 ? ("uniswap-v2" as const) : ("uniswap-v3" as const), fee: i === 0 ? 3000 : V3_FEES[i - 1], quote }]
      : [],
  );
}

/** Quote-token units per whole token in a pool, from V3's slot0 or V2's reserves. */
async function spot(c: Candidate, token: Address, tokenDecimals: number, quoteDecimals: number): Promise<number | null> {
  const tokenIs0 = below(token, c.quote);
  const [d0, d1] = tokenIs0 ? [tokenDecimals, quoteDecimals] : [quoteDecimals, tokenDecimals];
  let raw1Per0: number;
  if (c.dex === "uniswap-v3") {
    const [sqrt] = await logClient.readContract({ address: c.pool, abi: v3PoolAbi, functionName: "slot0" });
    raw1Per0 = Number(sqrt) ** 2 / Q192;
  } else {
    const [r0, r1] = await logClient.readContract({ address: c.pool, abi: v2PairAbi, functionName: "getReserves" });
    if (r0 === BigInt(0)) return null;
    raw1Per0 = Number(r1) / Number(r0);
  }
  const whole1Per0 = raw1Per0 * 10 ** (d0 - d1);
  if (!Number.isFinite(whole1Per0) || whole1Per0 <= 0) return null;
  return tokenIs0 ? whole1Per0 : 1 / whole1Per0;
}

/** The deepest candidate by quote-token balance. */
async function deepest(cands: Candidate[]) {
  if (cands.length === 0) return null;
  const bal = await logClient.multicall({
    contracts: cands.map((c) => ({ address: c.quote, abi: erc20Abi, functionName: "balanceOf", args: [c.pool] }) as const),
    allowFailure: true,
  });
  let best: { c: Candidate; balance: bigint } | null = null;
  cands.forEach((c, i) => {
    const b = bal[i].status === "success" ? (bal[i].result as bigint) : BigInt(0);
    if (b > BigInt(0) && (!best || b > best.balance)) best = { c, balance: b };
  });
  return best as { c: Candidate; balance: bigint } | null;
}

let ethUsdCache: Promise<number | null> | null = null;
/** WETH's price in USD from the deepest WETH / test-USDC pool, read once per page load. */
export function ethUsd(): Promise<number | null> {
  ethUsdCache ??= (async () => {
    const best = await deepest(await candidates(WETH, TESTNET_USDC));
    return best ? spot(best.c, WETH, 18, 6) : null;
  })().catch(() => {
    ethUsdCache = null;
    return null;
  });
  return ethUsdCache;
}

const found = new Map<string, Promise<ExternalPool | null>>();
const byPool = new Map<string, ExternalPool>();

/**
 * A token's deepest Uniswap pool against test USDC or WETH, valued in USD, or null when it has none (or is USDC
 * itself). Cached per page load; registered so the shared trade readers decode its swaps.
 */
export function discoverPool(token: Address): Promise<ExternalPool | null> {
  const key = token.toLowerCase();
  let p = found.get(key);
  if (!p) {
    p = (async () => {
      const t = getAddress(token);
      if (t === getAddress(TESTNET_USDC)) return null;
      const quotes = t === getAddress(WETH) ? [TESTNET_USDC] : [TESTNET_USDC, WETH];
      const [tokenDecimals, eth, ...lists] = await Promise.all([
        logClient.readContract({ address: t, abi: erc20Abi, functionName: "decimals" }),
        ethUsd(),
        ...quotes.map((q) => candidates(t, q)),
      ]);
      // Rank across quotes in USD: a WETH balance counts at the ETH price.
      const ranked = await Promise.all(
        lists.map(async (list) => {
          const best = await deepest(list);
          if (!best) return null;
          const isUsdc = getAddress(best.c.quote) === getAddress(TESTNET_USDC);
          const quoteUsd = isUsdc ? 1 : eth;
          if (quoteUsd === null) return null;
          return { ...best, quoteUsd, usd: (Number(best.balance) / 10 ** (isUsdc ? 6 : 18)) * quoteUsd, isUsdc };
        }),
      );
      const pick = ranked.filter((r) => r !== null).sort((a, b) => b.usd - a.usd)[0];
      if (!pick) return null;
      const pool: ExternalPool = {
        pool: pick.c.pool,
        dex: pick.c.dex,
        fee: pick.c.fee,
        token: t,
        quote: getAddress(pick.c.quote),
        quoteSymbol: pick.isUsdc ? "USDC" : "WETH",
        quoteDecimals: pick.isUsdc ? 6 : 18,
        tokenDecimals,
        tokenIsToken0: below(t, pick.c.quote),
        quoteUsd: pick.quoteUsd,
        quoteLiquidityUsd: pick.usd,
      };
      byPool.set(pool.pool.toLowerCase(), pool);
      return pool;
    })();
    p.catch(() => found.delete(key));
    found.set(key, p);
  }
  return p;
}

/** The registered external pool at this address, if the page found one (lib/poolTrades dispatches on it). */
export const externalPoolOf = (pool: Address): ExternalPool | undefined => byPool.get(pool.toLowerCase());

/** The pool's current price in USD per whole token. */
export async function externalPrice(p: ExternalPool): Promise<number | null> {
  const s = await spot({ pool: p.pool, dex: p.dex, fee: p.fee, quote: p.quote }, p.token, p.tokenDecimals, p.quoteDecimals);
  return s === null ? null : s * p.quoteUsd;
}

const abs = (v: bigint) => (v < BigInt(0) ? -v : v);

/** USD in 6 decimals (PoolTrade.usdc) for a quote-token amount. */
const usd6 = (p: ExternalPool, quote: bigint) => BigInt(Math.round((Number(quote) / 10 ** p.quoteDecimals) * p.quoteUsd * 1e6));

/** Reads one block range of an external pool's swaps as trades (for lib/logs scanLogs), oldest first. */
export function externalTradeReader(p: ExternalPool): ReadLogs<PoolTrade> {
  const priced = (side: "buy" | "sell", quote: bigint, tokens: bigint) => {
    const usdc = usd6(p, quote);
    const whole = Number(tokens) / 10 ** p.tokenDecimals;
    return { side, usdc, tokens, price: whole > 0 ? Number(usdc) / 1e6 / whole : 0 };
  };
  return async (fromBlock, toBlock) => {
    if (p.dex === "uniswap-v3") {
      const logs = await logClient.getLogs({ address: p.pool, event: V3_SWAP, fromBlock, toBlock });
      return logs.map((l) => {
        // Signed from the pool's side: positive flowed in. Quote in = someone bought the token.
        const q = p.tokenIsToken0 ? l.args.amount1! : l.args.amount0!;
        const t = p.tokenIsToken0 ? l.args.amount0! : l.args.amount1!;
        return {
          ...priced(q > BigInt(0) ? "buy" : "sell", abs(q), abs(t)),
          to: (l.args.recipient ?? zeroAddress) as Address,
          viaIntent: false,
          venue: "uniswap-v3" as const,
          txHash: l.transactionHash,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex,
        };
      });
    }
    const logs = await logClient.getLogs({ address: p.pool, event: V2_SWAP, fromBlock, toBlock });
    return logs.map((l) => {
      const [qIn, qOut, tIn, tOut] = p.tokenIsToken0
        ? [l.args.amount1In!, l.args.amount1Out!, l.args.amount0In!, l.args.amount0Out!]
        : [l.args.amount0In!, l.args.amount0Out!, l.args.amount1In!, l.args.amount1Out!];
      const buy = qIn > BigInt(0);
      return {
        ...priced(buy ? "buy" : "sell", buy ? qIn : qOut, buy ? tOut : tIn),
        to: (l.args.to ?? zeroAddress) as Address,
        viaIntent: false,
        venue: "uniswap-v2" as const,
        txHash: l.transactionHash,
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
      };
    });
  };
}
