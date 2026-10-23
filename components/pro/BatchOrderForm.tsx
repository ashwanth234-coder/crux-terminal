"use client";

import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, erc20Abi, formatUnits, parseEventLogs, parseUnits, zeroAddress, type Hex } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { useExactApproval } from "@/hooks/useExactApproval";
import type { LaunchMarket } from "@/hooks/useLaunchMarket";
import { BATCH_SECONDS, POOL_ERRORS, batchAt, batchPoolAbi, soloOut } from "@/lib/batchPool";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { SLIPPAGE_BPS, TESTNET_USDC } from "@/lib/intents";
import { formatRemaining, launchError } from "@/lib/launch";
import { logClient } from "@/lib/logs";
import { simulateThenWrite } from "@/lib/preflight";
import { useConnectModal } from "@/providers/Web3Provider";

type Side = "buy" | "sell";
type Flow =
  | { kind: "idle" }
  | { kind: "switching" | "approving" | "placing" }
  | { kind: "placed"; batch: bigint; closesAt: number; hash: Hex; block: bigint; side: Side }
  | { kind: "error"; message: string };

const ORDER_FILLED = batchPoolAbi.find((x) => x.type === "event" && x.name === "OrderFilled")!;
const ORDER_REFUNDED = batchPoolAbi.find((x) => x.type === "event" && x.name === "OrderRefunded")!;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const usd6 = (v: bigint) => `$${Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

function parse(value: string, decimals: number): bigint | null {
  try {
    const v = value ? parseUnits(value, decimals) : null;
    return v !== null && v > BigInt(0) ? v : null;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown) {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name && POOL_ERRORS[name]) return POOL_ERRORS[name];
  }
  return launchError(err);
}

/** A wall clock ticking every second, for the batch countdown. */
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * A V5 launch inside its 24-hour protection: orders go straight into the batch pool's current 60-second batch,
 * which clears at one uniform price on-chain. The minimum signed here is the order's protection: if the batch's
 * price would give less, the whole order is refunded instead of filling worse.
 */
export function BatchOrderForm({ market, symbol }: { market: LaunchMarket; symbol: string }) {
  const uid = useId();
  const config = useConfig();
  const { address, chainId, isConnected } = useConnection();
  const { openConnect } = useConnectModal();
  const { mutateAsync: switchChain } = useSwitchChain();
  const approveExact = useExactApproval();
  const now = useNow();
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });

  const pool = market.batchPool!;
  const seededAt = market.seededAt ?? now;
  const { batch, closesAt } = batchAt(seededAt, now);
  const on = { chainId: TESTNET.id } as const;

  const usdc = useReadContract({
    ...on,
    address: TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });
  const book = useReadContract({
    ...on,
    address: pool,
    abi: batchPoolAbi,
    functionName: "batchOrders",
    args: [market.token, BigInt(batch)],
    query: { refetchInterval: 5_000 },
  });
  const [buys = [], sells = []] = book.data ?? [];
  const mine = (orders: readonly { owner: string }[]) => Boolean(address) && orders.some((o) => o.owner.toLowerCase() === address!.toLowerCase());
  const alreadyThisSide = side === "buy" ? mine(buys) : mine(sells);

  const decimals = side === "buy" ? 6 : market.decimals;
  const input = parse(amount, decimals);
  const balance = side === "buy" ? (address ? (usdc.data ?? null) : null) : market.tokenBalance;
  const reserves = market.reserves;
  const quote = input && reserves ? (side === "buy" ? soloOut(input, reserves.usdc, reserves.token) : soloOut(input, reserves.token, reserves.usdc)) : null;
  const minOut = quote !== null ? (quote * BigInt(10_000 - SLIPPAGE_BPS)) / BigInt(10_000) : null;
  const tokens = (v: bigint) => `${Number(formatUnits(v, market.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}`;
  const outFmt = (v: bigint, s: Side = side) => (s === "buy" ? tokens(v) : usd6(v));

  const overBalance = input !== null && balance !== null && input > balance;
  const busy = flow.kind === "switching" || flow.kind === "approving" || flow.kind === "placing";
  const disabled = busy || !input || !quote || quote === BigInt(0) || overBalance || alreadyThisSide;

  // After placing: the order's own outcome, read from the pool's events for its batch.
  const placed = flow.kind === "placed" ? flow : null;
  const outcome = useQuery({
    queryKey: ["batch-order", pool, market.token, placed?.batch.toString(), address],
    enabled: placed !== null && Boolean(address),
    refetchInterval: (q) => (q.state.data ? false : 4_000),
    queryFn: async () => {
      const args = { token: market.token, batch: placed!.batch, owner: address! };
      const [filled] = await logClient.getLogs({ address: pool, event: ORDER_FILLED, args, fromBlock: placed!.block });
      if (filled) return { kind: "filled" as const, out: filled.args.amountOut!, hash: filled.transactionHash };
      const [refunded] = await logClient.getLogs({ address: pool, event: ORDER_REFUNDED, args, fromBlock: placed!.block });
      if (refunded) return { kind: "refunded" as const, hash: refunded.transactionHash };
      return null;
    },
  });

  const submit = async () => {
    if (!isConnected || !address) {
      openConnect();
      return;
    }
    if (disabled || !input || minOut === null) return;
    try {
      if (chainId !== TESTNET.id) {
        setFlow({ kind: "switching" });
        await switchChain({ chainId: TESTNET.id });
      }
      // Exactly this order's input, never an unlimited allowance.
      await approveExact(
        { token: side === "buy" ? TESTNET_USDC : market.token, owner: address, spender: pool, amount: input },
        { onPrompt: () => setFlow({ kind: "approving" }) },
      );
      const hash = await simulateThenWrite(
        config,
        address,
        { address: pool, abi: batchPoolAbi, functionName: side, args: [market.token, input, minOut], chainId: TESTNET.id },
        () => setFlow({ kind: "placing" }),
      );
      setFlow({ kind: "placing" });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
      const [event] = parseEventLogs({ abi: batchPoolAbi, eventName: "OrderPlaced", logs: receipt.logs });
      if (receipt.status !== "success" || !event) throw new Error("The order didn't land. Nothing was escrowed.");
      const placedBatch = event.args.batch;
      setFlow({ kind: "placed", batch: placedBatch, closesAt: seededAt + (Number(placedBatch) + 1) * BATCH_SECONDS, hash, block: receipt.blockNumber, side });
      setAmount("");
    } catch (err) {
      setFlow({ kind: "error", message: errorMessage(err) });
    }
  };

  const label = !isConnected
    ? "Connect wallet to trade"
    : flow.kind === "switching"
      ? "Switching to Base Sepolia…"
      : flow.kind === "approving"
        ? `Approving ${side === "buy" ? "test USDC" : symbol}…`
        : flow.kind === "placing"
          ? "Placing order…"
          : alreadyThisSide
            ? `You have a ${side} in this batch`
            : overBalance
              ? `Not enough ${side === "buy" ? "test USDC" : symbol}`
              : `Place ${side} in batch #${batch}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-line bg-void/60 px-3 py-2.5 text-[11.5px] leading-snug">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-chrome">Batch #{batch}</span>
          <span className="font-mono tabular-nums text-chrome" role="timer">
            clears in {formatRemaining(Math.max(0, closesAt - now))}
          </span>
        </p>
        <p className="mt-1 text-dim">
          So far: {buys.length} buy{buys.length === 1 ? "" : "s"} · {sells.length} sell{sells.length === 1 ? "" : "s"}. Everyone in the batch
          gets one price.
        </p>
      </div>

      <div role="tablist" aria-label="Order side" className="grid grid-cols-2 rounded-lg bg-void/60 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
            }}
            className={`h-8 rounded-md text-[12.5px] capitalize transition-colors ${side === s ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <label htmlFor={`${uid}-amt`} className="sr-only">
        {side === "buy" ? "USDC to spend" : `${symbol} to sell`}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2.5 focus-within:border-line-2">
        {side === "buy" && <span className="font-mono text-dim">$</span>}
        <input
          id={`${uid}-amt`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-full min-w-0 bg-transparent font-mono text-[20px] text-chrome outline-none placeholder:text-dim"
        />
        <span className="shrink-0 text-[12px] text-muted">{side === "buy" ? "USDC" : symbol}</span>
      </div>
      <div className="-mt-1.5 flex items-baseline justify-between text-[11px] text-dim">
        <span>{side === "buy" ? "Base Sepolia test USDC" : `Selling ${symbol}`}</span>
        <button
          type="button"
          disabled={!balance}
          onClick={() => balance && setAmount(formatUnits(balance, decimals))}
          className="font-mono text-muted hover:text-chrome disabled:hover:text-muted"
        >
          Bal {balance === null ? "…" : side === "buy" ? usd6(balance) : tokens(balance)}
        </button>
      </div>

      {quote !== null && minOut !== null && (
        <dl className="divide-y divide-line rounded-lg border border-line text-[12px]">
          <div className="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt className="text-muted">If alone in the batch</dt>
            <dd className="font-mono text-chrome">{outFmt(quote)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt className="text-muted">Your minimum (signed)</dt>
            <dd className="font-mono text-chrome">{outFmt(minOut)}</dd>
          </div>
          <p className="px-3 py-2 text-[11px] leading-snug text-dim">
            Buys and sells in the batch are matched first; only the net trades against the pool. If the batch&apos;s one price gives you less
            than {(SLIPPAGE_BPS / 100).toFixed(1)}% under this quote, your whole order is refunded.
          </p>
        </dl>
      )}

      <button type="button" disabled={isConnected && disabled} onClick={submit} className={buttonClass("signal", "md", "w-full rounded-xl font-semibold")}>
        {busy && <KineticLoader />}
        {label}
        {!busy && <ArrowUpRight />}
      </button>

      {flow.kind === "error" && (
        <p role="alert" className="text-[12px] leading-snug text-down">
          {flow.message}
        </p>
      )}
      {placed && (
        <div role="status" aria-live="polite" className="rounded-lg border border-line px-3 py-2.5 text-[12px] leading-snug">
          {outcome.data?.kind === "filled" ? (
            <p className="text-up">
              Filled in batch #{placed.batch.toString()}: {placed.side === "buy" ? "received" : "paid"} {outFmt(outcome.data.out, placed.side)} at the
              batch&apos;s one price.{" "}
              <a href={`${TESTNET_EXPLORER}/tx/${outcome.data.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-line-2">
                {short(outcome.data.hash)}
              </a>
            </p>
          ) : outcome.data?.kind === "refunded" ? (
            <p className="text-muted">
              Batch #{placed.batch.toString()} cleared below your minimum, so your whole order was refunded. Nothing filled worse than you signed.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-chrome/85">
              <KineticLoader className="mt-0.5 shrink-0 text-signal" />
              <span>
                In batch #{placed.batch.toString()}.{" "}
                {now < placed.closesAt ? `It clears in ${formatRemaining(placed.closesAt - now)}` : "Clearing now (closed batches clear within seconds)"}.{" "}
                <a href={`${TESTNET_EXPLORER}/tx/${placed.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-line-2">
                  {short(placed.hash)}
                </a>
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
