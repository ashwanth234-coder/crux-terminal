import type { Address } from "viem";
import { CAIP19, NOVA_CAIP19 } from "./farcaster";
import { SLIPPAGE_BPS } from "./intents";
import type { OriginKey } from "./crosschain";
import type { PaySource, PaySourceId } from "./tokens";

export type Side = "buy" | "sell";

export type OrderDraft = {
  side: Side;
  symbol: string;
  /** Token quantity entered by the user. */
  qty: number;
  /** Indicative unit price in USD. */
  price: number;
  /** qty × price. */
  notional: number;
  source: PaySource;
  /** Human-readable chain the funds leave from. */
  originLabel: string;
  /**
   * The token traded, when it isn't the demo NOVA: a graduated Crux launch on Base Sepolia, priced from its
   * locked Uniswap pool. Buys escrow test USDC; sells escrow this token.
   */
  asset?: TradedAsset;
  /** Buys only: pay with test USDC on a cross-chain origin, escrowed there and settled by a Hyperlane fill proof. */
  payFrom?: OriginKey;
  /** The trader's slippage allowance, in basis points (the ticket's gear); SLIPPAGE_BPS when unset. */
  slippageBps?: number;
};

export type TradedAsset = { address: Address; caip19: string; decimals: number };

export const NOVA_ASSET = { caip19: NOVA_CAIP19, decimals: 18 };

/** CAIP-19 asset that funds (or receives) the order for each "Pay with" option. */
export function sourceAsset(id: PaySourceId): { caip19: string; decimals: number } {
  switch (id) {
    case "solana-usdc":
      return { caip19: CAIP19.SOLANA_USDC, decimals: 6 };
    case "robinhood-usdc":
      // Fall back to the Base rail until Robinhood USDC is configured.
      return { caip19: CAIP19.ROBINHOOD_USDC ?? CAIP19.BASE_USDC, decimals: 6 };
    default:
      return { caip19: CAIP19.BASE_USDC, decimals: 6 };
  }
}

export const slippageOf = (order: OrderDraft) => order.slippageBps ?? SLIPPAGE_BPS;

/** Worst acceptable fill after slippage, in the output unit. */
export function minReceived(order: OrderDraft) {
  const out = order.side === "buy" ? order.qty : order.notional;
  return out * (1 - slippageOf(order) / 10_000);
}

/** Price cap (buy) or floor (sell) the batch auction must clear within. */
export function clearingLimit(order: OrderDraft) {
  const k = slippageOf(order) / 10_000;
  return order.side === "buy" ? order.price * (1 + k) : order.price * (1 - k);
}
