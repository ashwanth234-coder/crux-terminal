"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useCoinOrders } from "@/hooks/useCoinOrders";
import { usePositions } from "@/hooks/usePositions";
import { relay, useOneBalance } from "@/hooks/useSolanaTrading";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useAskCruxCoach } from "@/hooks/useTradePlans";
import { EvmBag, useSolanaRows, type Row } from "@/components/portfolio/YourCoins";
import { type Card, type CoinRef } from "@/lib/coach";
import { coinKey, dismissKey, initialsShare, reviewCards, type ReviewRow } from "@/lib/coachReview";
import { boughtThisVisit, lossesToday } from "@/lib/coachSession";

type OnCommand = (command: string, say?: string) => void;
type Group = { status: string; chain: CoinRef["chain"]; coin: string; legs: { kind: string; status: string }[] };

const DISMISSED = "crux-coach-dismissed";
const TONE = { 3: "bg-down", 2: "bg-signal", 1: "bg-dim" } as const;

const refOf = (r: Row): CoinRef => ({ chain: r.chain === "bsc" ? "bnb" : r.chain, address: r.coin, symbol: r.symbol });

/** Every coin held, Solana and Crux-bought BNB Chain / Base coins alike (the EVM ones read per coin, as Your coins does). */
function Holdings({ children }: { children: (rows: Row[], reading: boolean) => ReactNode }) {
  const pos = usePositions();
  const sol = useSolanaRows();
  const [evm, setEvm] = useState<Record<string, Row | null>>({});
  const report = useCallback((k: string, r: Row | null) => setEvm((m) => (m[k] === r ? m : { ...m, [k]: r })), []);
  const rows = [...sol.rows, ...Object.values(evm).filter((r): r is Row => r !== null)];
  return (
    <>
      {pos.positions
        .filter((p) => p.chain !== "solana")
        .map((p) => (
          <EvmBag key={`${p.chain}:${p.coin}`} p={p} onRow={report} />
        ))}
      {children(rows, sol.reading)}
    </>
  );
}

/**
 * The coach when Ask Crux opens (docs/superpowers/specs/2026-11-24-ask-crux-coach-design.md): "Here's what I'd look at",
 * one card per coin with one-tap buttons. Every button sends a command to the normal confirm card. Off unless the
 * server's coach is on for this login.
 */
export function CoachCards({ onCommand }: { onCommand: OnCommand }) {
  const on = useAskCruxCoach();
  if (!on) return null;
  return <Holdings>{(rows, reading) => <Review rows={rows} reading={reading} onCommand={onCommand} />}</Holdings>;
}

function readDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function Review({ rows, reading, onCommand }: { rows: Row[]; reading: boolean; onCommand: OnCommand }) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const balance = useOneBalance();
  const { orders } = useCoinOrders();
  const [dismissed, setDismissed] = useState<Record<string, number>>(readDismissed);
  const [now] = useState(() => Date.now());
  const server = useQuery({
    queryKey: ["coach-cards", crux.owner],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      return relay<{ cards: Card[]; peaks: Record<string, number>; lossesToday?: number }>("/v1/coach/cards", { token });
    },
  });
  const plans = useQuery({
    queryKey: ["coach-plans", crux.owner],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      return (await relay<{ groups: Group[] }>("/v1/order-groups/list", { token })).groups;
    },
  });

  const dismiss = useCallback((c: Card) => {
    setDismissed((was) => {
      const next = { ...was, [dismissKey(c)]: Date.now() };
      try {
        localStorage.setItem(DISMISSED, JSON.stringify(next));
      } catch {
        // no storage: it comes back next time
      }
      return next;
    });
  }, []);

  if (reading || server.isLoading || plans.isLoading) return null;
  const floors = new Set<string>();
  for (const g of plans.data ?? []) if (g.status === "active" && g.legs.some((l) => l.kind === "stopLoss" && l.status === "armed")) floors.add(coinKey({ chain: g.chain, address: g.coin, symbol: "" }));
  for (const o of orders ?? []) if (o.kind === "stopLoss" && o.status === "open") floors.add(coinKey({ chain: o.chain === "bsc" ? "bnb" : o.chain, address: o.coin, symbol: "" }));
  const review: ReviewRow[] = rows.map((r) => {
    const coin = refOf(r);
    return { coin, held: r.held, price: r.price, entry: r.entry, marketCash: r.marketCash, heldMs: r.boughtAt ? now - r.boughtAt : undefined, hasFloor: floors.has(coinKey(coin)) };
  });
  const cards = reviewCards({
    rows: review,
    cashUsd: balance.total !== null ? Number(balance.total) / 1e6 : 0,
    peaks: server.data?.peaks ?? {},
    server: server.data?.cards ?? [],
    dismissed,
    boughtThisSession: boughtThisVisit(),
    // Losses today: Ask Crux sales in this browser, or the plans' own sales on the server, whichever saw more.
    lossesToday: Math.max(lossesToday(), server.data?.lossesToday ?? 0),
    now,
  });
  if (cards.length === 0) return null;
  return (
    <div className="max-w-[95%] rounded-xl border border-line-2 px-3 py-2.5 text-[14px] text-chrome">
      <p className="text-[12px] uppercase tracking-[0.14em] text-dim">Here&apos;s what I&apos;d look at</p>
      <ul className="mt-2 space-y-2">
        {cards.map((c) => (
          <li key={dismissKey(c)} className="rounded-lg border border-line-2 px-3 py-2">
            <p className="flex items-start gap-2 text-[13px]">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[c.urgency]}`} aria-hidden="true" />
              <span>{c.text}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => (a.command ? onCommand(a.command, a.say ?? a.label) : dismiss(c))}
                  className="rounded-full border border-line-2 px-2.5 py-0.5 text-[12px] text-muted hover:border-chrome/40 hover:text-chrome"
                >
                  {a.label}
                </button>
              ))}
              <button type="button" onClick={() => dismiss(c)} className="px-1.5 py-0.5 text-[12px] text-dim hover:text-muted">
                Not now
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Take initials on BONK": sell the share that gets back what was paid (from Crux's record of the buy). */
export function InitialsCard({ coin, chain, onCommand }: { coin: string; chain?: CoinRef["chain"]; onCommand: OnCommand }) {
  return (
    <Holdings>
      {(rows, reading) => {
        const want = coin.replace(/^\$/, "").toLowerCase();
        const r = rows.find((x) => (x.coin.toLowerCase() === want || x.symbol.toLowerCase() === want) && (!chain || refOf(x).chain === chain));
        if (!r) return <p>{reading ? "Reading your coins…" : `I can't see $${coin.toUpperCase()} in your coins.`}</p>;
        const ref = refOf(r);
        const on = ` on ${ref.chain}`;
        const paid = r.entry !== undefined ? r.entry * r.held : undefined;
        const value = r.price !== undefined ? r.price * r.held : undefined;
        const share = paid !== undefined && value !== undefined ? initialsShare(paid, value) : null;
        if (share === null) {
          return (
            <>
              <p>{paid === undefined ? `I don't know what you paid for $${r.symbol}, so I can't work out your initials.` : `You're not up on $${r.symbol} yet, so there's nothing to take out.`}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => onCommand(`sell half of ${r.coin}${on}`, `Sell half my ${r.symbol}`)} className="rounded-full border border-line-2 px-3 py-1 text-[12.5px] text-muted hover:border-chrome/40 hover:text-chrome">
                  Sell half
                </button>
              </div>
            </>
          );
        }
        return (
          <>
            <p>{`Taking your initials on $${r.symbol} means selling about ${share}%: that gets your $${paid!.toFixed(2)} back. The rest keeps riding.`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => onCommand(`sell ${share}% of ${r.coin}${on}`, `Take my initials on ${r.symbol}`)} className="rounded-full border border-line-2 px-3 py-1 text-[12.5px] text-muted hover:border-chrome/40 hover:text-chrome">
                {`Sell ${share}%`}
              </button>
            </div>
          </>
        );
      }}
    </Holdings>
  );
}
