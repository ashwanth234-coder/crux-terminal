"use client";

import { useEffect, useRef, useState } from "react";
import { useSigners } from "@privy-io/react-auth";
import { useSignMessage, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
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
/** Set once the server moves this wallet's deposits itself (it holds the account it was registered to). */
const REGISTERED = (wallet: string) => `crux:sol-autoreg:${wallet}`;

/** What the wallet signs to name its Crux account (crux-solver solautomove.ts registrationMessage, byte for byte). */
const registrationMessage = (wallet: string, account: string) => `Crux: deposits from my Solana wallet ${wallet} go to my Crux account ${account}`;

function registeredTo(wallet: string): string | null {
  try {
    return localStorage.getItem(REGISTERED(wallet));
  } catch {
    return null;
  }
}

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
  const { signMessage } = useSignMessage();
  const { addSigners } = useSigners();
  const [state, setState] = useState<AutoDeposit>({ kind: "idle" });
  const busy = useRef(false);
  const embedded = wallets[0];
  const account = crux.loggedIn ? crux.account : null;
  const wallet = embedded?.address ?? null;

  useEffect(() => {
    if (!account || !wallet || !embedded) return;
    let live = true;
    let sponsor: PublicKey | null = null;
    let serverMoves = registeredTo(wallet) === account;
    /**
     * Once per login: let Crux's server move this wallet's deposits even with no page open. The wallet adds the
     * "crux server" key as a signer that Privy limits to Crux deposits (policyId), and signs which account its
     * deposits go to. From then on the server moves them and this page stops doing it itself.
     */
    const register = async (auto: { signerId: string; policyId: string }) => {
      try {
        await addSigners({ address: wallet, signers: [{ signerId: auto.signerId, policyIds: [auto.policyId] }] });
      } catch (e) {
        // Already added on another device or an earlier visit: carry on to the registration.
        if (!/already|exist|duplicate/i.test((e as Error).message ?? "")) throw e;
      }
      const { signature } = await signMessage({ message: new TextEncoder().encode(registrationMessage(wallet, account)), wallet: embedded });
      const res = await fetch(`${RELAY_URL}/v1/solana/autodeposit`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ wallet, account, signature: Buffer.from(signature).toString("base64") }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? `The relay said ${res.status}`);
      try {
        localStorage.setItem(REGISTERED(wallet), account);
      } catch {}
      serverMoves = true;
    };
    const tick = async () => {
      if (busy.current || serverMoves || lockedElsewhere(wallet)) return;
      busy.current = true;
      try {
        if (!sponsor) {
          const health = (await fetch(`${RELAY_URL}/v1/health`, { cache: "no-store" }).then((r) => r.json())) as {
            solanaSponsor?: string;
            solanaAutoDeposit?: { signerId: string; policyId: string };
          };
          if (!health.solanaSponsor) return;
          sponsor = new PublicKey(health.solanaSponsor);
          if (health.solanaAutoDeposit) {
            // Best effort: if it fails, this page keeps moving deposits itself as before.
            await register(health.solanaAutoDeposit).catch((e: Error) => console.warn("Crux: Solana auto-deposit not set up:", e.message));
            if (serverMoves) return;
          }
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
  }, [account, wallet, embedded, signTransaction, signMessage, addSigners]);

  return state;
}
