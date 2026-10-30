import { sdk } from "@farcaster/miniapp-sdk";
import { parseUnits } from "viem";

/** CAIP-19 asset identifiers used by the Farcaster swap form. */
export const CAIP19 = {
  BASE_USDC: "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  BASE_ETH: "eip155:8453/native",
  SOLANA_USDC: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  /** Robinhood Chain's USDG (mainnet 4663); NEXT_PUBLIC_ROBINHOOD_USDC overrides the token. */
  ROBINHOOD_USDC: `eip155:4663/erc20:${process.env.NEXT_PUBLIC_ROBINHOOD_USDC ?? "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"}`,
} as const;

export const USDC_DECIMALS = 6;

/**
 * Buy-side asset for the demo $NOVA intent. Point this at the real token's
 * CAIP-19 id via NEXT_PUBLIC_NOVA_CAIP19; until then it routes to Base ETH.
 */
export const NOVA_CAIP19 = process.env.NEXT_PUBLIC_NOVA_CAIP19 ?? CAIP19.BASE_ETH;

let contextPromise: Promise<boolean> | null = null;

/**
 * Detects the Farcaster host and dismisses its splash screen.
 * Safe to call repeatedly and outside a mini app (resolves to false).
 */
export function initFarcaster(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  contextPromise ??= (async () => {
    try {
      const inMiniApp = await sdk.isInMiniApp();
      if (inMiniApp) await sdk.actions.ready();
      return inMiniApp;
    } catch {
      return false;
    }
  })();
  return contextPromise;
}

export type MiniAppContext = Awaited<typeof sdk.context>;

/** The host client's context (user, client, location), or null outside a mini app. */
export async function getMiniAppContext(): Promise<MiniAppContext | null> {
  if (!(await initFarcaster())) return null;
  try {
    return await sdk.context;
  } catch {
    return null;
  }
}

export type CruxIntent = {
  /** CAIP-19 id of the asset being bought. */
  buyToken: string;
  /** CAIP-19 id of the asset being sold. Defaults to Base USDC (the unified balance rail). */
  sellToken?: string;
  /** Amount to sell, denominated in the sell token (USDC by default). */
  sellAmount: number;
  sellDecimals?: number;
};

export type CruxIntentResult =
  | { status: "submitted"; transactions: `0x${string}`[] }
  | { status: "rejected" }
  | { status: "failed"; message: string }
  | { status: "unsupported" };

/**
 * Hands a buy intent to the host Farcaster client's native swap form.
 * Outside a Farcaster client this resolves to `unsupported` so the caller can
 * fall back to the web flow.
 */
export async function triggerCruxIntent(intent: CruxIntent): Promise<CruxIntentResult> {
  const inMiniApp = await initFarcaster();
  if (!inMiniApp) return { status: "unsupported" };

  const sellToken = intent.sellToken ?? CAIP19.BASE_USDC;
  const decimals = intent.sellDecimals ?? USDC_DECIMALS;
  const sellAmount = parseUnits(intent.sellAmount.toFixed(decimals), decimals).toString();

  sdk.haptics.impactOccurred("medium").catch(() => {});

  try {
    const result = await sdk.actions.swapToken({
      sellToken,
      buyToken: intent.buyToken,
      sellAmount,
    });
    if (result.success) {
      sdk.haptics.notificationOccurred("success").catch(() => {});
      return { status: "submitted", transactions: result.swap.transactions };
    }
    if (result.reason === "rejected_by_user") return { status: "rejected" };
    return { status: "failed", message: result.error?.message ?? "Swap failed" };
  } catch (err) {
    return { status: "failed", message: err instanceof Error ? err.message : "Swap failed" };
  }
}
