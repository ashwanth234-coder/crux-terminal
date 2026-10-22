"use client";

import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { TESTNET } from "@/lib/chains";
import { parseTokenMeta, tokenMetaAbi, type TokenMeta } from "@/lib/tokenMeta";

export { parseTokenMeta, type TokenMeta };

/** A Crux launch token's own metadata (description, socials, logo), read once from the token contract. */
export function useTokenMeta(token: Address): TokenMeta {
  const { data } = useReadContract({ address: token, abi: tokenMetaAbi, functionName: "metadataURI", chainId: TESTNET.id, query: { staleTime: Infinity } });
  return parseTokenMeta(data);
}
