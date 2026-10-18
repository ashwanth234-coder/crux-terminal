"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

/** Circle's native USDC mint on Solana mainnet. */
export const SOLANA_USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** The owner's associated USDC token account (where wallets hold USDC by default). */
function usdcAccount(owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), SOLANA_USDC_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  )[0];
}

export type SolanaBalance = {
  publicKey: string | null;
  connected: boolean;
  isLoading: boolean;
  isError: boolean;
  sol: number;
  usdc: number;
};

/** SOL + SPL-USDC held by the connected Solana wallet, polled every 30s. */
export function useSolanaBalance(): SolanaBalance {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const key = publicKey?.toBase58() ?? null;

  const q = useQuery({
    queryKey: ["solana-balance", connection.rpcEndpoint, key],
    enabled: Boolean(publicKey),
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      if (!publicKey) return { sol: 0, usdc: 0 };
      // Public RPCs disable bulk token-account scans, so read the one associated
      // USDC account directly; a missing account simply means no USDC.
      const [lamports, usdc] = await Promise.all([
        connection.getBalance(publicKey),
        connection
          .getTokenAccountBalance(usdcAccount(publicKey))
          .then((r) => r.value.uiAmount ?? 0)
          .catch((err: unknown) => {
            if (err instanceof Error && /could not find account|invalid param/i.test(err.message)) return 0;
            throw err;
          }),
      ]);
      return { sol: lamports / LAMPORTS_PER_SOL, usdc };
    },
  });

  return {
    publicKey: key,
    connected: connected && Boolean(publicKey),
    isLoading: q.isLoading && Boolean(publicKey),
    isError: q.isError,
    sol: q.data?.sol ?? 0,
    usdc: q.data?.usdc ?? 0,
  };
}
