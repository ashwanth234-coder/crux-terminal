"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { AccountPanel } from "@/components/account/AccountPanel";
import { ExecutionPanel } from "@/components/pro/ExecutionPanel";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import type { AuctionV2, PhaseV2 } from "@/lib/launchV2";

export const BENCH_TOKEN = "0x00000000000000000000000000000000000c4a28" as Address;
const PAIR = "0x00000000000000000000000000000000000c4a27" as Address;
const FACTORY = "0x00000000000000000000000000000000000c4a2b" as Address;
const SUPPLY = BigInt(10) ** BigInt(27);
/** Prices in the factory's units (USDC per token, 24 decimals): floor $0.00001, projected $0.00002. */
export const FLOOR = BigInt(10) ** BigInt(19);
export const PROJECTED = BigInt(2) * BigInt(10) ** BigInt(19);

declare global {
  interface Window {
    /** What the panel asked for: auction deposits (amount, max price), as decimal strings. */
    __benchOrders?: { kind: string; amount: string; maxPrice: string }[];
  }
}

/**
 * Query string: scenario = open (the fair-launch opening: a stand-in auction model that records deposits), trade (a
 * trading token), protected (its first, batch-only minutes) or account (the account panel, for deposits). The CRUX
 * Account and the market come from window.__cruxTest (lib/testOverrides), set by the test.
 */
export function OrderBench() {
  const [scenario, setScenario] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    // Read once from the URL on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScenario(new URLSearchParams(location.search).get("scenario") ?? "trade");
    setNow(Math.floor(Date.now() / 1000));
    window.__benchOrders = [];
  }, []);
  if (!scenario) return null;

  const auction: AuctionV2 = {
    token: BENCH_TOKEN,
    creator: "0x00000000000000000000000000000000000c4a29",
    startTime: now - 120,
    batchWindow: 300,
    status: scenario === "open" ? 0 : 1,
    bidderCount: 3,
    settledAt: scenario === "open" ? 0 : now - 60,
    pair: scenario === "open" ? "0x0000000000000000000000000000000000000000" : PAIR,
    totalSupply: SUPPLY,
    saleSupply: SUPPLY / BigInt(2),
    graduationTarget: BigInt(10_000e6),
    floorPrice: FLOOR,
    maxAllocationPerWallet: SUPPLY,
    totalDeposits: BigInt(6_000e6),
    clearingPrice: scenario === "open" ? BigInt(0) : PROJECTED,
  };
  const model: LaunchV2Model = {
    version: 7,
    auction,
    maxDeposit: BigInt(1_000e6),
    topTickPrice: null,
    name: "Bench",
    symbol: "BENCH",
    loading: false,
    error: null,
    indicativePrice: PROJECTED,
    wouldGraduate: false,
    account: "0x00000000000000000000000000000000000c4a2c",
    connect: () => {},
    myBid: { quote: BigInt(0), maxPrice: BigInt(0) },
    myClaim: { tokens: BigInt(0), refund: BigInt(0) },
    creatorVested: { quote: BigInt(0), tokens: BigInt(0) },
    usdcBalance: BigInt(500e6),
    allowance: BigInt(10) ** BigInt(30),
    deposit: async (amount, maxPrice) => {
      window.__benchOrders!.push({ kind: "deposit", amount: amount.toString(), maxPrice: maxPrice.toString() });
      return `0x${"ab".repeat(32)}` as Hex;
    },
    settle: async () => undefined,
    claim: async () => undefined,
    claimVesting: async () => undefined,
  };
  const phase: PhaseV2 = scenario === "open" ? "open" : "graduated";

  // The account panel is a whole page (its own header and layout); the order panel sits in a terminal-width column.
  if (scenario === "account") return <AccountPanel />;
  return (
    <main className="mx-auto max-w-[420px] bg-void p-4">
      <div className="rounded-xl border border-line bg-panel">
        <ExecutionPanel factory={FACTORY} id="0" model={model} auction={auction} phase={phase} version={7} fallback={null} />
      </div>
    </main>
  );
}
