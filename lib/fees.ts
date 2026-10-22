import type { Config } from "wagmi";
import { estimateFeesPerGas } from "wagmi/actions";
import { ARBITRUM } from "./crosschain";

/**
 * Fee fields to send with a write on `chainId`. Arbitrum's base fee moves between blocks, and MetaMask was seen live
 * (2026-10-22) pricing the max fee a hair under the next block's base fee (20,056,000 vs 20,058,000 wei), which the
 * node rejects. On Arbitrum the site suggests double the estimate: only the actual fee is charged. Elsewhere the
 * wallet prices the transaction itself.
 */
export async function feeHeadroom(config: Config, chainId: number | undefined) {
  if (chainId !== ARBITRUM.id) return {};
  const { maxFeePerGas, maxPriorityFeePerGas } = await estimateFeesPerGas(config, { chainId: ARBITRUM.id });
  return { maxFeePerGas: maxFeePerGas * BigInt(2), maxPriorityFeePerGas };
}
