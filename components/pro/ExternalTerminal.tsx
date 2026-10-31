"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, formatUnits, parseAbi, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { useBalance, useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ChartGrid } from "@/components/chart/ChartGrid";
import { TerminalShell } from "@/components/pro/TerminalShell";
import { TradeSettingsButton } from "@/components/pro/TradeSettingsButton";
import { td, th, short } from "@/components/pro/desk";
import { buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useTradeSettings } from "@/hooks/useTradeSettings";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import {
  discoverPool,
  externalPrice,
  UNISWAP_V2_ROUTER,
  UNISWAP_V3_QUOTER,
  UNISWAP_V3_ROUTER,
  type ExternalPool,
} from "@/lib/externalPools";
import { fmtTokenPrice } from "@/lib/launchTrade";
import type { AuctionV2 } from "@/lib/launchV2";
import type { PoolTrade } from "@/lib/tradeDecode";
import { logClient } from "@/lib/logs";
import { simulateThenWrite } from "@/lib/preflight";
import { useConnectModal } from "@/providers/Web3Provider";

/**
 * The Pro terminal for a Base Sepolia token that isn't a Crux launch: its deepest Uniswap pool (lib/externalPools)
 * charted with the same Pro chart, its swaps, and a wallet swap straight through Uniswap's router. None of Crux's own
 * machinery applies here: no auction, vesting or anti-sniper badges, no intents or solver, no holders index.
 */

/** How far back the chart and tape read an outside pool. */
const LOOKBACK_SECONDS = 3 * 86_400;

const v2RouterAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);
const v3RouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);
// QuoterV2 isn't a view (it reverts internally to quote), but answers an eth_call: declared as view to read it.
const quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
/** SwapRouter02's "the router itself" recipient, so it can unwrap WETH before paying out ETH. */
const ROUTER_ITSELF: Address = "0x0000000000000000000000000000000000000002";

const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const money = (v: number) => (v > 0 && v < 0.01 ? "<$0.01" : v < 1_000 ? `$${v.toFixed(2)}` : usdCompact.format(v));
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

function ago(now: number | null, t: number) {
  if (now === null) return "…";
  const s = Math.max(0, now - t);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

const venueLabel = (p: ExternalPool) => `${p.dex === "uniswap-v3" ? "Uniswap V3" : "Uniswap V2"} · ${p.fee / 10_000}% · ${p.quoteSymbol}`;

/** /terminal/0x…: finds the token's pool, then renders the terminal or says why it can't. */
export function ExternalTerminalRoute({ token }: { token: Address }) {
  const pool = useQuery({ queryKey: ["external-pool", token.toLowerCase()], queryFn: () => discoverPool(token), staleTime: 60_000, retry: 1 });
  const meta = useReadContracts({
    contracts: [
      { chainId: TESTNET.id, address: token, abi: erc20Abi, functionName: "symbol" },
      { chainId: TESTNET.id, address: token, abi: erc20Abi, functionName: "name" },
      { chainId: TESTNET.id, address: token, abi: erc20Abi, functionName: "totalSupply" },
    ],
  });
  const [sym, name, supply] = meta.data ?? [];

  if (pool.isLoading || meta.isLoading) {
    return (
      <TerminalShell>
        <p role="status" className="flex items-center gap-3 px-5 py-10 text-[13.5px] text-muted">
          <KineticLoader className="text-chrome" /> Finding this token&apos;s Uniswap pool on Base Sepolia…
        </p>
      </TerminalShell>
    );
  }
  if (sym?.status !== "success") {
    return <Missing token={token} title="Not a token on Base Sepolia">This address doesn&apos;t answer as an ERC-20 token on Base Sepolia. Check the chain and the address.</Missing>;
  }
  if (!pool.data) {
    return (
      <Missing token={token} title={`No pool for ${sym.result}`}>
        Crux found no Uniswap V2 or V3 pool pairing this token with test USDC or WETH on Base Sepolia, so there is no price to chart or trade.
      </Missing>
    );
  }
  return (
    <ExternalTerminal
      pool={pool.data}
      symbol={sym.result}
      name={name?.status === "success" ? name.result : null}
      totalSupply={supply?.status === "success" ? supply.result : BigInt(0)}
    />
  );
}

function Missing({ token, title, children }: { token: Address; title: string; children: React.ReactNode }) {
  return (
    <TerminalShell>
      <div className="max-w-xl px-5 py-12">
        <h1 className="font-display-md text-[24px] text-chrome">{title}</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{children}</p>
        <p className="mt-4 break-all font-mono text-[12px] text-dim">{token}</p>
        <Link href="/launches" className={buttonClass("outline", "sm", "mt-6")}>
          Browse Crux launches
        </Link>
      </div>
    </TerminalShell>
  );
}

function ExternalTerminal({ pool, symbol, name, totalSupply }: { pool: ExternalPool; symbol: string; name: string | null; totalSupply: bigint }) {
  const now = useNow();
  // The chart and tape read the pool from a few days back; `auction` carries only what they use for a non-launch.
  const [since] = useState(() => Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS);
  const auction = useMemo<AuctionV2>(
    () => ({
      token: pool.token,
      creator: zeroAddress,
      startTime: since,
      batchWindow: 0,
      status: 1,
      bidderCount: 0,
      settledAt: since,
      pair: pool.pool,
      // The chart's market cap reads an 18-decimal supply.
      totalSupply: (totalSupply * BigInt(10) ** BigInt(18)) / BigInt(10) ** BigInt(pool.tokenDecimals),
      saleSupply: BigInt(0),
      graduationTarget: BigInt(0),
      floorPrice: BigInt(0),
      maxAllocationPerWallet: BigInt(0),
      totalDeposits: BigInt(0),
      clearingPrice: BigInt(0),
    }),
    [pool, since, totalSupply],
  );
  const swaps = usePoolSwaps(pool.pool, since, true, pool.tokenDecimals);
  const price = useQuery({ queryKey: ["external-price", pool.pool], queryFn: () => externalPrice(pool), refetchInterval: 15_000 });
  const trades = useMemo(() => swaps.data?.trades ?? [], [swaps.data]);

  const stats = useMemo(() => {
    if (now === null) return null;
    const day = trades.filter((t) => t.time >= now - 86_400);
    const volume = day.reduce((s, t) => s + Number(t.usdc) / 1e6, 0);
    const before = trades.find((t) => t.time < now - 86_400) ?? day[day.length - 1];
    return { volume, open: before?.price ?? null, count: day.length };
  }, [trades, now]);
  const p = price.data ?? trades[0]?.price ?? null;
  const change = p !== null && stats?.open ? ((p - stats.open) / stats.open) * 100 : null;
  const supply = Number(totalSupply) / 10 ** pool.tokenDecimals;

  return (
    <TerminalShell>
      <section aria-label="Token" className="border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display-md text-[26px] text-chrome">${symbol}</h1>
          {name && <span className="text-[13px] text-muted">{name}</span>}
          <span className="rounded-[3px] border border-line-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Base Sepolia · {venueLabel(pool)}</span>
          <span
            className="rounded-[3px] border border-dashed border-line-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim"
            title="Not launched on Crux: no fair auction, vesting or anti-sniper protection applies, and trades go straight to Uniswap."
          >
            Not a Crux launch
          </span>
        </div>
        <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[12.5px]">
          <div className="flex items-baseline gap-2">
            <dt className="text-[10.5px] uppercase tracking-[0.16em] text-dim">Price</dt>
            <dd className="text-[22px] text-chrome">{p !== null ? fmtTokenPrice(p) : "—"}</dd>
            {change !== null && <dd className={change >= 0 ? "text-up" : "text-down"}>{pct(change)} 24h</dd>}
          </div>
          <Stat label="MCap" value={p !== null && supply > 0 ? money(p * supply) : "—"} />
          <Stat label="Liq" value={money(pool.quoteLiquidityUsd * 2)} />
          <Stat label="Vol 24h" value={stats ? money(stats.volume) : "—"} />
          <Stat label="Swaps 24h" value={stats ? String(stats.count) : "—"} />
        </dl>
        {pool.quoteSymbol === "WETH" && (
          <p className="mt-2 text-[11.5px] text-dim">Priced through WETH at ${pool.quoteUsd.toFixed(2)} per ETH (the Base Sepolia WETH/USDC pool when this page loaded).</p>
        )}
      </section>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-px bg-line max-lg:pb-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)_minmax(190px,28%)]">
        <section aria-label="Chart" className="bg-void p-1.5 max-lg:h-[72svh] max-lg:min-h-[460px] lg:col-start-1 lg:row-start-1 lg:min-h-0">
          <ChartGrid auction={auction} symbol={`$${symbol}`} name={name} factory={zeroAddress} id="0" external />
        </section>
        <aside aria-label="Swap" className="bg-panel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto">
          <SwapPanel pool={pool} symbol={symbol} />
        </aside>
        <section aria-label="Swaps" className="min-h-[260px] bg-void p-3 lg:col-start-1 lg:row-start-2 lg:overflow-y-auto">
          <SwapsTape trades={trades} now={now} symbol={symbol} decimals={pool.tokenDecimals} loading={swaps.isLoading} />
        </section>
      </div>
    </TerminalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10.5px] uppercase tracking-[0.16em] text-dim">{label}</dt>
      <dd className="text-chrome">{value}</dd>
    </div>
  );
}

function SwapsTape({ trades, now, symbol, decimals, loading }: { trades: PoolTrade[]; now: number | null; symbol: string; decimals: number; loading: boolean }) {
  if (loading) return <p className="px-3 py-4 text-[12.5px] text-dim">Reading the pool&apos;s swaps…</p>;
  if (trades.length === 0) return <p className="px-3 py-4 text-[12.5px] text-dim">No swaps in this pool in the last few days.</p>;
  return (
    <table className="w-full min-w-[560px] text-left">
      <caption className="sr-only">Recent swaps in this pool</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className={th}>Time</th>
          <th scope="col" className={th}>Side</th>
          <th scope="col" className={`${th} text-right`}>USD</th>
          <th scope="col" className={`${th} text-right`}>${symbol}</th>
          <th scope="col" className={`${th} text-right`}>Price</th>
          <th scope="col" className={th}>Trader</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {trades.slice(0, 50).map((t) => (
          <tr key={`${t.txHash}:${t.logIndex}`} className="border-b border-line/60">
            <td className={`${td} text-dim`}>{ago(now, t.time)}</td>
            <td className={`${td} ${t.side === "buy" ? "text-up" : "text-down"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
            <td className={`${td} text-right text-chrome`}>{money(Number(t.usdc) / 1e6)}</td>
            <td className={`${td} text-right text-muted`}>{Number(formatUnits(t.tokens, decimals)).toLocaleString("en-US", { maximumSignificantDigits: 6 })}</td>
            <td className={`${td} text-right text-chrome`}>{fmtTokenPrice(t.price)}</td>
            <td className={td}>
              <a href={`${TESTNET_EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-chrome">
                {short(t.to)} ↗
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Side = "buy" | "sell";

/** A wallet swap straight through Uniswap's router, with the trader's slippage signed into its minimum. */
function SwapPanel({ pool, symbol }: { pool: ExternalPool; symbol: string }) {
  const uid = useId();
  const config = useConfig();
  const { address, chainId, isConnected } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { openConnect } = useConnectModal();
  const { slippageBps } = useTradeSettings();
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash: Hex } | null>(null);

  // A WETH-quoted pool is paid in (and pays out) ETH: the router wraps and unwraps it.
  const payEth = pool.quoteSymbol === "WETH";
  const inToken = side === "buy" ? pool.quote : pool.token;
  const outToken = side === "buy" ? pool.token : pool.quote;
  const inDecimals = side === "buy" ? pool.quoteDecimals : pool.tokenDecimals;
  const outDecimals = side === "buy" ? pool.tokenDecimals : pool.quoteDecimals;
  const inUnit = side === "buy" ? (payEth ? "ETH" : "USDC") : symbol;
  const outUnit = side === "buy" ? symbol : payEth ? "ETH" : "USDC";
  const router = pool.dex === "uniswap-v3" ? UNISWAP_V3_ROUTER : UNISWAP_V2_ROUTER;
  const nativeIn = side === "buy" && payEth;

  let input: bigint | null = null;
  try {
    input = amount && Number(amount) > 0 ? parseUnits(amount, inDecimals) : null;
  } catch {
    input = null;
  }

  const eth = useBalance({ address, chainId: TESTNET.id, query: { enabled: Boolean(address) } });
  const reads = useReadContracts({
    contracts: [
      { chainId: TESTNET.id, address: inToken, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress] },
      { chainId: TESTNET.id, address: inToken, abi: erc20Abi, functionName: "allowance", args: [address ?? zeroAddress, router] },
    ],
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });
  const balance = nativeIn ? (eth.data?.value ?? null) : reads.data?.[0]?.result ?? null;
  const allowance = reads.data?.[1]?.result ?? BigInt(0);

  const quote = useQuery({
    queryKey: ["external-quote", pool.pool, side, input?.toString()],
    enabled: input !== null,
    staleTime: 5_000,
    queryFn: async () => {
      if (pool.dex === "uniswap-v3") {
        const [out] = await logClient.readContract({
          address: UNISWAP_V3_QUOTER,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: inToken, tokenOut: outToken, amountIn: input!, fee: pool.fee, sqrtPriceLimitX96: BigInt(0) }],
        });
        return out;
      }
      const amounts = await logClient.readContract({ address: UNISWAP_V2_ROUTER, abi: v2RouterAbi, functionName: "getAmountsOut", args: [input!, [inToken, outToken]] });
      return amounts[1];
    },
  });
  const out = quote.data ?? null;
  const minOut = out !== null ? (out * BigInt(10_000 - slippageBps)) / BigInt(10_000) : null;
  const over = input !== null && balance !== null && input > balance;

  async function swap() {
    if (!address || input === null || minOut === null) return;
    setError(null);
    setDone(null);
    try {
      if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
      if (!nativeIn && allowance < input) {
        setBusy(`Approve ${inUnit} for the Uniswap router…`);
        const h = await simulateThenWrite(config, address, { address: inToken, abi: erc20Abi, functionName: "approve", args: [router, input], chainId: TESTNET.id });
        await waitForTransactionReceipt(config, { hash: h, chainId: TESTNET.id });
        await reads.refetch();
      }
      setBusy("Confirm the swap in your wallet…");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      let hash: Hex;
      if (pool.dex === "uniswap-v2") {
        const path = [inToken, outToken];
        hash = nativeIn
          ? await simulateThenWrite(config, address, { address: router, abi: v2RouterAbi, functionName: "swapExactETHForTokens", args: [minOut, path, address, deadline], value: input, chainId: TESTNET.id })
          : side === "sell" && payEth
            ? await simulateThenWrite(config, address, { address: router, abi: v2RouterAbi, functionName: "swapExactTokensForETH", args: [input, minOut, path, address, deadline], chainId: TESTNET.id })
            : await simulateThenWrite(config, address, { address: router, abi: v2RouterAbi, functionName: "swapExactTokensForTokens", args: [input, minOut, path, address, deadline], chainId: TESTNET.id });
      } else {
        const unwrap = side === "sell" && payEth;
        const params = { tokenIn: inToken, tokenOut: outToken, fee: pool.fee, recipient: unwrap ? ROUTER_ITSELF : address, amountIn: input, amountOutMinimum: minOut, sqrtPriceLimitX96: BigInt(0) };
        hash = unwrap
          ? await simulateThenWrite(config, address, {
              address: router,
              abi: v3RouterAbi,
              functionName: "multicall",
              args: [
                [
                  encodeFunctionData({ abi: v3RouterAbi, functionName: "exactInputSingle", args: [params] }),
                  encodeFunctionData({ abi: v3RouterAbi, functionName: "unwrapWETH9", args: [minOut, address] }),
                ],
              ],
              chainId: TESTNET.id,
            })
          : await simulateThenWrite(config, address, { address: router, abi: v3RouterAbi, functionName: "exactInputSingle", args: [params], value: nativeIn ? input : undefined, chainId: TESTNET.id });
      }
      setBusy("Waiting for Base Sepolia…");
      await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
      setDone({ text: `Swapped ${amount} ${inUnit} for ${outUnit}.`, hash });
      setAmount("");
      void reads.refetch();
      void eth.refetch();
    } catch (e) {
      setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium text-chrome">Swap on Uniswap</h2>
        <TradeSettingsButton />
      </div>
      <div role="tablist" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-void/60 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
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
        {balance !== null && (
          <button type="button" onClick={() => setAmount(formatUnits(balance, inDecimals))} className="mt-1.5 font-mono text-[11.5px] text-dim hover:text-chrome">
            Balance {Number(formatUnits(balance, inDecimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} {inUnit}
          </button>
        )}
      </div>
      <dl className="space-y-1.5 rounded-lg border border-line px-3 py-2.5 text-[12.5px]">
        <div className="flex justify-between">
          <dt className="text-dim">You get about</dt>
          <dd className="font-mono text-chrome">{quote.isFetching && out === null ? "…" : out !== null ? `${Number(formatUnits(out, outDecimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${outUnit}` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">Minimum ({(slippageBps / 100).toFixed(1)}% slippage)</dt>
          <dd className="font-mono text-muted">{minOut !== null ? `${Number(formatUnits(minOut, outDecimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${outUnit}` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">Route</dt>
          <dd className="text-muted">Your wallet → {venueLabel(pool)}</dd>
        </div>
      </dl>
      {!isConnected ? (
        <button type="button" onClick={openConnect} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold")}>
          Connect wallet to swap
        </button>
      ) : (
        <button
          type="button"
          disabled={busy !== null || input === null || minOut === null || over}
          onClick={() => void swap()}
          className={buttonClass(side, "md", "w-full rounded-xl font-semibold")}
        >
          {over ? `Not enough ${inUnit}` : `${side === "buy" ? "Buy" : "Sell"} $${symbol}`}
        </button>
      )}
      {busy && (
        <p role="status" className="flex items-center gap-2 text-[12px] text-chrome">
          <KineticLoader className="text-chrome" /> {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-lg border border-line-2 px-3 py-2 text-[12px] text-chrome">
          {done.text}{" "}
          <a href={`${TESTNET_EXPLORER}/tx/${done.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-muted underline decoration-line-2">
            {short(done.hash)}
          </a>
        </p>
      )}
      <p className="text-[11.5px] leading-relaxed text-dim">
        This token isn&apos;t a Crux launch, so the trade goes straight from your wallet to Uniswap: no Crux intent, solver or batch. Your minimum is
        enforced by the Uniswap router.
      </p>
    </div>
  );
}
