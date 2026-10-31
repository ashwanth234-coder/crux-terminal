"use client";

import { useState } from "react";
import { erc20Abi, formatUnits, parseAbi, type Hex } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { cruxSettlerAbi } from "@/contracts/abis/erc7683";
import type { MyIntent } from "@/hooks/useMyIntents";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { LIVE_ORIGINS, originByKey } from "@/lib/crosschain";
import { SETTLER, TESTNET_USDC } from "@/lib/intents";
import { simulateThenWrite } from "@/lib/preflight";
import { countdown, refundClock } from "@/lib/refundTime";

// Block timestamps trail the wall clock by a few seconds; wait them out so the
// refund call isn't estimated against a block still inside the grace period.
const BLOCK_LAG_SECONDS = 10;

const usdcFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

function shortId(id: Hex) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
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
  const origin = intent.origin ? originByKey(intent.origin) : null;
  const cross = origin !== null;
  const chain = origin ? origin.chain : TESTNET;
  const settler = origin ? origin.settler : (intent.settler ?? SETTLER);
  const explorer = origin ? origin.explorer : TESTNET_EXPLORER;
  const escrowsUsdc = intent.token === null || [TESTNET_USDC, ...LIVE_ORIGINS.map((o) => o.usdc)].some((u) => u.toLowerCase() === intent.token!.toLowerCase());
  // USDC is 6 decimals except BSC testnet's (18); a sold launch token has 18.
  const escrowDecimals = escrowsUsdc ? (origin?.decimals ?? 6) : 18;
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
  // Past its fill deadline with no fill: say exactly when the refund opens.
  const late = open && !refundable && now !== null && intent.fillDeadline !== null && now > intent.fillDeadline && intent.refundAt !== null;

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
              label: refundable
                ? "Not filled in time · refund open"
                : late
                  ? `Not filled in time · refund available at ${refundClock(intent.refundAt! + BLOCK_LAG_SECONDS, now!)}`
                  : cross
                    ? `In escrow on ${origin!.name} · awaiting fill + proof`
                    : "In escrow · awaiting solver",
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
          title={`Order ${intent.orderId} on ${cross ? `${origin!.name}'s explorer` : "Basescan"}`}
        >
          {shortId(intent.orderId)} ↗
        </a>
        <p className={`mt-1 flex items-center gap-1.5 text-[11px] ${status.tone}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
          <span className="truncate">{status.label}</span>
        </p>
      </div>

      <p className="text-right font-mono text-[12.5px] tabular-nums text-chrome">
        {intent.amount === null ? "—" : usdcFmt.format(Number(formatUnits(intent.amount, escrowDecimals)))}
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
            className={buttonClass("primary", "sm", "h-8 px-3.5 text-[12px] disabled:opacity-100")}
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
