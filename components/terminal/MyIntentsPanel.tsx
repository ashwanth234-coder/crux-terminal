"use client";

import { useState, useSyncExternalStore } from "react";
import { erc20Abi, formatUnits, parseAbi, type Hex } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { cruxSettlerAbi } from "@/contracts/abis/erc7683";
import { useMyIntents, type MyIntent } from "@/hooks/useMyIntents";
import { useBatchClock } from "@/lib/batch";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { ARBITRUM, ARBITRUM_EXPLORER, ARBITRUM_USDC, CROSS_CHAIN_SETTLER } from "@/lib/crosschain";
import { SETTLER, SETTLER_DEPLOYED, SETTLER_VERSION, TESTNET_USDC } from "@/lib/intents";
import { StatusTag } from "@/components/ui/StatusTag";
import { simulateThenWrite } from "@/lib/preflight";

const noopSubscribe = () => () => {};

// Block timestamps trail the wall clock by a few seconds; wait them out so the
// refund call isn't estimated against a block still inside the grace period.
const BLOCK_LAG_SECONDS = 10;

const usdcFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

function shortId(id: Hex) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function countdown(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}:${pad(s)}`;
}

/** The settler's refund reverts, so the pre-flight check can name them. */
const refundAbi = [
  ...cruxSettlerAbi,
  ...parseAbi(["error RefundNotYetAvailable()", "error AlreadyFilled()", "error OrderNotOpen()"]),
] as const;

function errorMessage(err: unknown) {
  const e = err as { name?: string; shortMessage?: string; message?: string };
  const text = `${e.shortMessage} ${e.message}`;
  if (e.name === "UserRejectedRequestError" || /reject/i.test(e.shortMessage ?? "")) return "Rejected in wallet.";
  if (/RefundNotYetAvailable/.test(text)) return "Not refundable yet. Try again in a moment.";
  if (/AlreadyFilled/.test(text)) return "A solver already filled this order, so it can't be refunded. It settles to the solver shortly.";
  if (/OrderNotOpen/.test(text)) return "This order is already settled or refunded.";
  return e.shortMessage ?? e.message?.split("\n")[0] ?? "Refund failed";
}

type Refund = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "sent"; hash: Hex } | { kind: "error"; message: string };

export function IntentRow({ intent, now, onRefunded }: { intent: MyIntent; now: number | null; onRefunded: () => void }) {
  // Buys escrow test USDC (on Arbitrum for a cross-chain order); a launch-token sell escrows the token itself
  // (Crux launch tokens have 18 decimals).
  const cross = intent.origin === "arbitrum";
  const chain = cross ? ARBITRUM : TESTNET;
  const settler = cross ? CROSS_CHAIN_SETTLER : SETTLER;
  const explorer = cross ? ARBITRUM_EXPLORER : TESTNET_EXPLORER;
  const escrowsUsdc = intent.token === null || [TESTNET_USDC, ARBITRUM_USDC].some((u) => u.toLowerCase() === intent.token!.toLowerCase());
  const { data: tokenSymbol } = useReadContract({
    address: intent.token ?? undefined,
    abi: erc20Abi,
    functionName: "symbol",
    chainId: chain.id,
    query: { enabled: !escrowsUsdc, staleTime: Infinity },
  });
  const unit = escrowsUsdc ? "USDC" : tokenSymbol ? `$${tokenSymbol}` : "tokens";
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const [refund, setRefund] = useState<Refund>({ kind: "idle" });

  const open = intent.status === "open";
  const left = open && intent.refundAt !== null && now !== null ? intent.refundAt + BLOCK_LAG_SECONDS - now : null;
  const refundable = left !== null && left <= 0;

  const reclaim = async () => {
    if (!address) return;
    try {
      if (chainId !== chain.id) {
        setRefund({ kind: "busy", label: "Switching…" });
        await switchChain({ chainId: chain.id });
      }
      setRefund({ kind: "busy", label: "Checking…" });
      // Simulated first: a refund that would revert (too early, already settled) stops here with its reason.
      const hash = await simulateThenWrite(
        config,
        address,
        { address: settler, abi: refundAbi, functionName: "refund", args: [intent.orderId], chainId: chain.id },
        () => setRefund({ kind: "busy", label: "Confirm in wallet…" }),
      );
      setRefund({ kind: "sent", hash });
      await waitForTransactionReceipt(config, { hash, chainId: chain.id });
      onRefunded();
    } catch (err) {
      setRefund({ kind: "error", message: errorMessage(err) });
    }
  };

  const status =
    intent.status === "settled"
      ? { dot: "bg-up", label: "Filled", tone: "text-up" }
      : intent.status === "refunded"
        ? { dot: "bg-muted", label: "Refunded", tone: "text-muted" }
        : open
          ? {
              dot: "bg-signal",
              label: refundable ? "Unfilled · refund open" : cross ? "In escrow on Arbitrum · awaiting fill + proof" : "In escrow · awaiting solver",
              tone: "text-chrome/85",
            }
          : { dot: "bg-line-2", label: "Reading escrow…", tone: "text-dim" };

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(9.5rem,auto)]">
      <div className="min-w-0">
        <a
          href={`${explorer}/tx/${intent.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[12px] text-chrome/80 underline decoration-line-2 underline-offset-2 transition-colors hover:text-chrome"
          title={`Order ${intent.orderId} on ${cross ? "Arbiscan" : "Basescan"}`}
        >
          {shortId(intent.orderId)} ↗
        </a>
        <p className={`mt-1 flex items-center gap-1.5 text-[11px] ${status.tone}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
          <span className="truncate">{status.label}</span>
        </p>
      </div>

      <p className="text-right font-mono text-[12.5px] tabular-nums text-chrome">
        {intent.amount === null ? "—" : usdcFmt.format(Number(formatUnits(intent.amount, escrowsUsdc ? 6 : 18)))}
        <span className="ml-1 text-[11px] text-muted">{unit}</span>
      </p>

      <div className="col-span-2 flex flex-col items-stretch gap-1 sm:col-span-1 sm:items-end">
        {open && !refundable && left !== null && (
          <p className="text-[11px] text-muted sm:text-right">
            Refund opens in{" "}
            <span className="font-mono tabular-nums text-chrome/85" role="timer">
              {countdown(Math.max(0, left))}
            </span>
          </p>
        )}
        {open && refundable && refund.kind !== "sent" && (
          <button
            type="button"
            onClick={reclaim}
            disabled={refund.kind === "busy"}
            className={buttonClass("signal", "sm", "h-8 px-3.5 text-[12px] disabled:opacity-100")}
          >
            {refund.kind === "busy" ? (
              <>
                <KineticLoader />
                {refund.label}
              </>
            ) : (
              `Refund ${escrowsUsdc ? "test USDC" : unit}`
            )}
          </button>
        )}
        {refund.kind === "sent" && (
          <a
            href={`${explorer}/tx/${refund.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[11px] text-signal sm:justify-end"
          >
            {open && <KineticLoader />}
            {open ? "Refund confirming" : "Refunded"} ↗
          </a>
        )}
        {refund.kind === "error" && (
          <p role="alert" className="text-[11px] text-down sm:text-right">
            {refund.message}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * The connected wallet's ERC-7683 orders on the Base Sepolia settler, with a
 * refund once an unfilled order's grace period has passed. Testnet only.
 */
export function MyIntentsPanel() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { isConnected } = useConnection();
  const clock = useBatchClock();
  const { enabled, intents, isLoading, error, refetch } = useMyIntents();

  if (!hydrated || !SETTLER_DEPLOYED || !isConnected || !enabled) return null;

  const openCount = intents.filter((i) => i.status === "open").length;

  return (
    <section aria-labelledby="my-intents-title" className="border-t border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <h3 id="my-intents-title" className="text-[13px] text-chrome">
            My intents
          </h3>
          <StatusTag status="testnet" label="Base + Arbitrum Sepolia" />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-dim">
          {intents.length > 0 && (
            <span>
              <span className="font-mono tabular-nums text-muted">{openCount}</span> in escrow
            </span>
          )}
          <button type="button" onClick={() => void refetch()} className={buttonClass("ghost", "sm", "h-7 px-2 text-[11px]")}>
            Refresh
          </button>
        </div>
      </div>
      <p className="mt-1.5 max-w-[46rem] text-[11.5px] leading-relaxed text-muted">
        Orders opened from this wallet escrow their input (test USDC, or the launch token you sell) until a solver fills
        them. Testnet only: unfilled orders can be refunded{" "}
        {SETTLER_VERSION === 3 ? "as soon as their fill deadline passes (10 minutes)" : "1 hour after their fill deadline"}; orders paid from
        Arbitrum, 6 hours after it if no fill proof arrived.
      </p>

      {error && intents.length === 0 ? (
        <p role="alert" className="mt-4 text-[12px] text-down">
          Couldn&apos;t read the settler on Base Sepolia.{" "}
          <button type="button" onClick={() => void refetch()} className="text-chrome underline decoration-line-2 underline-offset-2">
            Retry
          </button>
        </p>
      ) : isLoading ? (
        <div className="mt-4 space-y-3" aria-label="Loading intents">
          {[0, 1].map((i) => (
            <span key={i} className="block h-9 rounded-md bg-line/70" />
          ))}
        </div>
      ) : intents.length === 0 ? (
        <p className="mt-4 text-[12px] text-dim">No intents opened from this wallet yet.</p>
      ) : (
        <ul className="mt-2 max-h-[18rem] divide-y divide-line overflow-y-auto">
          {intents.map((intent) => (
            <IntentRow key={intent.orderId} intent={intent} now={clock?.now ?? null} onRefunded={() => void refetch()} />
          ))}
        </ul>
      )}
    </section>
  );
}
