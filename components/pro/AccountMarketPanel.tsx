"use client";

import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits, parseUnits, zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { slippageFor, useTradeSettings } from "@/hooks/useTradeSettings";
import { tradeFromAccount } from "@/lib/account";
import { TESTNET } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { fetchMarkets, MARKET_SPREAD_BPS, quoteMarket, type CuratedMarket } from "@/lib/markets";
import { watchHeads } from "@/lib/stream";

type Side = "buy" | "sell";
const num = (v: bigint, d: number) => Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 6 });

/**
 * Buy or sell a Crux market (lib/markets.ts) from the Crux account: one silent signature, no gas, filled by the Crux
 * solver at the batch's one price. The quote is the Uniswap V3 route's, refreshed as blocks arrive, less the solver's
 * spread and the trader's slippage.
 */
export function AccountMarketPanel({ market, onUseWallet }: { market: CuratedMarket; onUseWallet: () => void }) {
  const uid = useId();
  const crux = useCruxAccount();
  const settings = useTradeSettings();
  const [side, setSide] = useState<Side>("buy");
  // Buys and sells each have their own slippage (the ticket's gear).
  const slippageBps = slippageFor(settings, side);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  const inToken = side === "buy" ? TESTNET_USDC : market.token;
  const inDecimals = side === "buy" ? 6 : market.decimals;
  const outDecimals = side === "buy" ? market.decimals : 6;
  const inUnit = side === "buy" ? "USDC" : market.symbol;
  const outUnit = side === "buy" ? market.symbol : "USDC";

  let input: bigint | null = null;
  try {
    input = amount && Number(amount) > 0 ? parseUnits(amount, inDecimals) : null;
  } catch {
    input = null;
  }

  const balance = useReadContract({
    chainId: TESTNET.id,
    address: inToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [crux.account ?? zeroAddress],
    query: { enabled: crux.account !== null, refetchInterval: 10_000 },
  });
  const listing = useQuery({ queryKey: ["crux-markets"], queryFn: fetchMarkets, staleTime: 30_000, refetchInterval: 60_000 });
  const listed = listing.data?.curated.find((c) => c.token.toLowerCase() === market.token.toLowerCase());
  const open = listed ? (side === "buy" ? listed.buyable : listed.sellable) : null;

  const quote = useQuery({
    queryKey: ["market-quote", market.token, side, input?.toString()],
    enabled: input !== null,
    staleTime: 2_000,
    queryFn: () => quoteMarket(market, side, input!),
  });
  // Requote as blocks arrive (200 ms on Base Sepolia), at most once a second.
  const { refetch } = quote;
  useEffect(() => (input === null ? undefined : watchHeads(() => void refetch(), 1_000)), [input, refetch]);

  const routeOut = quote.data && quote.data > BigInt(0) ? quote.data : null;
  const youGet = routeOut !== null ? (routeOut * BigInt(10_000 - MARKET_SPREAD_BPS)) / BigInt(10_000) : null;
  const minOut = youGet !== null ? (youGet * BigInt(10_000 - slippageBps)) / BigInt(10_000) : null;
  const over = input !== null && balance.data !== undefined && input > balance.data;

  async function submit() {
    if (!crux.sign || !crux.owner || !crux.account || input === null || minOut === null) return;
    setBusy(true);
    setError(null);
    setOpened(null);
    try {
      const orderId = await tradeFromAccount(crux.sign, crux.owner, crux.account, {
        tokenIn: inToken,
        amountIn: input,
        tokenOut: `eip155:${TESTNET.id}/erc20:${side === "buy" ? market.token : TESTNET_USDC}`,
        minAmountOut: minOut,
      });
      setOpened(orderId);
      setAmount("");
      void balance.refetch();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-signal/40 bg-signal/5 px-3 py-2 text-[11.5px]">
        <span className="text-chrome">CRUX Account</span>
        <span className="text-dim">— Instant • 0 Gas · filled by Crux</span>
        <button type="button" onClick={onUseWallet} className="ml-auto text-dim hover:text-chrome">
          Or pay directly from external wallet ▾
        </button>
      </div>
      <div role="tablist" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-lg border border-line p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setOpened(null);
            }}
            className={`rounded-md py-2 text-[13.5px] capitalize transition-colors ${
              side === s ? (s === "buy" ? "border border-up/50 bg-up/10 text-up" : "border border-down/50 bg-down/10 text-down") : "text-muted hover:text-chrome"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor={`${uid}-amount`} className="text-[12px] text-dim">
          You pay
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2.5 focus-within:border-line-2">
          <input
            id={`${uid}-amount`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full min-w-0 bg-transparent font-mono text-[20px] text-chrome outline-none placeholder:text-dim"
          />
          <span className="shrink-0 text-[12px] text-muted">{inUnit}</span>
        </div>
        {balance.data !== undefined && (
          <button type="button" onClick={() => setAmount(formatUnits(balance.data!, inDecimals))} className="mt-1.5 font-mono text-[11.5px] text-dim hover:text-chrome">
            In your account {num(balance.data, inDecimals)} {inUnit}
          </button>
        )}
      </div>
      <dl className="space-y-1.5 rounded-lg border border-line px-3 py-2.5 text-[12.5px]">
        <div className="flex justify-between">
          <dt className="text-dim">You get about</dt>
          <dd className="font-mono text-chrome">{quote.isFetching && youGet === null ? "…" : youGet !== null ? `${num(youGet, outDecimals)} ${outUnit}` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">Minimum ({(slippageBps / 100).toFixed(1)}% slippage)</dt>
          <dd className="font-mono text-muted">{minOut !== null ? `${num(minOut, outDecimals)} ${outUnit}` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-dim">Route</dt>
          <dd className="text-right text-muted">Crux solver · Uniswap V3 · {market.tokens.length - 1} hop{market.tokens.length > 2 ? "s" : ""} · 0.3% spread</dd>
        </div>
      </dl>
      {!crux.account ? (
        <a href="/account" className={buttonClass("primary", "md", "w-full rounded-xl text-center font-semibold")}>
          Create your Crux account
        </a>
      ) : open === false ? (
        <p className="rounded-lg border border-line px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          ${market.symbol} isn&apos;t registered for Crux account trading yet: it needs one Crux Safe transaction. Use a wallet swap meanwhile.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || input === null || minOut === null || over || !crux.sign}
          onClick={() => void submit()}
          className={buttonClass(side, "md", "w-full rounded-xl font-semibold")}
        >
          {over ? `Not enough ${inUnit} in your account` : `${side === "buy" ? "Buy" : "Sell"} $${market.symbol}`}
        </button>
      )}
      {busy && (
        <p role="status" className="flex items-center gap-2 text-[12px] text-chrome">
          <KineticLoader className="text-chrome" /> Signing with your login and opening the order…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
          {error}
        </p>
      )}
      {opened && (
        <p role="status" className="rounded-lg border border-line-2 px-3 py-2 text-[12px] text-chrome">
          Order opened. Crux fills it in the next 10-second batch, straight into your account.
        </p>
      )}
      <p className="text-[11.5px] leading-relaxed text-dim">
        A Crux market: not a Crux launch, but tradable from your account. Funds stay in the account; Crux can only pay the fill back into it.
        {market.note ? ` ${market.note}.` : ""}
      </p>
    </div>
  );
}
