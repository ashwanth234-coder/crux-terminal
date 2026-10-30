"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { Address } from "viem";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { solanaDevnet, useSolanaPayer, type SolanaPayer } from "@/hooks/useSolanaPayer";
import { BATCH_WINDOW_SECONDS } from "@/lib/intents";
import type { OrderDraft } from "@/lib/order";
import {
  SOLANA_REFUND_GRACE_SECONDS,
  newSolanaOrder,
  openInstruction,
  orderAddress,
  orderProven,
  refundInstruction,
  type SolanaOrder,
} from "@/lib/solanaEscrow";

/** A Base buy paid with USDC on Solana devnet: the amounts are the ones the ticket quoted and will be signed. */
export type SolanaOrderRequest = {
  draft: OrderDraft;
  /** USDC escrowed, 6 decimals. */
  amount: bigint;
  /** The signed floor, in the token's units. */
  minAmountOut: bigint;
  /** CAIP-19 of the token bought on Base. */
  tokenOut: string;
  /** Where the solver delivers on Base. */
  payee: Address;
};

type Flow =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "sending" }
  | { kind: "open"; order: SolanaOrder; signature: string }
  | { kind: "refunding"; order: SolanaOrder; signature: string }
  | { kind: "refunded"; order: SolanaOrder; signature: string }
  | { kind: "error"; message: string };

const explorer = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

/** Signs with the payer, sends through devnet and waits for confirmation. */
async function sendSigned(payer: SolanaPayer, ix: TransactionInstruction) {
  const connection = solanaDevnet();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(ix);
  const signed = await payer.sign(tx);
  const signature = await connection.sendRawTransaction(signed, { preflightCommitment: "confirmed" });
  // Poll the status rather than confirmTransaction, which needs a websocket and getBlockHeight: the relay serves neither.
  for (let i = 0; i < 60; i++) {
    const { value } = await connection.getSignatureStatus(signature);
    if (value?.err) throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return signature;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Not confirmed after 90 s; check it on Solana Explorer: ${signature}`);
}

function message(err: unknown) {
  const e = err as { name?: string; message?: string };
  if (e.name === "WalletSignTransactionError" || /reject|denied|cancel/i.test(e.message ?? "")) return "Request rejected in wallet.";
  return e.message?.split("\n")[0] ?? "Something went wrong";
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="font-mono text-[12.5px] text-chrome">{value}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-dim">{hint}</span>}
      </dd>
    </div>
  );
}

export function SolanaIntentModal({ request, onClose }: { request: SolanaOrderRequest | null; onClose: () => void }) {
  const { payer, connect, usdc, sol, refetch } = useSolanaPayer();
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const placed = flow.kind === "open" || flow.kind === "refunding" || flow.kind === "refunded" ? flow.order : null;
  const signature = "signature" in flow ? flow.signature : null;

  // The escrow on Solana: there and unproven (waiting for the fill), proven (filled on Base, settling), or gone.
  const status = useQuery({
    queryKey: ["solana-order", placed ? Buffer.from(placed.fillHash).toString("hex") : null],
    enabled: placed !== null && flow.kind !== "refunded",
    refetchInterval: 4_000,
    queryFn: async () => {
      const info = await solanaDevnet().getAccountInfo(orderAddress(placed!.fillHash), "confirmed");
      const state = info ? (orderProven(info.data) ? "proven" : "escrowed") : "closed";
      // Refunds open once the fill deadline plus the grace period has passed with no proof.
      const refundable = state === "escrowed" && Date.now() / 1000 > placed!.fillDeadline + SOLANA_REFUND_GRACE_SECONDS;
      return { state, refundable };
    },
  });
  const refundable = status.data?.refundable ?? false;

  const busy = flow.kind === "signing" || flow.kind === "sending" || flow.kind === "refunding";
  const close = () => {
    if (busy) return;
    setFlow({ kind: "idle" });
    onClose();
  };

  async function place() {
    if (!request || !payer) return;
    try {
      setFlow({ kind: "signing" });
      const order = newSolanaOrder({
        user: payer.publicKey,
        amount: request.amount,
        tokenOut: request.tokenOut,
        minAmountOut: request.minAmountOut,
        payee: request.payee,
        now: Math.floor(Date.now() / 1000),
      });
      setFlow({ kind: "sending" });
      const signature = await sendSigned(payer, openInstruction(order, BATCH_WINDOW_SECONDS));
      setFlow({ kind: "open", order, signature });
      void refetch();
    } catch (err) {
      setFlow({ kind: "error", message: message(err) });
    }
  }

  async function refund() {
    if (!payer || flow.kind !== "open") return;
    const order = flow.order;
    try {
      setFlow({ kind: "refunding", order, signature: flow.signature });
      const signature = await sendSigned(payer, refundInstruction(order.user, order.fillHash));
      setFlow({ kind: "refunded", order, signature });
      void refetch();
    } catch (err) {
      setFlow({ kind: "error", message: message(err) });
    }
  }

  if (!request) return null;
  const { draft } = request;
  const usd = (n: bigint) => `${(Number(n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const short_ = !payer ? null : usdc === null ? "Reading your USDC…" : usdc < request.amount ? `Not enough USDC on Solana devnet (you have ${usd(usdc)})` : sol !== null && sol < 0.01 ? "Add a little devnet SOL for fees and rent (about 0.01)" : null;

  const note =
    flow.kind === "signing"
      ? `Approve the order in ${payer?.label ?? "your wallet"}…`
      : flow.kind === "sending"
        ? "Escrowing your USDC on Solana devnet…"
        : flow.kind === "refunding"
          ? "Refunding your USDC…"
          : flow.kind === "refunded"
            ? "Refunded: your USDC is back in your Solana wallet."
            : flow.kind === "error"
              ? flow.message
              : flow.kind === "open"
                ? status.data?.state === "closed"
                  ? `Done: $${draft.symbol} delivered to ${short(request.payee)} on Base Sepolia, and the solver was repaid on Solana.`
                  : status.data?.state === "proven"
                    ? "Filled on Base Sepolia. The Hyperlane proof reached Solana; the escrow is settling."
                    : refundable
                      ? "No solver filled this order in time. Refund your USDC."
                      : "Escrowed on Solana. Waiting for the solver's fill on Base Sepolia (then a Hyperlane proof, about a minute)."
                : `Pay with USDC on Solana devnet, receive $${draft.symbol} on Base Sepolia. Testnet only, no real funds.`;

  return (
    <Modal open onClose={close} locked={busy} title="Review intent" subtitle="Pay from Solana: escrowed on Solana, filled on Base, proven by Hyperlane.">
      <p role="status" aria-live="polite" className={`flex items-start gap-2 text-[12.5px] leading-snug ${flow.kind === "error" ? "text-down" : "text-chrome/85"}`}>
        {(busy || (flow.kind === "open" && status.data?.state !== "closed" && !refundable)) && <KineticLoader className="mt-0.5 shrink-0 text-signal" />}
        <span>{note}</span>
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-line bg-void/60 p-4 min-[420px]:grid-cols-2">
        <div>
          <p className="text-[12px] text-muted">You pay</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">{usd(request.amount)} USDC</p>
          <p className="mt-0.5 text-[12px] text-muted">on Solana devnet</p>
        </div>
        <div className="min-[420px]:text-right">
          <p className="text-[12px] text-muted">You receive (expected)</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">
            {draft.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${draft.symbol}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">on Base Sepolia</p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-line">
        <Row label="Paid from" value={payer ? `${payer.label} · ${short(payer.publicKey.toBase58())}` : "Not connected"} />
        <Row label="Delivered to" value={short(request.payee)} hint="Your address on Base Sepolia" />
        <Row label="Settlement" value="Hyperlane fill proof" hint="The escrow pays the solver only after Base proves the fill; otherwise you can refund 6 h after the deadline" />
      </dl>

      {signature && (
        <a href={explorer(signature)} target="_blank" rel="noreferrer" className="group mt-4 flex items-center justify-between gap-3 text-[12px] text-muted transition-colors hover:text-chrome">
          <span>Solana transaction</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-chrome/80">
            {short(signature)} <ArrowUpRight className="h-3 w-3" />
          </span>
        </a>
      )}

      {!payer ? (
        <button type="button" onClick={connect} className={buttonClass("primary", "md", "mt-5 w-full rounded-xl font-semibold")}>
          Connect a Solana wallet
        </button>
      ) : placed ? (
        <div className="mt-5 space-y-3">
          {refundable && flow.kind === "open" && (
            <button type="button" onClick={refund} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold")}>
              Refund USDC
            </button>
          )}
          <button type="button" onClick={close} disabled={busy} className={buttonClass("outline", "sm", "w-full rounded-lg")}>
            {status.data?.state === "closed" || flow.kind === "refunded" ? "Done" : "Close"}
          </button>
          {flow.kind === "open" && status.data?.state !== "closed" && (
            <p className="text-center text-[11.5px] text-dim">You can close this. The solver keeps working, and refunds open if no one fills it.</p>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={place}
            disabled={busy || short_ !== null}
            className={buttonClass("primary", "md", "mt-5 w-full rounded-xl font-semibold disabled:opacity-100")}
          >
            {busy && <KineticLoader />}
            {short_ ?? (busy ? "Confirming…" : "Pay from Solana")}
            {!busy && !short_ && <ArrowUpRight />}
          </button>
          <p className="mt-3 text-center text-[11.5px] text-dim">One signature in {payer.label}. Opening the escrow uses about 0.005 SOL of rent; about half returns when the order completes.</p>
        </>
      )}
    </Modal>
  );
}
