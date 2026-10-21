"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  parseAbi,
  parseAbiItem,
  parseEventLogs,
  parseUnits,
  verifyTypedData,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { useConfig, useConnection, useReadContract, useSignTypedData, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { readContract, simulateContract } from "wagmi/actions";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { SubmitKey } from "@/components/pro/hotkeys";
import { SmartAccountNote } from "@/components/ui/SmartAccountNote";
import { useExactApproval } from "@/hooks/useExactApproval";
import { verifySettlerDomain } from "@/lib/settlerDomain";
import { cruxSettlerAbi, originSettlerAbi } from "@/contracts/abis/erc7683";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import {
  BATCH_WINDOW_SECONDS,
  SETTLER,
  SETTLER_DEPLOYED,
  SLIPPAGE_BPS,
  TESTNET_ESCROW_ASSETS,
  TESTNET_NOVA_CAIP19,
  TESTNET_USDC,
  buildGaslessOrder,
} from "@/lib/intents";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { NOVA_ASSET, clearingLimit, minReceived, sourceAsset, type OrderDraft } from "@/lib/order";
import { usd } from "@/lib/tokens";

type Flow =
  | { kind: "idle" }
  | { kind: "switching" }
  /** Settler live: approving it to escrow test USDC. */
  | { kind: "approving" }
  | { kind: "signing" }
  | { kind: "broadcasting" }
  /** Settler live: openFor sent to Base Sepolia. */
  | { kind: "broadcast"; hash: Hex }
  /** No settler yet: signature produced and checked locally, nothing sent. */
  | { kind: "local"; signature: Hex; valid: boolean }
  | { kind: "error"; message: string };

const BUSY: Flow["kind"][] = ["switching", "approving", "signing", "broadcasting"];

const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const priceFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
/** Launch tokens can trade far below a cent; keep their significant digits. */
const fmtPrice = (v: number) => (v < 0.01 ? fmtTokenPrice(v) : priceFmt.format(v));

// Destination settler on Base Sepolia and its fill event: read-only, to show what the solver delivered.
const DESTINATION = "0x300a835939D2beBed59C543470DCD9a9c8065822";
const ORDER_FILLED = parseAbiItem(
  "event OrderFilled(bytes32 indexed orderId, address indexed filler, address indexed recipient, address token, uint256 amount)",
);
// sepolia.base.org caps eth_getLogs at 200 blocks; publicnode allows wide ranges.
const logClient = createPublicClient({ chain: baseSepolia, transport: http("https://base-sepolia-rpc.publicnode.com", { timeout: 15_000 }) });

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
  WrongChain: "Switch your wallet to Base Sepolia and try again. Nothing was sent.",
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

  const receipt = useWaitForTransactionReceipt({
    hash: flow.kind === "broadcast" ? flow.hash : undefined,
    chainId: TESTNET.id,
  });

  // After openFor lands: the order id from its Open event, then its escrow until it settles or refunds.
  const opened = receipt.data?.status === "success" ? parseEventLogs({ abi: originSettlerAbi, eventName: "Open", logs: receipt.data.logs })[0] : undefined;
  const orderId = opened?.args.orderId;
  const escrow = useReadContract({
    address: SETTLER,
    abi: cruxSettlerAbi,
    functionName: "escrows",
    args: orderId ? [orderId] : undefined,
    chainId: TESTNET.id,
    query: {
      enabled: Boolean(orderId),
      refetchInterval: (q) => ((q.state.data?.[4] ?? 1) <= 1 ? 4_000 : false),
    },
  });
  const escrowStatus = escrow.data?.[4];
  const fromBlock = receipt.data?.blockNumber;
  const delivered = useQuery({
    queryKey: ["crux-order-filled", orderId],
    enabled: escrowStatus === ESCROW_SETTLED && Boolean(orderId) && fromBlock !== undefined,
    staleTime: Infinity,
    queryFn: async () => {
      const [log] = await logClient.getLogs({ address: DESTINATION, event: ORDER_FILLED, args: { orderId }, fromBlock });
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
      let signingChainId = chainId;
      if (SETTLER_DEPLOYED && chainId !== TESTNET.id) {
        setFlow({ kind: "switching" });
        await switchChain({ chainId: TESTNET.id });
        signingChainId = TESTNET.id;
      }

      // A graduated launch token (order.asset) is asked for, or sold, under its own CAIP-19 id; otherwise NOVA.
      const traded = order.asset;
      const tokenDecimals = traded?.decimals ?? NOVA_ASSET.decimals;
      const input = buying
        ? { caip19: payAsset.caip19, amount: parseUnits(order.notional.toFixed(payAsset.decimals), payAsset.decimals) }
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
        const escrowed = { address: sellsLaunch ? traded!.address : TESTNET_USDC, abi: erc20Abi, chainId: TESTNET.id } as const;
        const decimals = sellsLaunch ? tokenDecimals : 6;
        const balance = await readContract(config, { ...escrowed, functionName: "balanceOf", args: [address] });
        if (balance < input.amount) {
          setFlow({
            kind: "error",
            message: sellsLaunch
              ? `Needs ${formatUnits(input.amount, decimals)} $${order.symbol} on Base Sepolia (you have ${formatUnits(balance, decimals)}).`
              : `Needs ${formatUnits(input.amount, 6)} test USDC on Base Sepolia (you have ${formatUnits(balance, 6)}). Get some free at faucet.circle.com.`,
          });
          return;
        }
        // Exactly this order's input, never an unlimited allowance; skipped when the allowance already covers it.
        await approveExact({ token: escrowed.address, owner: address, spender: SETTLER, amount: input.amount }, { onPrompt: () => setFlow({ kind: "approving" }) });
      }

      // Never ask for a signature the deployed settler wouldn't accept under its own EIP-712 domain.
      if (SETTLER_DEPLOYED) await verifySettlerDomain(config);

      const { order: gasless, typed } = buildGaslessOrder({
        user: address,
        chainId: signingChainId,
        inputCaip19: input.caip19,
        // The token the settler pulls: the launch token for a sell, test USDC otherwise.
        inputToken: !buying && traded ? traded.address : TESTNET_USDC,
        inputAmount: input.amount,
        outputCaip19: output.caip19,
        minOutputAmount: output.amount,
        // On testnet the fill also happens on Base Sepolia, where the destination settler lives.
        destinationChainId: SETTLER_DEPLOYED ? TESTNET.id : 8453,
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
        address: SETTLER,
        abi: openForAbi,
        functionName: "openFor",
        args: [gasless, signature, "0x"],
        account: address,
        chainId: TESTNET.id,
      });
      setFlow({ kind: "broadcasting" });
      const hash = await writeContract(request);
      setFlow({ kind: "broadcast", hash });
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
      note = "Switch your wallet to Base Sepolia.";
      break;
    case "approving":
      stage = 1;
      note =
        !buying && order.asset
          ? `Approve exactly ${qtyFmt.format(order.qty)} $${order.symbol} for the settler to escrow.`
          : `Approve exactly ${usd.format(order.notional)} of test USDC for the settler.`;
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
        note = "Confirming the submission on Base Sepolia…";
      } else if (escrowStatus === ESCROW_SETTLED) {
        stage = 4;
        note = delivered.data
          ? `Settlement confirmed. A solver delivered ${
              buying
                ? `${qtyFmt.format(Number(formatUnits(delivered.data.amount, order.asset?.decimals ?? 18)))} $${order.symbol}`
                : `${usd.format(Number(formatUnits(delivered.data.amount, payAsset.decimals)))} test USDC`
            } and the escrow was released.`
          : "Settlement confirmed. A solver filled your intent and the escrow was released.";
      } else if (escrowStatus === ESCROW_REFUNDED) {
        stage = 3;
        failed = true;
        note = "No solver filled this intent in time. The escrow was refunded to you.";
      } else {
        stage = 3;
        working = true;
        note = `Submitted and escrowed. Waiting for a solver to fill it at the next ${BATCH_WINDOW_SECONDS}-second batch.`;
      }
      break;
  }

  const ctaLabel: Record<Flow["kind"], string> = {
    idle: "Confirm & sign intent",
    error: "Try again",
    switching: "Switching to Base Sepolia…",
    approving: "Approving test USDC…",
    signing: "Awaiting signature…",
    broadcasting: "Submitting intent…",
    broadcast: "",
    local: "",
  };

  // ---------------------------------------------------------------- quote

  const origin = SETTLER_DEPLOYED ? "Base Sepolia" : order.originLabel;
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
        <Row label="Route" value={`${origin} → solver → ${destination.name}`} hint="No bridge: the solver delivers from its own capital" />
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
          hint={`${buying ? "Price cap" : "Price floor"} ${fmtPrice(limit)} · ${(SLIPPAGE_BPS / 100).toFixed(2)}% max slippage`}
        />
        <Row
          label="Quote"
          value={`${fmtPrice(order.price)} / $${order.symbol}`}
          hint={order.asset ? "From the locked Uniswap V2 pool at this size · testnet" : SETTLER_DEPLOYED ? "Indicative testnet price" : "Indicative price"}
        />
        <Row
          label="Settler"
          value={SETTLER_DEPLOYED ? `${SETTLER.slice(0, 6)}…${SETTLER.slice(-4)}` : "Not configured"}
          hint={SETTLER_DEPLOYED ? "CruxSettler on Base Sepolia" : "The signature is checked locally only"}
        />
        <Row label="Signing as" value={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"} hint={chain?.name ?? (chainId ? `Chain ${chainId}` : undefined)} />
      </dl>

      {finished ? (
        <div className="mt-5 space-y-3">
          {flow.kind === "broadcast" && (
            <div className="space-y-1.5 text-[12px]">
              <a
                href={`${TESTNET_EXPLORER}/tx/${flow.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 text-muted transition-colors hover:text-chrome"
              >
                <span>Submission (openFor)</span>
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
                  <span>Solver fill</span>
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
              ? "Approves test USDC if needed, signs, then submits on Base Sepolia. Testnet only, no real funds."
              : "Gasless EIP-712 signature. No funds move until a solver fills the batch."}
          </p>
        </>
      )}
    </Modal>
  );
}
