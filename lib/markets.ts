import { concat, getAddress, numberToHex, parseAbi, type Address, type Hex } from "viem";
import { TESTNET_USDC } from "@/lib/intents";
import { logClient } from "@/lib/logs";
import { RELAY_URL } from "@/lib/session";

/**
 * Crux markets (Way C): established tokens that aren't Crux launches, which a Crux account trades through the Crux
 * solver like a launch token: one signature, no gas, filled at the batch's one price. The solver quotes and swaps them
 * on official Uniswap V3 pools along a fixed path from USDC (crux-solver scripts/markets.ts, kept in step with this
 * list); a market trades once the Crux Safe has registered its token on both settlers (the relay reports it).
 */
export const WETH: Address = "0x4200000000000000000000000000000000000006";

export type CuratedMarket = {
  symbol: string;
  name: string;
  token: Address;
  decimals: number;
  /** Tokens from USDC to the market's token, and each hop's V3 fee tier. */
  tokens: Address[];
  fees: number[];
  note?: string;
};

const LINK = getAddress("0xE4aB69C077896252FAFBD49EFD26B5D171A32410");

export const CURATED_MARKETS: CuratedMarket[] = [
  { symbol: "WETH", name: "Wrapped Ether", token: WETH, decimals: 18, tokens: [TESTNET_USDC, WETH], fees: [3000] },
  { symbol: "LINK", name: "Chainlink (test)", token: LINK, decimals: 18, tokens: [TESTNET_USDC, WETH, LINK], fees: [3000, 10_000], note: "Thin testnet pool" },
];

export const marketOf = (token: Address) => CURATED_MARKETS.find((m) => m.token.toLowerCase() === token.toLowerCase()) ?? null;

/** The solver's spread on market fills (crux-solver SPREAD_BPS). */
export const MARKET_SPREAD_BPS = 30;

/** Uniswap V3 path bytes from USDC to the token; `reverse` walks back from the token to USDC (sells). */
export function encodePath(m: Pick<CuratedMarket, "tokens" | "fees">, reverse = false): Hex {
  const tokens = reverse ? [...m.tokens].reverse() : m.tokens;
  const fees = reverse ? [...m.fees].reverse() : m.fees;
  const parts: Hex[] = [];
  tokens.forEach((t, i) => {
    parts.push(t);
    if (i < fees.length) parts.push(numberToHex(fees[i], { size: 3 }));
  });
  return concat(parts);
}

// QuoterV2 isn't a view (it reverts internally to quote), but answers an eth_call: declared as view to read it.
const quoterAbi = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) view returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);
const QUOTER_V2: Address = "0xC5290058841028F1614F3A6F0F5816cAd0df5E27";

/** The route's output for `amountIn` (buy: USDC in; sell: the token in), before the solver's spread; 0 if it can't quote. */
export async function quoteMarket(m: CuratedMarket, side: "buy" | "sell", amountIn: bigint): Promise<bigint> {
  if (amountIn <= BigInt(0)) return BigInt(0);
  try {
    const [out] = await logClient.readContract({ address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInput", args: [encodePath(m, side === "sell"), amountIn] });
    return out;
  } catch {
    return BigInt(0);
  }
}

export type TrendingRow = {
  pool: Address;
  dex: "v2" | "v3";
  fee: number;
  factory: Address;
  token0: { address: Address; symbol: string; decimals: number };
  token1: { address: Address; symbol: string; decimals: number };
  swaps: number;
  /** On an official Uniswap factory: only those are charted and tradable here. */
  official: boolean;
};

export type MarketsFeed = {
  curated: { symbol: string; token: Address; decimals: number; buyable: boolean; sellable: boolean; note: string | null; tokensPerUsdc: string }[];
  trending: { head: string; windowBlocks: string; rows: TrendingRow[] } | null;
};

/** GET /v1/markets from the Crux relay: each market's registration and price, and the busiest pools of the last hour. */
export async function fetchMarkets(): Promise<MarketsFeed> {
  const res = await fetch(`${RELAY_URL}/v1/markets`);
  if (!res.ok) throw new Error(`The relay answered ${res.status}.`);
  return (await res.json()) as MarketsFeed;
}
