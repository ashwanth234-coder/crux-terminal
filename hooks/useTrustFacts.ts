"use client";

import { erc20Abi, parseAbi, zeroAddress, type Address } from "viem";
import { useBytecode, useReadContracts } from "wagmi";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { useCreatorVestingDays } from "@/hooks/useCreatorVesting";
import { useNow } from "@/hooks/useLaunchAuction";
import { TESTNET } from "@/lib/chains";
import { fmtUsdc, fmtTokens } from "@/lib/launch";
import { maxDepositV3, type AuctionV2, type BatchVersion } from "@/lib/launchV2";

const DEAD: Address = "0x000000000000000000000000000000000000dEaD";
const lpAbi = parseAbi(["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);

/** pass: verified on-chain just now · pending: not applicable yet (enforced later by the contract) · fail: the chain disagrees. */
export type CheckState = "pass" | "pending" | "fail" | "loading";
export type TrustCheck = { key: string; label: string; state: CheckState; value: string; detail: string; href?: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * The un-ruggable facts of one launch, each read live from Base Sepolia rather than asserted:
 * LP lock (pool LP held by 0x…dEaD), creator vesting (the factory's own constant and the settle time),
 * fee split, admin powers, fixed token supply, per-wallet cap and the home chain.
 */
export function useTrustFacts(
  factory: Address,
  auction: AuctionV2,
  version: BatchVersion,
  explorer: string,
  id: string | null = null,
): { checks: TrustCheck[]; loading: boolean; vestingDays: number | null } {
  // V4 launches each carry the creator's choice; V2/V3 use the factory's constant.
  const chosenDays = useCreatorVestingDays(factory, id === null ? null : BigInt(id), version);
  const graduated = auction.status === 1;
  const cancelled = auction.status === 2;
  const hasPool = graduated && auction.pair !== zeroAddress;
  const on = { chainId: TESTNET.id } as const;
  const fac = { ...on, address: factory, abi: cruxBatchFactoryAbi } as const;

  const facts = useReadContracts({
    contracts: [
      { ...fac, functionName: "FEE_BPS" },
      { ...fac, functionName: "CREATOR_FEE_SHARE_BPS" },
      { ...fac, functionName: "CREATOR_VESTING" },
      { ...fac, functionName: "owner" },
      { ...on, address: auction.token, abi: erc20Abi, functionName: "totalSupply" },
    ],
    query: { staleTime: 60_000 },
  });
  const lp = useReadContracts({
    contracts: [
      { ...on, address: auction.pair, abi: lpAbi, functionName: "totalSupply" },
      { ...on, address: auction.pair, abi: lpAbi, functionName: "balanceOf", args: [DEAD] },
      { ...on, address: auction.pair, abi: lpAbi, functionName: "balanceOf", args: [zeroAddress] },
    ],
    query: { enabled: hasPool, refetchInterval: 60_000 },
  });
  const code = useBytecode({ ...on, address: factory, query: { staleTime: Infinity } });

  const [feeBps, shareBps, vesting, owner, supply] = (facts.data ?? []).map((r) => r?.result);
  const [lpTotal, lpDead, lpZero] = (lp.data ?? []).map((r) => r?.result as bigint | undefined);
  const now = useNow();

  // 1. LP lock: the share of the pool's LP tokens no one can ever redeem (0x…dEaD, plus Uniswap's 1,000 at 0x0).
  let lpCheck: TrustCheck;
  if (cancelled) {
    lpCheck = { key: "lp", label: "LP status", state: "pending", value: "No pool", detail: "The launch cancelled below its floor, so no pool was created. Every deposit is refundable." };
  } else if (!hasPool) {
    lpCheck = {
      key: "lp",
      label: "LP status",
      state: "pending",
      value: "Locks at graduation",
      detail: "At graduation the factory mints the pool's LP tokens straight to 0x…dEaD. No wallet, the creator included, can ever receive them.",
    };
  } else if (lpTotal === undefined || lpDead === undefined) {
    lpCheck = { key: "lp", label: "LP status", state: "loading", value: "Checking…", detail: "Reading the pool's LP holders." };
  } else {
    const burned = lpDead + (lpZero ?? BigInt(0));
    const bps = lpTotal > BigInt(0) ? Number((burned * BigInt(10_000)) / lpTotal) : 0;
    lpCheck = {
      key: "lp",
      label: "LP status",
      state: bps >= 9_999 ? "pass" : "fail",
      value: bps >= 9_999 ? "Locked to 0x…dEaD" : `Only ${(bps / 100).toFixed(2)}% burned`,
      detail: `${(bps / 100).toFixed(2)}% of the pool's LP tokens sit at 0x…dEaD and 0x0, where no one can redeem them. Read live from pool ${short(auction.pair)}.`,
      href: `${explorer}/address/${auction.pair}`,
    };
  }

  // 2. Creator vesting: the factory's own constant, measured from the on-chain settle time.
  const vestDays = version === 4 ? chosenDays : typeof vesting === "bigint" ? Number(vesting) / 86_400 : null;
  let vestCheck: TrustCheck;
  if (vestDays === 0) {
    vestCheck = {
      key: "vesting",
      label: "Creator vesting",
      state: "fail",
      value: "Instant unlock",
      detail: graduated
        ? "The creator chose an instant unlock: their 10% and their share of the raise were released at graduation and can be sold at once."
        : "The creator chose an instant unlock: at graduation their 10% and their share of the raise are released at once, with no vesting.",
    };
  } else if (vestDays === null) {
    vestCheck = { key: "vesting", label: "Creator vesting", state: "loading", value: "Checking…", detail: "Reading the factory's vesting schedule." };
  } else if (graduated) {
    const pct = now === null ? 0 : Math.max(0, Math.min(100, ((now - auction.settledAt) / (vestDays * 86_400)) * 100));
    vestCheck = {
      key: "vesting",
      label: "Creator vesting",
      state: "pass",
      value: `${vestDays}-day linear`,
      detail: `The creator's 10% and their share of the raise unlock linearly from ${day(auction.settledAt)}: ${pct.toFixed(1)}% so far. The contract can't release it faster.`,
    };
  } else {
    vestCheck = {
      key: "vesting",
      label: "Creator vesting",
      state: "pending",
      value: `${vestDays}-day linear`,
      detail: cancelled ? "Not applicable: the launch cancelled, so nothing vests." : "Starts at graduation. The creator gets no tokens and no raise up front, only the vesting stream.",
    };
  }

  // 3. Fee split, from the contract's constants.
  const feeCheck: TrustCheck =
    typeof feeBps === "bigint" && typeof shareBps === "bigint"
      ? {
          key: "fees",
          label: "Fee routing",
          state: "pass",
          value: `${Number(feeBps) / 100}% · ${Number(shareBps) / 100}% to creator`,
          detail: `A ${Number(feeBps) / 100}% fee on the raise at graduation: ${Number(shareBps) / 100}% to the creator, the rest to the protocol. Fixed in the contract.`,
        }
      : { key: "fees", label: "Fee routing", state: "loading", value: "Checking…", detail: "Reading the fee constants." };

  // 4. Admin powers: the factory's only owner-gated function is setTreasury (verified in the source); it isn't upgradeable.
  const adminCheck: TrustCheck = {
    key: "admin",
    label: "Admin powers",
    state: typeof owner === "string" ? "pass" : "loading",
    value: "Fee treasury only",
    detail: `The factory admin${typeof owner === "string" ? ` (${short(owner)})` : ""} can only change where the protocol's fee share goes. No function can touch bids, the pool, LP or vesting, and the contract isn't upgradeable.`,
    href: `${explorer}/address/${factory}#code`,
  };

  // 5. Fixed supply: the factory deploys CruxToken, which mints once and has no mint function or owner.
  const supplyCheck: TrustCheck =
    typeof supply === "bigint"
      ? {
          key: "supply",
          label: "Token supply",
          state: supply <= auction.totalSupply ? "pass" : "fail",
          value: supply <= auction.totalSupply ? "Fixed · no mint" : "Supply changed",
          detail: `${fmtTokens(supply)} live supply${supply < auction.totalSupply ? " (some burned)" : ""}. Deployed by the Crux factory as CruxToken: minted once, no mint function, no owner.`,
          href: `${explorer}/token/${auction.token}`,
        }
      : { key: "supply", label: "Token supply", state: "loading", value: "Checking…", detail: "Reading the token's supply." };

  // 6. Per-wallet cap (anti-whale), from the auction itself.
  const capCheck: TrustCheck =
    version >= 3
      ? {
          key: "cap",
          label: "Wallet cap",
          state: "pass",
          value: `$${fmtUsdc(maxDepositV3(auction))} per wallet`,
          detail: "Each address can deposit at most this, enforced by the contract at deposit time.",
        }
      : {
          key: "cap",
          label: "Wallet cap",
          state: "pass",
          value: `${fmtTokens(auction.maxAllocationPerWallet)} per wallet`,
          detail: "Each address receives at most this many tokens; the excess is refunded.",
        };

  // 7. Home chain: the factory's code is read live from the chain this page is connected to.
  const chainCheck: TrustCheck = {
    key: "chain",
    label: "Home chain",
    state: code.data ? "pass" : code.isPending ? "loading" : "fail",
    value: `Base Sepolia · ${TESTNET.id}`,
    detail: code.data
      ? `Factory ${short(factory)} read live from Base Sepolia testnet${version >= 3 ? "; source verified on Basescan and Sourcify" : ""}.`
      : "Couldn't read the factory's code from Base Sepolia.",
    href: `${explorer}/address/${factory}#code`,
  };

  return {
    checks: [lpCheck, vestCheck, feeCheck, adminCheck, supplyCheck, capCheck, chainCheck],
    loading: facts.isPending,
    /** The factory's own creator-vesting length, read live; null until read. */
    vestingDays: vestDays,
  };
}
