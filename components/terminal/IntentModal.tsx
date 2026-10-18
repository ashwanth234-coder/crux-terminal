"use client";

import { useState } from "react";
import { parseUnits, type Hex } from "viem";
import { useConnection, useSignTypedData } from "wagmi";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { BATCH_WINDOW_SECONDS, SETTLER_DEPLOYED, SLIPPAGE_BPS, buildGaslessOrder } from "@/lib/intents";
import { NOVA_ASSET, clearingLimit, minReceived, sourceAsset, type OrderDraft } from "@/lib/order";
import { usd } from "@/lib/tokens";

type SignState = { kind: "idle" } | { kind: "signing" } | { kind: "signed"; signature: Hex } | { kind: "error"; message: string };

const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const priceFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={`text-right font-mono text-[12.5px] ${accent ? "text-acid" : "text-chrome"}`}>{value}</dd>
    </div>
  );
}

export function IntentModal({ order, open, onClose }: { order: OrderDraft | null; open: boolean; onClose: () => void }) {
  const { address, chainId, chain } = useConnection();
  const { mutateAsync: signTypedData } = useSignTypedData();
  const [state, setState] = useState<SignState>({ kind: "idle" });

  const close = () => {
    if (state.kind === "signing") return;
    setState({ kind: "idle" });
    onClose();
  };

  if (!order) return null;

  const buying = order.side === "buy";
  const payAsset = sourceAsset(order.source.id);
  const min = minReceived(order);
  const limit = clearingLimit(order);

  const confirm = async () => {
    if (!address || !chainId) return;
    setState({ kind: "signing" });
    try {
      const input = buying
        ? { caip19: payAsset.caip19, amount: parseUnits(order.notional.toFixed(payAsset.decimals), payAsset.decimals) }
        : { caip19: NOVA_ASSET.caip19, amount: parseUnits(order.qty.toFixed(6), NOVA_ASSET.decimals) };
      const output = buying
        ? { caip19: NOVA_ASSET.caip19, amount: parseUnits(min.toFixed(6), NOVA_ASSET.decimals) }
        : { caip19: payAsset.caip19, amount: parseUnits(min.toFixed(payAsset.decimals), payAsset.decimals) };

      const typed = buildGaslessOrder({
        user: address,
        chainId,
        inputCaip19: input.caip19,
        inputAmount: input.amount,
        outputCaip19: output.caip19,
        minOutputAmount: output.amount,
        destinationChainId: 8453,
      });
      const signature = await signTypedData(typed);
      setState({ kind: "signed", signature });
    } catch (err) {
      const e = err as { name?: string; shortMessage?: string; message?: string };
      setState({
        kind: "error",
        message: e.name === "UserRejectedRequestError" ? "Signature rejected in wallet." : (e.shortMessage ?? e.message ?? "Signing failed"),
      });
    }
  };

  const signing = state.kind === "signing";

  return (
    <Modal open={open} onClose={close} locked={signing} title="Review cross-chain intent" subtitle="ERC-7683 gasless order, signed off-chain.">
      {/* Headline amounts */}
      <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-line bg-void/60 p-4 min-[420px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div>
          <p className="label-mono">You {buying ? "pay" : "sell"}</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">
            {buying ? usd.format(order.notional) : `${qtyFmt.format(order.qty)} $${order.symbol}`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{buying ? order.source.label : `≈ ${usd.format(order.notional)}`}</p>
        </div>
        <span className="grid h-8 w-8 rotate-90 place-items-center rounded-full border border-line-2 text-acid min-[420px]:rotate-0">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-[420px]:text-right">
          <p className="label-mono">You receive</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">
            {buying ? `${qtyFmt.format(order.qty)} $${order.symbol}` : usd.format(order.notional)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{buying ? "Crux Spot DEX" : order.source.label}</p>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-line">
        <Row label="Origin chain" value={order.originLabel} />
        <Row label="Target hub" value="Base · Crux Spot DEX" />
        <Row label="Clearing mechanism" value={`${BATCH_WINDOW_SECONDS}s Uniform Batch Auction`} />
        <Row
          label={buying ? "Guaranteed clearing price (cap)" : "Guaranteed clearing price (floor)"}
          value={`${priceFmt.format(limit)} / $${order.symbol}`}
        />
        <Row label="Minimum received" value={buying ? `${qtyFmt.format(min)} $${order.symbol}` : usd.format(min)} />
        <Row label="Max slippage" value={`${(SLIPPAGE_BPS / 100).toFixed(2)}%`} />
        <Row label="Solver network fee" value="0.00%" accent />
        <Row label="Signing as" value={address ? `${address.slice(0, 6)}…${address.slice(-4)} · ${chain?.name ?? `chain ${chainId}`}` : "—"} />
      </dl>

      {state.kind === "signed" ? (
        <div role="status" className="mt-5 rounded-xl border border-acid/40 bg-acid/[0.06] p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-acid">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Intent signed
          </p>
          <p className="mt-2 break-all font-mono text-[10.5px] leading-relaxed text-chrome/70">{state.signature}</p>
          <p className="mt-2 text-[11px] text-muted">
            {SETTLER_DEPLOYED
              ? "Queued for the next batch window. Solvers will fill at the uniform clearing price."
              : "Signed off-chain only. Nothing was broadcast: the origin settler is not deployed yet."}
          </p>
          <button type="button" onClick={close} className={buttonClass("outline", "sm", "mt-4 w-full rounded-lg")}>
            Done
          </button>
        </div>
      ) : (
        <>
          {state.kind === "error" && (
            <p role="alert" className="mt-4 rounded-lg border border-down/30 bg-down/10 px-3 py-2 font-mono text-[11px] text-down">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={signing || !address}
            className={buttonClass("acid", "md", "mt-5 w-full rounded-xl font-semibold disabled:opacity-100")}
          >
            {signing ? (
              <>
                <KineticLoader />
                Awaiting signature…
              </>
            ) : (
              <>
                Confirm Cross-Chain Intent <ArrowUpRight />
              </>
            )}
          </button>
          <p className="mt-3 text-center font-mono text-[10px] text-dim">
            Gasless signature (EIP-712). No funds move until a solver fills the batch.
          </p>
        </>
      )}
    </Modal>
  );
}
