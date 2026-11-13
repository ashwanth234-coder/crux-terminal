"use client";

import { BUILDER_SUFFIX } from "@/lib/attribution";
import { useEffect, useState } from "react";
import { encodeAbiParameters, erc20Abi, formatUnits, keccak256, parseAbi, parseUnits, toHex, zeroAddress, type Address } from "viem";
import { useConfig, useConnection, useReadContract, useReadContracts } from "wagmi";
import { getConnection, signTypedData, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { SolanaIntentModal, type SolanaOrderRequest } from "@/components/terminal/SolanaIntentModal";
import { useExactApproval } from "@/hooks/useExactApproval";
import { useSolanaPayer } from "@/hooks/useSolanaPayer";
import { useConnectModal } from "@/providers/Web3Provider";
import { TESTNET } from "@/lib/chains";
import { RELAY_URL } from "@/lib/session";
import { CROSS_CHAIN_ORIGINS, toUsdc6, type CrossChainOrigin } from "@/lib/crosschain";
import { feeHeadroom } from "@/lib/fees";
import { TESTNET_USDC, orderNonce } from "@/lib/intents";
import { launchCaip19 } from "@/lib/launchTrade";
import { PAY_SOURCES } from "@/lib/tokens";

/**
 * The solver's spread on deposits (crux-solver DEPOSIT_SPREAD_BPS): none, so a deposit pays 1:1 and the order signs the
 * full amount. Trades keep the 0.3% spread. Must not be lower than the solver's, or it skips the deposit.
 */
const DEPOSIT_SPREAD_BPS = BigInt(0);

/** CruxCrossChainSettlerV2: the order names a recipient, so the deposit lands in the Crux account, not the wallet. */
const ORDER_DATA_TYPE_V2 = keccak256(
  toHex("CruxOrderDataV2(address tokenIn,uint256 amountIn,string tokenOut,uint256 minAmountOut,uint256 destinationChainId,uint32 batchWindow,address recipient)"),
);
const CRUX_ORDER_V2_TYPES = {
  CruxOrder: [
    { name: "user", type: "address" },
    { name: "recipient", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "tokenOut", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "destinationChainId", type: "uint256" },
    { name: "openDeadline", type: "uint32" },
    { name: "fillDeadline", type: "uint32" },
    { name: "batchWindow", type: "uint32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;
const openForAbi = parseAbi([
  "struct GaslessCrossChainOrder { address originSettler; address user; uint256 nonce; uint256 originChainId; uint32 openDeadline; uint32 fillDeadline; bytes32 orderDataType; bytes orderData; }",
  "function openFor(GaslessCrossChainOrder order, bytes signature, bytes originFillerData)",
  "error InvalidSignature()",
  "error UnsupportedInputToken(address token)",
  "error OpenDeadlinePassed()",
]);

type Origin = CrossChainOrigin & { depositSettler: Address };
const ORIGINS = CROSS_CHAIN_ORIGINS.filter((o): o is Origin => o.depositSettler !== null);
/** Solana devnet: USDC escrowed by crux_escrow, the account as payee and Base test USDC as the output (SolanaIntentModal). */
const SOLANA = "solana";
const SOLANA_NAME = "Solana devnet";
/** Base Sepolia: a plain USDC transfer from the wallet to the account (the account lives there), no fee. */
const BASE = "base";
const BASE_NAME = "Base Sepolia";
const CHOICES: { key: string; name: string }[] = [{ key: BASE, name: BASE_NAME }, ...ORIGINS, { key: SOLANA, name: SOLANA_NAME }];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Step = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "opened"; origin: Origin; hash: `0x${string}` } | { kind: "error"; message: string };

/** Whole dollars, rounded down: a limit is never shown above what it is. */
const capText = (units6: bigint) => (Number(units6 / BigInt(10_000)) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * How much a deposit from another chain can be right now: what Crux holds on Base to pay it (the relay's
 * /v1/health), read every 20 seconds while a non-Base chain is picked. Undefined while unknown.
 */
function useDepositCapacity(enabled: boolean): bigint | undefined {
  const [cap, setCap] = useState<bigint | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const read = () =>
      fetch(`${RELAY_URL}/v1/health`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { depositUsdc?: string }) => live && setCap(j.depositUsdc !== undefined ? BigInt(j.depositUsdc) : undefined))
        .catch(() => {});
    void read();
    const t = setInterval(read, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [enabled]);
  return enabled ? cap : undefined;
}

/**
 * Every way into the Crux account, in one box: pick the chain, enter the amount, Deposit. From Base Sepolia it's one
 * USDC transfer from the wallet (the panel's `base.deposit`), and the account's address is there to send to directly.
 * From another chain the wallet escrows test USDC on Arbitrum Sepolia,
 * Ethereum Sepolia or BSC testnet in CruxCrossChainSettlerV2, naming the account as recipient; the Crux solver pays
 * Base test USDC into the account 1:1, with no fee, and is repaid there once a Hyperlane proof of that payment
 * lands. Unfilled, the wallet can refund 6 hours after the deadline. From Solana devnet the same deposit is a crux_escrow
 * order paying Base test USDC to the account, signed in a Solana wallet.
 */
export function CrossChainDeposit({
  account,
  onOpened,
  base,
}: {
  account: Address;
  onOpened: () => void;
  /** Base Sepolia: the connected wallet's test USDC, and the transfer into the account (resolves once it lands). */
  base: { balance: bigint | undefined; busy: boolean; deposit: (units: bigint) => Promise<void> };
}) {
  const config = useConfig();
  const { address: wallet } = useConnection();
  const approveExact = useExactApproval();
  const { openConnect } = useConnectModal();
  const [key, setKey] = useState(CHOICES[0]?.key);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const origin = ORIGINS.find((o) => o.key === key) ?? null;
  const fromSolana = key === SOLANA;
  const fromBase = key === BASE;
  const solana = useSolanaPayer();
  const [solanaRequest, setSolanaRequest] = useState<SolanaOrderRequest | null>(null);

  const originBalance = useReadContract({
    chainId: origin?.chain.id,
    address: origin?.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet ?? zeroAddress],
    query: { enabled: Boolean(wallet && origin), refetchInterval: 20_000 },
  });

  // The wallet's USDC on every deposit chain, shown in the chain menu (where the money is, at a glance).
  const originBalances = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(wallet), refetchInterval: 30_000 },
    contracts: ORIGINS.map((o) => ({ chainId: o.chain.id, address: o.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet ?? zeroAddress] }) as const),
  });
  const balanceOf = (k: string): string | null => {
    const v =
      k === BASE
        ? base.balance
        : k === SOLANA
          ? (solana.usdc ?? undefined)
          : (originBalances.data?.[ORIGINS.findIndex((o) => o.key === k)]?.result as bigint | undefined);
    if (v === undefined) return null;
    const d = k === BASE || k === SOLANA ? 6 : (ORIGINS.find((o) => o.key === k)?.decimals ?? 6);
    return `$${Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  };

  // An EVM chain needs the wallet connected; Solana connects its own wallet in the review step.
  const needsWallet = !wallet && !fromSolana;
  const decimals = origin ? origin.decimals : 6;
  const units = (() => {
    try {
      const v = amount ? parseUnits(amount, decimals) : null;
      return v !== null && v > BigInt(0) ? v : null;
    } catch {
      return null;
    }
  })();
  const held = fromBase ? base.balance : fromSolana ? (solana.usdc ?? undefined) : originBalance.data;
  const over = units !== null && held !== undefined && units > held;
  // A deposit from another chain is paid on Base from Crux's own USDC: never one bigger than that can cover now.
  const capacity = useDepositCapacity(!fromBase);
  const units6 = units === null ? null : fromSolana || !origin ? units : toUsdc6(units, origin.decimals);
  const overCapacity = !fromBase && units6 !== null && capacity !== undefined && units6 > capacity;
  const busy = step.kind === "busy" || (fromBase && base.busy);

  /** Solana: the review modal connects the wallet if needed, checks USDC and SOL, and escrows the order. */
  const depositFromSolana = (units: bigint) => {
    const minOut = (units * (BigInt(10_000) - DEPOSIT_SPREAD_BPS)) / BigInt(10_000);
    const qty = Number(minOut) / 1e6;
    setSolanaRequest({
      draft: { side: "buy", symbol: "USDC", qty, price: 1, notional: qty, source: PAY_SOURCES.find((s) => s.id === "solana-usdc")!, originLabel: SOLANA_NAME },
      amount: units,
      minAmountOut: minOut,
      tokenOut: launchCaip19(TESTNET_USDC),
      payee: account,
      deposit: true,
    });
  };

  const deposit = async () => {
    if (!units) return;
    if (fromSolana) return depositFromSolana(units);
    if (fromBase) {
      await base.deposit(units);
      setAmount("");
      return;
    }
    const o = origin;
    if (!o || !wallet) return;
    try {
      setStep({ kind: "busy", label: `Switching to ${o.name}…` });
      if (getConnection(config).chainId !== o.chain.id) await switchChain(config, { chainId: o.chain.id });
      // Exactly this deposit, never an unlimited allowance.
      await approveExact(
        { token: o.usdc, owner: wallet, spender: o.depositSettler, amount: units, chainId: o.chain.id },
        { onPrompt: () => setStep({ kind: "busy", label: `Approve ${amount} USDC on ${o.name} in your wallet…` }) },
      );
      const amount6 = toUsdc6(units, o.decimals);
      const minOut = (amount6 * (BigInt(10_000) - DEPOSIT_SPREAD_BPS)) / BigInt(10_000);
      const tokenOut = launchCaip19(TESTNET_USDC);
      const now = Math.floor(Date.now() / 1000);
      const nonce = orderNonce();
      const openDeadline = now + 300;
      const fillDeadline = now + 900;
      setStep({ kind: "busy", label: "Sign the deposit in your wallet…" });
      const signature = await signTypedData(config, {
        account: wallet,
        domain: { name: "CruxCrossChainSettler", version: "2", chainId: o.chain.id, verifyingContract: o.depositSettler },
        types: CRUX_ORDER_V2_TYPES,
        primaryType: "CruxOrder",
        message: {
          user: wallet,
          recipient: account,
          tokenIn: o.usdc,
          amountIn: units,
          tokenOut,
          minAmountOut: minOut,
          destinationChainId: BigInt(TESTNET.id),
          openDeadline,
          fillDeadline,
          batchWindow: 10,
          nonce,
        },
      });
      const order = {
        originSettler: o.depositSettler,
        user: wallet,
        nonce,
        originChainId: BigInt(o.chain.id),
        openDeadline,
        fillDeadline,
        orderDataType: ORDER_DATA_TYPE_V2,
        orderData: encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint32" }, { type: "address" }],
          [o.usdc, units, tokenOut, minOut, BigInt(TESTNET.id), 10, account],
        ),
      };
      const { request } = await simulateContract(config, { address: o.depositSettler, abi: openForAbi, functionName: "openFor", args: [order, signature, "0x"], account: wallet, chainId: o.chain.id });
      const fees = await feeHeadroom(config, o.chain.id);
      setStep({ kind: "busy", label: `Confirm the deposit on ${o.name} in your wallet…` });
      const hash = await writeContract(config, { ...request, ...fees, dataSuffix: BUILDER_SUFFIX } as typeof request);
      setStep({ kind: "busy", label: `Opening it on ${o.name}…` });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: o.chain.id });
      if (receipt.status !== "success") throw new Error(`The deposit transaction failed on ${o.name}.`);
      setAmount("");
      setStep({ kind: "opened", origin: o, hash });
      onOpened();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string; name?: string };
      setStep({ kind: "error", message: err.name === "UserRejectedRequestError" ? "Request rejected in wallet." : (err.shortMessage ?? err.message?.split("\n")[0] ?? "Something went wrong.") });
    }
  };

  return (
    <div>
      {/* The account's address, to send to from an exchange or another wallet: Base Sepolia only, said right next to it. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] text-dim">Your account</span>
        <code className="font-mono text-[12.5px] text-chrome" title={account}>
          {short(account)}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(account).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-[4px] border border-line-2 px-2 py-0.5 text-[11px] text-muted hover:text-chrome"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="text-[11px] text-signal">Base Sepolia only</span>
      </div>

      <div className="mt-3">
        <p className="text-[12px] text-dim">Deposit from</p>
        <Menu<string>
          className="mt-1"
          label="Deposit from"
          value={key}
          onChange={(k) => {
            setKey(k);
            setAmount("");
            setStep({ kind: "idle" });
          }}
          options={CHOICES.map((o) => ({ value: o.key, label: o.name, hint: balanceOf(o.key) ?? undefined }))}
        />
      </div>
      {needsWallet ? (
        <button type="button" onClick={openConnect} className={buttonClass("outline", "sm", "mt-2")}>
          Connect a wallet to deposit from {fromBase ? BASE_NAME : origin?.name}
        </button>
      ) : (
      <div className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2 focus-within:border-line-2">
          <span className="font-mono text-dim">$</span>
          <label htmlFor="deposit-amount" className="sr-only">Test USDC to deposit from {fromBase ? BASE_NAME : (origin?.name ?? SOLANA_NAME)}</label>
          <input
            id="deposit-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full min-w-0 bg-transparent font-mono text-[15px] text-chrome outline-none placeholder:text-dim"
          />
        </div>
        <button type="button" disabled={!units || over || overCapacity || busy} onClick={() => void deposit()} className={buttonClass("primary", "sm", "shrink-0 font-semibold")}>
          {busy ? "Depositing…" : "Deposit"}
        </button>
      </div>
      )}
      {fromBase ? (
        wallet && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">
            {over ? "More than your wallet holds. " : ""}From {short(wallet)} on Base Sepolia
            {base.balance !== undefined ? ` · wallet has $${Number(formatUnits(base.balance, 6)).toFixed(2)}` : ""}. Arrives at once, no fee: your
            wallet asks you to confirm one transfer.
          </p>
        )
      ) : origin ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">
          {over ? "More than your wallet holds there. " : ""}
          Wallet on {origin.name}: {originBalance.data !== undefined ? `$${Number(formatUnits(originBalance.data, origin.decimals)).toFixed(2)}` : "…"} test USDC (free at{" "}
          {origin.faucet}). Arrives in your Crux account on Base in about a minute, no fee. Needs a little {origin.chain.nativeCurrency.symbol} there for
          gas.
        </p>
      ) : (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">
          {over ? "More than your Solana wallet holds. " : ""}
          {solana.payer
            ? `Solana wallet: ${solana.usdc !== null ? `$${Number(formatUnits(solana.usdc, 6)).toFixed(2)}` : "…"} devnet USDC (free at faucet.circle.com). `
            : "Connect a Solana wallet in the next step. Devnet USDC is free at faucet.circle.com. "}
          Arrives in your Crux account on Base in about a minute, no fee. Needs a little devnet SOL for network fees.
        </p>
      )}
      {!fromBase && capacity !== undefined && (
        <p className={`mt-1 text-[11.5px] ${overCapacity ? "text-down" : "text-dim"}`}>
          {overCapacity
            ? `Instant deposits from other chains are up to $${capText(capacity)} right now. Deposit less, or split it.`
            : `Instant deposits from other chains: up to $${capText(capacity)} right now.`}
        </p>
      )}
      {step.kind === "busy" && <p role="status" className="mt-1.5 text-[12px] text-muted">{step.label}</p>}
      {step.kind === "error" && <p role="status" className="mt-1.5 text-[12px] text-down">{step.message}</p>}
      {step.kind === "opened" && (
        <p role="status" className="mt-1.5 text-[12px] text-up">
          Deposit opened on {step.origin.name} (
          <a href={`${step.origin.explorer}/tx/${step.hash}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2">
            tx
          </a>
          ). Crux pays it into your account on Base within a minute or two; your balance above updates by itself. If it isn&apos;t
          filled, you can refund it on {step.origin.name} 6 hours after its deadline.
        </p>
      )}
      {fromBase && (
        <details className="mt-3 rounded-lg border border-line px-3 py-2.5">
          <summary className="cursor-pointer text-[11.5px] text-dim hover:text-chrome">Sending from an exchange or another wallet?</summary>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
            Send test USDC on <span className="text-chrome">Base Sepolia</span> to your account address above (Copy). It arrives as soon as the transfer lands.
          </p>
          <p className="mt-1 text-[11px] leading-snug text-signal">
            USDC sent to that address on any other chain doesn&apos;t reach your account. From another chain, pick it in &ldquo;Deposit from&rdquo; instead.
          </p>
        </details>
      )}
      <SolanaIntentModal
        request={solanaRequest}
        onClose={() => setSolanaRequest(null)}
        onPlaced={() => {
          setAmount("");
          onOpened();
        }}
      />
    </div>
  );
}
