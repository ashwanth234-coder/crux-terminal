"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { useSolanaOrders, type SolanaOrderRow } from "@/hooks/useSolanaOrders";
import { sendSolana, solanaErrorMessage, useSolanaPayer } from "@/hooks/useSolanaPayer";
import { countdown, refundClock } from "@/lib/refundTime";
import { refundInstruction } from "@/lib/solanaEscrow";
import { updateSolanaOrder } from "@/lib/solanaOrders";
import { PublicKey } from "@solana/web3.js";

const explorer = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
const usdc = (amount: string) => (Number(amount) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Wall-clock seconds, ticking each second (null until mounted, so server and client render alike). */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

function Row({ order, now }: { order: SolanaOrderRow; now: number | null }) {
  const { payer } = useSolanaPayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = order.state === "escrowed";
  const late = waiting && now !== null && now > order.fillDeadline;
  const refundable = waiting && now !== null && now >= order.refundAt;

  const refund = async () => {
    if (!payer) return;
    setBusy(true);
    setError(null);
    try {
      const signature = await sendSolana(payer, refundInstruction(new PublicKey(order.user), Uint8Array.from(Buffer.from(order.fillHash, "hex"))));
      updateSolanaOrder(order.user, order.fillHash, { outcome: "refunded", refundSignature: signature });
    } catch (err) {
      setError(solanaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const status =
    order.state === "filled"
      ? { dot: "bg-up", tone: "text-up", label: `Filled · $${order.symbol} delivered on Base` }
      : order.state === "refunded"
        ? { dot: "bg-muted", tone: "text-muted", label: "Refunded to your Solana wallet" }
        : order.state === "closed"
          ? { dot: "bg-muted", tone: "text-muted", label: "Closed" }
          : order.state === "proven"
            ? { dot: "bg-signal", tone: "text-chrome/85", label: "Filled on Base · confirming on Solana" }
            : refundable
              ? { dot: "bg-signal", tone: "text-chrome/85", label: "Not filled in time · refund open" }
              : late
                ? { dot: "bg-signal", tone: "text-chrome/85", label: `Not filled in time · refund available at ${refundClock(order.refundAt, now ?? undefined)}` }
                : waiting
                  ? { dot: "bg-signal", tone: "text-chrome/85", label: "Waiting for the fill on Base (usually about 20 s)" }
                  : { dot: "bg-line-2", tone: "text-dim", label: "Reading Solana…" };

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(9.5rem,auto)]">
      <div className="min-w-0">
        <a
          href={explorer(order.signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[12px] text-chrome/80 underline decoration-line-2 underline-offset-2 transition-colors hover:text-chrome"
          title="The order on Solana Explorer (devnet)"
        >
          {order.signature.slice(0, 6)}…{order.signature.slice(-4)} ↗
        </a>
        <p className={`mt-1 flex items-center gap-1.5 text-[11px] ${status.tone}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
          <span className="truncate">{status.label}</span>
        </p>
      </div>

      <p className="text-right font-mono text-[12.5px] tabular-nums text-chrome">
        {usdc(order.amount)}
        <span className="ml-1 text-[11px] text-muted">USDC</span>
      </p>

      <div className="col-span-2 flex flex-col items-stretch gap-1 sm:col-span-1 sm:items-end">
        {late && !refundable && now !== null && (
          <p className="text-[11px] text-muted sm:text-right">
            Refund opens in{" "}
            <span className="font-mono tabular-nums text-chrome/85" role="timer">
              {countdown(order.refundAt - now)}
            </span>
          </p>
        )}
        {refundable && (
          <button
            type="button"
            onClick={refund}
            disabled={busy || !payer}
            title={payer ? undefined : "Connect a Solana wallet to send the refund"}
            className={buttonClass("primary", "sm", "h-8 px-3.5 text-[12px] disabled:opacity-100")}
          >
            {busy ? (
              <>
                <KineticLoader /> Refunding…
              </>
            ) : (
              "Refund USDC"
            )}
          </button>
        )}
        {order.refundSignature && (
          <a href={explorer(order.refundSignature)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-signal sm:text-right">
            Refund transaction ↗
          </a>
        )}
        {error && (
          <p role="alert" className="text-[11px] text-down sm:text-right">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

/** Orders for one token paid with USDC from the connected Solana wallet (placed from this browser). */
export function SolanaOrders({ token }: { token: string }) {
  const { payer } = useSolanaPayer();
  const orders = useSolanaOrders(payer?.publicKey.toBase58() ?? null).filter((o) => o.token === token.toLowerCase());
  const now = useNow();
  if (orders.length === 0) return null;
  return (
    <section aria-label="Paid from Solana" className="border-t border-line px-3 pt-3 first:border-t-0">
      <h3 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">Paid from Solana</h3>
      <ul className="divide-y divide-line">
        {orders.map((o) => (
          <Row key={o.fillHash} order={o} now={now} />
        ))}
      </ul>
    </section>
  );
}
