"use client";

import { useState } from "react";
import { parseUnits, verifyTypedData, type Hex } from "viem";
import { useConnection, useSignTypedData, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { originSettlerAbi } from "@/contracts/abis/erc7683";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { BATCH_WINDOW_SECONDS, SETTLER, SETTLER_DEPLOYED, SLIPPAGE_BPS, buildGaslessOrder } from "@/lib/intents";
import { NOVA_ASSET, clearingLimit, minReceived, sourceAsset, type OrderDraft } from "@/lib/order";
import { usd } from "@/lib/tokens";

type Flow =
  | { kind: "idle" }
  | { kind: "switching" }
  | { kind: "signing" }
  | { kind: "broadcasting" }
  /** Settler live: openFor sent to Base Sepolia. */
  | { kind: "broadcast"; hash: Hex }
  /** No settler yet: signature produced and checked locally, nothing sent. */
  | { kind: "local"; signature: Hex; valid: boolean }
  | { kind: "error"; message: string };

const BUSY: Flow["kind"][] = ["switching", "signing", "broadcasting"];

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

function errorMessage(err: unknown) {
  const e = err as { name?: string; shortMessage?: string; message?: string };
  if (e.name === "UserRejectedRequestError" || /reject/i.test(e.shortMessage ?? "")) return "Request rejected in wallet.";
  return e.shortMessage ?? e.message?.split("\n")[0] ?? "Something went wrong";
}

export function IntentModal({ order, open, onClose }: { order: OrderDraft | null; open: boolean; onClose: () => void }) {
  const { address, chainId, chain } = useConnection();
  const { mutateAsync: signTypedData } = useSignTypedData();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: writeContract } = useWriteContract();
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });

  const receipt = useWaitForTransactionReceipt({
    hash: flow.kind === "broadcast" ? flow.hash : undefined,
    chainId: TESTNET.id,
  });

  const busy = BUSY.includes(flow.kind);

  const close = () => {
    if (busy) return;
    setFlow({ kind: "idle" });
    onClose();
  };

  if (!order) return null;

  const buying = order.side === "buy";
  const payAsset = sourceAsset(order.source.id);
  const min = minReceived(order);
  const limit = clearingLimit(order);

  const confirm = async () => {
    if (!address || !chainId) return;
    try {
      // With a live settler, intents are opened on Base Sepolia; the EIP-712
      // domain must match the chain the wallet signs on.
      let signingChainId = chainId;
      if (SETTLER_DEPLOYED && chainId !== TESTNET.id) {
        setFlow({ kind: "switching" });
        await switchChain({ chainId: TESTNET.id });
        signingChainId = TESTNET.id;
      }

      const input = buying
        ? { caip19: payAsset.caip19, amount: parseUnits(order.notional.toFixed(payAsset.decimals), payAsset.decimals) }
        : { caip19: NOVA_ASSET.caip19, amount: parseUnits(order.qty.toFixed(6), NOVA_ASSET.decimals) };
      const output = buying
        ? { caip19: NOVA_ASSET.caip19, amount: parseUnits(min.toFixed(6), NOVA_ASSET.decimals) }
        : { caip19: payAsset.caip19, amount: parseUnits(min.toFixed(payAsset.decimals), payAsset.decimals) };

      const typed = buildGaslessOrder({
        user: address,
        chainId: signingChainId,
        inputCaip19: input.caip19,
        inputAmount: input.amount,
        outputCaip19: output.caip19,
        minOutputAmount: output.amount,
        destinationChainId: 8453,
      });

      setFlow({ kind: "signing" });
      const signature = await signTypedData(typed);

      if (!SETTLER_DEPLOYED) {
        // A malformed signature throws rather than returning false; both mean "invalid".
        const valid = await verifyTypedData({ address, ...typed, signature }).catch(() => false);
        setFlow({ kind: "local", signature, valid });
        return;
      }

      setFlow({ kind: "broadcasting" });
      const hash = await writeContract({
        address: SETTLER,
        abi: originSettlerAbi,
        functionName: "openFor",
        args: [typed.message, signature, "0x"],
        chainId: TESTNET.id,
      });
      setFlow({ kind: "broadcast", hash });
    } catch (err) {
      setFlow({ kind: "error", message: errorMessage(err) });
    }
  };

  const ctaLabel: Record<Flow["kind"], string> = {
    idle: "Confirm Cross-Chain Intent",
    error: "Try again",
    switching: "Switching to Base Sepolia…",
    signing: "Awaiting signature…",
    broadcasting: "Broadcasting openFor…",
    broadcast: "",
    local: "",
  };

  return (
    <Modal open={open} onClose={close} locked={busy} title="Review cross-chain intent" subtitle="ERC-7683 gasless order, signed with EIP-712.">
      {/* Headline amounts */}
      <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-line bg-void/60 p-4 min-[420px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div>
          <p className="text-[11px] text-muted">You {buying ? "pay" : "sell"}</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">
            {buying ? usd.format(order.notional) : `${qtyFmt.format(order.qty)} $${order.symbol}`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{buying ? order.source.label : `≈ ${usd.format(order.notional)}`}</p>
        </div>
        <span className="grid h-8 w-8 rotate-90 place-items-center rounded-full border border-line-2 text-chrome min-[420px]:rotate-0">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-[420px]:text-right">
          <p className="text-[11px] text-muted">You receive</p>
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
        <Row label="Settlement" value={SETTLER_DEPLOYED ? `Base Sepolia · ${SETTLER.slice(0, 6)}…${SETTLER.slice(-4)}` : "Awaiting testnet deployment"} />
        <Row label="Signing as" value={address ? `${address.slice(0, 6)}…${address.slice(-4)} · ${chain?.name ?? `chain ${chainId}`}` : "—"} />
      </dl>

      {flow.kind === "broadcast" ? (
        <div role="status" className="mt-5 rounded-xl border border-acid/40 bg-acid/[0.06] p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-acid">
            {receipt.isSuccess ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <KineticLoader />
            )}
            {receipt.isSuccess ? "Intent opened on Base Sepolia" : receipt.isError ? "Broadcast, confirmation unknown" : "Broadcast · confirming…"}
          </p>
          <a
            href={`${TESTNET_EXPLORER}/tx/${flow.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block break-all font-mono text-[11px] leading-relaxed text-chrome/80 underline decoration-line-2 hover:text-chrome"
          >
            {flow.hash} ↗
          </a>
          <p className="mt-2 text-[11.5px] text-muted">Queued for the next batch window. Solvers fill at the uniform clearing price.</p>
          <button type="button" onClick={close} className={buttonClass("outline", "sm", "mt-4 w-full rounded-lg")}>
            Done
          </button>
        </div>
      ) : flow.kind === "local" ? (
        <div role="status" className="mt-5 rounded-xl border border-line-2 bg-void/60 p-4">
          <p className={`flex items-center gap-2 text-[13px] font-medium ${flow.valid ? "text-chrome" : "text-down"}`}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {flow.valid ? "Signature valid · verified locally" : "Signature did not verify"}
          </p>
          <p className="mt-2 break-all font-mono text-[10.5px] leading-relaxed text-chrome/60">{flow.signature}</p>
          <p className="mt-3 flex items-center gap-2 text-[12px] text-chrome/80">
            <span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
            Awaiting testnet deployment. Nothing was broadcast.
          </p>
          <button type="button" onClick={close} className={buttonClass("outline", "sm", "mt-4 w-full rounded-lg")}>
            Done
          </button>
        </div>
      ) : (
        <>
          {flow.kind === "error" && (
            <p role="alert" className="mt-4 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
              {flow.message}
            </p>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !address}
            className={buttonClass("acid", "md", "mt-5 w-full rounded-xl font-semibold disabled:opacity-100")}
          >
            {busy && <KineticLoader />}
            {ctaLabel[flow.kind]}
            {!busy && <ArrowUpRight />}
          </button>
          <p className="mt-3 text-center text-[11px] text-dim">
            {SETTLER_DEPLOYED
              ? "Signs the order, then opens it on Base Sepolia (testnet gas only)."
              : "Gasless EIP-712 signature. No funds move until a solver fills the batch."}
          </p>
        </>
      )}
    </Modal>
  );
}
