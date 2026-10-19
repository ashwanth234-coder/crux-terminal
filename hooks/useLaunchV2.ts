"use client";

import { useCallback } from "react";
import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, erc20Abi, zeroAddress, type Address, type Hex } from "viem";
import { useConfig, useConnection, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { cruxFactoryV2Abi } from "@/contracts/abis/batchAuction";
import { TESTNET } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { launchError, type OnStep } from "@/lib/launch";
import { toAuctionV2, type AuctionV2 } from "@/lib/launchV2";
import { useConnectModal } from "@/providers/Web3Provider";

const POLL_MS = 4_000;

function isUnknownAuction(err: unknown) {
  if (!(err instanceof BaseError)) return false;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "UnknownAuction";
}

export type LaunchV2Model = {
  auction: AuctionV2 | null;
  name: string | null;
  symbol: string | null;
  loading: boolean;
  error: string | null;
  /** Clearing price if the batch closed now (or the final one once settled); null when it would cancel. */
  indicativePrice: bigint | null;
  wouldGraduate: boolean | null;
  account: Address | null;
  connect: () => void;
  myBid: { quote: bigint; maxPrice: bigint };
  myClaim: { tokens: bigint; refund: bigint };
  creatorVested: { quote: bigint; tokens: bigint };
  usdcBalance: bigint | null;
  allowance: bigint | null;
  deposit: (amount: bigint, maxPrice: bigint, onStep: OnStep) => Promise<Hex | undefined>;
  settle: (onStep: OnStep) => Promise<Hex | undefined>;
  claim: (onStep: OnStep) => Promise<Hex | undefined>;
  claimVesting: (onStep: OnStep) => Promise<Hex | undefined>;
};

/** One auction on the deployed CruxFactoryV2 (Base Sepolia), with its writes. */
export function useLaunchV2(factory: Address, id: bigint): LaunchV2Model {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { openConnect } = useConnectModal();
  const { mutateAsync: writeContract } = useWriteContract();
  const { mutateAsync: switchChain } = useSwitchChain();

  const fac = { address: factory, abi: cruxFactoryV2Abi, chainId: TESTNET.id } as const;
  const usdc = { address: TESTNET_USDC, abi: erc20Abi, chainId: TESTNET.id } as const;
  const me = address ?? zeroAddress;

  const core = useReadContract({
    ...fac,
    functionName: "getAuction",
    args: [id],
    query: { refetchInterval: (q) => ((q.state.data?.status ?? 0) === 0 ? POLL_MS : false) },
  });
  const auction = core.data ? toAuctionV2(core.data) : null;
  const live = auction?.status === 0;

  // The contract's own clearing search (eth_call): the real price the batch would clear at.
  const clearing = useReadContract({
    ...fac,
    functionName: "findClearingPrice",
    args: [id],
    query: { enabled: Boolean(auction && live && auction.bidderCount > 0), refetchInterval: live ? 12_000 : false },
  });

  const mine = useReadContracts({
    contracts: [
      { ...fac, functionName: "bidOf", args: [id, me] },
      { ...fac, functionName: "claimable", args: [id, me] },
      { ...fac, functionName: "creatorVested", args: [id] },
      { ...usdc, functionName: "balanceOf", args: [me] },
      { ...usdc, functionName: "allowance", args: [me, factory] },
    ],
    query: { enabled: Boolean(auction), refetchInterval: live ? POLL_MS : 15_000 },
  });

  const meta = useReadContracts({
    contracts: [
      { address: auction?.token ?? zeroAddress, abi: erc20Abi, chainId: TESTNET.id, functionName: "name" },
      { address: auction?.token ?? zeroAddress, abi: erc20Abi, chainId: TESTNET.id, functionName: "symbol" },
    ],
    query: { enabled: Boolean(auction), staleTime: Infinity },
  });

  const error = core.error
    ? isUnknownAuction(core.error)
      ? `No auction #${id.toString()} exists on the V2 factory yet.`
      : core.error instanceof BaseError && core.error.walk((e) => e instanceof ContractFunctionZeroDataError)
        ? "The V2 factory isn't deployed at the configured address on Base Sepolia yet."
        : `Couldn't read the auction: ${launchError(core.error)}`
    : null;

  const refetch = useCallback(async () => {
    await Promise.all([core.refetch(), mine.refetch(), clearing.refetch()]);
  }, [core, mine, clearing]);

  /** Switch to Base Sepolia, send one write, wait for it to land. */
  const send = useCallback(
    async (label: string, request: Parameters<typeof writeContract>[0], onStep: OnStep): Promise<Hex> => {
      if (chainId !== TESTNET.id) {
        onStep({ label: "Switching to Base Sepolia…" });
        await switchChain({ chainId: TESTNET.id });
      }
      onStep({ label: "Confirm in your wallet…" });
      const hash = await writeContract(request);
      onStep({ label, hash });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
      if (receipt.status !== "success") throw new Error("The transaction reverted on Base Sepolia.");
      return hash;
    },
    [chainId, config, switchChain, writeContract],
  );

  const deposit = useCallback(
    async (amount: bigint, maxPrice: bigint, onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      onStep({ label: "Checking test USDC…" });
      const balance = await readContract(config, { ...usdc, functionName: "balanceOf", args: [address] });
      if (balance < amount) throw new Error("Not enough test USDC on Base Sepolia. Get some free at faucet.circle.com.");
      const allowance = await readContract(config, { ...usdc, functionName: "allowance", args: [address, factory] });
      if (allowance < amount) {
        // Approve exactly this deposit, never an unlimited allowance.
        await send("Approving test USDC…", { ...usdc, functionName: "approve", args: [factory, amount] }, onStep);
      }
      const hash = await send("Placing your bid…", { ...fac, functionName: "deposit", args: [id, amount, maxPrice] }, onStep);
      await refetch();
      return hash;
    },
    // fac/usdc are rebuilt each render from stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, config, factory, id, openConnect, refetch, send],
  );

  const settle = useCallback(
    async (onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      onStep({ label: "Computing the clearing price…" });
      const [, price] = await readContract(config, { ...fac, functionName: "findClearingPrice", args: [id] });
      const hash = await send("Settling the batch…", { ...fac, functionName: "settleAuction", args: [id, price] }, onStep);
      await refetch();
      return hash;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, config, factory, id, openConnect, refetch, send],
  );

  const claim = useCallback(
    async (onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      const hash = await send("Claiming…", { ...fac, functionName: "claim", args: [id] }, onStep);
      await refetch();
      return hash;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, factory, id, openConnect, refetch, send],
  );

  const claimVesting = useCallback(
    async (onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      const hash = await send("Releasing vested funds…", { ...fac, functionName: "claimCreatorVesting", args: [id] }, onStep);
      await refetch();
      return hash;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, factory, id, openConnect, refetch, send],
  );

  const bid = mine.data?.[0]?.result;
  const claimable = mine.data?.[1]?.result;
  const vested = mine.data?.[2]?.result;
  const settledPrice = auction && auction.status === 1 ? auction.clearingPrice : null;

  return {
    auction,
    name: meta.data?.[0]?.result ?? null,
    symbol: meta.data?.[1]?.result ?? null,
    loading: core.isPending,
    error,
    indicativePrice: settledPrice ?? (clearing.data?.[0] ? clearing.data[1] : null),
    wouldGraduate: auction?.status === 1 ? true : auction?.status === 2 ? false : clearing.data ? clearing.data[0] : null,
    account: address ?? null,
    connect: openConnect,
    myBid: { quote: bid?.[0] ?? BigInt(0), maxPrice: bid?.[1] ?? BigInt(0) },
    myClaim: { tokens: claimable?.[0] ?? BigInt(0), refund: claimable?.[1] ?? BigInt(0) },
    creatorVested: { quote: vested?.[0] ?? BigInt(0), tokens: vested?.[1] ?? BigInt(0) },
    usdcBalance: mine.data?.[3]?.result ?? null,
    allowance: mine.data?.[4]?.result ?? null,
    deposit,
    settle,
    claim,
    claimVesting,
  };
}
