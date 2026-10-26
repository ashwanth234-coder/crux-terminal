"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { buttonClass } from "@/components/ui/Button";
import { TradeSettingsButton } from "@/components/pro/TradeSettingsButton";
import type { CruxAccountState } from "@/hooks/useCruxAccount";
import { useTradeSettings } from "@/hooks/useTradeSettings";
import { TESTNET_USDC } from "@/lib/intents";
import { fmtTokens } from "@/lib/launch";
import { fmtTokenPrice, launchCaip19 } from "@/lib/launchTrade";
import { SOLVER_MAX_IMPACT_PCT, tradeRisk } from "@/lib/risk";
import type { PoolReserves } from "@/lib/launchTrade";
import { KIND_LABEL, cancelStanding, listStanding, newGroup, placeStanding, standingFloor, type StandingKind, type StandingView } from "@/lib/standing";

export type OrderType = "market" | StandingKind | "bracket";

const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const LIFETIMES = [
  { label: "1 day", seconds: 86_400 },
  { label: "7 days", seconds: 7 * 86_400 },
  { label: "30 days", seconds: 30 * 86_400 },
];
const pctText = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(Math.abs(p) >= 100 ? 0 : 2)}%`;

/** Where each kind starts, and how far its slider reaches (percent from the current price). */
const RANGE: Record<StandingKind, { start: number; min: number; max: number }> = {
  dip: { start: -10, min: -90, max: -1 },
  stopLoss: { start: -10, min: -90, max: -1 },
  takeProfit: { start: 50, min: 1, max: 1_000 },
  trailing: { start: 10, min: 1, max: 50 },
};

/**
 * One trigger: a price (or market cap) and the same as a percent from now, kept in step; the ⇆ switches units.
 * For a trailing stop it's the trail, a percent under the highest price.
 */
function Trigger({
  label,
  pct,
  setPct,
  price,
  supply,
  range,
  trailing,
}: {
  label: string;
  pct: number;
  setPct: (p: number) => void;
  price: number;
  supply: number;
  range: { min: number; max: number };
  trailing?: boolean;
}) {
  const uid = useId();
  const [mcap, setMcap] = useState(false);
  const target = price * (1 + (trailing ? -pct : pct) / 100);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (mcap ? (target * supply).toFixed(2) : target.toPrecision(4));
  return (
    <div className="rounded-lg border border-line bg-void/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${uid}-v`} className="flex items-center gap-1.5 text-[12px] text-muted">
          {label}
          {!trailing && (
            <button
              type="button"
              onClick={() => {
                setMcap((m) => !m);
                setText(null);
              }}
              title={mcap ? "Enter a price instead" : "Enter a market cap instead"}
              className="rounded-[3px] px-1 font-mono text-[11px] text-dim hover:text-chrome"
            >
              ⇆ {mcap ? "MCap" : "Price"}
            </button>
          )}
        </label>
        {trailing ? (
          <span className="font-mono text-[13px] text-chrome">Trail {pct}%</span>
        ) : (
          <span className="flex items-center gap-1 font-mono text-[14px] text-chrome">
            <span className="text-dim">$</span>
            <input
              id={`${uid}-v`}
              inputMode="decimal"
              value={shown}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.e-]/g, "");
                setText(v);
                const n = Number(v);
                if (n > 0 && price > 0) setPct(Math.round(((mcap ? n / supply : n) / price - 1) * 10_000) / 100);
              }}
              onBlur={() => setText(null)}
              className="w-28 bg-transparent text-right outline-none"
            />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          aria-label={`${label}, percent`}
          min={range.min}
          max={range.max}
          step={1}
          value={Math.min(range.max, Math.max(range.min, pct))}
          onChange={(e) => {
            setPct(Number(e.target.value));
            setText(null);
          }}
          className="h-1 flex-1 accent-[var(--color-signal)]"
        />
        <span className="flex w-20 items-center rounded-[4px] border border-line-2 px-1.5">
          <input
            inputMode="decimal"
            aria-label={`${label}, percent from now`}
            value={pct}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.-]/g, ""));
              if (Number.isFinite(n)) setPct(n);
              setText(null);
            }}
            className="w-full bg-transparent text-right font-mono text-[12px] text-chrome outline-none"
          />
          <span className="text-[11px] text-dim">%</span>
        </span>
      </div>
      {!trailing && (
        <p className="mt-1 text-[10.5px] text-dim">
          {mcap ? `Price ${fmtTokenPrice(target)}` : `MCap ${usdCompact.format(target * supply)}`} · {pctText(pct)} from now
        </p>
      )}
    </div>
  );
}

/**
 * The ticket for standing orders on a Crux account: buy the dip, take profit, stop loss, trailing stop, and take profit
 * + stop loss together (one cancels the other). Signed once with the login key, no pop-up; the keeper sends it when the
 * price gets there, and the floor shown is enforced on-chain. Below it, the account's open orders with cancel.
 */
export function StandingOrderForm({
  type,
  crux,
  token,
  decimals,
  symbol,
  price,
  supply,
  tokenBalance,
  reserves,
}: {
  type: Exclude<OrderType, "market">;
  crux: CruxAccountState;
  token: Address;
  decimals: number;
  symbol: string;
  price: number | null;
  supply: number;
  tokenBalance: bigint | null;
  /** The pool now: an order that would move it more than the solver's cap would never fill. */
  reserves: PoolReserves | null;
}) {
  const settings = useTradeSettings();
  const side = type === "dip" ? "buy" : "sell";
  const kinds: StandingKind[] = type === "bracket" ? ["takeProfit", "stopLoss"] : [type];
  const [pcts, setPcts] = useState<Record<StandingKind, number>>({ dip: RANGE.dip.start, stopLoss: RANGE.stopLoss.start, takeProfit: RANGE.takeProfit.start, trailing: RANGE.trailing.start });
  const [usdc, setUsdc] = useState("");
  const [share, setShare] = useState(100);
  const [lifetime, setLifetime] = useState(LIFETIMES[1].seconds);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [orders, setOrders] = useState<StandingView[] | null>(null);

  const ready = crux.loggedIn && crux.v2 && crux.sign !== null && crux.owner !== null && crux.account !== null;
  const refresh = useCallback(async () => {
    if (!crux.sign || !crux.owner || !crux.account || !crux.v2) return;
    try {
      setOrders(await listStanding(crux.sign, crux.owner, crux.account));
    } catch {
      // The list is a convenience; the next poll tries again.
    }
  }, [crux.sign, crux.owner, crux.account, crux.v2]);
  useEffect(() => {
    if (!ready) return;
    const first = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ready, refresh]);

  if (!crux.loggedIn) {
    return (
      <div className="rounded-lg border border-line p-3 text-[12px] text-muted">
        Standing orders run from your Crux account, so they keep working with this page closed.{" "}
        <button type="button" onClick={crux.login} className="text-chrome underline decoration-line-2">
          Log in
        </button>{" "}
        to use them.
      </div>
    );
  }
  if (!crux.v2) {
    return (
      <div className="rounded-lg border border-line p-3 text-[12px] text-muted">
        Standing orders need the new Crux account contract, which isn&apos;t deployed yet. Market orders work as before.
      </div>
    );
  }

  const amountIn =
    side === "buy"
      ? (() => {
          try {
            return usdc ? parseUnits(usdc, 6) : BigInt(0);
          } catch {
            return BigInt(0);
          }
        })()
      : tokenBalance
        ? (tokenBalance * BigInt(Math.round(share * 100))) / BigInt(10_000)
        : BigInt(0);
  const triggerOf = (k: StandingKind) => (price ?? 0) * (1 + (k === "trailing" ? -pcts.trailing : pcts[k]) / 100);
  const floors = kinds.map((k) => (price ? standingFloor(side, amountIn, triggerOf(k), decimals, settings.slippageBps) : BigInt(0)));
  const overBalance = side === "buy" && crux.usdc !== null && amountIn > crux.usdc;
  const impact = reserves && amountIn > BigInt(0) ? (tradeRisk(side, amountIn, reserves)?.poolImpactPct ?? null) : null;
  const tooBig = impact !== null && impact > SOLVER_MAX_IMPACT_PCT;
  const disabled = busy || !price || amountIn === BigInt(0) || overBalance || tooBig || floors.some((f) => f === BigInt(0));

  const create = async () => {
    if (!crux.sign || !crux.owner || !crux.account || !price) return;
    setBusy(true);
    setMsg(null);
    try {
      const group = kinds.length > 1 ? newGroup() : undefined;
      for (const [i, k] of kinds.entries()) {
        await placeStanding(crux.sign, crux.owner, crux.account, {
          kind: k,
          tokenIn: side === "buy" ? TESTNET_USDC : token,
          amountIn,
          tokenOut: side === "buy" ? launchCaip19(token) : launchCaip19(TESTNET_USDC),
          minAmountOut: floors[i],
          triggerUsd: triggerOf(k),
          group,
          lifetime,
          ...(k === "trailing" ? { trailBps: Math.round(pcts.trailing * 100) } : {}),
        });
      }
      setMsg({ tone: "ok", text: kinds.length > 1 ? "Take profit and stop loss placed. When one fills, the other cancels." : `${KIND_LABEL[kinds[0]]} placed. It waits for its price, even with this page closed.` });
      setUsdc("");
      void refresh();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message.split("\n")[0] });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (o: StandingView) => {
    if (!crux.sign || !crux.owner || !crux.account) return;
    try {
      await cancelStanding(crux.sign, crux.owner, crux.account, o.group ? [] : [BigInt(o.nonce)], o.group ? [o.group as Hex] : []);
      void refresh();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message.split("\n")[0] });
    }
  };

  const open = (orders ?? []).filter((o) => o.token.toLowerCase() === token.toLowerCase());

  return (
    <div className="flex flex-col gap-2.5">
      {kinds.map((k) => (
        <Trigger
          key={k}
          label={k === "dip" ? "Trigger price" : k === "takeProfit" ? "Take profit at" : k === "stopLoss" ? "Stop loss at" : "Trailing stop"}
          pct={pcts[k]}
          setPct={(p) => setPcts((x) => ({ ...x, [k]: p }))}
          price={price ?? 0}
          supply={supply}
          range={RANGE[k]}
          trailing={k === "trailing"}
        />
      ))}

      {side === "buy" ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2">
            <span className="text-[12px] text-muted">Total</span>
            <span className="ml-auto font-mono text-dim">$</span>
            <input
              inputMode="decimal"
              aria-label="USDC to spend"
              placeholder="0.00"
              value={usdc}
              onChange={(e) => setUsdc(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-28 bg-transparent text-right font-mono text-[15px] text-chrome outline-none placeholder:text-dim"
            />
            <span className="text-[11px] text-dim">USDC</span>
          </div>
          <div className="flex items-center gap-1.5">
            {settings.buyPresets.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setUsdc(String(v))}
                className="h-7 flex-1 rounded-[4px] border border-line-2 font-mono text-[11.5px] text-muted hover:border-chrome/60 hover:text-chrome"
              >
                ${v}
              </button>
            ))}
            <TradeSettingsButton />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2">
            <span className="text-[12px] text-muted">Percentage</span>
            <span className="ml-auto font-mono text-[11px] text-dim">{tokenBalance !== null ? `${fmtTokens(amountIn)} ${symbol}` : "…"}</span>
            <input
              inputMode="decimal"
              aria-label="Share of your bag"
              value={share}
              onChange={(e) => setShare(Math.min(100, Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)))}
              className="w-12 bg-transparent text-right font-mono text-[15px] text-chrome outline-none"
            />
            <span className="text-[11px] text-dim">%</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[25, 50, 75, 100].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setShare(p)}
                className={`h-7 flex-1 rounded-[4px] border font-mono text-[11.5px] ${share === p ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
              >
                {p}%
              </button>
            ))}
            <TradeSettingsButton />
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-[11px] text-dim">
        <span>Valid for</span>
        <span className="flex gap-1">
          {LIFETIMES.map((l) => (
            <button
              key={l.seconds}
              type="button"
              onClick={() => setLifetime(l.seconds)}
              className={`rounded-[3px] border px-1.5 py-0.5 ${lifetime === l.seconds ? "border-chrome/60 text-chrome" : "border-line text-dim hover:text-chrome"}`}
            >
              {l.label}
            </button>
          ))}
        </span>
      </div>

      {price && amountIn > BigInt(0) && (
        <dl className="divide-y divide-line rounded-lg border border-line text-[11.5px]">
          {kinds.map((k, i) => (
            <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <dt className="text-muted">
                {KIND_LABEL[k]} {k === "trailing" ? `· fires ${pcts.trailing}% under the high` : `at ${fmtTokenPrice(triggerOf(k))}`}
              </dt>
              <dd className="font-mono text-chrome" title="Signed into the order and enforced on-chain: it can't fill for less">
                min {side === "buy" ? `${fmtTokens(floors[i])} ${symbol}` : `$${formatUnits(floors[i], 6)}`}
              </dd>
            </div>
          ))}
          <p className="px-3 py-1.5 text-[10.5px] leading-snug text-dim">
            The minimum is the trigger price less the 0.6% pool fee and spread and your {(settings.slippageBps / 100).toFixed(1)}% slippage. If the price gaps past it, the
            order refunds to your account instead of filling worse.
            {side === "sell" && kinds.some((k) => k === "stopLoss" || k === "trailing") && " The keeper decides when a stop sells; it can never sell under the minimum."}
          </p>
        </dl>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => void create()}
        className={buttonClass("signal", "md", `w-full rounded-xl font-semibold ${side === "sell" ? "!bg-[#e5484d] !text-white hover:!bg-[#d13d42]" : ""}`)}
      >
        {busy
          ? "Signing…"
          : overBalance
            ? "Not enough USDC in your account"
            : tooBig
              ? `Too large for this pool (over ${SOLVER_MAX_IMPACT_PCT}% price impact)`
              : side === "buy" ? "Create buy order" : "Create sell order"}
      </button>
      {msg && <p className={`text-[11.5px] ${msg.tone === "ok" ? "text-up" : "text-down"}`}>{msg.text}</p>}

      <div className="mt-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-dim">Standing orders on {symbol}</p>
        {orders === null ? (
          <p className="mt-1 text-[11.5px] text-dim">Loading…</p>
        ) : open.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-dim">None yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
            {open.slice(0, 12).map((o) => (
              <li key={o.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
                <span className={o.side === "buy" ? "text-up" : "text-down"}>{o.kind}</span>
                <span className="font-mono text-muted">
                  {o.kind === "trailing stop" ? `${(o.trailBps ?? 0) / 100}% trail` : fmtTokenPrice(o.triggerUsd)}
                </span>
                <span className={`ml-auto rounded-[3px] border px-1 font-mono text-[9.5px] uppercase ${o.status === "open" ? "border-signal/50 text-signal" : "border-line text-dim"}`} title={o.note ?? undefined}>
                  {o.status}
                </span>
                {o.status === "open" && (
                  <button type="button" onClick={() => void cancel(o)} className="text-dim hover:text-down" title={o.group ? "Cancel this order and its linked one" : "Cancel"}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
