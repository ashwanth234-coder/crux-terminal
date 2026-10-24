"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { readContract } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { cruxSettlerAbi } from "@/contracts/abis/erc7683";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { ONE_CLICK_LIVE, SETTLER } from "@/lib/intents";
import { formatRemaining } from "@/lib/launch";
import {
  MAX_CAP_USDC,
  forgetSession,
  loadSession,
  remainingCap,
  revokeOnChain,
  startSession,
  type LoginStep,
  type StoredSession,
} from "@/lib/session";

const STEP_LABEL: Record<LoginStep, string> = {
  approving: "Approve Permit2 in your wallet (once, for test USDC)…",
  "signing-session": "Signature 1 of 2: your one-click session…",
  "signing-permit": "Signature 2 of 2: the Permit2 spending cap…",
  submitting: "Starting your session…",
};

const CAPS = [25, 100, 500];

/** The connected wallet's one-click session in this browser, what's left of its cap, and the login. */
export function useOneClick() {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const [step, setStep] = useState<LoginStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  // This browser's session key for the wallet (localStorage) and what's left of its cap (Permit2).
  const state = useQuery({
    queryKey: ["one-click", address],
    queryFn: async (): Promise<{ session: StoredSession | null; remaining: bigint | null }> => {
      const session = loadSession(address!);
      if (!session) return { session: null, remaining: null };
      const r = await remainingCap(config, address!).catch(() => null);
      // The allowance is the session's cap, lowered by every buy; a newer login elsewhere replaces it.
      return { session, remaining: r ? (r.expiration === session.expiry ? r.amount : BigInt(0)) : null };
    },
    enabled: ONE_CLICK_LIVE && Boolean(address),
    refetchInterval: 15_000,
  });
  const session = state.data?.session ?? null;
  const remaining = state.data?.remaining ?? null;
  const refresh = async () => {
    await state.refetch();
  };

  const start = async (capUsdc: number) => {
    if (!address) return;
    setError(null);
    try {
      if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
      await startSession(config, address, parseUnits(String(capUsdc), 6), setStep);
      await refresh();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(/rejected|denied|cancel/i.test(msg) ? "Cancelled in the wallet. Nothing changed." : msg.split("\n")[0]);
    } finally {
      setStep(null);
    }
  };

  const turnOff = async (onChain: boolean) => {
    if (!address) return;
    setError(null);
    try {
      if (onChain) {
        if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
        await revokeOnChain(config, address);
      } else forgetSession(address);
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    }
    await refresh();
  };

  return { live: ONE_CLICK_LIVE && Boolean(address), session, remaining, step, error, start, turnOff, refresh };
}

export type OneClick = ReturnType<typeof useOneClick>;

/** The one-click switch above the Buy button: enable with a cap, or the live session's state and its off switch. */
export function OneClickBar({ oneClick }: { oneClick: OneClick }) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState("100");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!oneClick.live) return null;
  const { session, remaining, step, error } = oneClick;
  const capNum = Number(cap);
  const capValid = Number.isFinite(capNum) && capNum > 0 && capNum <= MAX_CAP_USDC;

  if (session) {
    const left = remaining !== null ? Number(formatUnits(remaining, 6)) : null;
    return (
      <div className="rounded-lg border border-up/30 bg-up/[0.04] px-3 py-2 text-[11.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-up">One-click on</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => void oneClick.turnOff(false)} className="text-muted underline decoration-line-2 hover:text-chrome">
              Turn off
            </button>
          </span>
        </div>
        <p className="mt-1 leading-snug text-muted">
          {left !== null ? `$${left.toLocaleString("en-US", { maximumFractionDigits: 2 })} of $${Number(formatUnits(BigInt(session.cap), 6)).toLocaleString("en-US")} left` : "Reading your cap…"} ·{" "}
          {formatRemaining(Math.max(0, session.expiry - now))} left. Buys go through without a wallet popup; tokens always land in your wallet.{" "}
          <button type="button" onClick={() => void oneClick.turnOff(true)} className="underline decoration-line-2 hover:text-chrome">
            Revoke on-chain
          </button>
        </p>
        {error && <p className="mt-1 text-down">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[11.5px] text-muted hover:border-line-2 hover:text-chrome">
        <span>
          <span className="text-chrome">One-click trading</span> · off
        </span>
        <span className="underline decoration-line-2">Enable</span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line p-3 text-[11.5px]">
      <p className="text-[12.5px] text-chrome">Enable one-click trading</p>
      <p className="mt-1 leading-snug text-muted">
        For 24 hours, buys go through without a wallet popup, up to a spending cap you choose. Your USDC stays in your wallet until each buy, and
        what you buy always goes to your wallet. A key kept in this browser signs the buys; it can&apos;t withdraw anything.
      </p>
      <div className="mt-2 flex items-center gap-1.5" role="radiogroup" aria-label="Spending cap">
        {CAPS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cap === String(c)}
            onClick={() => setCap(String(c))}
            className={`h-7 rounded-[4px] border px-2 font-mono transition-colors ${cap === String(c) ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
          >
            ${c}
          </button>
        ))}
        <label className="flex h-7 items-center gap-1 rounded-[4px] border border-line-2 px-2 text-muted">
          $
          <input
            inputMode="decimal"
            aria-label="Custom cap in USDC"
            value={cap}
            onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))}
            className="w-20 bg-transparent font-mono text-chrome outline-none"
          />
        </label>
      </div>
      {!capValid && <p className="mt-1 text-down">Choose a cap between $1 and ${MAX_CAP_USDC.toLocaleString("en-US")}.</p>}
      <p className="mt-2 leading-snug text-dim">
        First time only: one approval transaction (Permit2, for test USDC). Then two signatures, no gas. Turn it off or revoke it any time.
      </p>
      {step ? (
        <p role="status" className="mt-2 text-chrome">
          {STEP_LABEL[step]}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!capValid} onClick={() => void oneClick.start(capNum)} className={buttonClass("signal", "sm", "rounded-lg")}>
            Enable · ${capValid ? capNum.toLocaleString("en-US") : "…"} cap
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-muted underline decoration-line-2 hover:text-chrome">
            Not now
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-down">{error}</p>}
    </div>
  );
}

export type OneClickOrder = { kind: "sending" } | { kind: "open"; orderId: Hex } | { kind: "filled"; orderId: Hex } | { kind: "refunded"; orderId: Hex } | { kind: "error"; message: string };

/** Follows a one-click order on the settler until it settles (filled) or is refunded. */
export function useOrderWatch(order: OneClickOrder | null, setOrder: (o: OneClickOrder) => void) {
  const config = useConfig();
  const orderId = order?.kind === "open" ? order.orderId : null;
  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    const tick = async () => {
      const escrow = await readContract(config, { chainId: TESTNET.id, address: SETTLER as Address, abi: cruxSettlerAbi, functionName: "escrows", args: [orderId] }).catch(() => null);
      const status = escrow ? Number(escrow[4]) : 0;
      if (stop) return;
      if (status === 2) setOrder({ kind: "filled", orderId });
      else if (status === 3) setOrder({ kind: "refunded", orderId });
    };
    const t = setInterval(() => void tick(), 2_000);
    void tick();
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [orderId, config, setOrder]);
}

/** The last one-click order's state, under the Buy button. */
export function OneClickOrderStatus({ order }: { order: OneClickOrder | null }) {
  if (!order) return null;
  const link = (id: Hex) => (
    <a href={`${TESTNET_EXPLORER}/address/${SETTLER}#events`} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-line-2">
      {`${id.slice(0, 6)}…${id.slice(-4)}`}
    </a>
  );
  return (
    <p role="status" className={`text-[11.5px] leading-snug ${order.kind === "error" ? "text-down" : order.kind === "filled" ? "text-up" : "text-muted"}`}>
      {order.kind === "sending" && "Signed in this browser · opening it on Base…"}
      {order.kind === "open" && <>Order {link(order.orderId)} open · the solver fills it in the next 10-second batch…</>}
      {order.kind === "filled" && <>Filled · order {link(order.orderId)} delivered to your wallet.</>}
      {order.kind === "refunded" && <>Order {link(order.orderId)} wasn&apos;t filled and was refunded to your wallet.</>}
      {order.kind === "error" && order.message}
    </p>
  );
}
