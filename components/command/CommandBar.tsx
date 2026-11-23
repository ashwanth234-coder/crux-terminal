"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { buttonClass } from "@/components/ui/Button";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useCashMove } from "@/hooks/useCashMove";
import { useCoinOrders, type PlaceCoinOrder } from "@/hooks/useCoinOrders";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";
import { useWalletTrading } from "@/hooks/useBnbTrading";
import { COMMAND_EXAMPLES, describeStep, parseCommand, type CommandStep } from "@/lib/commandIntent";
import { CHAIN_NAME, findCoins, type FoundCoin, type LaunchLite } from "@/lib/commandCoins";
import { IS_TESTNET } from "@/lib/network";

/** During the beta one buy is capped by the server (BETA_MAX_BUY_USDC); the card says so before it's sent. */
const BETA_MAX_BUY = 25;
const SLIPPAGE_BPS = 300;

type Outcome = { ok: boolean; text: string; link?: string };
type Plan = { steps: CommandStep[]; coins: FoundCoin[][]; pick: number[] };

/**
 * The command bar: the trader types what they want ("buy $5 of BONK and take profit at 2x"), Crux reads it into fixed
 * steps (lib/commandIntent, no AI), finds each coin, and shows a card. Nothing runs until Confirm; then each step runs
 * through the same trade and order paths as the coin pages, so the server checks it exactly as it checks a click.
 * Opens from the header button or Ctrl/⌘+K.
 */
export function CommandButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass("outline", "sm", "gap-2 px-3")} ${className}`} aria-label="Tell Crux what to trade">
        <span aria-hidden="true">›_</span>
        <span>Ask Crux</span>
        <kbd className="hidden rounded border border-line-2 px-1 font-mono text-[10.5px] text-dim lg:inline">Ctrl K</kbd>
      </button>
      {open && <CommandPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function CommandPanel({ onClose }: { onClose: () => void }) {
  const crux = useCruxAccount();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [running, setRunning] = useState<number | null>(null);
  const [outcomes, setOutcomes] = useState<(Outcome | undefined)[]>([]);
  const box = useRef<HTMLInputElement>(null);

  // The same cached list as the header search (Crux's own launches, matched first).
  const feed = useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: LaunchLite[] }).launches;
    },
    staleTime: 60_000,
  });

  useEffect(() => box.current?.focus(), []);

  const read = async () => {
    setError(null);
    setPlan(null);
    setOutcomes([]);
    const parsed = parseCommand(text);
    if (!parsed.ok) return setError(parsed.error);
    setFinding(true);
    try {
      const launches = feed.data ?? (await feed.refetch()).data ?? [];
      const seen = new Map<string, Promise<FoundCoin[]>>();
      const coins = await Promise.all(
        parsed.steps.map((s) => {
          const k = `${s.coin.toLowerCase()}|${s.chain ?? ""}`;
          if (!seen.has(k)) seen.set(k, findCoins(s.coin, s.chain, launches));
          return seen.get(k)!;
        }),
      );
      const missing = parsed.steps.findIndex((_, i) => coins[i].length === 0);
      if (missing >= 0) {
        const s = parsed.steps[missing];
        return setError(`I couldn't find a coin called ${s.coin}${s.chain ? ` on ${CHAIN_NAME[s.chain]}` : ""} with real trading. Try its address instead.`);
      }
      setPlan({ steps: parsed.steps, coins, pick: parsed.steps.map(() => 0) });
    } catch {
      setError("Couldn't look the coins up just now. Try again in a moment.");
    } finally {
      setFinding(false);
    }
  };

  const chosen = (i: number) => plan!.coins[i][plan!.pick[i]];
  const problems = plan ? planProblems(plan.steps, plan.steps.map((_, i) => chosen(i))) : [];
  const done = running === null && outcomes.length > 0;
  const busy = finding || running !== null;

  const onStepDone = useCallback(
    (i: number, o: Outcome) => {
      setOutcomes((prev) => {
        const next = [...prev];
        next[i] = o;
        return next;
      });
      // A failed step stops the rest (a take profit after a buy that didn't happen would be wrong).
      setRunning(o.ok && plan && i + 1 < plan.steps.length ? i + 1 : null);
    },
    [plan],
  );

  return (
    <Modal open onClose={busy ? () => undefined : onClose} locked={running !== null} title="Ask Crux" subtitle="Say what you want to trade. You'll confirm before anything happens." size="lg">
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void read();
        }}
      >
        <input
          ref={box}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (plan && running === null) setPlan(null);
          }}
          disabled={running !== null}
          placeholder="buy $5 of BONK and take profit at 2x"
          aria-label="What do you want to trade?"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-chrome placeholder:text-dim focus:border-signal focus:outline-none"
        />
        <button type="submit" disabled={busy || text.trim() === ""} className={buttonClass("outline", "sm", "h-11")}>
          {finding ? "Reading…" : "Read"}
        </button>
      </form>

      {!plan && !error && (
        <div className="mt-3 flex flex-wrap gap-2">
          {COMMAND_EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-line-2 px-3 py-1 text-[12px] text-muted hover:border-chrome/40 hover:text-chrome">
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 rounded-lg border border-down/50 px-3 py-2 text-[13px] text-down">{error}</p>}

      {plan && (
        <div className="mt-4 rounded-xl border border-line-2 p-4">
          <p className="text-[12px] uppercase tracking-wide text-dim">{done ? "Done" : running !== null ? "Working…" : "Check and confirm"}</p>
          <ol className="mt-2 space-y-3">
            {plan.steps.map((s, i) => {
              const c = chosen(i);
              const o = outcomes[i];
              return (
                <li key={i} className="text-[14px] text-chrome">
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      {i + 1}. {describeStep(s, c.symbol)}
                    </span>
                    <span className="shrink-0 rounded-full border border-line-2 px-2 py-0.5 text-[11px] text-muted">{c.crux ? "Crux launch" : CHAIN_NAME[c.chain]}</span>
                  </div>
                  {plan.coins[i].length > 1 && running === null && !done && (
                    <label className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                      Not this one?
                      <select
                        value={plan.pick[i]}
                        onChange={(e) => {
                          const pick = [...plan.pick];
                          // The same coin word picks the same coin in every step.
                          plan.steps.forEach((t, j) => t.coin === s.coin && (pick[j] = Number(e.target.value)));
                          setPlan({ ...plan, pick });
                        }}
                        className="rounded border border-line-2 bg-void px-1 py-0.5 text-[12px] text-chrome"
                      >
                        {plan.coins[i].map((x, j) => (
                          <option key={`${x.chain}:${x.address}`} value={j}>
                            {x.symbol} on {CHAIN_NAME[x.chain]}
                            {x.name ? ` (${x.name})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {o && (
                    <p className={`mt-1 text-[12.5px] ${o.ok ? "text-up" : "text-down"}`}>
                      {o.text}
                      {o.link && (
                        <a href={o.link} target="_blank" rel="noreferrer" className="ml-2 underline">
                          receipt
                        </a>
                      )}
                    </p>
                  )}
                  {/* The step's runner: mounted while the card shows, so a buy is readied before Confirm. */}
                  {!done && <Runner step={s} coin={c} go={running === i} onDone={(o2) => onStepDone(i, o2)} />}
                </li>
              );
            })}
          </ol>

          {problems.length > 0 && (
            <ul className="mt-3 space-y-1">
              {problems.map((p) => (
                <li key={p} className="text-[12.5px] text-down">
                  {p}
                </li>
              ))}
            </ul>
          )}
          {!crux.loggedIn && <p className="mt-3 text-[12.5px] text-down">Log in first: commands trade from your Crux balance.</p>}

          {running === null && !done && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={problems.length > 0 || !crux.loggedIn}
                onClick={() => {
                  setOutcomes([]);
                  setRunning(0);
                }}
                className={buttonClass("primary", "sm", "flex-1")}
              >
                Confirm
              </button>
              <button type="button" onClick={() => setPlan(null)} className={buttonClass("outline", "sm")}>
                Edit
              </button>
            </div>
          )}
          {done && (
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setOutcomes([]);
                setText("");
                box.current?.focus();
              }}
              className={buttonClass("outline", "sm", "mt-4 w-full")}
            >
              New command
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

/** What stops a plan from being confirmed, in plain words. Pure. */
export function planProblems(steps: CommandStep[], coins: FoundCoin[]): string[] {
  const p = new Set<string>();
  steps.forEach((s, i) => {
    const c = coins[i];
    if ((s.kind === "buy" || s.kind === "dip") && s.usd > BETA_MAX_BUY) p.add(`During the beta, one buy can be at most $${BETA_MAX_BUY}.`);
    if (s.kind !== "buy" && s.kind !== "sell" && c.chain === "base") p.add("Price orders work for Solana and BNB Chain coins for now. Buy or sell Base coins right away instead.");
    if ((s.kind === "takeProfit" || s.kind === "stopLoss" || s.kind === "dip") && c.chain !== "base" && !(c.price && c.price > 0)) p.add(`Couldn't read ${c.symbol}'s price to set the order.`);
  });
  return [...p];
}

type RunnerProps = { step: CommandStep; coin: FoundCoin; go: boolean; onDone: (o: Outcome) => void };

function Runner(p: RunnerProps) {
  return p.coin.chain === "solana" ? <SolanaRunner {...p} /> : <WalletRunner {...p} />;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Re-reads `get` every 250 ms until it returns something, or gives up after `ms`. */
async function waitFor<T>(get: () => T | null | undefined, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v !== null && v !== undefined) return v;
    if (Date.now() > end) return null;
    await sleep(250);
  }
}

/** Runs a step once, the moment it's its turn. */
function useRunOnce(go: boolean, run: () => Promise<Outcome>, onDone: (o: Outcome) => void) {
  const started = useRef(false);
  const latest = useRef({ run, onDone });
  useEffect(() => {
    latest.current = { run, onDone };
  });
  useEffect(() => {
    if (!go || started.current) return;
    started.current = true;
    latest.current.run().then(
      (o) => latest.current.onDone(o),
      (e: Error) => latest.current.onDone({ ok: false, text: e.message.split("\n")[0] }),
    );
  }, [go]);
}

/** The coin's base units for `pct` of what's held, once the holding is known (after a buy, once it's landed). */
async function unitsOf(held: () => bigint | null | undefined, pct: number, symbol: string): Promise<bigint | "all"> {
  const amount = await waitFor(() => {
    const h = held();
    return h !== null && h !== undefined && h > BigInt(0) ? h : null;
  }, 10_000);
  if (amount === null) throw new Error(`You don't hold any ${symbol} yet.`);
  return pct >= 100 ? "all" : (amount * BigInt(Math.round(pct * 100))) / BigInt(10_000);
}

/** A price order (Solana and BNB Chain coins): Crux watches the price and trades with the page closed. */
async function placeOrder(place: (o: PlaceCoinOrder[]) => Promise<void>, s: CommandStep, c: FoundCoin, sellUnits: () => Promise<bigint | "all">): Promise<Outcome> {
  const chain = c.chain === "bnb" ? "bsc" : "solana";
  const price = c.price ?? 0;
  const cashUnits = (usd: number) => (c.chain === "bnb" ? BigInt(Math.round(usd * 1e6)) * BigInt(1_000_000_000_000) : BigInt(Math.round(usd * 1e6)));
  const base = { chain, coin: c.address, symbol: c.symbol, slippageBps: SLIPPAGE_BPS } as const;
  let order: PlaceCoinOrder;
  if (s.kind === "takeProfit") order = { ...base, kind: "takeProfit", amount: String(await sellUnits()), trigger: price * s.multiple };
  else if (s.kind === "stopLoss") order = { ...base, kind: "stopLoss", amount: String(await sellUnits()), trigger: price * (1 - s.dropPct / 100) };
  else if (s.kind === "trailing") order = { ...base, kind: "trailing", amount: String(await sellUnits()), trailPct: s.trailPct };
  else if (s.kind === "dip") order = { ...base, kind: "dip", amount: cashUnits(s.usd).toString(), trigger: price * (1 - s.dropPct / 100) };
  else throw new Error("Not a price order.");
  await place([order]);
  return { ok: true, text: "Order placed. Crux watches the price and trades for you, even with this page closed." };
}

function SolanaRunner({ step, coin, go, onDone }: RunnerProps) {
  const t = useSolanaTrading(coin.address);
  const cash = useCashMove();
  const orders = useCoinOrders();
  // What the step's run reads while it waits (kept current after each render).
  const result = useRef(t.result);
  const held = useRef<bigint | null>(null);
  useEffect(() => {
    result.current = t.result;
    held.current = t.holdings?.coin?.amount ?? (t.holdings ? BigInt(0) : null);
  });

  const usd6 = step.kind === "buy" ? BigInt(Math.round(step.usd * 1e6)) : BigInt(0);
  const { prepare } = t;
  useEffect(() => {
    if (step.kind === "buy") prepare("buy", usd6, { slippageBps: SLIPPAGE_BPS });
  }, [prepare, step.kind, usd6]);

  const finish = async (): Promise<Outcome> => {
    const r = await waitFor(() => (result.current.kind === "done" || result.current.kind === "error" ? result.current : null), 90_000);
    if (!r) return { ok: false, text: "Still working on it. Check your balance in a moment." };
    if (r.kind === "error") return { ok: false, text: r.message };
    if (r.kind !== "done") return { ok: false, text: "Something went wrong." };
    return { ok: true, text: `${r.side === "buy" ? "Bought" : "Sold"} in ${(r.ms / 1000).toFixed(1)} s.`, link: r.signature ? `https://solscan.io/tx/${r.signature}` : undefined };
  };

  useRunOnce(
    go,
    async () => {
      if (step.kind === "buy") {
        if (!IS_TESTNET) await cash.ensure("solana", usd6);
        void t.buy(usd6, { slippageBps: SLIPPAGE_BPS });
        return finish();
      }
      if (step.kind === "sell") {
        void t.sell(await unitsOf(() => held.current, step.pct, coin.symbol), { slippageBps: SLIPPAGE_BPS });
        return finish();
      }
      return placeOrder(orders.place, step, coin, () => unitsOf(() => held.current, "pct" in step ? step.pct : 100, coin.symbol));
    },
    onDone,
  );
  return null;
}

function WalletRunner({ step, coin, go, onDone }: RunnerProps) {
  const chain = coin.chain === "bnb" ? "bnb" : "base";
  const t = useWalletTrading(chain, coin.address);
  const cash = useCashMove();
  const orders = useCoinOrders();
  const held = useRef<bigint | null>(null);
  useEffect(() => {
    held.current = t.holdings?.coin?.amount ?? (t.holdings ? BigInt(0) : null);
  });

  const usd6 = step.kind === "buy" ? BigInt(Math.round(step.usd * 1e6)) : BigInt(0);
  // BNB Chain's cash (USDT) counts 18 decimals; Base's (USDC) 6.
  const cashUnits = chain === "bnb" ? usd6 * BigInt(1_000_000_000_000) : usd6;
  const { prepare } = t;
  useEffect(() => {
    if (step.kind === "buy") prepare("buy", cashUnits, SLIPPAGE_BPS);
  }, [prepare, step.kind, cashUnits]);

  const scan = chain === "bnb" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/";
  const outcome = (r: Awaited<ReturnType<typeof t.buy>>): Outcome => {
    if (!r) return { ok: false, text: "Still loading this coin. Try again in a moment." };
    if (r.kind === "error") return { ok: false, text: r.message };
    if (r.kind !== "done") return { ok: false, text: "Something went wrong." };
    return { ok: true, text: `${r.side === "buy" ? "Bought" : "Sold"} in ${(r.ms / 1000).toFixed(1)} s.`, link: scan + r.hash };
  };

  useRunOnce(
    go,
    async () => {
      if (step.kind === "buy") {
        if (!IS_TESTNET) await cash.ensure(chain, usd6);
        return outcome(await t.buy(cashUnits, SLIPPAGE_BPS));
      }
      if (step.kind === "sell") return outcome(await t.sell(await unitsOf(() => held.current, step.pct, coin.symbol), SLIPPAGE_BPS));
      return placeOrder(orders.place, step, coin, () => unitsOf(() => held.current, "pct" in step ? step.pct : 100, coin.symbol));
    },
    onDone,
  );
  return null;
}
