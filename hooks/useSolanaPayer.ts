"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useSolanaConnectModal } from "@/providers/SolanaProvider";
import { associatedTokenAddress } from "@/lib/solanaEscrow";

let devnet: Connection | null = null;

/** Solana devnet, through the site's relay (app/api/solana?cluster=devnet) unless NEXT_PUBLIC_SOLANA_DEVNET_RPC is set. */
export function solanaDevnet(): Connection {
  devnet ??= new Connection(process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC ?? `${window.location.origin}/api/solana?cluster=devnet`, "confirmed");
  return devnet;
}

export type SolanaPayer = {
  publicKey: PublicKey;
  /** "Phantom", "Solflare", or "Crux login" (Privy's Solana embedded wallet). */
  label: string;
  /** Signs (never sends) a transaction and returns its serialized bytes; the app sends it through devnet itself. */
  sign: (tx: Transaction) => Promise<Uint8Array>;
};

/**
 * Who pays a Solana order: a connected Solana wallet (Phantom, Solflare, any Wallet Standard wallet), else the Solana
 * embedded wallet of an email / Google login. Plus that payer's USDC (devnet) and SOL for fees.
 */
export function useSolanaPayer() {
  const adapter = useWallet();
  const { wallets: privyWallets } = useWallets();
  const { signTransaction: privySign } = useSignTransaction();
  const { openSolana } = useSolanaConnectModal();

  const payer = useMemo<SolanaPayer | null>(() => {
    if (adapter.connected && adapter.publicKey && adapter.signTransaction) {
      const signTransaction = adapter.signTransaction;
      return {
        publicKey: adapter.publicKey,
        label: adapter.wallet?.adapter.name ?? "Solana wallet",
        sign: async (tx) => Uint8Array.from((await signTransaction(tx)).serialize()),
      };
    }
    const embedded = privyWallets[0];
    if (embedded) {
      return {
        publicKey: new PublicKey(embedded.address),
        label: "Crux login",
        sign: async (tx) => {
          const { signedTransaction } = await privySign({
            transaction: Uint8Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })),
            wallet: embedded,
          });
          return signedTransaction;
        },
      };
    }
    return null;
  }, [adapter.connected, adapter.publicKey, adapter.signTransaction, adapter.wallet, privyWallets, privySign]);

  const key = payer?.publicKey.toBase58() ?? null;
  const balances = useQuery({
    queryKey: ["solana-devnet-payer", key],
    enabled: payer !== null,
    refetchInterval: 15_000,
    retry: 1,
    queryFn: async () => {
      const connection = solanaDevnet();
      const owner = payer!.publicKey;
      const [lamports, usdc] = await Promise.all([
        connection.getBalance(owner),
        connection
          .getTokenAccountBalance(associatedTokenAddress(owner))
          .then((r) => BigInt(r.value.amount))
          .catch((err: unknown) => {
            if (err instanceof Error && /could not find account|invalid param/i.test(err.message)) return BigInt(0);
            throw err;
          }),
      ]);
      return { sol: lamports / 1e9, usdc };
    },
  });

  return {
    payer,
    connect: openSolana,
    /** USDC in 6-decimal units (1:1 with Base test USDC), null while unknown. */
    usdc: balances.data?.usdc ?? null,
    sol: balances.data?.sol ?? null,
    refetch: balances.refetch,
  };
}
