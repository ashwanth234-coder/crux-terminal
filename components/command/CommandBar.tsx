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
import { describeStep, waitText, type CommandStep, type TradeStep } from "@/lib/commandIntent";
import { BUY_SIZES, describeScan, moneyShort, readMessage, type ChatOption, type Reply, type ScanRule } from "@/lib/commandChat";
import { CHAIN_NAME, findCoins, type FoundCoin, type LaunchLite } from "@/lib/commandCoins";
import { pickScanCoin, scanSolana, SCAN_SAFETY_TEXT, solanaFacts, solanaWarnings } from "@/lib/coinScan";
import { evmSafety } from "@/lib/tokenSafety";
import { fmtCompact, fmtPrice } from "@/lib/solanaCoins";
import { IS_TESTNET } from "@/lib/network";

/** During the beta one buy is capped by the server (BETA_MAX_BUY_USDC); cards say so before anything is sent. */
const BETA_MAX_BUY = 25;
const SLIPPAGE_BPS = 300;
/** How often a scan re-reads the coin lists. */
const SCAN_EVERY_MS = 20_000;

type Outcome = { ok: boolean; text: string; link?: string };

const STARTERS: ChatOption[] = [
  { label: "buy $5 of BONK", command: "buy $5 of BONK" },
  { label: "buy $5 of BT and sell it in 1 min", command: "buy $5 of BT and sell it in 1 min" },
  { label: "scan Solana for 1 hour, buy $5, sell at 2x", command: "scan solana for 1 hour, buy $5 of a coin with 50k volume, sell at 2x" },
  { label: "stop loss 20% on BONK", command: "stop loss 20% on BONK" },
];

/** Crux's own launches (the header search's cached list): matched first when a command names a coin. */
function useLaunches() {
  return useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: LaunchLite[] }).launches;
    },
    staleTime: 60_000,
  });
}

/**
 * "Ask Crux": a conversation about trades. The trader types or pastes; Crux replies with something to act on (a coin's
 * facts, a question with answer buttons, a card to confirm, a scan to start). Fixed rules (lib/commandChat), no AI.
 * Nothing trades until a card is confirmed, and every trade goes through the same paths and server checks as a click
 * on a coin page. Opens from the header button or Ctrl/⌘+K; closing it only hides it, so a scan or a wait keeps going
 * while this page stays open.
 */
export function CommandButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMounted(true);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        className={`${buttonClass("outline", "sm", "gap-2 px-3")} ${className}`}
        aria-label="Ask Crux what to trade"
      >
        <span aria-hidden="true">›_</span>
        <span>Ask Crux</span>
        {working ? <span className="h-2 w-2 animate-pulse rounded-full bg-signal" aria-label="working" /> : <kbd className="hidden rounded border border-line-2 px-1 font-mono text-[10.5px] text-dim lg:inline">Ctrl K</kbd>}
      </button>
      {mounted && <CommandPanel open={open} onClose={() => setOpen(false)} onWorking={setWorking} />}
    </>
  );
}

type Msg = { id: number; from: "you" | "crux"; text?: string; options?: ChatOption[]; reply?: Reply };

function CommandPanel({ open, onClose, onWorking }: { open: boolean; onClose: () => void; onWorking: (w: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: "crux", text: "Hi! Tell me what to trade, or paste a coin's address and I'll check it for you.", options: STARTERS }]);
  const [input, setInput] = useState("");
  const [template, setTemplate] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const box = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    onWorking(busy.size > 0);
  }, [busy, onWorking]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const send = useCallback(
    (text: string, say?: string) => {
      const t = text.trim();
      if (!t) return;
      const reply = readMessage(t, template);
      const you: Msg = { id: nextId.current++, from: "you", text: say ?? t };
      const crux: Msg = { id: nextId.current++, from: "crux", reply };
      setMsgs((m) => [...m, you, crux]);
      setTemplate(reply.kind === "ask" ? reply.template : undefined);
      setInput("");
    },
    [template],
  );

  const markBusy = useCallback((id: number, on: boolean) => {
    setBusy((b) => {
      if (on === b.has(id)) return b;
      const next = new Set(b);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <Modal open={open} onClose={onClose} title="Ask Crux" subtitle="Talk to Crux like a trading desk. Nothing happens until you confirm." size="lg">
      <div className="mt-4 flex max-h-[min(60svh,560px)] flex-col gap-3 overflow-y-auto pr-1">
        {msgs.map((m) =>
          m.from === "you" ? (
            <p key={m.id} className="ml-auto max-w-[85%] rounded-xl bg-tint/[0.06] px-3 py-2 text-[14px] text-chrome">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="max-w-[95%] rounded-xl border border-line-2 px-3 py-2.5 text-[14px] text-chrome">
              {m.reply ? <CruxReply reply={m.reply} onCommand={send} onBusy={(on) => markBusy(m.id, on)} /> : <Said text={m.text ?? ""} options={m.options} onCommand={send} />}
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={box}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={template ? "Type your answer…" : "Type a trade or paste a coin's address"}
          aria-label="Message to Crux"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-chrome placeholder:text-dim focus:border-signal focus:outline-none"
        />
        <button type="submit" disabled={input.trim() === ""} className={buttonClass("primary", "sm", "h-11")}>
          Send
        </button>
      </form>
    </Modal>
  );
}

/** A plain reply: text, then buttons that send a command. */
type OnCommand = (command: string, say?: string) => void;

function Said({ text, options, onCommand, tone }: { text: string; options?: ChatOption[]; onCommand: OnCommand; tone?: "error" }) {
  return (
    <>
      <p className={tone === "error" ? "text-down" : undefined}>{text}</p>
      {options && options.length > 0 && <Choices options={options} onCommand={onCommand} />}
    </>
  );
}

function Choices({ options, onCommand }: { options: ChatOption[]; onCommand: OnCommand }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.command} type="button" onClick={() => onCommand(o.command, o.say ?? o.label)} className="rounded-full border border-line-2 px-3 py-1 text-[12.5px] text-muted hover:border-chrome/40 hover:text-chrome">
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CruxReply({ reply, onCommand, onBusy }: { reply: Reply; onCommand: OnCommand; onBusy: (on: boolean) => void }) {
  switch (reply.kind) {
    case "ask":
      return <Said text={reply.text} options={reply.options} onCommand={onCommand} />;
    case "error":
      return <Said text={reply.text} tone="error" options={STARTERS.slice(0, 2)} onCommand={onCommand} />;
    case "lookup":
      return <CoinCard query={reply.coin} chain={reply.chain} onCommand={onCommand} />;
    case "plan":
      return <PlanCard steps={reply.steps} onBusy={onBusy} />;
    case "scan":
      return <ScanCard rule={reply.rule} onBusy={onBusy} />;
  }
}

/** A pasted address or a coin's name: its facts and warning signs, then what to do with it. */
function CoinCard({ query, chain, onCommand }: { query: string; chain?: FoundCoin["chain"]; onCommand: OnCommand }) {
  const launches = useLaunches();
  const ready = launches.data !== undefined || launches.isError;
  const found = useQuery({ queryKey: ["cmd-coin", query.toLowerCase(), chain ?? ""], enabled: ready, staleTime: 60_000, queryFn: () => findCoins(query, chain, launches.data ?? []) });
  const [pick, setPick] = useState(0);
  const c = found.data?.[pick];
  const facts = useQuery({
    queryKey: ["cmd-facts", c?.chain, c?.address],
    enabled: !!c && !c.crux,
    staleTime: 60_000,
    queryFn: async () => {
      if (c!.chain === "solana") {
        const f = await solanaFacts(c!.address);
        return { warnings: f ? solanaWarnings(f) : null, volume1h: f?.volume1h, mcap: f?.mcap, liquidity: f?.liquidity, price: f?.price };
      }
      const s = (await evmSafety(c!.chain === "bnb" ? "bsc" : "base", [c!.address]))[c!.address.toLowerCase()];
      return { warnings: s ? s.warnings : null, volume1h: undefined, mcap: undefined, liquidity: c!.liquidity, price: c!.price };
    },
  });

  if (!ready || found.isLoading) return <p className="text-muted">Looking it up…</p>;
  if (!c) return <p className="text-down">{`I couldn't find a coin called ${query} with real trading. Check the address, or try its name.`}</p>;

  const on = ` on ${c.chain}`;
  const f = facts.data;
  const price = f?.price ?? c.price;
  const orders = c.chain !== "base";
  const options: ChatOption[] = [
    ...BUY_SIZES.map((d) => ({ label: `Buy $${d}`, command: `buy $${d} of ${c.address}${on}`, say: `Buy $${d} of ${c.symbol}` })),
    { label: "Sell half", command: `sell half of ${c.address}${on}`, say: `Sell half my ${c.symbol}` },
    { label: "Sell all", command: `sell all ${c.address}${on}`, say: `Sell all my ${c.symbol}` },
    ...(orders
      ? [
          { label: "Take profit at 2×", command: `sell all ${c.address} at 2x${on}`, say: `Sell all my ${c.symbol} at 2×` },
          { label: "Stop loss 20%", command: `stop loss 20% on ${c.address}${on}`, say: `Stop loss 20% on ${c.symbol}` },
        ]
      : []),
  ];
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p>
          <span className="font-medium">{c.symbol}</span>
          {c.name && <span className="text-muted"> · {c.name}</span>}
        </p>
        <span className="shrink-0 rounded-full border border-line-2 px-2 py-0.5 text-[11px] text-muted">{c.crux ? "Crux launch" : CHAIN_NAME[c.chain]}</span>
      </div>
      {found.data && found.data.length > 1 && (
        <label className="mt-1 flex items-center gap-2 text-[12px] text-muted">
          Not this one?
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))} className="rounded border border-line-2 bg-void px-1 py-0.5 text-[12px] text-chrome">
            {found.data.map((x, j) => (
              <option key={`${x.chain}:${x.address}`} value={j}>
                {x.symbol} on {CHAIN_NAME[x.chain]}
                {x.name ? ` (${x.name})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {c.crux ? (
        <p className="mt-1 text-[12.5px] text-muted">A Crux launch. It trades on its launch curve until it graduates.</p>
      ) : (
        <p className="mt-1 font-mono text-[12.5px] text-muted">
          {[price ? `Price ${fmtPrice(price)}` : null, f?.mcap ? `Market cap ${fmtCompact(f.mcap)}` : null, f?.liquidity ? `Pool ${fmtCompact(f.liquidity)}` : null, f?.volume1h ? `Traded last hour ${moneyShort(Math.round(f.volume1h))}` : null]
            .filter(Boolean)
            .join(" · ") || "Reading its market…"}
        </p>
      )}
      {!c.crux &&
        (facts.isLoading ? (
          <p className="mt-1 text-[12.5px] text-dim">Checking it for warning signs…</p>
        ) : f?.warnings === null || f === undefined ? (
          <p className="mt-1 text-[12.5px] text-dim">{"Couldn't check it for warning signs yet. Trade carefully."}</p>
        ) : f.warnings.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {f.warnings.map((w) => (
              <li key={w} className="text-[12.5px] text-down">
                ⚠ {w}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-up">No warning signs found.</p>
        ))}
      <p className="mt-2 text-[13px]">What would you like to do?</p>
      <Choices options={options} onCommand={onCommand} />
    </div>
  );
}

/**
 * A command's steps to confirm, then run in order (each through the same paths as the coin pages). `preset`: coins
 * already chosen (a scan's find), skipping the search; `auto`: runs without a Confirm (the scan was confirmed).
 */
function PlanCard({ steps, preset, auto = false, onBusy }: { steps: CommandStep[]; preset?: FoundCoin; auto?: boolean; onBusy: (on: boolean) => void }) {
  const crux = useCruxAccount();
  const launches = useLaunches();
  const [coins, setCoins] = useState<FoundCoin[][] | null>(preset ? steps.map((s) => (s.kind === "wait" ? [] : [preset])) : null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<number[]>(steps.map(() => 0));
  const [running, setRunning] = useState<number | null>(null);
  const [outcomes, setOutcomes] = useState<(Outcome | undefined)[]>([]);
  const [cancelled, setCancelled] = useState(false);

  // The coins each step names, looked up once (Crux launches first).
  const launchList = launches.data;
  const launchesReady = launchList !== undefined || launches.isError;
  useEffect(() => {
    if (coins || !launchesReady) return;
    let live = true;
    const seen = new Map<string, Promise<FoundCoin[]>>();
    Promise.all(
      steps.map((s) => {
        if (s.kind === "wait") return Promise.resolve([] as FoundCoin[]);
        const k = `${s.coin.toLowerCase()}|${s.chain ?? ""}`;
        if (!seen.has(k)) seen.set(k, findCoins(s.coin, s.chain, launchList ?? []));
        return seen.get(k)!;
      }),
    )
      .then((found) => {
        if (!live) return;
        const missing = steps.findIndex((s, i) => s.kind !== "wait" && found[i].length === 0);
        if (missing >= 0) {
          const s = steps[missing] as TradeStep;
          setError(`I couldn't find a coin called ${s.coin}${s.chain ? ` on ${CHAIN_NAME[s.chain]}` : ""} with real trading. Try pasting its address.`);
        } else setCoins(found);
      })
      .catch(() => live && setError("Couldn't look the coins up just now. Try again in a moment."));
    return () => {
      live = false;
    };
  }, [coins, launchesReady, launchList, steps]);

  const chosen = (i: number): FoundCoin | undefined => coins?.[i]?.[pick[i]];
  const problems = coins ? planProblems(steps, steps.map((_, i) => chosen(i))) : [];
  const canRun = coins !== null && problems.length === 0 && crux.loggedIn;
  // The step running now. A scan's buy starts as soon as its coin is set (the scan itself was confirmed).
  const active = running !== null ? running : auto && canRun && outcomes.length === 0 ? 0 : null;
  const done = active === null && outcomes.length > 0;

  useEffect(() => {
    onBusy(active !== null);
  }, [active, onBusy]);

  const onStepDone = useCallback(
    (i: number, o: Outcome) => {
      setOutcomes((prev) => {
        const next = [...prev];
        next[i] = o;
        return next;
      });
      // A failed step stops the rest (a take profit after a buy that didn't happen would be wrong).
      setRunning(o.ok && i + 1 < steps.length ? i + 1 : null);
    },
    [steps.length],
  );

  if (error) return <p className="text-down">{error}</p>;
  if (!coins) return <p className="text-muted">Finding the coins…</p>;
  if (cancelled) return <p className="text-muted">Cancelled. Nothing was traded.</p>;

  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide text-dim">{done ? "Done" : active !== null ? "Working…" : "Here's what I'll do"}</p>
      <ol className="mt-2 space-y-3">
        {steps.map((s, i) => {
          const c = chosen(i);
          const o = outcomes[i];
          return (
            <li key={i}>
              <div className="flex items-start justify-between gap-3">
                <span>
                  {i + 1}. {describeStep(s, c?.symbol)}
                </span>
                {c && <span className="shrink-0 rounded-full border border-line-2 px-2 py-0.5 text-[11px] text-muted">{c.crux ? "Crux launch" : CHAIN_NAME[c.chain]}</span>}
              </div>
              {s.kind !== "wait" && coins[i].length > 1 && active === null && !done && (
                <label className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                  Not this one?
                  <select
                    value={pick[i]}
                    onChange={(e) => {
                      const next = [...pick];
                      // The same coin word picks the same coin in every step.
                      steps.forEach((t, j) => t.kind !== "wait" && t.coin === s.coin && (next[j] = Number(e.target.value)));
                      setPick(next);
                    }}
                    className="rounded border border-line-2 bg-void px-1 py-0.5 text-[12px] text-chrome"
                  >
                    {coins[i].map((x, j) => (
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
              {!done &&
                (s.kind === "wait" ? (
                  <WaitRunner seconds={s.seconds} go={active === i} onDone={(o2) => onStepDone(i, o2)} />
                ) : (
                  c && <Runner step={s} coin={c} go={active === i} onDone={(o2) => onStepDone(i, o2)} />
                ))}
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
      {!crux.loggedIn && <p className="mt-3 text-[12.5px] text-down">Log in first: I trade from your Crux balance.</p>}
      {active === null && !done && !auto && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!canRun}
            onClick={() => {
              setOutcomes([]);
              setRunning(0);
            }}
            className={buttonClass("primary", "sm", "flex-1")}
          >
            Confirm
          </button>
          <button type="button" onClick={() => setCancelled(true)} className={buttonClass("outline", "sm")}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A scan: confirmed once, then it re-reads new Solana coins every 20 s while this page is open, buys the first that
 * passes the rules (at most one), and sets the exits as price orders (those keep running with the page closed).
 */
function ScanCard({ rule, onBusy }: { rule: ScanRule; onBusy: (on: boolean) => void }) {
  const crux = useCruxAccount();
  const [phase, setPhase] = useState<"confirm" | "scanning" | "found" | "timeout" | "stopped">("confirm");
  const [checked, setChecked] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [found, setFound] = useState<FoundCoin | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    onBusy(phase === "scanning" || buying);
  }, [phase, buying, onBusy]);

  useEffect(() => {
    if (phase !== "scanning") return;
    let live = true;
    const seen = new Set<string>();
    void (async () => {
      while (live) {
        const list = await scanSolana();
        if (!live) return;
        list.forEach((c) => seen.add(c.mint));
        setChecked(seen.size);
        const t = Date.now();
        const hit = pickScanCoin(list, rule, t);
        if (hit) {
          setFound({ chain: "solana", address: hit.mint, symbol: hit.symbol, name: hit.name, price: hit.price, liquidity: hit.liquidity });
          setPhase("found");
          return;
        }
        if (t >= endsAt) {
          setPhase("timeout");
          return;
        }
        await new Promise((r) => setTimeout(r, Math.min(SCAN_EVERY_MS, endsAt - t)));
      }
    })();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearInterval(tick);
    };
  }, [phase, rule, endsAt]);

  const problems = [rule.usd > BETA_MAX_BUY ? `During the beta, one buy can be at most $${BETA_MAX_BUY}.` : null, !crux.loggedIn ? "Log in first: I trade from your Crux balance." : null].filter((x): x is string => x !== null);
  const left = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  const steps: CommandStep[] = found
    ? [
        { kind: "buy", coin: found.address, usd: rule.usd },
        ...(rule.takeProfit ? [{ kind: "takeProfit", coin: found.address, multiple: rule.takeProfit, pct: 100 } as const] : []),
        ...(rule.stopLossPct ? [{ kind: "stopLoss", coin: found.address, dropPct: rule.stopLossPct, pct: 100 } as const] : []),
      ]
    : [];

  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide text-dim">Scan</p>
      <ul className="mt-2 space-y-1">
        {describeScan(rule).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">{SCAN_SAFETY_TEXT}</p>
      {phase === "confirm" && (
        <>
          {problems.map((p) => (
            <p key={p} className="mt-2 text-[12.5px] text-down">
              {p}
            </p>
          ))}
          <button
            type="button"
            disabled={problems.length > 0}
            onClick={() => {
              setEndsAt(Date.now() + rule.minutes * 60_000);
              setNow(Date.now());
              setPhase("scanning");
            }}
            className={buttonClass("primary", "sm", "mt-3 w-full")}
          >
            Start scanning
          </button>
        </>
      )}
      {phase === "scanning" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-mono text-[12.5px] text-signal">
            Scanning… {checked} coins checked · {left} min left · none passed yet
          </p>
          <button type="button" onClick={() => setPhase("stopped")} className={buttonClass("outline", "sm")}>
            Stop
          </button>
        </div>
      )}
      {phase === "timeout" && <p className="mt-3 text-[13px] text-muted">{"Time's up: no coin passed the rules, so I didn't buy anything."}</p>}
      {phase === "stopped" && <p className="mt-3 text-[13px] text-muted">Stopped. Nothing was bought.</p>}
      {phase === "found" && found && (
        <div className="mt-3 rounded-lg border border-line-2 p-3">
          <p className="text-[13px]">
            Found <span className="font-medium">{found.symbol}</span>
            {found.liquidity ? ` (pool ${fmtCompact(found.liquidity)})` : ""}. Buying now.
          </p>
          <div className="mt-2">
            <PlanCard steps={steps} preset={found} auto onBusy={setBuying} />
          </div>
        </div>
      )}
    </div>
  );
}

/** What stops a plan from being confirmed, in plain words. Pure. */
export function planProblems(steps: CommandStep[], coins: (FoundCoin | undefined)[]): string[] {
  const p = new Set<string>();
  steps.forEach((s, i) => {
    const c = coins[i];
    if (s.kind === "wait" || !c) return;
    if ((s.kind === "buy" || s.kind === "dip") && s.usd > BETA_MAX_BUY) p.add(`During the beta, one buy can be at most $${BETA_MAX_BUY}.`);
    if (s.kind !== "buy" && s.kind !== "sell" && c.chain === "base") p.add("Price orders work for Solana and BNB Chain coins for now. Buy or sell Base coins right away instead.");
    if ((s.kind === "takeProfit" || s.kind === "stopLoss" || s.kind === "dip") && c.chain !== "base" && !(c.price && c.price > 0)) p.add(`Couldn't read ${c.symbol}'s price to set the order.`);
  });
  return [...p];
}

type RunnerProps = { step: TradeStep; coin: FoundCoin; go: boolean; onDone: (o: Outcome) => void };

/** A wait step: counts down on the card, then lets the next step run. */
function WaitRunner({ seconds, go, onDone }: { seconds: number; go: boolean; onDone: (o: Outcome) => void }) {
  const [left, setLeft] = useState<number | null>(null);
  useRunOnce(
    go,
    async () => {
      const end = Date.now() + seconds * 1000;
      for (let l = seconds; l > 0; l = Math.ceil((end - Date.now()) / 1000)) {
        setLeft(l);
        await sleep(Math.min(1000, Math.max(50, end - Date.now())));
      }
      setLeft(null);
      return { ok: true, text: `Waited ${waitText(seconds)}.` };
    },
    onDone,
  );
  return left !== null ? <p className="mt-1 font-mono text-[12.5px] text-signal">{waitText(left)} left…</p> : null;
}

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
async function placeOrder(place: (o: PlaceCoinOrder[]) => Promise<void>, s: TradeStep, c: FoundCoin, sellUnits: () => Promise<bigint | "all">): Promise<Outcome> {
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
