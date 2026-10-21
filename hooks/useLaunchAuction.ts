"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { BaseError, ContractFunctionRevertedError, erc20Abi, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { cruxFactoryAbi } from "@/contracts/abis/batchAuction";
import { TESTNET } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { TOKEN_DECIMALS, USDC_DECIMALS, launchError, type AuctionState, type LaunchModel, type OnStep } from "@/lib/launch";
import { useExactApproval } from "@/hooks/useExactApproval";
import { useConnectModal } from "@/providers/Web3Provider";

// ------------------------------------------------------------------ clock

const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  nowTimer ??= setInterval(() => nowListeners.forEach((l) => l()), 1000);
  return () => {
    nowListeners.delete(cb);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

/** Unix seconds, ticking once a second. Null during SSR and hydration. */
export function useNow() {
  return useSyncExternalStore(
    subscribeNow,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
}

// ------------------------------------------------------------------- live

const POLL_MS = 4_000;

function isUnknownAuction(err: unknown) {
  if (!(err instanceof BaseError)) return false;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "UnknownAuction";
}

/** Reads and writes one auction on the deployed CruxFactory (Base Sepolia). */
export function useLiveLaunch(factory: Address, id: bigint): LaunchModel {
  const config = useConfig();
  const approveExact = useExactApproval();
  const { address, chainId } = useConnection();
  const { openConnect } = useConnectModal();
  const { mutateAsync: writeContract } = useWriteContract();
  const { mutateAsync: switchChain } = useSwitchChain();

  const fac = { address: factory, abi: cruxFactoryAbi, chainId: TESTNET.id } as const;
  const usdc = { address: TESTNET_USDC, abi: erc20Abi, chainId: TESTNET.id } as const;

  const core = useReadContracts({
    contracts: [
      { ...fac, functionName: "getAuction", args: [id] },
      { ...fac, functionName: "saleSupply", args: [id] },
    ],
    query: {
      // Poll while the auction can still change on its own; stop once settled.
      refetchInterval: (q) => (q.state.data?.[0]?.result?.status ?? 0) === 0 ? POLL_MS : false,
    },
  });

  const raw = core.data?.[0]?.result;
  const auction: AuctionState | null = raw
    ? {
        token: raw.token,
        creator: raw.creator,
        startTime: Number(raw.startTime),
        batchWindow: raw.batchWindow,
        graduationTarget: raw.graduationTarget,
        totalDeposits: raw.totalDeposits,
        clearingPrice: raw.clearingPrice,
        status: raw.status,
      }
    : null;

  const me = address ?? zeroAddress;
  const mine = useReadContracts({
    contracts: [
      { ...fac, functionName: "deposits", args: [id, me] },
      { ...fac, functionName: "previewAllocation", args: [id, me] },
      { ...usdc, functionName: "balanceOf", args: [me] },
      { ...usdc, functionName: "allowance", args: [me, factory] },
    ],
    query: { enabled: Boolean(address && auction), refetchInterval: auction?.status === 0 ? POLL_MS : false },
  });

  const meta = useReadContracts({
    contracts: [
      { address: auction?.token ?? zeroAddress, abi: erc20Abi, chainId: TESTNET.id, functionName: "name" },
      { address: auction?.token ?? zeroAddress, abi: erc20Abi, chainId: TESTNET.id, functionName: "symbol" },
    ],
    query: { enabled: Boolean(auction), staleTime: Infinity },
  });

  const coreError = core.data?.[0]?.error ?? core.error;
  const error = coreError
    ? isUnknownAuction(coreError)
      ? `No auction #${id.toString()} exists on the factory yet.`
      : `Couldn't read the auction: ${launchError(coreError)}`
    : null;

  const refetch = useCallback(async () => {
    await Promise.all([core.refetch(), mine.refetch()]);
  }, [core, mine]);

  /** Switch to Base Sepolia, send one write, wait for it to land. */
  const send = useCallback(
    async (
      label: string,
      request: Parameters<typeof writeContract>[0],
      onStep: OnStep,
    ): Promise<Hex> => {
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
    async (amount: bigint, onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      onStep({ label: "Checking test USDC…" });
      const balance = await readContract(config, { ...usdc, functionName: "balanceOf", args: [address] });
      if (balance < amount) throw new Error("Not enough test USDC on Base Sepolia. Get some free at faucet.circle.com.");
      // Exactly this deposit, never an unlimited allowance; skipped when the allowance already covers it.
      await approveExact(
        { token: TESTNET_USDC, owner: address, spender: factory, amount },
        { onPrompt: () => onStep({ label: "Confirm the approval in your wallet…" }), onSent: (hash) => onStep({ label: "Approving test USDC…", hash }) },
      );
      const hash = await send("Depositing into the batch…", { ...fac, functionName: "deposit", args: [id, amount] }, onStep);
      await refetch();
      return hash;
    },
    // fac/usdc are rebuilt each render from stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, approveExact, config, factory, id, openConnect, refetch, send],
  );

  const settle = useCallback(
    async (onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      const hash = await send("Settling the auction…", { ...fac, functionName: "settleAuction", args: [id] }, onStep);
      await refetch();
      return hash;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, factory, id, openConnect, refetch, send],
  );

  const claim = useCallback(
    async (onStep: OnStep) => {
      if (!address) {
        openConnect();
        return;
      }
      const hash = await send("Claiming…", { ...fac, functionName: "claimTokens", args: [id] }, onStep);
      await refetch();
      return hash;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, factory, id, openConnect, refetch, send],
  );

  return {
    mode: "live",
    name: meta.data?.[0]?.result ?? null,
    symbol: meta.data?.[1]?.result ?? null,
    auction,
    saleSupply: core.data?.[1]?.result ?? null,
    loading: core.isPending,
    error,
    account: address ?? null,
    connect: openConnect,
    myDeposit: mine.data?.[0]?.result ?? BigInt(0),
    allocation: mine.data?.[1]?.result ?? BigInt(0),
    usdcBalance: mine.data?.[2]?.result ?? null,
    allowance: mine.data?.[3]?.result ?? null,
    deposit,
    settle,
    claim,
  };
}

// -------------------------------------------------------------- simulated

/** Simulated buyer balance; the preview never touches a wallet. */
const SIM_BALANCE = parseUnits("100000", USDC_DECIMALS);
/** Matches CruxFactory.SALE_BPS: 80% of supply is sold in the window. */
const SALE_BPS = BigInt(8000);
const SIM_ACCOUNT = "0x000000000000000000000000000000000000c0de" as Address;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PreviewParams = {
  name: string;
  symbol: string;
  /** Whole tokens. */
  supply: bigint;
  /** Whole USDC. */
  target: bigint;
  window: number;
  start: number;
};

/**
 * The same lifecycle, run in memory against the CruxFactory rules so the
 * flow can be tried before the factory is deployed. Nothing is sent anywhere.
 */
export function useSimulatedLaunch(p: PreviewParams): LaunchModel {
  const saleSupply = (p.supply * BigInt(10) ** BigInt(TOKEN_DECIMALS) * SALE_BPS) / BigInt(10000);
  const target = p.target * BigInt(10) ** BigInt(USDC_DECIMALS);
  const [state, setState] = useState({ deposit: BigInt(0), allowance: BigInt(0), balance: SIM_BALANCE, status: 0, claimed: false });

  const total = state.deposit;
  const graduated = state.status === 2;
  const auction: AuctionState = {
    token: SIM_ACCOUNT,
    creator: SIM_ACCOUNT,
    startTime: p.start,
    batchWindow: p.window,
    graduationTarget: target,
    // Like the contract, the total stays fixed after settlement while buyers claim.
    totalDeposits: total,
    clearingPrice: graduated && saleSupply > BigInt(0) ? (total * BigInt(10) ** BigInt(18)) / saleSupply : BigInt(0),
    status: state.status,
  };

  const deposit = async (amount: bigint, onStep: OnStep) => {
    if (Date.now() / 1000 >= p.start + p.window) throw new Error("The deposit window has closed. Settle the auction to finish it.");
    if (amount > state.balance) throw new Error("Not enough simulated USDC.");
    if (state.allowance < amount) {
      onStep({ label: "Approving exactly this amount (simulated)…" });
      await pause(900);
      setState((s) => ({ ...s, allowance: amount }));
    }
    onStep({ label: "Depositing into the batch (simulated)…" });
    await pause(900);
    setState((s) => ({ ...s, deposit: s.deposit + amount, balance: s.balance - amount, allowance: s.allowance - amount }));
    return undefined;
  };

  const settle = async (onStep: OnStep) => {
    onStep({ label: "Settling the auction (simulated)…" });
    await pause(900);
    setState((s) => ({ ...s, status: s.deposit > BigInt(0) && s.deposit >= target ? 2 : 3 }));
    return undefined;
  };

  const claim = async (onStep: OnStep) => {
    onStep({ label: "Claiming (simulated)…" });
    await pause(900);
    setState((s) => ({ ...s, claimed: true, balance: s.status === 3 ? s.balance + s.deposit : s.balance }));
    return undefined;
  };

  const unclaimed = state.claimed ? BigInt(0) : state.deposit;
  return {
    mode: "simulated",
    name: p.name,
    symbol: p.symbol,
    auction,
    saleSupply,
    loading: false,
    error: null,
    account: SIM_ACCOUNT,
    connect: () => {},
    myDeposit: unclaimed,
    allocation: unclaimed > BigInt(0) && total > BigInt(0) ? (unclaimed * saleSupply) / total : BigInt(0),
    usdcBalance: state.balance,
    allowance: state.allowance,
    deposit,
    settle,
    claim,
  };
}
