"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { KineticLoader } from "@/components/ui/Modal";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { fmtTokens, fmtUsdc, launchError, type OnStep, type TxStep } from "@/lib/launch";
import type { AuctionV2, PhaseV2 } from "@/lib/launchV2";

const ZERO = BigInt(0);

type Notice = { key: string; text: string; action: string; run: (onStep: OnStep) => Promise<Hex | undefined>; done: string };

/**
 * Money waiting for this wallet, as one slim line above the terminal: auction tokens or a refund to claim,
 * and (for the creator) vested funds to release. Renders nothing when there is nothing to collect.
 */
export function NoticeBanner({ model, auction, phase, symbol }: { model: LaunchV2Model; auction: AuctionV2; phase: PhaseV2; symbol: string }) {
  const [busy, setBusy] = useState<TxStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash?: Hex } | null>(null);

  const notices: Notice[] = [];
  const { tokens, refund } = model.myClaim;
  if ((phase === "graduated" || phase === "cancelled") && (tokens > ZERO || refund > ZERO)) {
    const parts = [tokens > ZERO ? `${fmtTokens(tokens)} ${symbol}` : null, refund > ZERO ? `$${fmtUsdc(refund)} USDC refund` : null].filter(Boolean);
    notices.push({ key: "claim", text: `You have ${parts.join(" + ")} to claim from this auction`, action: "Claim now", run: model.claim, done: "Claimed." });
  }
  const isCreator = model.account !== null && model.account.toLowerCase() === auction.creator.toLowerCase();
  const vested = model.creatorVested;
  if (isCreator && phase === "graduated" && (vested.quote > ZERO || vested.tokens > ZERO)) {
    const parts = [vested.quote > ZERO ? `$${fmtUsdc(vested.quote)} USDC` : null, vested.tokens > ZERO ? `${fmtTokens(vested.tokens)} ${symbol}` : null].filter(Boolean);
    notices.push({ key: "vesting", text: `Creator vesting: ${parts.join(" + ")} releasable`, action: "Release", run: model.claimVesting, done: "Vested funds released." });
  }

  if (notices.length === 0 && !done && !error) return null;

  const run = async (n: Notice) => {
    setError(null);
    setDone(null);
    try {
      const hash = await n.run(setBusy);
      setDone({ text: n.done, hash });
    } catch (err) {
      setError(launchError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="region" aria-label="Funds to collect" className="border-b border-line bg-panel">
      {notices.map((n) => (
        <div key={n.key} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 sm:px-5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[12.5px] text-chrome">{n.text}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run(n)}
            className="inline-flex h-7 items-center gap-2 rounded-[4px] border border-signal/70 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-signal transition-colors hover:border-signal hover:bg-signal/[0.08] disabled:opacity-50"
          >
            {busy ? <KineticLoader /> : null}
            {busy ? busy.label : n.action}
          </button>
        </div>
      ))}
      {(error || done) && (
        <p role={error ? "alert" : "status"} className={`px-4 pb-2 text-[11.5px] sm:px-5 ${error ? "text-down" : "text-muted"} ${notices.length === 0 ? "pt-2" : ""}`}>
          {error ?? done?.text}{" "}
          {done?.hash && (
            <a href={`${TESTNET_EXPLORER}/tx/${done.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-line-2 hover:text-chrome">
              {done.hash.slice(0, 10)}…
            </a>
          )}
        </p>
      )}
    </div>
  );
}
