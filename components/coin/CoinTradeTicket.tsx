"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import { useCashMove, type CashChain } from "@/hooks/useCashMove";
import { IS_TESTNET } from "@/lib/network";
import { buttonClass } from "@/components/ui/Button";
import { TradeSettingsButton } from "@/components/pro/TradeSettingsButton";
import { Menu } from "@/components/ui/Menu";
import { CoinOrderForm, CoinOrderList, type OrderKind } from "@/components/coin/CoinOrderForm";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";
import { useBnbTrading, useWalletTrading } from "@/hooks/useBnbTrading";
import { useCreatorAlert } from "@/hooks/useCreatorAlert";
import { slippageFor, useTradeSettings } from "@/hooks/useTradeSettings";
import { fmtPrice, solanaFeeText } from "@/lib/solanaCoins";
import { bnbFeeText } from "@/lib/bnbCoins";
import { usePositions } from "@/hooks/usePositions";
import { pnlOf, pnlText } from "@/lib/pnl";

type Side = "buy" | "sell";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const coins = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1_000 ? 0 : n >= 1 ? 2 : 6 });

/** What a chain gives the ticket: cash, the bag, and how to prepare and send a trade. */
type Venue = {
  chain: "solana" | "bsc" | "base";
  coin: string;
  /** The cash a limit buy spends (it trades with no page open, from this chain's own cash), and its decimals. */
  orderCash: number | null;
  cashDecimals: number;
  symbol: string;
  price?: number;
  /** Dollars ready to buy with (null while reading). */
  cash: number | null;
  /** The bag, in the coin's base units, and its decimals. */
  held: bigint;
  decimals: number;
  /** What the bag cost per whole coin, on average (positions), when Crux recorded the buys. */
  entry?: number;
  busy: boolean;
  prepare: (side: Side, amount: bigint | "all", slippageBps: number) => void;
  buy: (dollars: number, slippageBps: number) => void;
  sell: (amount: bigint | "all", slippageBps: number) => void;
  /** Turbo, the creator alert: what only this chain has. */
  extras?: ReactNode;
  footnote: string;
  status: ReactNode;
};

/**
 * The pro Buy / Sell ticket for a coin on any chain, as on a Crux launch: Buy and Sell tabs, the four instant sizes
 * (set in the gear: dollars to buy, shares of the bag to sell, slippage, one-click on or off), an amount box with what
 * it gets, and the result. Pointing at a button prepares that exact trade on the server, so the click only sends it.
 */
function Ticket(v: Venue) {
  const settings = useTradeSettings();
  const [side, setSide] = useState<Side>("buy");
  const [shownSide, setShownSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [orderType, setOrderType] = useState<OrderKind>("market");
  const bps = slippageFor(settings, side);
  const scale = 10 ** v.decimals;
  const heldCoins = Number(v.held) / scale;
  const heldUsd = v.price !== undefined ? heldCoins * v.price : null;
  const n = Number(amount) || 0;
  // Buy: the box is dollars. Sell: coins (Max fills the whole bag, sold as "all" so nothing is left behind).
  const sellAll = side === "sell" && n > 0 && n >= heldCoins;
  const sellUnits = side === "sell" && n > 0 ? (sellAll ? ("all" as const) : BigInt(Math.floor(n * scale))) : null;
  const slip = 1 - bps / 10_000;
  const estimate =
    n <= 0 || v.price === undefined || v.price <= 0
      ? null
      : side === "buy"
        ? `About ${coins(n / v.price)} $${v.symbol} · at least ${coins((n / v.price) * slip)}`
        : `About ${usd(n * v.price)} · at least ${usd(n * v.price * slip)}`;
  const tooMuch = side === "buy" ? v.cash !== null && n > v.cash + 1e-9 : n > heldCoins + 1e-12;
  const pct = (p: number): bigint | "all" => (p >= 100 ? "all" : (v.held * BigInt(Math.round(p * 100))) / BigInt(10_000));
  const instant = settings.instant;

  const tabs = (
    <div className="flex gap-1" role="tablist">
      {(["buy", "sell"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={shownSide === s}
          onClick={() => {
            if (s === shownSide) return;
            setShownSide(s);
            startTransition(() => {
              setSide(s);
              setAmount("");
              setOrderType("market");
            });
          }}
          className={`h-8 flex-1 rounded-[4px] border text-[13px] ${shownSide === s ? (s === "buy" ? "border-up/60 text-up" : "border-down/60 text-down") : "border-line-2 text-muted"}`}
        >
          {s === "buy" ? "Buy" : "Sell"}
        </button>
      ))}
    </div>
  );

  return (
    <>
    <section className="rounded-xl border border-line bg-panel p-4">
      {tabs}

      <Menu<OrderKind>
        className="mt-3"
        label="Order type"
        value={orderType}
        onChange={setOrderType}
        options={
          side === "buy"
            ? [
                { value: "market", label: "Market: buy now" },
                { value: "dip", label: "Buy the dip" },
              ]
            : [
                { value: "market", label: "Market: sell now" },
                { value: "takeProfit", label: "Take profit" },
                { value: "stopLoss", label: "Stop loss" },
                { value: "trailing", label: "Trailing stop" },
                { value: "bracket", label: "Take profit + stop loss" },
              ]
        }
      />

      {orderType !== "market" ? (
        <CoinOrderForm kind={orderType} chain={v.chain} coin={v.coin} symbol={v.symbol} price={v.price} held={v.held} decimals={v.decimals} cash={v.orderCash} cashDecimals={v.cashDecimals} />
      ) : (
      <>
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dim">
            {side === "buy" ? "Quick buy" : "Quick sell"} · {instant ? "one click" : "fills the box"}
          </p>
          <TradeSettingsButton side={side} />
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {side === "buy"
            ? settings.buyPresets.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={v.busy || (v.cash !== null && v.cash < d)}
                  onPointerEnter={() => v.prepare("buy", BigInt(Math.round(d * 1e6)), bps)}
                  onClick={() => (instant ? v.buy(d, bps) : setAmount(String(d)))}
                  className="h-9 rounded-lg border border-up/40 font-mono text-[12.5px] text-up transition-colors hover:border-up hover:bg-up/[0.06] disabled:opacity-35"
                >
                  ${d}
                </button>
              ))
            : settings.sellPresets.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={v.busy || v.held === BigInt(0)}
                  onPointerEnter={() => v.held > BigInt(0) && v.prepare("sell", pct(p), bps)}
                  onClick={() => (instant ? v.sell(pct(p), bps) : setAmount(String(p >= 100 ? heldCoins : (heldCoins * p) / 100)))}
                  className="h-9 rounded-lg border border-down/40 font-mono text-[12.5px] text-down transition-colors hover:border-down hover:bg-down/[0.06] disabled:opacity-35"
                >
                  {p >= 100 ? "All" : `${p}%`}
                </button>
              ))}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2">
        {side === "buy" && <span className="font-mono text-[14px] text-dim">$</span>}
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.00"
          aria-label={side === "buy" ? "Amount in dollars" : `Amount of $${v.symbol}`}
          className="w-full bg-transparent font-mono text-[16px] text-chrome outline-none"
        />
        {side === "sell" ? (
          <button type="button" disabled={v.held === BigInt(0)} onClick={() => setAmount(String(heldCoins))} className="font-mono text-[11px] text-dim hover:text-chrome">
            MAX
          </button>
        ) : (
          <span className="font-mono text-[12px] text-dim">USD</span>
        )}
      </label>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-dim">
        <span>
          Cash ready: <span className="font-mono text-chrome">{v.cash !== null ? usd(v.cash) : "…"}</span>
        </span>
        <span>
          You hold <span className="font-mono text-chrome">{heldCoins > 0 ? coins(heldCoins) : "0"}</span> ${v.symbol}
          {heldUsd !== null && heldCoins > 0 && <span> ({usd(heldUsd)})</span>}
        </span>
      </div>
      {heldCoins > 0 && v.entry !== undefined && v.price !== undefined && v.price > 0 && (
        <PnlLine pnl={pnlOf(heldCoins, v.price, v.entry)} entry={v.entry} />
      )}

      {estimate && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          {estimate} ({(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}% slippage)
        </p>
      )}

      <button
        type="button"
        disabled={v.busy || n <= 0 || tooMuch}
        onPointerEnter={() => {
          if (n <= 0 || tooMuch) return;
          if (side === "buy") v.prepare("buy", BigInt(Math.round(n * 1e6)), bps);
          else if (sellUnits !== null) v.prepare("sell", sellUnits, bps);
        }}
        onClick={() => {
          if (side === "buy") v.buy(n, bps);
          else if (sellUnits !== null) v.sell(sellUnits, bps);
        }}
        className={`${buttonClass("primary", "md", "rounded-lg")} mt-3 w-full ${side === "sell" ? "!bg-down !text-void hover:!bg-down/90" : ""}`}
      >
        {side === "buy" ? `Buy $${v.symbol}` : `Sell $${v.symbol}`}
      </button>
      {tooMuch && <p className="mt-2 text-[12px] text-down">{side === "buy" ? "More than your cash ready. Add money first." : `You hold ${coins(heldCoins)} $${v.symbol}.`}</p>}
      </>
      )}

      {v.status && <div className="mt-3">{v.status}</div>}
      {v.extras && <div className="mt-3 border-t border-line pt-3">{v.extras}</div>}
      <p className="mt-3 text-[11px] leading-snug text-dim">{v.footnote}</p>
      {v.price !== undefined && <p className="sr-only">Price {fmtPrice(v.price)}</p>}
    </section>
    <CoinOrderList coin={v.coin} decimals={v.decimals} cashDecimals={v.cashDecimals} />
    </>
  );
}

function LogIn({ text }: { text: string }) {
  const crux = useCruxAccount();
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <p className="text-[13px] text-muted">{text}</p>
      <button type="button" onClick={crux.login} className={buttonClass("primary", "md", "font-semibold")}>
        Log in to trade
      </button>
    </section>
  );
}

function Result({ r, receipt, testRun }: { r: { kind: string; label?: string; message?: string; side?: Side; ms?: number; confirmed?: boolean }; receipt?: string; testRun?: boolean }) {
  if (r.kind === "busy") return <p className="text-[13px] text-muted">{r.label}</p>;
  if (r.kind === "error") return <p className="rounded-lg border border-down/50 px-3 py-2 text-[13px] text-down">{r.message}</p>;
  if (r.kind !== "done") return null;
  return (
    <p className="rounded-lg border border-up/40 px-3 py-2 text-[13px] text-up">
      {r.side === "buy" ? "Bought" : "Sold"} in {((r.ms ?? 0) / 1000).toFixed(1)} s<span className="text-muted">{r.confirmed ? " · confirmed ✓" : " · confirming…"}</span>
      {testRun && <span className="text-muted"> · test run: your test USDC comes back</span>}
      {receipt && (
        <>
          {" · "}
          <a href={receipt} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2">
            receipt
          </a>
        </>
      )}
    </p>
  );
}

/** Profit or loss on the bag against what it cost (green up, red down), with the average entry. */
function PnlLine({ pnl, entry }: { pnl: { usd: number; pct: number }; entry: number }) {
  return (
    <p className="mt-1 flex justify-between text-[12px] text-muted">
      <span>
        Bought at <span className="font-mono text-chrome">{fmtPrice(entry)}</span>
      </span>
      <span className={`font-mono ${pnl.usd >= 0 ? "text-up" : "text-down"}`}>{pnlText(pnl)}</span>
    </p>
  );
}

/**
 * One balance for a chain's ticket (Option A, Base mainnet): the quick-buy size moves to this chain as soon as the
 * page opens (so the buy is instant), and a buy bigger than this chain's cash moves the rest first, then buys.
 */
function useOneBalanceBuy(chain: CashChain) {
  const m = useCashMove();
  const settings = useTradeSettings();
  const [error, setError] = useState<string | null>(null);
  const quick = BigInt(Math.round((settings.buyPresets[0] ?? 0) * 1e6));
  const { premove } = m;
  useEffect(() => premove(chain, quick), [premove, chain, quick]);
  const buy = async (usd6: bigint, run: () => void) => {
    setError(null);
    try {
      if (!IS_TESTNET) await m.ensure(chain, usd6);
      run();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const status = m.moving ? (
    <p className="text-[13px] text-muted">Moving your cash to {m.name(chain)}… a few seconds.</p>
  ) : error ? (
    <p className="rounded-lg border border-down/50 px-3 py-2 text-[13px] text-down">{error}</p>
  ) : null;
  return { buy, status, total: IS_TESTNET ? null : m.total };
}

/** The ticket for a Solana coin: paid from Solana cash first, else the Crux balance (picked for you, never shown). */
export function SolanaTicket({ mint, symbol, price }: { mint: string; symbol?: string; price?: number }) {
  const crux = useCruxAccount();
  const t = useSolanaTrading(mint);
  const pos = usePositions();
  const alert = useCreatorAlert(mint);
  const [turbo, setTurbo] = useState(false);
  const one = useOneBalanceBuy("solana");
  if (!crux.loggedIn) return <LogIn text="Trade this coin from your one Crux account. No SOL, no bridging." />;
  const h = t.holdings;
  // Mainnet: the whole balance can buy (the rest moves here first); Sepolia: Solana cash plus the account's test USDC.
  const cash = one.total !== null ? Number(one.total) / 1e6 : h ? Number(h.usdc) / 1e6 + Number(crux.usdc ?? BigInt(0)) / 1e6 : null;
  const r = t.result;
  return (
    <Ticket
      chain="solana"
      coin={mint}
      // A limit buy trades with the page closed, from Solana cash only (the Crux balance needs this page to pay).
      orderCash={h ? Number(h.usdc) / 1e6 : null}
      cashDecimals={6}
      symbol={symbol || h?.token?.symbol || "coin"}
      price={price ?? h?.token?.usdPrice}
      cash={cash}
      held={h?.coin?.amount ?? BigInt(0)}
      decimals={h?.coin?.decimals ?? h?.token?.decimals ?? 6}
      entry={pos.entryOf("solana", mint, h?.coin?.decimals ?? h?.token?.decimals ?? 6)}
      busy={r.kind === "busy"}
      prepare={(side, amount, slippageBps) => t.prepare(side, amount, { turbo, slippageBps })}
      buy={(d, slippageBps) => {
        const usd6 = BigInt(Math.round(d * 1e6));
        void one.buy(usd6, () => void t.buy(usd6, { turbo, slippageBps }));
      }}
      sell={(a, slippageBps) => void t.sell(a, { turbo, slippageBps })}
      status={
        one.status ?? <Result r={r} receipt={r.kind === "done" && r.signature ? `https://solscan.io/tx/${r.signature}` : undefined} testRun={r.kind === "done" && r.how === "account"} />
      }
      footnote={`Paid from your Crux balance. ${solanaFeeText(mint)}`}
      extras={
        <>
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
            Turbo (fastest landing)
          </label>
          <label className="mt-2 flex items-start gap-2 text-[12px] text-muted">
            <input type="checkbox" className="mt-0.5" checked={alert.on} disabled={alert.busy} onChange={(e) => void alert.set(e.target.checked)} />
            <span>
              Notify me when the creator sells
              {alert.on && <span className="text-up"> · watching</span>}
              {alert.busy && <span className="text-dim"> · …</span>}
            </span>
          </label>
          {alert.error && <p className="mt-1 text-[11.5px] text-down">{alert.error}</p>}
          {alert.note && <p className="mt-1 text-[11.5px] text-dim">{alert.note}</p>}
          {alert.events.slice(0, 3).map((e) => (
            <p key={e.at} className="mt-1 text-[11.5px] text-signal">
              {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.all ? "The creator sold everything they held." : `The creator sold ${e.soldPct}% of their coins.`}
            </p>
          ))}
        </>
      }
    />
  );
}

/** The ticket for a BNB Chain coin: paid from the balance's BNB Chain cash, Crux paying the gas. */
export function BnbTicket({ address, symbol, price }: { address: string; symbol?: string; price?: number }) {
  const crux = useCruxAccount();
  const t = useBnbTrading(address);
  const pos = usePositions();
  const one = useOneBalanceBuy("bnb");
  if (!crux.loggedIn) return <LogIn text="Trade this coin from your one Crux account. No BNB needed, no bridging." />;
  const h = t.holdings;
  // USDT on BNB Chain has 18 decimals.
  const units = (d: number) => BigInt(Math.round(d * 1e6)) * BigInt(1_000_000_000_000);
  const r = t.result;
  return (
    <Ticket
      chain="bsc"
      coin={address}
      orderCash={h ? Number(h.usdt) / 1e18 : null}
      cashDecimals={18}
      symbol={symbol || "coin"}
      price={price}
      cash={one.total !== null ? Number(one.total) / 1e6 : h ? Number(h.usdt) / 1e18 : null}
      held={h?.coin?.amount ?? BigInt(0)}
      decimals={h?.coin?.decimals ?? 18}
      entry={pos.entryOf("bsc", address, h?.coin?.decimals ?? 18)}
      busy={r.kind === "busy"}
      // The ticket names buy amounts in 6-decimal dollars; BNB Chain's cash counts 18.
      prepare={(side, amount, slippageBps) => t.prepare(side, side === "buy" && typeof amount === "bigint" ? amount * BigInt(1_000_000_000_000) : amount, slippageBps)}
      buy={(d, slippageBps) => void one.buy(BigInt(Math.round(d * 1e6)), () => void t.buy(units(d), slippageBps))}
      sell={(a, slippageBps) => void t.sell(a, slippageBps)}
      status={one.status ?? <Result r={r} receipt={r.kind === "done" ? `https://bscscan.com/tx/${r.hash}` : undefined} />}
      footnote={`Paid from your Crux balance. ${bnbFeeText} Crux pays the gas.`}
    />
  );
}

/** The ticket for any Base coin: paid from Base cash (USDC), moved there from Solana or BNB Chain first when short. */
export function BaseTicket({ address, symbol, price }: { address: string; symbol?: string; price?: number }) {
  const crux = useCruxAccount();
  const t = useWalletTrading("base", address);
  const pos = usePositions();
  const one = useOneBalanceBuy("base");
  if (!crux.loggedIn) return <LogIn text="Trade this coin from your one Crux account. No ETH needed, no bridging." />;
  const h = t.holdings;
  // Base USDC counts 6 decimals, as the ticket's dollars do.
  const units = (d: number) => BigInt(Math.round(d * 1e6));
  const r = t.result;
  return (
    <Ticket
      chain="base"
      coin={address}
      orderCash={h ? Number(h.cash) / 1e6 : null}
      cashDecimals={6}
      symbol={symbol || "coin"}
      price={price}
      cash={one.total !== null ? Number(one.total) / 1e6 : h ? Number(h.cash) / 1e6 : null}
      held={h?.coin?.amount ?? BigInt(0)}
      decimals={h?.coin?.decimals ?? 18}
      entry={pos.entryOf("base", address, h?.coin?.decimals ?? 18)}
      busy={r.kind === "busy"}
      prepare={(side, amount, slippageBps) => t.prepare(side, amount, slippageBps)}
      buy={(d, slippageBps) => void one.buy(units(d), () => void t.buy(units(d), slippageBps))}
      sell={(a, slippageBps) => void t.sell(a, slippageBps)}
      status={one.status ?? <Result r={r} receipt={r.kind === "done" ? `https://basescan.org/tx/${r.hash}` : undefined} />}
      footnote={`Paid from your Crux balance. ${bnbFeeText} Crux pays the gas.`}
    />
  );
}
