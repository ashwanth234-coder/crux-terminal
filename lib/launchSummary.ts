import type { LaunchSummary } from "@/hooks/useLaunches";
import { auctionPhase, impliedMarketCap, impliedPrice, type Phase } from "@/lib/launch";
import { marketCapUsd, phaseV2, priceUsd } from "@/lib/launchV2";

export type LaunchDisplay = {
  phase: Phase;
  /** What the price figure means: the final price, the price so far, or (V2, before settling) the floor. */
  priceLabel: string;
  price: string | null;
  marketCap: string | null;
  /** Seconds until deposits open (scheduled) or until the window closes (open). */
  opensIn: number;
  closesIn: number;
};

/** One shape for cards, the feed and the home tracker, whichever factory a launch lives on. */
export function describeLaunch(launch: LaunchSummary, now: number | null): LaunchDisplay {
  const a = launch.auction;
  const opensIn = now === null ? 0 : a.startTime - now;
  const closesIn = now === null ? a.batchWindow : a.startTime + a.batchWindow - now;

  if (launch.v2) {
    const v = launch.v2;
    const phase: Phase = now === null ? "scheduled" : phaseV2(v, now);
    // Before settlement the clearing price depends on every limit in the book; show the floor, which is exact.
    const raw = phase === "graduated" ? v.clearingPrice : phase === "cancelled" ? null : v.floorPrice;
    return {
      phase,
      priceLabel: phase === "graduated" ? "Clearing price" : "Floor price",
      price: raw === null ? null : `$${priceUsd(raw)}`,
      marketCap: raw === null ? null : marketCapUsd(raw, v.totalSupply),
      opensIn,
      closesIn,
    };
  }

  const phase = now === null ? "open" : auctionPhase(a, now);
  const price = impliedPrice(a.totalDeposits, launch.saleSupply);
  return {
    phase,
    priceLabel: phase === "graduated" ? "Clearing price" : phase === "open" ? "Clearing price so far" : "Uniform price",
    price: phase === "cancelled" || !price ? null : `$${price}`,
    marketCap: phase === "cancelled" ? null : impliedMarketCap(a.totalDeposits),
    opensIn,
    closesIn,
  };
}
