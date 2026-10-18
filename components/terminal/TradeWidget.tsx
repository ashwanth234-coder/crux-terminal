"use client";

import { useId, useState } from "react";
import { parseUnits } from "viem";
import { useConnection } from "wagmi";
import { ArrowRight, buttonClass } from "@/components/ui/Button";
import { KineticLoader } from "@/components/ui/Modal";
import { TokenGlyph } from "./TokenGlyph";
import { PayWithSelect } from "./PayWithSelect";
import { IntentModal } from "./IntentModal";
import { useUnifiedBalance } from "@/hooks/useUnifiedBalance";
import { useFarcaster } from "@/providers/FarcasterProvider";
import { useConnectModal } from "@/providers/Web3Provider";
import type { CruxIntentResult } from "@/lib/farcaster";
import { NOVA_ASSET, sourceAsset, type OrderDraft, type Side } from "@/lib/order";
import { ORB_TOKENS, PAY_SOURCES, usd, type PaySourceId } from "@/lib/tokens";

type Status = { kind: "idle" } | { kind: "pending" } | { kind: "done"; result: CruxIntentResult };

const NOVA = ORB_TOKENS[0];

const ORIGIN: Record<PaySourceId, string> = {
  unified: "Auto-routed",
  "base-usdc": "Base",
  "solana-usdc": "Solana",
  "robinhood-usdc": "Robinhood Chain",
};

const STATUS_COPY: Record<CruxIntentResult["status"], (r: CruxIntentResult) => string> = {
  submitted: (r) => `Swap submitted · ${r.status === "submitted" ? r.transactions.length : 0} tx`,
  rejected: () => "Swap cancelled in wallet",
  failed: (r) => (r.status === "failed" ? r.message : "Swap failed"),
  unsupported: () => "Swap form is only available inside Farcaster.",
};

export function TradeWidget() {
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("100");
  const [source, setSource] = useState<PaySourceId>("unified");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [order, setOrder] = useState<OrderDraft | null>(null);
  const inputId = useId();

  const balance = useUnifiedBalance();
  const { isConnected } = useConnection();
  const { isFarcaster, triggerSwap } = useFarcaster();
  const { openConnect } = useConnectModal();

  const qty = Number.parseFloat(amount) || 0;
  const notional = qty * NOVA.price;
  const available = balance.availableFor(source);
  const overBudget = side === "buy" && notional > available;
  const paySource = PAY_SOURCES.find((s) => s.id === source) ?? PAY_SOURCES[0];

  const largestChain = [...balance.chains].sort((a, b) => b.usd - a.usd)[0];
  const originLabel = source === "unified" ? `Auto-routed · ${largestChain?.usd ? largestChain.label : "Base"}` : ORIGIN[source];

  const review = async () => {
    if (qty <= 0 || overBudget) return;

    // 1. Inside Farcaster: hand off to the host's native swap form.
    if (isFarcaster) {
      setStatus({ kind: "pending" });
      const pay = sourceAsset(source);
      const result =
        side === "buy"
          ? await triggerSwap({ buyToken: NOVA_ASSET.caip19, sellToken: pay.caip19, sellAmount: Number(notional.toFixed(2)), sellDecimals: pay.decimals })
          : await triggerSwap({ buyToken: pay.caip19, sellToken: NOVA_ASSET.caip19, sellAmount: qty, sellDecimals: NOVA_ASSET.decimals });
      setStatus({ kind: "done", result });
      return;
    }

    // 2. Browser without a wallet: connect first.
    if (!isConnected) {
      openConnect();
      return;
    }

    // 3. Browser with a wallet: review and sign the ERC-7683 intent.
    setOrder({ side, symbol: NOVA.symbol, qty, price: NOVA.price, notional, source: paySource, originLabel });
  };

  // Validate the amount parses at token precision so signing can't throw later.
  const invalid = (() => {
    try {
      parseUnits(qty.toFixed(6), NOVA_ASSET.decimals);
      return false;
    } catch {
      return true;
    }
  })();

  const disabled = status.kind === "pending" || qty <= 0 || overBudget || invalid;

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-void/60 p-3">
      <div role="tablist" aria-label="Order side" className="grid grid-cols-2 rounded-lg bg-panel-2 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            type="button"
            onClick={() => {
              setSide(s);
              setStatus({ kind: "idle" });
            }}
            className={`h-8 rounded-md text-[12px] capitalize transition-colors ${
              side === s ? (s === "buy" ? "bg-line-2 text-chrome" : "bg-down/15 text-down") : "text-muted hover:text-chrome"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
        <span className="flex items-center gap-2.5">
          <TokenGlyph symbol="NOVA" className="h-6 w-6" />
          <span className="font-mono text-[12px] font-semibold">$NOVA</span>
        </span>
        <span className="font-mono text-[11px] text-muted">{usd.format(NOVA.price)}</span>
      </div>

      <div className="mt-2 rounded-lg border border-line px-3 py-2.5 focus-within:border-line-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="sr-only">
            Amount of NOVA to {side}
          </label>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              const next = e.target.value.replace(/[^0-9.]/g, "");
              // Allow a single decimal point.
              if (next.split(".").length <= 2) setAmount(next);
              setStatus({ kind: "idle" });
            }}
            className="w-full min-w-0 bg-transparent font-mono text-[22px] text-chrome outline-none placeholder:text-dim"
            placeholder="0"
          />
          <span className="shrink-0 rounded-full border border-line-2 px-2 py-1 font-mono text-[10px] text-muted">NOVA</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between font-mono text-[11px]">
          <span className={overBudget ? "text-down" : "text-muted"}>≈{usd.format(notional)}</span>
          {side === "buy" && (
            <button
              type="button"
              onClick={() => setAmount(available > 0 ? (Math.floor((available / NOVA.price) * 100) / 100).toString() : "0")}
              className="text-dim transition-colors hover:text-acid"
            >
              Max
            </button>
          )}
        </div>
      </div>

      <div className="mt-2">
        <PayWithSelect
          value={source}
          onChange={setSource}
          availableFor={balance.availableFor}
          label={side === "buy" ? "Pay with" : "Receive to"}
          unavailable={balance.mode === "live" ? { "solana-usdc": "Link a Solana wallet to use" } : {}}
        />
      </div>

      <button
        type="button"
        onClick={review}
        disabled={disabled}
        className={buttonClass("acid", "sm", "mt-3 h-10 w-full rounded-lg text-[13px] font-semibold")}
      >
        {status.kind === "pending" ? (
          <>
            <KineticLoader /> Opening swap…
          </>
        ) : overBudget ? (
          "Insufficient buying power"
        ) : (
          <>
            Review Intent <ArrowRight />
          </>
        )}
      </button>

      <p aria-live="polite" className="mt-2 min-h-[30px] text-center text-[11px] leading-snug text-muted">
        {status.kind === "done" ? (
          <span className={status.result.status === "submitted" ? "text-acid" : status.result.status === "failed" ? "text-down" : ""}>
            {STATUS_COPY[status.result.status](status.result)}
          </span>
        ) : !isConnected && !isFarcaster ? (
          <>Connect a wallet to sign · demo balances shown</>
        ) : (
          <>Fast execution · Best price · Powered by Solvers</>
        )}
      </p>

      <IntentModal order={order} open={order !== null} onClose={() => setOrder(null)} />
    </div>
  );
}
