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
import { askForCoin, BUY_SIZES, describeCopy, describeScan, fillTemplate, moneyShort, readMessage, type ChatOption, type CopyRule, type Reply, type ScanRule } from "@/lib/commandChat";
import { COPY_EVERY_MS, hasSold, holdingsOf, shortWallet, walletChanges, type Holdings } from "@/lib/walletCopy";
import { CHAIN_NAME, findCoins, type FoundCoin, type LaunchLite } from "@/lib/commandCoins";
import { evmCandidates, pickScanCoin, scanSolana, SCAN_SAFETY_TEXT, solanaFacts, solanaWarnings } from "@/lib/coinScan";
import { scanEvmCoins } from "@/lib/coinMarket";
import { evmSafety } from "@/lib/tokenSafety";
import { fmtCompact, fmtPrice } from "@/lib/solanaCoins";
import { IS_TESTNET } from "@/lib/network";
import { YourCoins } from "@/components/portfolio/YourCoins";
import { trendingSolanaCoins } from "@/lib/solanaCoins";
import { trendingEvmCoins } from "@/lib/coinMarket";

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
  { label: "copy a wallet's trades", command: "copy a wallet" },
];

/** The menu: what Crux can do, as buttons (the questions about the account first). */
const MENU: ChatOption[] = [
  { label: "What do I hold?", command: "what do I hold?" },
  { label: "What's trending?", command: "what's trending?" },
  { label: "Show my orders", command: "show my orders" },
  ...STARTERS,
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

/** `command`: what a reply was read from (the trader's words, with any question's answer filled in). */
type Msg = { id: number; from: "you" | "crux"; text?: string; options?: ChatOption[]; reply?: Reply; command?: string };

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
      const crux: Msg = { id: nextId.current++, from: "crux", reply, command: fillTemplate(t, template) };
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
              {m.reply ? (
                <CruxReply
                  reply={m.reply}
                  onCommand={send}
                  onBusy={(on) => markBusy(m.id, on)}
                  // A coin it can't find: the next message (its address) takes the coin word's place in this command.
                  onMissingCoin={(word) => m.command && setTemplate(askForCoin(m.command, word))}
                />
              ) : (
                <Said text={m.text ?? ""} options={m.options} onCommand={send} />
              )}
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

function CruxReply({ reply, onCommand, onBusy, onMissingCoin }: { reply: Reply; onCommand: OnCommand; onBusy: (on: boolean) => void; onMissingCoin: (word: string) => void }) {
  switch (reply.kind) {
    case "ask":
      return <Said text={reply.text} options={reply.options} onCommand={onCommand} />;
    case "error":
      return <Said text={reply.text} tone="error" options={[{ label: "What can you do?", command: "help" }, ...STARTERS.slice(0, 2)]} onCommand={onCommand} />;
    case "lookup":
      return <CoinCard query={reply.coin} chain={reply.chain} onCommand={onCommand} onMissingCoin={onMissingCoin} />;
    case "plan":
      return <PlanCard steps={reply.steps} onBusy={onBusy} onMissingCoin={onMissingCoin} onCommand={onCommand} />;
    case "scan":
      return <ScanCard rule={reply.rule} onBusy={onBusy} />;
    case "copy":
      return <CopyCard rule={reply.rule} onBusy={onBusy} />;
    case "help":
      return (
        <Said
          text={
            reply.greeting
              ? "Hey! I'm Crux, your trading desk for Solana, Base and BNB Chain, all from one balance. I can check a coin, buy or sell it, set take profits and stop losses, find new coins for you or copy a wallet. What shall we do?"
              : "Here's what I can do. Type it your own way, or tap one. I'll always show you the plan before anything trades."
          }
          options={MENU}
          onCommand={onCommand}
        />
      );
    case "portfolio":
      return <YourCoins compact onCommand={onCommand} />;
    case "trending":
      return <TrendingCard chain={reply.chain} onCommand={onCommand} />;
    case "orders":
      return <OrdersCard cancelAll={reply.cancel} />;
  }
}

/** The hottest coins right now (the hour's trending lists), each with Check and Buy $5. */
function TrendingCard({ chain, onCommand }: { chain?: FoundCoin["chain"]; onCommand: OnCommand }) {
  const want = (c: FoundCoin["chain"]) => !chain || chain === c;
  const per = chain ? 6 : 3;
  const sol = useQuery({ queryKey: ["cmd-trending-sol"], enabled: want("solana"), staleTime: 60_000, queryFn: () => trendingSolanaCoins() });
  const base = useQuery({ queryKey: ["base-trending"], enabled: want("base"), staleTime: 30_000, queryFn: () => trendingEvmCoins("base") });
  const bnb = useQuery({ queryKey: ["bnb-trending-cmd"], enabled: want("bnb"), staleTime: 30_000, queryFn: () => trendingEvmCoins("bsc") });
  const rows = [
    ...(want("solana") ? (sol.data ?? []).slice(0, per).map((c) => ({ chain: "solana" as const, address: c.mint, symbol: c.symbol, change: c.change1h, mcap: c.mcap })) : []),
    ...(want("base") ? (base.data ?? []).slice(0, per).map((c) => ({ chain: "base" as const, address: c.address, symbol: c.symbol, change: c.change1h, mcap: c.mcap })) : []),
    ...(want("bnb") ? (bnb.data ?? []).slice(0, per).map((c) => ({ chain: "bnb" as const, address: c.address, symbol: c.symbol, change: c.change1h, mcap: c.mcap })) : []),
  ];
  const loading = (want("solana") && sol.isLoading) || (want("base") && base.isLoading) || (want("bnb") && bnb.isLoading);
  if (rows.length === 0) return <p className="text-muted">{loading ? "Looking at what's moving…" : "I couldn't read the trending lists just now. Try again in a moment."}</p>;
  return (
    <div>
      <p>{chain ? `Hottest on ${CHAIN_NAME[chain]} in the last hour:` : "Hottest coins in the last hour, across every chain:"}</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={`${r.chain}:${r.address}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-2 px-3 py-2 text-[13px]">
            <span>
              <span className="font-medium">${r.symbol}</span> <span className="text-[11px] text-dim">{CHAIN_NAME[r.chain]}</span>
              {r.change !== undefined && <span className={`ml-2 font-mono ${r.change >= 0 ? "text-up" : "text-down"}`}>{`${r.change >= 0 ? "+" : ""}${r.change.toFixed(1)}% 1h`}</span>}
              {r.mcap ? <span className="ml-2 font-mono text-muted">{fmtCompact(r.mcap)}</span> : null}
            </span>
            <span className="flex gap-1.5">
              <button type="button" onClick={() => onCommand(`${r.address} on ${r.chain}`, `Check $${r.symbol}`)} className="rounded-full border border-line-2 px-2.5 py-0.5 text-[12px] text-muted hover:text-chrome">
                Check
              </button>
              <button type="button" onClick={() => onCommand(`buy $5 of ${r.address} on ${r.chain}`, `Buy $5 of $${r.symbol}`)} className="rounded-full border border-line-2 px-2.5 py-0.5 text-[12px] text-muted hover:text-chrome">
                Buy $5
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-dim">{"Trending isn't safe by itself: tap Check to see a coin's warning signs first."}</p>
    </div>
  );
}

const ORDER_WORDS: Record<string, string> = { dip: "Buy the dip", takeProfit: "Take profit", stopLoss: "Stop loss", trailing: "Trailing stop" };

/** The login's open price orders, each with Cancel (and Cancel all when asked). */
function OrdersCard({ cancelAll }: { cancelAll: boolean }) {
  const crux = useCruxAccount();
  const o = useCoinOrders();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!crux.loggedIn) return <p className="text-down">Log in first to see your orders.</p>;
  if (o.orders === null) return <p className="text-muted">Reading your orders…</p>;
  const open = o.orders.filter((x) => x.status === "open");
  if (open.length === 0) return <p>{note ?? "You have no open orders. Want to set a take profit or stop loss on something you hold?"}</p>;
  const cancel = async (ids: string[]) => {
    setBusy(true);
    try {
      await o.cancel(ids);
      setNote(ids.length > 1 ? `Cancelled ${ids.length} orders.` : "Cancelled.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p>{`You have ${open.length} open order${open.length === 1 ? "" : "s"}. They run on Crux's server, even with this page closed.`}</p>
      <ul className="mt-2 space-y-1.5">
        {open.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-line-2 px-3 py-1.5 text-[13px]">
            <span>
              {ORDER_WORDS[x.kind] ?? x.kind} <span className="font-medium">${x.symbol}</span>
              {x.trigger !== undefined && <span className="font-mono text-muted"> at {fmtPrice(x.trigger)}</span>}
              {x.trailPct !== undefined && <span className="font-mono text-muted"> {x.trailPct}% under its high</span>}
            </span>
            <button type="button" disabled={busy} onClick={() => void cancel([x.id])} className="text-[12px] text-muted underline hover:text-chrome">
              Cancel
            </button>
          </li>
        ))}
      </ul>
      {cancelAll && open.length > 1 && (
        <button type="button" disabled={busy} onClick={() => void cancel(open.map((x) => x.id))} className={buttonClass("outline", "sm", "mt-3 w-full")}>
          {`Cancel all ${open.length} orders`}
        </button>
      )}
      {note && <p className="mt-2 text-[12.5px] text-muted">{note}</p>}
    </div>
  );
}

/** A pasted address or a coin's name: its facts and warning signs, then what to do with it. */
function CoinCard({ query, chain, onCommand, onMissingCoin }: { query: string; chain?: FoundCoin["chain"]; onCommand: OnCommand; onMissingCoin: (word: string) => void }) {
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
  if (!c) return <NotFound word={query} onMissingCoin={onMissingCoin} />;

  const on = ` on ${c.chain}`;
  const f = facts.data;
  const price = f?.price ?? c.price;
  const orders = !c.crux;
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

/** A coin Crux couldn't find: asks for its address, which the next message then stands in for. */
function NotFound({ word, onMissingCoin }: { word: string; onMissingCoin?: (word: string) => void }) {
  // Asked once, when this reply appears (later messages mustn't bring the question back).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    onMissingCoin?.(word);
  }, [word, onMissingCoin]);
  return (
    <p>
      {`I couldn't find a coin called ${word} with real trading. `}
      <span className="text-muted">{"Paste its address here and I'll use that."}</span>
    </p>
  );
}

/**
 * A command's steps to confirm, then run in order (each through the same paths as the coin pages). `preset`: coins
 * already chosen (a scan's find), skipping the search; `auto`: runs without a Confirm (the scan was confirmed).
 */
function PlanCard({
  steps,
  preset,
  auto = false,
  onBusy,
  onMissingCoin,
  onCommand,
}: {
  steps: CommandStep[];
  preset?: FoundCoin;
  auto?: boolean;
  onBusy: (on: boolean) => void;
  onMissingCoin?: (word: string) => void;
  /** Where the next-step buttons send their command (none inside a scan or a copy). */
  onCommand?: OnCommand;
}) {
  const crux = useCruxAccount();
  const launches = useLaunches();
  const [coins, setCoins] = useState<FoundCoin[][] | null>(preset ? steps.map((s) => (s.kind === "wait" ? [] : [preset])) : null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
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
        if (missing >= 0) setMissing((steps[missing] as TradeStep).coin);
        else setCoins(found);
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

  if (missing) return <NotFound word={missing} onMissingCoin={onMissingCoin} />;
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
      {done && onCommand && outcomes.every((o) => o?.ok) && <Choices options={nextSteps(steps, steps.map((_, i) => chosen(i)))} onCommand={onCommand} />}
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
    // Base/BNB coins whose code showed warning signs (or isn't checked yet): not asked again this scan.
    const refused = new Set<string>();
    void (async () => {
      while (live) {
        const t = Date.now();
        let hit: FoundCoin | null = null;
        for (const chain of rule.chains) {
          if (hit || !live) break;
          if (chain === "solana") {
            const list = await scanSolana();
            list.forEach((c) => seen.add(c.mint));
            const s = pickScanCoin(list, rule, t);
            if (s) hit = { chain: "solana", address: s.mint, symbol: s.symbol, name: s.name, price: s.price, liquidity: s.liquidity };
          } else {
            const network = chain === "bnb" ? "bsc" : "base";
            const list = await scanEvmCoins(network).catch(() => []);
            list.forEach((c) => seen.add(c.address.toLowerCase()));
            // The most traded first; their code is checked (GoPlus) before one is bought.
            const top = evmCandidates(list, rule, t, refused).slice(0, 5);
            const safety = top.length ? await evmSafety(network, top.map((c) => c.address)).catch(() => ({}) as Record<string, null>) : {};
            for (const c of top) {
              const s = safety[c.address.toLowerCase()];
              if (s && s.warnings.length === 0) {
                hit = { chain, address: c.address, symbol: c.symbol, name: c.name, price: c.price, liquidity: c.liquidity };
                break;
              }
              if (s) refused.add(c.address.toLowerCase());
            }
          }
        }
        if (!live) return;
        setChecked(seen.size);
        if (hit) {
          setFound(hit);
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
            Found <span className="font-medium">{found.symbol}</span> on {CHAIN_NAME[found.chain]}
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

const ignoreBusy = () => undefined;

type CopyEvent = { id: number; text: string; tone: "info" | "skip"; steps?: CommandStep[]; coin?: FoundCoin };

/**
 * Copy-trading a Solana wallet: confirmed once, then the wallet's coins are read every few seconds while this page is
 * open. Each coin it buys that passes the safety checks is bought for the trader (at most maxCopies), with the exits:
 * sold when the wallet sells it, and/or price orders (those keep running with the page closed).
 */
function CopyCard({ rule, onBusy }: { rule: CopyRule; onBusy: (on: boolean) => void }) {
  const crux = useCruxAccount();
  const [phase, setPhase] = useState<"confirm" | "watching" | "done" | "stopped">("confirm");
  const [reads, setReads] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [events, setEvents] = useState<CopyEvent[]>([]);

  useEffect(() => {
    onBusy(phase === "watching");
  }, [phase, onBusy]);

  useEffect(() => {
    if (phase !== "watching") return;
    let live = true;
    let id = 0;
    const say = (e: Omit<CopyEvent, "id">) => setEvents((list) => [...list, { ...e, id: id++ }]);
    // What the wallet held right after each copied buy (a sell is measured against it), and which are already sold.
    const copied = new Map<string, { peak: bigint; sold: boolean; coin: FoundCoin }>();
    const tried = new Set<string>();
    void (async () => {
      let before: Holdings | null = null;
      while (live && !before) {
        before = await holdingsOf(rule.wallet);
        if (!before) await sleep(COPY_EVERY_MS);
      }
      setReads(1);
      let n = 1;
      while (live) {
        if (Date.now() >= endsAt) {
          setPhase("done");
          return;
        }
        await sleep(COPY_EVERY_MS);
        if (!live) return;
        const after = await holdingsOf(rule.wallet);
        if (!after || !live) continue;
        setReads(++n);
        const { bought } = walletChanges(before!, after);
        for (const mint of bought) {
          const c = copied.get(mint);
          if (c) {
            if (!c.sold && after.get(mint)! > c.peak) c.peak = after.get(mint)!;
            continue;
          }
          if (tried.has(mint)) continue;
          tried.add(mint);
          if (copied.size >= rule.maxCopies) {
            say({ text: `It bought another coin, but I've already copied ${rule.maxCopies}.`, tone: "skip" });
            continue;
          }
          const f = await solanaFacts(mint);
          if (!live) return;
          if (!f || !(f.price && f.price > 0)) {
            say({ text: "It bought a coin I couldn't read a price for, so I skipped it.", tone: "skip" });
            continue;
          }
          const warn = solanaWarnings(f);
          if (warn.length) {
            say({ text: `It bought ${f.symbol || "a coin"}, but I skipped it: ${warn[0].toLowerCase()}.`, tone: "skip" });
            continue;
          }
          const coin: FoundCoin = { chain: "solana", address: mint, symbol: f.symbol, name: f.name, price: f.price, liquidity: f.liquidity };
          copied.set(mint, { peak: after.get(mint)!, sold: false, coin });
          say({
            text: `It bought ${f.symbol}. Copying with $${rule.usd}.`,
            tone: "info",
            coin,
            steps: [
              { kind: "buy", coin: mint, usd: rule.usd },
              ...(rule.takeProfit ? [{ kind: "takeProfit", coin: mint, multiple: rule.takeProfit, pct: 100 } as const] : []),
              ...(rule.stopLossPct ? [{ kind: "stopLoss", coin: mint, dropPct: rule.stopLossPct, pct: 100 } as const] : []),
            ],
          });
        }
        if (rule.followSells) {
          for (const [mint, c] of copied) {
            if (c.sold || !hasSold(c.peak, after.get(mint) ?? BigInt(0))) continue;
            c.sold = true;
            say({ text: `It sold ${c.coin.symbol}. Selling yours.`, tone: "info", coin: c.coin, steps: [{ kind: "sell", coin: mint, pct: 100 }] });
          }
        }
        before = after;
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
  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide text-dim">Copy trades</p>
      <ul className="mt-2 space-y-1">
        {describeCopy(rule).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">{SCAN_SAFETY_TEXT.replace("Safety checks:", "Each coin is checked first:")}</p>
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
              setPhase("watching");
            }}
            className={buttonClass("primary", "sm", "mt-3 w-full")}
          >
            Start copying
          </button>
        </>
      )}
      {phase === "watching" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-mono text-[12.5px] text-signal">
            Watching {shortWallet(rule.wallet)}… {reads} checks · {left} min left
          </p>
          <button type="button" onClick={() => setPhase("stopped")} className={buttonClass("outline", "sm")}>
            Stop
          </button>
        </div>
      )}
      {phase === "done" && <p className="mt-3 text-[13px] text-muted">{"Time's up: I've stopped watching. Any price orders I set keep running."}</p>}
      {phase === "stopped" && <p className="mt-3 text-[13px] text-muted">Stopped watching. Any price orders I set keep running.</p>}
      {events.length > 0 && (
        <ul className="mt-3 space-y-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg border border-line-2 p-3">
              <p className={`text-[13px] ${e.tone === "skip" ? "text-muted" : ""}`}>{e.text}</p>
              {e.steps && e.coin && (
                <div className="mt-2">
                  <PlanCard steps={e.steps} preset={e.coin} auto onBusy={ignoreBusy} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What to offer once a plan went through: exits after a buy, another go after a sell, the account after an order. */
function nextSteps(steps: CommandStep[], coins: (FoundCoin | undefined)[]): ChatOption[] {
  const i = steps.map((s) => s.kind !== "wait").lastIndexOf(true);
  const s = steps[i];
  const c = coins[i];
  if (!s || s.kind === "wait" || !c) return [];
  const on = ` on ${c.chain}`;
  if (s.kind === "buy") {
    return [
      ...(c.crux ? [] : [{ label: "Take profit 2×", command: `sell all ${c.address} at 2x${on}`, say: `Sell all my ${c.symbol} at 2×` }, { label: "Stop loss 20%", command: `stop loss 20% on ${c.address}${on}`, say: `Stop loss 20% on ${c.symbol}` }]),
      { label: "Sell half", command: `sell half of ${c.address}${on}`, say: `Sell half my ${c.symbol}` },
      { label: "What do I hold?", command: "what do I hold?" },
    ];
  }
  if (s.kind === "sell") {
    return [
      { label: `Buy $5 of ${c.symbol} again`, command: `buy $5 of ${c.address}${on}`, say: `Buy $5 of ${c.symbol}` },
      { label: "What's trending?", command: "what's trending?" },
      { label: "What do I hold?", command: "what do I hold?" },
    ];
  }
  return [
    { label: "Show my orders", command: "show my orders" },
    { label: "What do I hold?", command: "what do I hold?" },
  ];
}

/** What stops a plan from being confirmed, in plain words. Pure. */
export function planProblems(steps: CommandStep[], coins: (FoundCoin | undefined)[]): string[] {
  const p = new Set<string>();
  steps.forEach((s, i) => {
    const c = coins[i];
    if (s.kind === "wait" || !c) return;
    if ((s.kind === "buy" || s.kind === "dip") && s.usd > BETA_MAX_BUY) p.add(`During the beta, one buy can be at most $${BETA_MAX_BUY}.`);
    if (s.kind !== "buy" && s.kind !== "sell" && c.crux) p.add("Price orders don't work on Crux launches still on their launch curve yet. Buy or sell them right away instead.");
    if ((s.kind === "takeProfit" || s.kind === "stopLoss" || s.kind === "dip") && !c.crux && !(c.price && c.price > 0)) p.add(`Couldn't read ${c.symbol}'s price to set the order.`);
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
  const chain = c.chain === "bnb" ? "bsc" : c.chain === "base" ? "base" : "solana";
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
