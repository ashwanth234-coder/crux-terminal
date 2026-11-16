"use client";

import { useEffect, useRef, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { solanaDevnet } from "@/hooks/useSolanaPayer";
import { BATCH_WINDOW_SECONDS, TESTNET_USDC } from "@/lib/intents";
import { launchCaip19 } from "@/lib/launchTrade";
import { RELAY_URL } from "@/lib/session";
import { associatedTokenAddress, newSolanaOrder, openInstruction, SOLANA_RENT } from "@/lib/solanaEscrow";
import { rememberSolanaOrder, tokenFromCaip19 } from "@/lib/solanaOrders";

/** The escrow's rent (crux-solver solsponsor.ts ESCROW_RENT_LAMPORTS): Crux tops the wallet up to this, never more. */
const RENT = SOLANA_RENT.order + SOLANA_RENT.marker + SOLANA_RENT.vault;
/** The smallest amount moved (the sponsor's SOLANA_SPONSOR_MIN_USDC). */
const MIN_USDC = BigInt(1_000_000);
const CHECK_MS = 20_000;
/** After a move (or a failure), this wallet waits before trying again; one tab at a time moves it. */
const COOLDOWN_MS = 90_000;
const LOCK = (wallet: string) => `crux:sol-automove:${wallet}`;

export type AutoDeposit = { kind: "idle" } | { kind: "moving"; usdc: bigint } | { kind: "moved"; usdc: bigint } | { kind: "error"; message: string };

function lockedElsewhere(wallet: string) {
  try {
    const at = Number(localStorage.getItem(LOCK(wallet)) ?? 0);
    return Date.now() - at < COOLDOWN_MS;
  } catch {
    return false;
  }
}
function lock(wallet: string) {
  try {
    localStorage.setItem(LOCK(wallet), String(Date.now()));
  } catch {}
}

/**
 * One Crux account, every chain: USDC that lands on a Crux login's Solana address moves into the Crux safe account by
 * itself. The login signs a crux_escrow deposit silently (paying the account on Base 1:1) and Crux's sponsor pays the
 * Solana fee and any rent the wallet is short of (relay POST /v1/solana/sponsor), so the wallet needs no SOL.
 */
export function useSolanaAutoDeposit(): AutoDeposit {
  const crux = useCruxAccount();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [state, setState] = useState<AutoDeposit>({ kind: "idle" });
  const busy = useRef(false);
  const embedded = wallets[0];
  const account = crux.loggedIn ? crux.account : null;
  const wallet = embedded?.address ?? null;

  useEffect(() => {
    if (!account || !wallet || !embedded) return;
    let live = true;
    let sponsor: PublicKey | null = null;
    const tick = async () => {
      if (busy.current || lockedElsewhere(wallet)) return;
      busy.current = true;
      try {
        if (!sponsor) {
          const health = (await fetch(`${RELAY_URL}/v1/health`, { cache: "no-store" }).then((r) => r.json())) as { solanaSponsor?: string };
          if (!health.solanaSponsor) return;
          sponsor = new PublicKey(health.solanaSponsor);
        }
        const connection = solanaDevnet();
        const user = new PublicKey(wallet);
        const usdc = await connection
          .getTokenAccountBalance(associatedTokenAddress(user))
          .then((r) => BigInt(r.value.amount))
          .catch(() => BigInt(0));
        if (usdc < MIN_USDC || !live) return;
        lock(wallet);
        setState({ kind: "moving", usdc });
        const [lamports, { blockhash, lastValidBlockHeight }] = await Promise.all([connection.getBalance(user, "confirmed"), connection.getLatestBlockhash("confirmed")]);
        const tokenOut = launchCaip19(TESTNET_USDC);
        const order = newSolanaOrder({ user, amount: usdc, tokenOut, minAmountOut: usdc, payee: account, now: Math.floor(Date.now() / 1000) });
        const tx = new Transaction({ feePayer: sponsor, blockhash, lastValidBlockHeight });
        const short = RENT - lamports;
        if (short > 0) tx.add(SystemProgram.transfer({ fromPubkey: sponsor, toPubkey: user, lamports: short }));
        tx.add(openInstruction(order, BATCH_WINDOW_SECONDS));
        const { signedTransaction } = await signTransaction({
          transaction: Uint8Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })),
          wallet: embedded,
        });
        const res = await fetch(`${RELAY_URL}/v1/solana/sponsor`, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ tx: Buffer.from(signedTransaction).toString("base64") }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; signature?: string; error?: string };
        if (!body.ok || !body.signature) throw new Error(body.error ?? `The relay said ${res.status}`);
        rememberSolanaOrder({
          fillHash: Buffer.from(order.fillHash).toString("hex"),
          user: wallet,
          token: tokenFromCaip19(tokenOut),
          symbol: "USDC",
          amount: order.amount.toString(),
          fillDeadline: order.fillDeadline,
          signature: body.signature,
        });
        lock(wallet);
        if (live) setState({ kind: "moved", usdc });
      } catch (e) {
        if (live) setState({ kind: "error", message: (e as Error).message.split("\n")[0] });
      } finally {
        busy.current = false;
      }
    };
    void tick();
    const t = setInterval(() => void tick(), CHECK_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [account, wallet, embedded, signTransaction]);

  return state;
}
