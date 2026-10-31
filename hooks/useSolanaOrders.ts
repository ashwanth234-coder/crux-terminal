"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { solanaDevnet } from "@/hooks/useSolanaPayer";
import { SOLANA_REFUND_GRACE_SECONDS, orderAddress, orderProven } from "@/lib/solanaEscrow";
import { SOLANA_ORDERS_EVENT, parseSolanaOrders, readSolanaOrdersRaw, updateSolanaOrder, type SolanaOrderRecord } from "@/lib/solanaOrders";

/** Where an order stands: waiting for a fill, filled on Base but not yet proven on Solana, or closed (filled / refunded). */
export type SolanaOrderState = "escrowed" | "proven" | "filled" | "refunded" | "closed" | "unknown";
export type SolanaOrderRow = SolanaOrderRecord & { state: SolanaOrderState; refundAt: number };

const hexBytes = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));

const subscribe = (onChange: () => void) => {
  window.addEventListener(SOLANA_ORDERS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SOLANA_ORDERS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** A closed order's last transaction says how it closed: the program logs "Instruction: Settle" or "Instruction: Refund". */
async function closedHow(fillHash: string): Promise<"filled" | "refunded" | null> {
  const connection = solanaDevnet();
  const [last] = await connection.getSignaturesForAddress(orderAddress(hexBytes(fillHash)), { limit: 1 }, "confirmed");
  if (!last) return null;
  const tx = await connection.getTransaction(last.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const logs = tx?.meta?.logMessages;
  if (!logs) return null;
  if (logs.some((l) => /Instruction: Refund\b/.test(l))) return "refunded";
  if (logs.some((l) => /Instruction: Settle\b/.test(l))) return "filled";
  return null;
}

/** This browser's Pay-from-Solana orders for one Solana wallet, with live status read from devnet. */
export function useSolanaOrders(wallet: string | null): SolanaOrderRow[] {
  const raw = useSyncExternalStore(subscribe, () => (wallet ? readSolanaOrdersRaw(wallet) : ""), () => "");
  const records = useMemo(() => parseSolanaOrders(raw), [raw]);
  const pending = records.filter((r) => !r.outcome);

  const live = useQuery({
    queryKey: ["solana-orders", wallet, pending.map((r) => r.fillHash).join(",")],
    enabled: wallet !== null && pending.length > 0,
    refetchInterval: 6_000,
    queryFn: async () => {
      const infos = await solanaDevnet().getMultipleAccountsInfo(pending.map((r) => orderAddress(hexBytes(r.fillHash))), "confirmed");
      const states: Record<string, SolanaOrderState> = {};
      await Promise.all(
        pending.map(async (r, i) => {
          const info = infos[i];
          if (info) {
            states[r.fillHash] = orderProven(info.data) ? "proven" : "escrowed";
            return;
          }
          // Closed: remember how, so it's read once.
          const how = await closedHow(r.fillHash).catch(() => null);
          if (how) updateSolanaOrder(r.user, r.fillHash, { outcome: how });
          states[r.fillHash] = how ?? "closed";
        }),
      );
      return states;
    },
  });

  return records.map((r) => ({
    ...r,
    state: r.outcome ?? live.data?.[r.fillHash] ?? "unknown",
    refundAt: r.fillDeadline + SOLANA_REFUND_GRACE_SECONDS,
  }));
}
