"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { useCoinOrders, type CoinOrderKind, type CoinOrderView } from "@/hooks/useCoinOrders";
import { useTradeSettings } from "@/hooks/useTradeSettings";
import { fmtPrice } from "@/lib/solanaCoins";

export type OrderKind = "market" | CoinOrderKind | "bracket";

const KIND_WORDS: Record<CoinOrderKind, string> = { dip: "Buy the dip", takeProfit: "Take profit", stopLoss: "Stop loss", trailing: "Trailing stop" };
/** Quick trigger offsets from the price now, in percent. */
const OFFSETS: Record<"dip" | "takeProfit" | "stopLoss", number[]> = { dip: [-10, -20, -30, -50], takeProfit: [25, 50, 100, 200], stopLoss: [-10, -20, -30, -50] };
const TRAILS = [5, 10, 20, 30];

const parse = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** One trigger: a price box with quick "% from now" buttons, and how far that is from the price now. */
function Trigger({ label, value, onChange, price, offsets, tone }: { label: string; value: string; onChange: (v: string) => void; price?: number; offsets: number[]; tone: "up" | "down" }) {
  const v = parse(value);
  const away = v !== null && price ? ((v - price) / price) * 100 : null;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-dim">
        <span>{label}</span>
        {away !== null && <span className={`font-mono normal-case tracking-normal ${away >= 0 ? "text-up" : "text-down"}`}>{`${away >= 0 ? "+" : ""}${away.toFixed(1)}% from now`}</span>}
      </div>
      <label className="mt-1.5 flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2">
        <span className="font-mono text-[14px] text-dim">$</span>
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.e-]/g, ""))} placeholder={price ? fmtPrice(price).slice(1) : "price"} aria-label={label} className="w-full bg-transparent font-mono text-[15px] text-chrome outline-none" />
      </label>
      {price !== undefined && (
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {offsets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(String(Number((price * (1 + p / 100)).toPrecision(4))))}
              className={`h-7 rounded-md border font-mono text-[11.5px] transition-colors ${tone === "up" ? "border-up/30 text-up hover:border-up" : "border-down/30 text-down hover:border-down"}`}
            >
              {p > 0 ? "+" : ""}
              {p}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The ticket's standing orders for a Solana or BNB Chain coin: buy the dip, take profit, stop loss, trailing stop, or
 * take profit + stop loss together (whichever triggers first sells; the other closes). Crux watches the price every
 * couple of seconds and trades from your wallet when it triggers, with this page closed.
 */
export function CoinOrderForm({
  kind,
  chain,
  coin,
  symbol,
  price,
  held,
  decimals,
  cash,
  cashDecimals,
}: {
  kind: Exclude<OrderKind, "market">;
  chain: "solana" | "bsc";
  coin: string;
  symbol: string;
  price?: number;
  held: bigint;
  decimals: number;
  cash: number | null;
  cashDecimals: number;
}) {
  const settings = useTradeSettings();
  const { place } = useCoinOrders();
  const [trigger, setTrigger] = useState("");
  const [stop, setStop] = useState("");
  const [trail, setTrail] = useState(10);
  const [dollars, setDollars] = useState("");
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const buying = kind === "dip";
  const heldCoins = Number(held) / 10 ** decimals;
  const sellAmount = pct >= 100 ? "all" : ((held * BigInt(pct)) / BigInt(100)).toString();
  const usd = parse(dollars);
  const tp = parse(trigger);
  const sl = parse(stop);

  const problem = buying
    ? usd === null
      ? "Enter how much to buy."
      : cash !== null && usd > cash
        ? "More than your cash ready."
        : tp === null
          ? "Pick the price to buy at."
          : price && tp >= price
            ? "A dip price is under the price now."
            : null
    : held === BigInt(0)
      ? `You hold no $${symbol} yet.`
      : kind === "trailing"
        ? null
        : kind === "stopLoss"
          ? tp === null
            ? "Pick the stop price."
            : price && tp >= price
              ? "A stop is under the price now."
              : null
          : tp === null
            ? "Pick the take-profit price."
            : price && tp <= price
              ? "Take profit is over the price now."
              : kind === "bracket" && (sl === null || (price !== undefined && sl >= price))
                ? "Pick a stop price under the price now."
                : null;

  const submit = async () => {
    if (problem) return;
    setBusy(true);
    setNote(null);
    const base = { chain, coin, symbol, slippageBps: settings.standingSlippageBps };
    try {
      if (buying) await place([{ ...base, kind: "dip", amount: BigInt(Math.round(usd! * 1e6)) * BigInt(10) ** BigInt(cashDecimals - 6) + "", trigger: tp! }]);
      else if (kind === "trailing") await place([{ ...base, kind: "trailing", amount: sellAmount, trailPct: trail }]);
      else if (kind === "bracket") {
        const group = crypto.randomUUID();
        await place([
          { ...base, kind: "takeProfit", amount: sellAmount, trigger: tp!, group },
          { ...base, kind: "stopLoss", amount: sellAmount, trigger: sl!, group },
        ]);
      } else await place([{ ...base, kind, amount: sellAmount, trigger: tp! }]);
      setNote({ ok: true, text: "Order placed. Crux watches the price and trades for you, even with this page closed." });
      setTrigger("");
      setStop("");
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {buying ? (
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2">
          <span className="font-mono text-[14px] text-dim">$</span>
          <input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Amount to buy" aria-label="Amount to buy in dollars" className="w-full bg-transparent font-mono text-[15px] text-chrome outline-none" />
          <span className="font-mono text-[12px] text-dim">USD</span>
        </label>
      ) : (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dim">How much of your ${symbol}</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {[25, 50, 75, 100].map((p) => (
              <button key={p} type="button" onClick={() => setPct(p)} className={`h-8 rounded-md border font-mono text-[12px] ${pct === p ? "border-down/70 text-down" : "border-line-2 text-muted hover:text-chrome"}`}>
                {p === 100 ? "All" : `${p}%`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-dim">
            {heldCoins > 0 ? `${((heldCoins * pct) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} $${symbol}${price ? ` · about $${((heldCoins * pct * price) / 100).toFixed(2)} now` : ""}` : `You hold no $${symbol} yet.`}
          </p>
        </div>
      )}

      {kind === "trailing" ? (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dim">Sell when it falls this far from its high</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {TRAILS.map((t) => (
              <button key={t} type="button" onClick={() => setTrail(t)} className={`h-8 rounded-md border font-mono text-[12px] ${trail === t ? "border-down/70 text-down" : "border-line-2 text-muted hover:text-chrome"}`}>
                {t}%
              </button>
            ))}
          </div>
          {price && <p className="mt-1 text-[11px] text-dim">Right now that&rsquo;s {fmtPrice(price * (1 - trail / 100))}; it rises as the price makes new highs.</p>}
        </div>
      ) : (
        <Trigger
          label={kind === "dip" ? "Buy when the price falls to" : kind === "stopLoss" ? "Sell if the price falls to" : "Sell when the price reaches"}
          value={trigger}
          onChange={setTrigger}
          price={price}
          offsets={OFFSETS[kind === "bracket" ? "takeProfit" : kind]}
          tone={kind === "takeProfit" || kind === "bracket" ? "up" : "down"}
        />
      )}
      {kind === "bracket" && <Trigger label="Or sell if it falls to" value={stop} onChange={setStop} price={price} offsets={OFFSETS.stopLoss} tone="down" />}

      <button
        type="button"
        disabled={busy || problem !== null}
        onClick={() => void submit()}
        className={`${buttonClass("primary", "md", "rounded-lg")} mt-3 w-full ${buying ? "" : "!bg-down !text-void hover:!bg-down/90"}`}
      >
        {busy ? "Placing…" : kind === "bracket" ? "Place take profit + stop loss" : `Place ${KIND_WORDS[kind].toLowerCase()}`}
      </button>
      {problem && !busy && (trigger || dollars || stop) && <p className="mt-2 text-[12px] text-down">{problem}</p>}
      {note && <p className={`mt-2 text-[12px] leading-snug ${note.ok ? "text-up" : "text-down"}`}>{note.text}</p>}
      <p className="mt-2 text-[11px] leading-snug text-dim">Fills within your order slippage ({(settings.standingSlippageBps / 100).toFixed(0)}%, in the gear). Orders last 30 days.</p>
    </div>
  );
}

/** This coin's orders: open ones with Cancel, then the last few that filled, failed or closed. */
export function CoinOrderList({ coin, decimals, cashDecimals }: { coin: string; decimals: number; cashDecimals: number }) {
  const { orders, cancel } = useCoinOrders();
  const mine = (orders ?? []).filter((o) => o.coin.toLowerCase() === coin.toLowerCase());
  if (mine.length === 0) return null;
  const open = mine.filter((o) => o.status === "open" || o.status === "firing");
  const done = mine.filter((o) => o.status !== "open" && o.status !== "firing").slice(0, 4);
  const what = (o: CoinOrderView) =>
    o.kind === "dip"
      ? `$${(Number(BigInt(o.amount)) / 10 ** cashDecimals).toFixed(2)}`
      : o.amount === "all"
        ? `all $${o.symbol}`
        : `${(Number(BigInt(o.amount)) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: 2 })} $${o.symbol}`;
  const at = (o: CoinOrderView) => (o.kind === "trailing" ? `${o.trailPct}% under the high${o.peak ? ` (${fmtPrice(o.peak * (1 - (o.trailPct ?? 0) / 100))} now)` : ""}` : `at ${fmtPrice(o.trigger ?? 0)}`);
  return (
    <section className="mt-3 rounded-xl border border-line bg-panel p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-dim">Your orders</p>
      <ul className="mt-2 flex flex-col gap-2">
        {open.map((o) => (
          <li key={o.id} className="flex items-start justify-between gap-2 text-[12px]">
            <span className="text-muted">
              <span className={o.kind === "dip" ? "text-up" : "text-down"}>{KIND_WORDS[o.kind]}</span> {what(o)} {at(o)}
              {o.group && <span className="text-dim"> · paired</span>}
              {o.status === "firing" && <span className="text-signal"> · trading now…</span>}
            </span>
            {o.status === "open" && (
              <button type="button" onClick={() => void cancel(o.group ? open.filter((x) => x.group === o.group).map((x) => x.id) : [o.id])} className="shrink-0 text-[11.5px] text-dim underline decoration-line-2 hover:text-chrome">
                Cancel
              </button>
            )}
          </li>
        ))}
        {done.map((o) => (
          <li key={o.id} className="text-[11.5px] text-dim">
            {KIND_WORDS[o.kind]} {what(o)} ·{" "}
            {o.status === "filled" ? (
              <span className="text-up">filled{o.firedPrice ? ` at ${fmtPrice(o.firedPrice)}` : ""}</span>
            ) : o.status === "failed" ? (
              <span className="text-down">didn&rsquo;t go through{o.error ? `: ${o.error}` : ""}</span>
            ) : (
              o.status
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
