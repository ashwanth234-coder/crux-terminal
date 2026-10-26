"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  formatUnits,
  parseAbi,
  parseAbiItem,
  parseEventLogs,
  parseUnits,
  verifyTypedData,
  type Hex,
} from "viem";
import { useConfig, useConnection, useReadContract, useSignTypedData, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { getBlockNumber, readContract, simulateContract } from "wagmi/actions";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { SubmitKey } from "@/components/pro/hotkeys";
import { logClient } from "@/lib/logs";
import { feeHeadroom } from "@/lib/fees";
import { SmartAccountNote } from "@/components/ui/SmartAccountNote";
import { useExactApproval } from "@/hooks/useExactApproval";
import { verifySettlerDomain } from "@/lib/settlerDomain";
import { cruxSettlerAbi, originSettlerAbi } from "@/contracts/abis/erc7683";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { crossChainDomain, originByKey } from "@/lib/crosschain";
import {
  BATCH_WINDOW_SECONDS,
  SETTLER,
  SETTLER_DEPLOYED,
  DESTINATION_SETTLER,
  ORDER_FILLED_EVENT,
  TESTNET_ESCROW_ASSETS,
  TESTNET_NOVA_CAIP19,
  TESTNET_USDC,
  buildGaslessOrder,
} from "@/lib/intents";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { NOVA_ASSET, clearingLimit, minReceived, slippageOf, sourceAsset, type OrderDraft } from "@/lib/order";
import { usd } from "@/lib/tokens";

type Flow =
  | { kind: "idle" }
  | { kind: "switching" }
  /** Settler live: approving it to escrow test USDC. */
  | { kind: "approving" }
  | { kind: "signing" }
  | { kind: "broadcasting" }
  /** Settler live: openFor sent (Base Sepolia, or the origin chain for a cross-chain order). `baseFrom`: a Base
   *  block at or before the fill, where the fill-log search starts (the receipt's block is on the origin chain). */
  | { kind: "broadcast"; hash: Hex; baseFrom?: bigint }
  /** No settler yet: signature produced and checked locally, nothing sent. */
  | { kind: "local"; signature: Hex; valid: boolean }
  | { kind: "error"; message: string };

const BUSY: Flow["kind"][] = ["switching", "approving", "signing", "broadcasting"];

const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const priceFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
/** Launch tokens can trade far below a cent; keep their significant digits. */
const fmtPrice = (v: number) => (v < 0.01 ? fmtTokenPrice(v) : priceFmt.format(v));

// The active destination settler's fill event: read-only, to show what the solver delivered. Read through the
// shared log client (wide-range RPCs; NEXT_PUBLIC_BASE_SEPOLIA_LOGS_RPC overrides).
const ORDER_FILLED = parseAbiItem(ORDER_FILLED_EVENT);

// Escrow status on CruxSettler: 1 Open, 2 Settled (OrderSettled emitted), 3 Refunded.
const ESCROW_SETTLED = 2;
const ESCROW_REFUNDED = 3;

const STEPS = ["Quote ready", "Awaiting signature", "Intent submitted", "Settlement confirmed"] as const;

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="font-mono text-[12.5px] text-chrome">{value}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-dim">{hint}</span>}
      </dd>
    </div>
  );
}

type Tone = "active" | "failed" | "halted";

/** Four steps; a step only counts as done once the chain says so. "halted" marks a step that was never reached. */
function Lifecycle({ stage, tone }: { stage: number; tone: Tone }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Intent progress">
      {STEPS.map((label, i) => {
        const done = i < stage;
        const current = i === stage;
        return (
          <li key={label} aria-current={current ? "step" : undefined}>
            <span
              className={`block h-0.5 rounded-full ${
                done ? "bg-chrome/70" : current ? (tone === "failed" ? "bg-down" : tone === "halted" ? "bg-line-2" : "bg-signal") : "bg-line-2"
              }`}
              aria-hidden="true"
            />
            <span className={`mt-2 block text-[11.5px] leading-tight ${current && tone !== "halted" ? "text-chrome" : done ? "text-muted" : "text-dim"}`}>
              {label}
              <span className="sr-only">{done ? " (done)" : current ? (tone === "halted" ? " (not reached)" : " (current)") : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** CruxSettler's custom errors, so a failed pre-flight simulation can say what went wrong. */
const settlerErrorsAbi = parseAbi([
  "error WrongSettler()",
  "error WrongChain()",
  "error OpenDeadlinePassed()",
  "error InvalidFillDeadline()",
  "error UnknownOrderDataType()",
  "error NonceAlreadyUsed()",
  "error InvalidSignature()",
  "error UnsupportedInputAsset(bytes32 assetId)",
  "error UnsupportedInputToken(address token)",
  "error InvalidOutputAsset()",
  "error InvalidDestinationChain()",
  "error ZeroAmount()",
]);
const openForAbi = [...originSettlerAbi, ...settlerErrorsAbi] as const;

const SETTLER_ERRORS: Record<string, string> = {
  InvalidSignature:
    "The settler couldn't verify your wallet's signature. Smart-account (EIP-7702) wallets need ERC-1271 support for this. Nothing was sent.",
  OpenDeadlinePassed: "This quote expired before it was submitted. Nothing was sent; review and sign again.",
  InvalidFillDeadline: "This quote expired before it was submitted. Nothing was sent; review and sign again.",
  NonceAlreadyUsed: "This intent was already submitted. Nothing new was sent.",
  UnsupportedInputAsset: "The settler doesn't escrow this asset yet. Nothing was sent.",
  UnsupportedInputToken: "The settler doesn't escrow this token yet. Nothing was sent.",
  InvalidOutputAsset: "This order has no output asset. Nothing was sent.",
  ZeroAmount: "Enter an amount above zero.",
  WrongChain: "Your wallet signed on the wrong chain. Switch networks and try again. Nothing was sent.",
  InvalidDestinationChain: "This settler only fills on Base Sepolia. Nothing was sent.",
};

function errorMessage(err: unknown) {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name && SETTLER_ERRORS[name]) return SETTLER_ERRORS[name];
  }
  const e = err as { name?: string; shortMessage?: string; message?: string };
  if (e.name === "UserRejectedRequestError" || /reject/i.test(e.shortMessage ?? "")) return "Request rejected in wallet.";
  return e.shortMessage ?? e.message?.split("\n")[0] ?? "Something went wrong";
}

export function IntentModal({ order, open, onClose }: { order: OrderDraft | null; open: boolean; onClose: () => void }) {
  const config = useConfig();
  const { address, chainId, chain } = useConnection();
  const { mutateAsync: signTypedData } = useSignTypedData();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: writeContract } = useWriteContract();
  const approveExact = useExactApproval();
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });

  // A cross-chain order is escrowed on its origin (Arbitrum Sepolia, Ethereum Sepolia, BSC testnet) and filled on Base Sepolia.
  const crossOrigin = order?.payFrom ? originByKey(order.payFrom) : null;
  const cross = crossOrigin !== null;
  const originChain = crossOrigin ? crossOrigin.chain : TESTNET;
  const originSettler = crossOrigin ? crossOrigin.settler : SETTLER;
  const originName = crossOrigin?.name ?? "Base Sepolia";

  const receipt = useWaitForTransactionReceipt({
    hash: flow.kind === "broadcast" ? flow.hash : undefined,
    chainId: originChain.id,
  });

  // After openFor lands: the order id from its Open event, then its escrow until it settles or refunds.
  const opened = receipt.data?.status === "success" ? parseEventLogs({ abi: originSettlerAbi, eventName: "Open", logs: receipt.data.logs })[0] : undefined;
  const orderId = opened?.args.orderId;
  const escrow = useReadContract({
    address: originSettler,
    abi: cruxSettlerAbi,
    functionName: "escrows",
    args: orderId ? [orderId] : undefined,
    chainId: originChain.id,
    query: {
      enabled: Boolean(orderId),
      refetchInterval: (q) => ((q.state.data?.[4] ?? 1) <= 1 ? 4_000 : false),
    },
  });
  const escrowStatus = escrow.data?.[4];
  const fromBlock = cross ? (flow.kind === "broadcast" ? flow.baseFrom : undefined) : receipt.data?.blockNumber;
  // Cross-chain: the fill lands on Base before the proof settles the escrow on the origin, so look for it while open.
  const delivered = useQuery({
    queryKey: ["crux-order-filled", orderId],
    enabled: (escrowStatus === ESCROW_SETTLED || (cross && escrowStatus === 1)) && Boolean(orderId) && fromBlock !== undefined,
    staleTime: Infinity,
    refetchInterval: (q) => (cross && !q.state.data ? 5_000 : false),
    queryFn: async () => {
      const [log] = await logClient.getLogs({ address: DESTINATION_SETTLER, event: ORDER_FILLED, args: { orderId }, fromBlock });
      return log ? { amount: log.args.amount ?? BigInt(0), tx: log.transactionHash } : null;
    },
  });

  const busy = BUSY.includes(flow.kind);

  const close = () => {
    if (busy) return;
    setFlow({ kind: "idle" });
    onClose();
  };

  // ⌘/Ctrl + Enter presses Confirm: the same button, so a disabled or busy state blocks it, and the
  // wallet still asks for every approval and signature.
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "Enter" && !e.repeat) {
        e.preventDefault();
        confirmRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      // A cross-chain order is opened on its origin chain instead.
      let signingChainId = chainId;
      if ((SETTLER_DEPLOYED || cross) && chainId !== originChain.id) {
        setFlow({ kind: "switching" });
        await switchChain({ chainId: originChain.id });
        signingChainId = originChain.id;
      }

      // A graduated launch token (order.asset) is asked for, or sold, under its own CAIP-19 id; otherwise NOVA.
      const traded = order.asset;
      const tokenDecimals = traded?.decimals ?? NOVA_ASSET.decimals;
      // Cross-chain buys escrow the origin's USDC in its own decimals (18 on BSC testnet).
      const inputDecimals = buying && crossOrigin ? crossOrigin.decimals : payAsset.decimals;
      const input = buying
        ? { caip19: payAsset.caip19, amount: parseUnits(order.notional.toFixed(6), inputDecimals) }
        : { caip19: traded?.caip19 ?? NOVA_ASSET.caip19, amount: parseUnits(order.qty.toFixed(6), tokenDecimals) };
      const output = buying
        ? {
            // On testnet, ask for MockNOVA: the token the Crux solver holds and can deliver.
            caip19: traded ? traded.caip19 : SETTLER_DEPLOYED && TESTNET_NOVA_CAIP19 ? TESTNET_NOVA_CAIP19 : NOVA_ASSET.caip19,
            amount: parseUnits(min.toFixed(6), tokenDecimals),
          }
        : { caip19: payAsset.caip19, amount: parseUnits(min.toFixed(payAsset.decimals), payAsset.decimals) };

      if (SETTLER_DEPLOYED) {
        // The settler pulls the input into escrow inside openFor, so it needs
        // the funds and an allowance before the user signs. A launch-token sell
        // escrows the token itself (the settler lists it); everything else escrows test USDC.
        const sellsLaunch = !buying && Boolean(traded);
        if (!sellsLaunch && !TESTNET_ESCROW_ASSETS.has(input.caip19)) {
          setFlow({ kind: "error", message: "The testnet settler escrows USDC only. Buy with Base USDC to open this intent." });
          return;
        }
        const escrowed = crossOrigin
          ? ({ address: crossOrigin.usdc, abi: erc20Abi, chainId: crossOrigin.chain.id } as const)
          : ({ address: sellsLaunch ? traded!.address : TESTNET_USDC, abi: erc20Abi, chainId: TESTNET.id } as const);
        const decimals = sellsLaunch ? tokenDecimals : inputDecimals;
        const balance = await readContract(config, { ...escrowed, functionName: "balanceOf", args: [address] });
        if (balance < input.amount) {
          setFlow({
            kind: "error",
            message: sellsLaunch
              ? `Needs ${formatUnits(input.amount, decimals)} $${order.symbol} on Base Sepolia (you have ${formatUnits(balance, decimals)}).`
              : `Needs ${formatUnits(input.amount, decimals)} test USDC on ${originName} (you have ${formatUnits(balance, decimals)}). Get some free at ${crossOrigin ? crossOrigin.faucet : "faucet.circle.com"}.`,
          });
          return;
        }
        // Exactly this order's input, never an unlimited allowance; skipped when the allowance already covers it.
        await approveExact(
          { token: escrowed.address, owner: address, spender: originSettler, amount: input.amount, chainId: escrowed.chainId },
          { onPrompt: () => setFlow({ kind: "approving" }) },
        );
      }

      // Never ask for a signature the deployed settler wouldn't accept under its own EIP-712 domain.
      if (SETTLER_DEPLOYED) await verifySettlerDomain(config, crossOrigin ? crossChainDomain(crossOrigin) : undefined);

      const { order: gasless, typed } = buildGaslessOrder({
        user: address,
        chainId: signingChainId,
        inputCaip19: input.caip19,
        // The token the settler pulls: the launch token for a sell, test USDC (on the paying chain) otherwise.
        inputToken: !buying && traded ? traded.address : crossOrigin ? crossOrigin.usdc : TESTNET_USDC,
        inputAmount: input.amount,
        outputCaip19: output.caip19,
        minOutputAmount: output.amount,
        // On testnet the fill also happens on Base Sepolia, where the destination settler lives.
        destinationChainId: SETTLER_DEPLOYED ? TESTNET.id : 8453,
        origin: crossOrigin?.key,
      });

      setFlow({ kind: "signing" });
      const signature = await signTypedData(typed);

      if (!SETTLER_DEPLOYED) {
        // A malformed signature throws rather than returning false; both mean "invalid".
        const valid = await verifyTypedData({ address, ...typed, signature }).catch(() => false);
        setFlow({ kind: "local", signature, valid });
        return;
      }

      // Pre-flight: run openFor against the chain first. If it would revert, the wallet never opens a
      // transaction it would flag as "expected to fail"; the reason is shown here instead.
      const { request } = await simulateContract(config, {
        address: originSettler,
        abi: openForAbi,
        functionName: "openFor",
        args: [gasless, signature, "0x"],
        account: address,
        chainId: originChain.id,
      });
      // Cross-chain: the solver fills on Base after this, so Base's current block bounds where its fill can be.
      const baseFrom = cross ? await getBlockNumber(config, { chainId: TESTNET.id }) : undefined;
      const fees = await feeHeadroom(config, originChain.id);
      setFlow({ kind: "broadcasting" });
      const hash = await writeContract({ ...request, ...fees } as typeof request);
      setFlow({ kind: "broadcast", hash, baseFrom });
    } catch (err) {
      setFlow({ kind: "error", message: errorMessage(err) });
    }
  };

  // ---------------------------------------------------------------- lifecycle

  const reverted = receipt.data?.status === "reverted";
  let stage = 0;
  let failed = false;
  let halted = false;
  let working = busy;
  let note: string;
  switch (flow.kind) {
    case "idle":
      note = "Quote ready. Review it, then confirm to sign.";
      break;
    case "error":
      failed = true;
      note = flow.message;
      break;
    case "switching":
      stage = 1;
      note = `Switch your wallet to ${originChain.name}.`;
      break;
    case "approving":
      stage = 1;
      note =
        !buying && order.asset
          ? `Approve exactly ${qtyFmt.format(order.qty)} $${order.symbol} for the settler to escrow.`
          : `Approve exactly ${usd.format(order.notional)} of test USDC${cross ? ` on ${originName}` : ""} for the settler.`;
      break;
    case "signing":
      stage = 1;
      note = "Sign the intent in your wallet. Signing costs no gas.";
      break;
    case "broadcasting":
      stage = 2;
      note = "Confirm the submission (openFor) in your wallet.";
      break;
    case "local":
      stage = 2;
      failed = !flow.valid;
      halted = flow.valid;
      note = flow.valid
        ? "Signed and verified locally. No settler is configured, so nothing was submitted."
        : "The signature did not verify. Nothing was submitted.";
      break;
    case "broadcast":
      if (reverted || receipt.isError) {
        stage = 2;
        failed = true;
        note = reverted ? "The submission reverted. Your funds did not move." : "Submitted, but the confirmation could not be read.";
      } else if (!receipt.isSuccess) {
        stage = 2;
        working = true;
        note = `Confirming the submission on ${originChain.name}…`;
      } else if (escrowStatus === ESCROW_SETTLED) {
        stage = 4;
        note = delivered.data
          ? `Settlement confirmed. A solver delivered ${
              buying
                ? `${qtyFmt.format(Number(formatUnits(delivered.data.amount, order.asset?.decimals ?? 18)))} $${order.symbol}`
                : `${usd.format(Number(formatUnits(delivered.data.amount, payAsset.decimals)))} test USDC`
            } and the escrow was released.`
          : "Settlement confirmed. A solver filled your intent and the escrow was released.";
        if (cross) note += ` The solver was paid on ${originName} only after a Hyperlane proof of its fill on Base.`;
      } else if (escrowStatus === ESCROW_REFUNDED) {
        stage = 3;
        failed = true;
        note = "No solver filled this intent in time. The escrow was refunded to you.";
      } else if (cross && delivered.data) {
        stage = 3;
        working = true;
        note = `Delivered on Base Sepolia: ${qtyFmt.format(Number(formatUnits(delivered.data.amount, order.asset?.decimals ?? 18)))} $${order.symbol}. The fill proof is crossing to ${originName} through Hyperlane (usually under a few minutes); then your escrow is released to the solver.`;
      } else {
        stage = 3;
        working = true;
        note = `Submitted and escrowed${cross ? ` on ${originName}` : ""}. Waiting for a solver to fill it ${cross ? "on Base Sepolia " : ""}at the next ${BATCH_WINDOW_SECONDS}-second batch.`;
      }
      break;
  }

  const ctaLabel: Record<Flow["kind"], string> = {
    idle: "Confirm & sign intent",
    error: "Try again",
    switching: `Switching to ${originChain.name}…`,
    approving: "Approving test USDC…",
    signing: "Awaiting signature…",
    broadcasting: "Submitting intent…",
    broadcast: "",
    local: "",
  };

  // ---------------------------------------------------------------- quote

  const origin = cross ? originName : SETTLER_DEPLOYED ? "Base Sepolia" : order.originLabel;
  const destination = SETTLER_DEPLOYED ? { name: "Base Sepolia", id: 84532 } : { name: "Base", id: 8453 };
  // Launch-token trades on thin testnet pools are often under a cent: show USDC to its 6 decimals.
  const money = (v: number) => (order.asset && v < 1 ? `$${v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}` : usd.format(v));
  const inputLabel = buying
    ? `${money(order.notional)} ${SETTLER_DEPLOYED ? "test USDC" : "USDC"}`
    : `${qtyFmt.format(order.qty)} $${order.symbol}`;
  const outputLabel = buying ? `${qtyFmt.format(order.qty)} $${order.symbol}` : money(order.notional);
  const minLabel = buying ? `${qtyFmt.format(min)} $${order.symbol}` : money(min);
  const finished = flow.kind === "broadcast" || flow.kind === "local";

  return (
    <Modal open={open} onClose={close} locked={busy} title="Review intent" subtitle="ERC-7683 order, signed with EIP-712.">
      <Lifecycle stage={stage} tone={failed ? "failed" : halted ? "halted" : "active"} />
      <p role="status" aria-live="polite" className={`mt-3 flex items-start gap-2 text-[12.5px] leading-snug ${failed ? "text-down" : "text-chrome/85"}`}>
        {working && <KineticLoader className="mt-0.5 shrink-0 text-signal" />}
        <span>{note}</span>
      </p>
      <SmartAccountNote address={address} className="mt-2" />

      {/* Pre-signature quote: what goes in, what comes out, and how it gets there */}
      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-line bg-void/60 p-4 min-[420px]:grid-cols-2">
        <div>
          <p className="text-[12px] text-muted">You {buying ? "pay" : "sell"}</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">{inputLabel}</p>
          <p className="mt-0.5 text-[12px] text-muted">on {origin}</p>
        </div>
        <div className="min-[420px]:text-right">
          <p className="text-[12px] text-muted">You receive (expected)</p>
          <p className="mt-1.5 font-mono text-[18px] text-chrome">{outputLabel}</p>
          <p className="mt-0.5 text-[12px] text-muted">minimum {minLabel}</p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-line">
        <Row
          label="Route"
          value={`${origin} → solver → ${destination.name}`}
          hint={
            cross
              ? `No bridge: the solver delivers on Base from its own capital and is repaid on ${originName} after a Hyperlane proof of the fill`
              : "No bridge: the solver delivers from its own capital"
          }
        />
        <Row label="Destination chain" value={`${destination.name} · ${destination.id}`} />
        <Row
          label="Fees"
          value={order.asset ? "0.30% solver spread" : "0.00% solver fee"}
          hint={
            order.asset
              ? "Included in the quote, with Uniswap's 0.3% pool fee · gas is a little test ETH"
              : SETTLER_DEPLOYED
                ? "Approval and submission cost a little test ETH gas"
                : "The signature itself is gasless"
          }
        />
        <Row
          label="Clearing"
          value={`${BATCH_WINDOW_SECONDS}s uniform batch`}
          hint={`${buying ? "Price cap" : "Price floor"} ${fmtPrice(limit)} · ${(slippageOf(order) / 100).toFixed(2)}% max slippage`}
        />
        <Row
          label="Quote"
          value={`${fmtPrice(order.price)} / $${order.symbol}`}
          hint={order.asset ? "From the locked Uniswap V2 pool at this size · testnet" : SETTLER_DEPLOYED ? "Indicative testnet price" : "Indicative price"}
        />
        <Row
          label="Settler"
          value={SETTLER_DEPLOYED ? `${originSettler.slice(0, 6)}…${originSettler.slice(-4)}` : "Not configured"}
          hint={
            cross
              ? `CruxCrossChainSettler on ${originName} · refundable 6h after the deadline if unproven`
              : SETTLER_DEPLOYED
                ? "CruxSettler on Base Sepolia"
                : "The signature is checked locally only"
          }
        />
        <Row label="Signing as" value={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"} hint={chain?.name ?? (chainId ? `Chain ${chainId}` : undefined)} />
      </dl>

      {finished ? (
        <div className="mt-5 space-y-3">
          {flow.kind === "broadcast" && (
            <div className="space-y-1.5 text-[12px]">
              <a
                href={`${crossOrigin ? crossOrigin.explorer : TESTNET_EXPLORER}/tx/${flow.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 text-muted transition-colors hover:text-chrome"
              >
                <span>Submission (openFor{cross ? `, ${originName}` : ""})</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-chrome/80">
                  {flow.hash.slice(0, 10)}…{flow.hash.slice(-6)} <ArrowUpRight className="h-3 w-3" />
                </span>
              </a>
              {delivered.data && (
                <a
                  href={`${TESTNET_EXPLORER}/tx/${delivered.data.tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 text-muted transition-colors hover:text-chrome"
                >
                  <span>Solver fill{cross ? " (Base)" : ""}</span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-chrome/80">
                    {delivered.data.tx.slice(0, 10)}…{delivered.data.tx.slice(-6)} <ArrowUpRight className="h-3 w-3" />
                  </span>
                </a>
              )}
            </div>
          )}
          {flow.kind === "local" && <p className="break-all font-mono text-[11px] leading-relaxed text-chrome/55">{flow.signature}</p>}
          <button type="button" onClick={close} className={buttonClass("outline", "sm", "w-full rounded-lg")}>
            {stage === 4 ? "Done" : "Close"}
          </button>
          {flow.kind === "broadcast" && stage === 3 && !failed && (
            <p className="text-center text-[11.5px] text-dim">You can close this. My intents keeps tracking it, and refunds open if no solver fills it.</p>
          )}
        </div>
      ) : (
        <>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            disabled={busy || !address}
            className={buttonClass("signal", "md", "mt-5 w-full rounded-xl font-semibold disabled:opacity-100")}
          >
            {busy && <KineticLoader />}
            {ctaLabel[flow.kind]}
            {!busy && <ArrowUpRight />}
            {!busy && <SubmitKey />}
          </button>
          <p className="mt-3 text-center text-[11.5px] text-dim">
            {SETTLER_DEPLOYED
              ? `Approves test USDC if needed, signs, then submits on ${originChain.name}. Testnet only, no real funds.`
              : "Gasless EIP-712 signature. No funds move until a solver fills the batch."}
          </p>
        </>
      )}
    </Modal>
  );
}
