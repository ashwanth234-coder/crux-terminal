import { BaseError, ContractFunctionRevertedError, type Abi, type Address, type Hex } from "viem";
import type { Config } from "wagmi";
import { simulateContract, writeContract, type SimulateContractParameters } from "wagmi/actions";
import { feeHeadroom } from "./fees";

export type WriteRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  chainId?: number;
  value?: bigint;
};

/**
 * Runs a write against the chain as `account` first and sends it only if it would succeed. A revert throws here,
 * with the contract's own reason (launchError and friends decode it), before any wallet prompt: the wallet never
 * shows "this transaction is expected to fail". `onPrompt` fires once the simulation passed, as the wallet opens.
 */
export async function simulateThenWrite(config: Config, account: Address, request: WriteRequest, onPrompt?: () => void): Promise<Hex> {
  const { request: checked } = await simulateContract(config, { ...request, account } as SimulateContractParameters);
  const fees = await feeHeadroom(config, request.chainId);
  onPrompt?.();
  return writeContract(config, { ...checked, ...fees } as typeof checked);
}

/**
 * True when a simulated call failed only because a token allowance isn't in place yet (the approval comes next).
 * Covers Circle's FiatToken ("ERC20: transfer amount exceeds allowance") and OpenZeppelin's ERC20InsufficientAllowance.
 */
export function revertedOnAllowance(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return false;
  return revert.data?.errorName === "ERC20InsufficientAllowance" || /allowance/i.test(revert.reason ?? "");
}
