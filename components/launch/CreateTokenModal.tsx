"use client";

import { useId, useState, type ReactNode } from "react";
import { getAddress, keccak256, parseEventLogs, parseUnits, toHex, type Address, type Hex } from "viem";
import { useConfig, useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { cruxFactoryAbi } from "@/contracts/abis/batchAuction";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { BATCH_WINDOW_SECONDS, FACTORY } from "@/lib/intents";
import { useConnectModal } from "@/providers/Web3Provider";

type Form = {
  name: string;
  symbol: string;
  description: string;
  x: string;
  farcaster: string;
  website: string;
  supply: string;
  target: string;
  batchAuction: boolean;
};

const INITIAL: Form = {
  name: "",
  symbol: "",
  description: "",
  x: "",
  farcaster: "",
  website: "",
  supply: "1,000,000,000",
  target: "50,000",
  batchAuction: true,
};

const SIM_STEPS = [
  "Compiling LayerZero OFT bytecode…",
  "Configuring 60s Batch Auction parameters…",
  "Staging canonical Base liquidity pool…",
];

type Phase =
  | { kind: "form" }
  | { kind: "simulating"; step: number }
  | { kind: "deploying"; label: string; hash?: Hex }
  | { kind: "done"; token: Address; simulated: boolean; hash?: Hex; auctionId?: bigint };

const digits = (v: string) => v.replace(/[^0-9]/g, "");
const withCommas = (v: string) => (digits(v) ? Number(digits(v)).toLocaleString("en-US") : "");

function validate(f: Form) {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (f.name.trim().length < 2) errors.name = "Give the token a name (2–32 characters).";
  if (!/^[A-Z0-9]{2,10}$/.test(f.symbol)) errors.symbol = "2–10 letters or numbers, e.g. CRUX.";
  if (f.website && !/^https?:\/\/\S+\.\S+/.test(f.website)) errors.website = "Use a full URL starting with https://";
  const supply = Number(digits(f.supply));
  if (!supply || supply < 1_000) errors.supply = "Supply must be at least 1,000.";
  const target = Number(digits(f.target));
  if (!target || target < 1_000) errors.target = "Set a graduation target of at least $1,000.";
  return errors;
}

/** Off-chain metadata carried as a data URI so launch needs no IPFS pinning service. */
function metadataURI(f: Form) {
  const json = JSON.stringify({
    name: f.name.trim(),
    symbol: f.symbol,
    description: f.description.trim(),
    links: { x: f.x.trim(), farcaster: f.farcaster.trim(), website: f.website.trim() },
  });
  return `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Field({
  label,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] text-chrome/85">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[11.5px] text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[11.5px] text-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-void/60 px-3 py-2.5 text-[14px] text-chrome outline-none transition-colors placeholder:text-dim focus:border-acid/60 aria-[invalid=true]:border-down/60";

export function CreateTokenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useId();
  const config = useConfig();
  const { address, chainId, isConnected } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: writeContract } = useWriteContract();
  const { openConnect } = useConnectModal();

  const [form, setForm] = useState<Form>(INITIAL);
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);

  const errors = validate(form);
  const showErr = (k: keyof Form) => (touched ? errors[k] : undefined);
  const busy = phase.kind === "simulating" || phase.kind === "deploying";
  const live = FACTORY !== null;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm(INITIAL);
    setTouched(false);
    setPhase({ kind: "form" });
    setError(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const simulate = async () => {
    for (let i = 0; i < SIM_STEPS.length; i++) {
      setPhase({ kind: "simulating", step: i });
      await sleep(1400);
    }
    // A deterministic preview address; clearly labelled as not on-chain.
    const preview = getAddress(`0x${keccak256(toHex(`crux:${form.name}:${form.symbol}:${Date.now()}`)).slice(-40)}`);
    setPhase({ kind: "done", token: preview, simulated: true });
  };

  const deploy = async () => {
    if (!FACTORY) return;
    if (!isConnected || !address) {
      openConnect();
      return;
    }
    if (chainId !== TESTNET.id) {
      setPhase({ kind: "deploying", label: "Switching to Base Sepolia…" });
      await switchChain({ chainId: TESTNET.id });
    }
    setPhase({ kind: "deploying", label: "Confirm the launch in your wallet…" });
    const hash = await writeContract({
      address: FACTORY,
      abi: cruxFactoryAbi,
      functionName: "createAuction",
      chainId: TESTNET.id,
      args: [
        {
          name: form.name.trim(),
          symbol: form.symbol,
          metadataURI: metadataURI(form),
          totalSupply: parseUnits(digits(form.supply), 18),
          graduationTarget: parseUnits(digits(form.target), 6),
          batchAuction: form.batchAuction,
          batchWindow: form.batchAuction ? BATCH_WINDOW_SECONDS : 0,
        },
      ],
    });
    setPhase({ kind: "deploying", label: "Deploying token and auction…", hash });
    const receipt = await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
    const [created] = parseEventLogs({ abi: cruxFactoryAbi, eventName: "AuctionCreated", logs: receipt.logs });
    if (!created) throw new Error("Deployed, but no AuctionCreated event was found in the receipt.");
    setPhase({ kind: "done", token: created.args.token, simulated: false, hash, auctionId: created.args.auctionId });
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (Object.keys(errors).length) return;
    try {
      await (live ? deploy() : simulate());
    } catch (err) {
      const e = err as { name?: string; shortMessage?: string; message?: string };
      setError(e.name === "UserRejectedRequestError" ? "Launch rejected in wallet." : (e.shortMessage ?? e.message?.split("\n")[0] ?? "Launch failed"));
      setPhase({ kind: "form" });
    }
  };

  const viewInTerminal = () => {
    close();
    requestAnimationFrame(() => document.getElementById("protocol")?.scrollIntoView({ behavior: "smooth" }));
  };

  const id = (k: string) => `${uid}-${k}`;

  return (
    <Modal
      open={open}
      onClose={close}
      locked={busy}
      size="lg"
      title={phase.kind === "done" ? `$${form.symbol} is ${phase.simulated ? "staged" : "live"}` : "Launch a token"}
      subtitle={
        phase.kind === "done"
          ? phase.simulated
            ? "Simulated preview: the launch contracts are awaiting testnet deployment."
            : "Deployed on Base Sepolia with its batch auction initialised."
          : live
            ? "Deploys on Base Sepolia (testnet) through the Crux factory."
            : "Preview mode: the launch contracts are awaiting testnet deployment."
      }
    >
      {phase.kind === "done" ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${phase.simulated ? "border-line-2 bg-void/60" : "border-acid/40 bg-acid/[0.06]"}`}>
            <p className="text-[11px] text-muted">{phase.simulated ? "Preview token address (simulated, not on-chain)" : "Token address"}</p>
            <p className="mt-1.5 break-all font-mono text-[13px] text-chrome">{phase.token}</p>
            {!phase.simulated && phase.hash && (
              <a
                href={`${TESTNET_EXPLORER}/tx/${phase.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-[12px] text-chrome/80 underline decoration-line-2 hover:text-chrome"
              >
                View deployment on Base Sepolia ↗
              </a>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="rounded-lg border border-line p-3">
              <dt className="text-muted">Supply</dt>
              <dd className="mt-1 font-mono text-chrome">{withCommas(form.supply)}</dd>
            </div>
            <div className="rounded-lg border border-line p-3">
              <dt className="text-muted">Graduates at</dt>
              <dd className="mt-1 font-mono text-chrome">${withCommas(form.target)} USDC</dd>
            </div>
            <div className="col-span-2 rounded-lg border border-line p-3">
              <dt className="text-muted">Launch mechanism</dt>
              <dd className="mt-1 text-chrome">
                {form.batchAuction ? `${BATCH_WINDOW_SECONDS}s uniform-price batch auction` : "Open bonding curve"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={viewInTerminal} className={buttonClass("acid", "md", "flex-1 rounded-xl font-semibold")}>
              View in Crux Terminal <ArrowUpRight />
            </button>
            <button type="button" onClick={reset} className={buttonClass("outline", "md", "rounded-xl")}>
              Launch another
            </button>
          </div>
        </div>
      ) : busy ? (
        <div className="py-2">
          {phase.kind === "simulating" ? (
            <ol className="space-y-3">
              {SIM_STEPS.map((s, i) => {
                const state = i < phase.step ? "done" : i === phase.step ? "active" : "todo";
                return (
                  <li key={s} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center">
                      {state === "done" ? (
                        <svg viewBox="0 0 16 16" className="h-4 w-4 text-acid" aria-hidden="true">
                          <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : state === "active" ? (
                        <KineticLoader className="text-acid" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-line-2" />
                      )}
                    </span>
                    <span className={`text-[13px] ${state === "todo" ? "text-dim" : "text-chrome"}`}>{s}</span>
                  </li>
                );
              })}
              <li className="pt-1 text-center text-[11.5px] text-dim">Simulated: nothing is deployed until the factory is live.</li>
            </ol>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <KineticLoader className="h-5 text-acid" />
              <p className="text-[14px] text-chrome">{phase.label}</p>
              {phase.hash && (
                <a
                  href={`${TESTNET_EXPLORER}/tx/${phase.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono text-[11px] text-muted underline decoration-line-2"
                >
                  {phase.hash} ↗
                </a>
              )}
            </div>
          )}
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Field id={id("name")} label="Token name" error={showErr("name")}>
              <input
                id={id("name")}
                className={inputCls}
                placeholder="Crux Genesis"
                maxLength={32}
                value={form.name}
                aria-invalid={Boolean(showErr("name"))}
                aria-describedby={`${id("name")}-msg`}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field id={id("symbol")} label="Ticker" error={showErr("symbol")}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] text-dim">$</span>
                <input
                  id={id("symbol")}
                  className={`${inputCls} pl-6 font-mono uppercase`}
                  placeholder="CRUX"
                  maxLength={10}
                  value={form.symbol}
                  aria-invalid={Boolean(showErr("symbol"))}
                  aria-describedby={`${id("symbol")}-msg`}
                  onChange={(e) => set("symbol", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
              </div>
            </Field>
          </div>

          <Field id={id("desc")} label="Description" hint={`${form.description.length}/280`}>
            <textarea
              id={id("desc")}
              rows={3}
              maxLength={280}
              className={`${inputCls} resize-none`}
              placeholder="What is this token for?"
              value={form.description}
              aria-describedby={`${id("desc")}-msg`}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id={id("x")} label="X">
              <input id={id("x")} className={inputCls} placeholder="@handle" value={form.x} onChange={(e) => set("x", e.target.value)} />
            </Field>
            <Field id={id("fc")} label="Farcaster">
              <input id={id("fc")} className={inputCls} placeholder="@handle" value={form.farcaster} onChange={(e) => set("farcaster", e.target.value)} />
            </Field>
            <Field id={id("web")} label="Website" error={showErr("website")}>
              <input
                id={id("web")}
                className={inputCls}
                placeholder="https://"
                inputMode="url"
                value={form.website}
                aria-invalid={Boolean(showErr("website"))}
                aria-describedby={`${id("web")}-msg`}
                onChange={(e) => set("website", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id("supply")} label="Initial supply" error={showErr("supply")} hint="Tokens, 18 decimals">
              <input
                id={id("supply")}
                className={`${inputCls} font-mono`}
                inputMode="numeric"
                value={form.supply}
                aria-invalid={Boolean(showErr("supply"))}
                aria-describedby={`${id("supply")}-msg`}
                onChange={(e) => set("supply", withCommas(e.target.value))}
              />
            </Field>
            <Field id={id("target")} label="Graduation target" error={showErr("target")} hint="USDC raised before it moves to the Base pool">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] text-dim">$</span>
                <input
                  id={id("target")}
                  className={`${inputCls} pl-6 pr-14 font-mono`}
                  inputMode="numeric"
                  value={form.target}
                  aria-invalid={Boolean(showErr("target"))}
                  aria-describedby={`${id("target")}-msg`}
                  onChange={(e) => set("target", withCommas(e.target.value))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-dim">USDC</span>
              </div>
            </Field>
          </div>

          {/* Batch auction toggle with an explanatory tooltip (also exposed as its description) */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] text-chrome">
                <span id={id("ba-label")}>{BATCH_WINDOW_SECONDS}-second uniform batch auction</span>
                <span className="group relative">
                  <button
                    type="button"
                    aria-describedby={id("ba-tip")}
                    className="grid h-4 w-4 place-items-center rounded-full border border-line-2 text-[10px] text-muted hover:text-chrome focus-visible:text-chrome"
                  >
                    i
                  </button>
                  <span
                    id={id("ba-tip")}
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 w-60 -translate-x-1/2 rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-[11.5px] leading-snug text-chrome/85 opacity-0 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.9)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    Mathematically neutralizes block-0 MEV snipers by clearing all orders at one uniform price.
                  </span>
                </span>
              </p>
              <p className="mt-1 text-[11.5px] text-dim">Every opening order clears at the same price. Recommended.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.batchAuction}
              aria-labelledby={id("ba-label")}
              onClick={() => set("batchAuction", !form.batchAuction)}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                form.batchAuction ? "border-acid/60 bg-acid" : "border-line-2 bg-line"
              }`}
            >
              <span
                className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-[left,background-color] ${
                  form.batchAuction ? "left-[22px] bg-void" : "left-[3px] bg-chrome/70"
                }`}
              />
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
              {error}
            </p>
          )}

          <button type="submit" className={buttonClass("acid", "md", "w-full rounded-xl font-semibold")}>
            Deploy Token &amp; Initialize Auction <ArrowUpRight />
          </button>
          {live && !isConnected && <p className="text-center text-[11.5px] text-dim">You&apos;ll be asked to connect a wallet first.</p>}
        </form>
      )}
    </Modal>
  );
}
