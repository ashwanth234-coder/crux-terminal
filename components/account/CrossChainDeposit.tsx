"use client";

import { useState } from "react";
import { encodeAbiParameters, erc20Abi, formatUnits, keccak256, parseAbi, parseUnits, toHex, zeroAddress, type Address } from "viem";
import { useConfig, useConnection, useReadContract } from "wagmi";
import { getConnection, signTypedData, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { useExactApproval } from "@/hooks/useExactApproval";
import { useConnectModal } from "@/providers/Web3Provider";
import { TESTNET } from "@/lib/chains";
import { CROSS_CHAIN_ORIGINS, toUsdc6, type CrossChainOrigin } from "@/lib/crosschain";
import { feeHeadroom } from "@/lib/fees";
import { TESTNET_USDC, orderNonce } from "@/lib/intents";
import { launchCaip19 } from "@/lib/launchTrade";

/** The solver's spread on deposits (crux-solver SPREAD_BPS): a deposit pays 1:1 less this, and the order signs exactly that. */
const DEPOSIT_SPREAD_BPS = BigInt(30);

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

type Step = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "opened"; origin: Origin; hash: `0x${string}` } | { kind: "error"; message: string };

/**
 * Deposit test USDC from another chain into the Crux account on Base: the wallet escrows it on Arbitrum Sepolia,
 * Ethereum Sepolia or BSC testnet in CruxCrossChainSettlerV2, naming the account as recipient; the Crux solver pays
 * Base test USDC into the account (1:1 less its 0.3% spread) and is repaid there once a Hyperlane proof of that payment
 * lands. Unfilled, the wallet can refund 6 hours after the deadline.
 */
export function CrossChainDeposit({ account, onOpened }: { account: Address; onOpened: () => void }) {
  const config = useConfig();
  const { address: wallet } = useConnection();
  const approveExact = useExactApproval();
  const { openConnect } = useConnectModal();
  const [key, setKey] = useState(ORIGINS[0]?.key);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const origin = ORIGINS.find((o) => o.key === key) ?? null;

  const originBalance = useReadContract({
    chainId: origin?.chain.id,
    address: origin?.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet ?? zeroAddress],
    query: { enabled: Boolean(wallet && origin), refetchInterval: 20_000 },
  });

  if (!origin) return null;
  // Before a wallet is connected: which chains it can come from, and the one step that unlocks it.
  if (!wallet) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[12px] text-dim">Deposit from another chain</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Pay test USDC on {ORIGINS.map((o) => o.name).join(", ").replace(/, ([^,]*)$/, " or $1")} from your wallet and Crux delivers it here on
          Base, no bridge.{" "}
          <button type="button" onClick={openConnect} className="text-chrome underline decoration-line-2 underline-offset-2 hover:text-bright">
            Connect a wallet
          </button>{" "}
          to start.
        </p>
      </div>
    );
  }
  const units = (() => {
    try {
      const v = amount ? parseUnits(amount, origin.decimals) : null;
      return v !== null && v > BigInt(0) ? v : null;
    } catch {
      return null;
    }
  })();
  const over = units !== null && originBalance.data !== undefined && units > originBalance.data;
  const busy = step.kind === "busy";

  const deposit = async () => {
    if (!units) return;
    const o = origin;
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
      const hash = await writeContract(config, { ...request, ...fees } as typeof request);
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
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-[12px] text-dim">Deposit from another chain</p>
      <div role="radiogroup" aria-label="Deposit from" className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
        {ORIGINS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={key === o.key}
            onClick={() => {
              setKey(o.key);
              setAmount("");
              setStep({ kind: "idle" });
            }}
            className={`h-7 rounded-[4px] border px-2.5 transition-colors ${key === o.key ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2 focus-within:border-line-2">
          <span className="font-mono text-dim">$</span>
          <label htmlFor="xchain-deposit" className="sr-only">Test USDC to deposit from {origin.name}</label>
          <input
            id="xchain-deposit"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full min-w-0 bg-transparent font-mono text-[15px] text-chrome outline-none placeholder:text-dim"
          />
        </div>
        <button type="button" disabled={!units || over || busy} onClick={() => void deposit()} className={buttonClass("primary", "sm", "shrink-0 font-semibold")}>
          {busy ? "Depositing…" : "Deposit"}
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">
        {over ? "More than your wallet holds there. " : ""}
        Wallet on {origin.name}: {originBalance.data !== undefined ? `$${Number(formatUnits(originBalance.data, origin.decimals)).toFixed(2)}` : "…"} test USDC (free at{" "}
        {origin.faucet}). Arrives in your Crux account on Base in about a minute, less 0.3%. Needs a little {origin.chain.nativeCurrency.symbol} there for
        gas.
      </p>
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
    </div>
  );
}
