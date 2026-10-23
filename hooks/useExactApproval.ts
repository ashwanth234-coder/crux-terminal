"use client";

import { useCallback } from "react";
import { erc20Abi, maxUint256, type Address, type Hex } from "viem";
import { useConfig } from "wagmi";
import { getConnection, readContract, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { TESTNET } from "@/lib/chains";
import { CROSS_CHAIN_ORIGINS, type OriginChainId } from "@/lib/crosschain";
import { feeHeadroom } from "@/lib/fees";

/** Anything at or above half of uint256 is treated as an "unlimited" approval and refused outright. */
const UNLIMITED_FLOOR = maxUint256 / BigInt(2);

export type ApprovalRequest = {
  token: Address;
  owner: Address;
  spender: Address;
  /** Exactly what the next call will pull, in the token's base units. */
  amount: bigint;
  /** Chain the token lives on: Base Sepolia unless given (a cross-chain origin for cross-chain orders). */
  chainId?: typeof TESTNET.id | OriginChainId;
};

export type ApprovalHooks = {
  /** About to open the wallet's approval prompt. */
  onPrompt?: () => void;
  /** Approval broadcast; waiting for it to land. */
  onSent?: (hash: Hex) => void;
};

/**
 * Approve exactly what the next call spends, never an unlimited allowance. Skips the prompt when the
 * current allowance already covers the amount, simulates the approve before the wallet opens (so a
 * doomed approval fails here, not as a red wallet warning), and resolves only once it has landed.
 * Returns the approval's hash, or null when none was needed.
 */
export function useExactApproval() {
  const config = useConfig();
  return useCallback(
    async ({ token, owner, spender, amount, chainId: onChain }: ApprovalRequest, hooks: ApprovalHooks = {}): Promise<Hex | null> => {
      if (amount <= BigInt(0)) throw new Error("Nothing to approve.");
      if (amount >= UNLIMITED_FLOOR) throw new Error("Refusing an unlimited token approval.");

      const chainId = onChain ?? TESTNET.id;
      const allowance = await readContract(config, { address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender], chainId });
      if (allowance >= amount) return null;

      if (getConnection(config).chainId !== chainId) await switchChain(config, { chainId });
      const { request } = await simulateContract(config, {
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
        account: owner,
        chainId,
      });
      const fees = await feeHeadroom(config, chainId);
      hooks.onPrompt?.();
      const hash = await writeContract(config, { ...request, ...fees } as typeof request);
      hooks.onSent?.(hash);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      const chainName = CROSS_CHAIN_ORIGINS.find((o) => o.chain.id === chainId)?.name ?? "Base Sepolia";
      if (receipt.status !== "success") throw new Error(`The approval reverted on ${chainName}.`);
      return hash;
    },
    [config],
  );
}
