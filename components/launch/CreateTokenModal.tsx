"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAddress, keccak256, parseAbi, parseEventLogs, parseUnits, toHex, type Address, type Hex } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { cruxBatchFactoryAbi, cruxFactoryAbi, factoryV4Abi, factoryV6Abi, factoryV8Abi } from "@/contracts/abis/batchAuction";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { BATCH_WINDOW_SECONDS, FACTORY, FACTORY_V7, LAUNCH_FACTORY } from "@/lib/intents";
import { V2_FEE, V2_MIN_LEAD_SECONDS, V2_SPLIT, V2_WINDOWS, buyersNeeded, windowLabel } from "@/lib/launchV2";
import { launchError, previewHref } from "@/lib/launch";
import { simulateThenWrite } from "@/lib/preflight";
import { VestingBadge } from "@/components/ui/VestingBadge";
import { AntiSniperBadge } from "@/components/ui/AntiSniperBadge";

/** With the batch auction off, CruxFactory runs one pro-rata sale over OPEN_SALE_WINDOW (1 day). */
const OPEN_SALE_HOURS = 24;

/** CruxFactory only needs a target above zero; testnet faucets hand out ~10 USDC, so the floor drops there. */
const MIN_TARGET = FACTORY || LAUNCH_FACTORY ? 1 : 1_000;
import { useConnectModal } from "@/providers/Web3Provider";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { checkLaunchNow, useLaunchGuard } from "@/hooks/useLaunchGuard";
import type { Conflict } from "@/lib/antiVamp";
import { launchFromAccount } from "@/lib/account";
import { imageDataUri } from "@/lib/tokenMeta";
import { DisplayImageField } from "./DisplayImageField";
import { endsIn5afe, mineTokenSalt } from "@/lib/tokenSalt";

type Form = {
  name: string;
  symbol: string;
  description: string;
  /** Optional display image, stored with the metadata: an uploaded image (a small WebP data: URI) or an https URL. */
  logo: string;
  x: string;
  website: string;
  supply: string;
  target: string;
  batchAuction: boolean;
  /** V4: release the creator's share at graduation instead of vesting it over 30 days. */
  instantUnlock: boolean;
  /** V6: the first minute of trading after graduation in one uniform-price batch (else straight to Uniswap). */
  antiSniper: boolean;
  /** V2: minutes from now until deposits open. */
  startsIn: string;
  /** V2: most of the sale one wallet can receive, as a percentage. */
  walletCap: string;
  /** V2: batch window in seconds. */
  window: string;
};

const INITIAL: Form = {
  name: "",
  symbol: "",
  description: "",
  logo: "",
  x: "",
  website: "",
  supply: "1,000,000,000",
  target: FACTORY || LAUNCH_FACTORY ? "10" : "50,000",
  batchAuction: true,
  instantUnlock: false,
  antiSniper: true,
  startsIn: "10",
  walletCap: "5",
  window: "300",
};

const SIM_STEPS = [
  "Compiling token bytecode…",
  "Configuring batch auction parameters…",
  "Staging the canonical liquidity pool…",
];

type Phase =
  | { kind: "form" }
  | { kind: "simulating"; step: number }
  | { kind: "deploying"; label: string; hash?: Hex }
  | { kind: "done"; token: Address; simulated: boolean; hash?: Hex; auctionId?: bigint; start: number };

const digits = (v: string) => v.replace(/[^0-9]/g, "");
const withCommas = (v: string) => (digits(v) ? Number(digits(v)).toLocaleString("en-US") : "");

function validate(f: Form) {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (f.name.trim().length < 2) errors.name = "Give the token a name (2–32 characters).";
  if (!/^[A-Z0-9]{2,10}$/.test(f.symbol)) errors.symbol = "2–10 letters or numbers, e.g. CRUX.";
  if (f.website && !/^https?:\/\/\S+\.\S+/.test(f.website)) errors.website = "Use a full URL starting with https://";
  if (f.logo.trim() && !imageDataUri(f.logo) && !/^https:\/\/\S+\.\S+/.test(f.logo.trim())) errors.logo = "Upload an image or use an https:// image URL.";
  const supply = Number(digits(f.supply));
  if (!supply || supply < 1_000) errors.supply = "Supply must be at least 1,000.";
  const target = Number(digits(f.target));
  if (!target || target < MIN_TARGET) errors.target = `Set a graduation target of at least $${MIN_TARGET.toLocaleString("en-US")}.`;
  if (LAUNCH_FACTORY) {
    const minutes = Number(f.startsIn);
    if (!Number.isFinite(minutes) || minutes * 60 < V2_MIN_LEAD_SECONDS || minutes > 30 * 24 * 60) {
      errors.startsIn = `Schedule the start ${V2_MIN_LEAD_SECONDS / 60} minutes to 30 days ahead.`;
    }
    const cap = Number(f.walletCap);
    if (!Number.isFinite(cap) || cap < 0.1 || cap > 100) errors.walletCap = "Between 0.1% and 100% of the sale.";
  }
  return errors;
}

/** How many wallets a cap needs before the sale can fill (and so graduate). */
function capHint(walletCap: string, target: string) {
  const cap = Number(walletCap);
  if (!Number.isFinite(cap) || cap < 0.1 || cap > 100) return "Share of the sale one wallet can receive; the excess is refunded";
  const n = buyersNeeded(cap);
  if (LAUNCH_FACTORY && LAUNCH_FACTORY.version >= 3) {
    // V3 enforces the cap as a deposit limit: the cap's worth of tokens at the floor price, i.e. cap% of the target.
    const usd = (Number(digits(target)) * cap) / 100;
    const each = `Each wallet can deposit up to $${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return n === 1 ? `${each}; one wallet can fill the whole sale` : `${each}; needs at least ${n} buyers to fill the sale and graduate`;
  }
  return n === 1
    ? "One wallet can fill the whole sale; anything over the cap is refunded"
    : `Needs at least ${n} buyers to fill the sale and graduate; each wallet's excess is refunded`;
}

/** Off-chain metadata carried as a data URI so launch needs no IPFS pinning service. */
function metadataURI(f: Form) {
  const json = JSON.stringify({
    name: f.name.trim(),
    symbol: f.symbol,
    description: f.description.trim(),
    ...(f.logo.trim() ? { image: f.logo.trim() } : {}),
    links: { x: f.x.trim(), website: f.website.trim() },
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
  "w-full rounded-lg border border-line bg-void/60 px-3 py-2.5 text-[14px] text-chrome outline-none transition-colors placeholder:text-dim focus:border-signal/60 aria-[invalid=true]:border-down/60";

export function CreateTokenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useId();
  const router = useRouter();
  const config = useConfig();
  const { address, chainId, isConnected } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { openConnect } = useConnectModal();

  const [form, setForm] = useState<Form>(INITIAL);
  // Logged in with a Crux account and launching on V7: the launch is signed by the login key and submitted by the relay,
  // with the account as creator (no gas, nothing needed on Base). The wallet stays one tap away.
  const crux = useCruxAccount();
  const [launchAs, setLaunchAs] = useState<"account" | "wallet">("account");
  // Gasless launches from a Crux account go through V7 (V8 can't name a Crux account as creator on testnet).
  const canLaunchFromAccount = FACTORY_V7 !== null && crux.loggedIn && crux.launchAccount !== null;
  const accountLaunch = canLaunchFromAccount && launchAs === "account";
  // V6 launches take the factory's batch-only window when created (owner-tunable); V5's is always 24 hours.
  const protectionWindow = useReadContract({
    chainId: TESTNET.id,
    address: LAUNCH_FACTORY?.address,
    abi: parseAbi(["function protectionWindow() view returns (uint256)"]),
    functionName: "protectionWindow",
    query: { enabled: (LAUNCH_FACTORY?.version ?? 0) >= 6 },
  });
  const factoryWindow =
    LAUNCH_FACTORY?.version === 5 ? 86_400 : (LAUNCH_FACTORY?.version ?? 0) >= 6 && protectionWindow.data !== undefined ? Number(protectionWindow.data) : null;
  // What this launch gets: V6 lets the creator turn it off.
  const batchOnlySeconds = (LAUNCH_FACTORY?.version ?? 0) >= 6 && !form.antiSniper ? 0 : factoryWindow;
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);

  const errors = validate(form);
  const showErr = (k: keyof Form) => (touched ? errors[k] : undefined);
  // Anti-vamp: the ticker, artwork and X link may not copy an existing Crux token (checked as the creator types).
  const guard = useLaunchGuard(form.symbol, form.logo.trim(), form.x.trim());
  // A block found at submit holds only for the inputs it was found for.
  const guardKey = `${form.symbol}|${form.logo.trim()}|${form.x.trim()}`;
  const [blocked, setBlocked] = useState<{ key: string; line: string; conflicts: Conflict[] } | null>(null);
  const vamp =
    (blocked?.key === guardKey ? blocked : null) ?? (guard.result && !guard.result.ok ? { line: guard.result.line, conflicts: guard.result.conflicts } : null);
  const busy = phase.kind === "simulating" || phase.kind === "deploying";
  const live = FACTORY !== null || LAUNCH_FACTORY !== null;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm(INITIAL);
    setTouched(false);
    setPhase({ kind: "form" });
    setError(null);
  };

  // Closing (or a failed attempt) keeps every value the creator typed; only a successful launch clears the form.
  const close = () => {
    if (busy) return;
    setTouched(false);
    setPhase({ kind: "form" });
    setError(null);
    onClose();
  };

  const simulate = async () => {
    for (let i = 0; i < SIM_STEPS.length; i++) {
      setPhase({ kind: "simulating", step: i });
      await sleep(1400);
    }
    // A deterministic preview address; clearly labelled as not on-chain.
    const preview = getAddress(`0x${keccak256(toHex(`crux:${form.name}:${form.symbol}:${Date.now()}`)).slice(-40)}`);
    setPhase({ kind: "done", token: preview, simulated: true, start: Math.floor(Date.now() / 1000) });
  };

  /** The launch parameters from the form (V2 and later). */
  const launchParams = () => {
    const totalSupply = parseUnits(digits(form.supply), 18);
    const sale = (totalSupply * BigInt(V2_SPLIT.saleBps)) / BigInt(10_000);
    const capBps = BigInt(Math.round(Number(form.walletCap) * 100));
    return {
      name: form.name.trim(),
      symbol: form.symbol,
      metadataURI: metadataURI(form),
      totalSupply,
      graduationTarget: parseUnits(digits(form.target), 6),
      startTime: BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(form.startsIn) * 60)),
      batchWindow: Number(form.window),
      maxAllocationPerWallet: (sale * capBps) / BigInt(10_000),
    };
  };

  /** CruxFactoryV7, from the Crux account: signed silently by the login key, submitted (and paid for) by the relay. */
  const deployFromAccount = async (factory: Address) => {
    if (!crux.sign || !crux.launchAccount) throw new Error("Your login key is still being set up. Try again in a moment.");
    setPhase({ kind: "deploying", label: "Signing the launch with your login…" });
    const params = launchParams();
    setPhase({ kind: "deploying", label: "Launching on Base: no gas needed…" });
    const auctionId = await launchFromAccount(crux.sign, crux.launchAccount, factory, params, { instantUnlock: form.instantUnlock, antiSniper: form.antiSniper });
    reset();
    onClose();
    router.push(`/launch/v7/${auctionId.toString()}`);
  };

  /** CruxFactoryV2 and later: scheduled start, per-wallet cap, locked liquidity. */
  const deployV2 = async (factory: Address, version: 2 | 3 | 4 | 5 | 6 | 7 | 8) => {
    if (accountLaunch && FACTORY_V7) return deployFromAccount(FACTORY_V7);
    if (!isConnected || !address) {
      openConnect();
      return;
    }
    if (chainId !== TESTNET.id) {
      setPhase({ kind: "deploying", label: "Switching to Base Sepolia…" });
      await switchChain({ chainId: TESTNET.id });
    }
    setPhase({ kind: "deploying", label: "Checking the launch settings…" });
    const params = launchParams();
    const onPrompt = () => setPhase({ kind: "deploying", label: "Confirm the launch in your wallet…" });
    // V8 deploys the token at a 5afe address: mine the salt for this wallet against the factory's init-code hash.
    if (version >= 8) {
      setPhase({ kind: "deploying", label: "Preparing your …5afe token address…" });
      const unsalted = { ...params, salt: `0x${"0".repeat(64)}` as Hex };
      const [deployer, initHash] = await Promise.all([
        readContract(config, { address: factory, abi: factoryV8Abi, functionName: "tokenDeployer", chainId: TESTNET.id }),
        readContract(config, { address: factory, abi: factoryV8Abi, functionName: "tokenInitCodeHash", args: [unsalted, address], chainId: TESTNET.id }),
      ]);
      // Let the label paint before the (about a second of) hashing.
      await sleep(30);
      const { salt, token } = mineTokenSalt(deployer, initHash);
      const salted = { ...params, salt };
      const predicted = await readContract(config, { address: factory, abi: factoryV8Abi, functionName: "predictToken", args: [salted, address], chainId: TESTNET.id });
      if (getAddress(predicted) !== getAddress(token) || !endsIn5afe(predicted)) throw new Error("The token address didn't check out. Try again.");
      const short5afe = `${predicted.slice(0, 6)}…${predicted.slice(-4)}`;
      const v8hash = await simulateThenWrite(
        config,
        address,
        { address: factory, abi: factoryV8Abi, functionName: "createAuctionWithOptions", chainId: TESTNET.id, args: [salted, form.instantUnlock, form.antiSniper] },
        () => setPhase({ kind: "deploying", label: `Confirm the launch in your wallet · token ${short5afe}` }),
      );
      setPhase({ kind: "deploying", label: `Deploying $${form.symbol} at ${short5afe}…`, hash: v8hash });
      const receipt = await waitForTransactionReceipt(config, { hash: v8hash, chainId: TESTNET.id });
      const [created] = parseEventLogs({ abi: cruxBatchFactoryAbi, eventName: "AuctionCreated", logs: receipt.logs });
      if (!created) throw new Error("Deployed, but no AuctionCreated event was found in the receipt.");
      reset();
      onClose();
      router.push(`/launch/v8/${created.args.auctionId.toString()}`);
      return;
    }
    // V6/V7 record both creator choices; V4/V5 the vesting choice; V2/V3 always vest over 30 days.
    const hash =
      version >= 6
        ? await simulateThenWrite(
            config,
            address,
            { address: factory, abi: factoryV6Abi, functionName: "createAuctionWithOptions", chainId: TESTNET.id, args: [params, form.instantUnlock, form.antiSniper] },
            onPrompt,
          )
        : version >= 4
        ? await simulateThenWrite(
            config,
            address,
            { address: factory, abi: factoryV4Abi, functionName: "createAuctionWithVesting", chainId: TESTNET.id, args: [params, form.instantUnlock] },
            onPrompt,
          )
        : await simulateThenWrite(
            config,
            address,
            { address: factory, abi: cruxBatchFactoryAbi, functionName: "createAuction", chainId: TESTNET.id, args: [params] },
            onPrompt,
          );
    setPhase({ kind: "deploying", label: "Deploying token and auction…", hash });
    const receipt = await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
    const [created] = parseEventLogs({ abi: cruxBatchFactoryAbi, eventName: "AuctionCreated", logs: receipt.logs });
    if (!created) throw new Error("Deployed, but no AuctionCreated event was found in the receipt.");
    reset();
    onClose();
    router.push(`/launch/v${version}/${created.args.auctionId.toString()}`);
  };

  const deploy = async () => {
    if (LAUNCH_FACTORY) return deployV2(LAUNCH_FACTORY.address, LAUNCH_FACTORY.version);
    if (!FACTORY) return;
    if (!isConnected || !address) {
      openConnect();
      return;
    }
    if (chainId !== TESTNET.id) {
      setPhase({ kind: "deploying", label: "Switching to Base Sepolia…" });
      await switchChain({ chainId: TESTNET.id });
    }
    setPhase({ kind: "deploying", label: "Checking the launch settings…" });
    const hash = await simulateThenWrite(config, address, {
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
    }, () => setPhase({ kind: "deploying", label: "Confirm the launch in your wallet…" }));
    setPhase({ kind: "deploying", label: "Deploying token and auction…", hash });
    const receipt = await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
    const [created] = parseEventLogs({ abi: cruxFactoryAbi, eventName: "AuctionCreated", logs: receipt.logs });
    if (!created) throw new Error("Deployed, but no AuctionCreated event was found in the receipt.");
    // The batch window started with this block, so go straight to the auction:
    // the creator keeps as much of it as possible to deposit.
    reset();
    onClose();
    router.push(`/launch/${created.args.auctionId.toString()}`);
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (Object.keys(errors).length) return;
    // A fresh check right before launching: the debounced one may be a moment old.
    const check = await checkLaunchNow({ symbol: form.symbol, image: form.logo.trim(), x: form.x.trim() });
    if (check && !check.ok) {
      setBlocked({ key: guardKey, line: check.line, conflicts: check.conflicts });
      return;
    }
    setBlocked(null);
    try {
      await (live ? deploy() : simulate());
    } catch (err) {
      // Readable reasons for the factory's reverts (caught by the pre-flight check) and wallet rejections.
      setError(launchError(err));
      setPhase({ kind: "form" });
    }
  };

  /** Opens the launch view: the on-chain auction, or the simulated preview of this form. */
  const viewInTerminal = () => {
    if (phase.kind !== "done") return;
    const href =
      phase.auctionId !== undefined
        ? `/launch/${phase.auctionId.toString()}`
        : previewHref({
            name: form.name.trim(),
            symbol: form.symbol,
            supply: digits(form.supply),
            target: digits(form.target),
            window: form.batchAuction ? BATCH_WINDOW_SECONDS : OPEN_SALE_HOURS * 3600,
            start: phase.start,
          });
    close();
    router.push(href);
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
            ? "Home chain: Base Sepolia (testnet). The token, its auction and its pool all live there."
            : "Preview mode: the launch contracts are awaiting testnet deployment."
      }
    >
      {phase.kind === "done" ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${phase.simulated ? "border-line-2 bg-void/60" : "border-signal/40 bg-signal/[0.06]"}`}>
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
                {LAUNCH_FACTORY
                  ? `${windowLabel(Number(form.window))} uniform-price batch auction`
                  : form.batchAuction
                    ? `${BATCH_WINDOW_SECONDS}s uniform-price batch auction`
                    : `${OPEN_SALE_HOURS}-hour pro-rata sale`}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={viewInTerminal} className={buttonClass("primary", "md", "flex-1 rounded-xl font-semibold")}>
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
                        <svg viewBox="0 0 16 16" className="h-4 w-4 text-signal" aria-hidden="true">
                          <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : state === "active" ? (
                        <KineticLoader className="text-signal" />
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
              <KineticLoader className="h-5 text-signal" />
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

          <Field id={id("logo")} label="Display image" error={showErr("logo")}>
            <DisplayImageField id={id("logo")} value={form.logo} onChange={(v) => set("logo", v)} invalid={Boolean(showErr("logo"))} inputCls={inputCls} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id("x")} label="X">
              <input id={id("x")} className={inputCls} placeholder="@handle" value={form.x} onChange={(e) => set("x", e.target.value)} />
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
            <Field id={id("target")} label="Graduation target" error={showErr("target")} hint={FACTORY ? "Test USDC the auction must raise to graduate" : "USDC the auction must raise to graduate"}>
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

          {LAUNCH_FACTORY && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={id("startsIn")}
                label="Scheduled start"
                error={showErr("startsIn")}
                hint="Minutes from now until deposits open, so buyers can gather"
              >
                <div className="relative">
                  <input
                    id={id("startsIn")}
                    className={`${inputCls} pr-20 font-mono`}
                    inputMode="numeric"
                    value={form.startsIn}
                    aria-invalid={Boolean(showErr("startsIn"))}
                    aria-describedby={`${id("startsIn")}-msg`}
                    onChange={(e) => set("startsIn", e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-dim">minutes</span>
                </div>
              </Field>
              <Field
                id={id("walletCap")}
                label="Max allocation per wallet"
                error={showErr("walletCap")}
                hint={capHint(form.walletCap, form.target)}
              >
                <div className="relative">
                  <input
                    id={id("walletCap")}
                    className={`${inputCls} pr-10 font-mono`}
                    inputMode="decimal"
                    value={form.walletCap}
                    aria-invalid={Boolean(showErr("walletCap"))}
                    aria-describedby={`${id("walletCap")}-msg`}
                    onChange={(e) => set("walletCap", e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-dim">%</span>
                </div>
              </Field>
            </div>
          )}

          {/* V2: every launch is a uniform-price batch; the creator picks how long it stays open */}
          {LAUNCH_FACTORY && (
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 text-[13px] text-chrome">Batch window</legend>
              <div role="radiogroup" aria-label="Batch window" className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {V2_WINDOWS.map((w) => {
                  const active = form.window === String(w.seconds);
                  return (
                    <button
                      key={w.seconds}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set("window", String(w.seconds))}
                      className={`h-10 rounded-lg border text-[13px] transition-colors ${
                        active ? "border-signal/70 bg-panel-2 text-chrome" : "border-line text-muted hover:text-chrome"
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-dim">
                Every bid in the window clears at one price, whatever its length. Longer windows give buyers time to find the launch.
              </p>
            </fieldset>
          )}

          {LAUNCH_FACTORY && LAUNCH_FACTORY.version >= 4 && (
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 text-[13px] text-chrome">Creator vesting</legend>
              <div role="radiogroup" aria-label="Creator vesting" className="mt-1 grid gap-2 sm:grid-cols-2">
                {[
                  { instant: false, title: "30-day vesting", note: "Recommended. Your 10% and share of the raise unlock linearly. Earns a trust badge." },
                  { instant: true, title: "Instant unlock", note: "Everything is released at graduation. Shown to buyers with a warning badge." },
                ].map((o) => {
                  const active = form.instantUnlock === o.instant;
                  return (
                    <button
                      key={o.title}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set("instantUnlock", o.instant)}
                      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-signal/70 bg-panel-2" : "border-line hover:border-line-2"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-[13px] ${active ? "text-chrome" : "text-muted"}`}>{o.title}</span>
                        <VestingBadge days={o.instant ? 0 : 30} />
                      </span>
                      <span className="mt-1.5 block text-[11.5px] leading-snug text-dim">{o.note}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-dim">Fixed on-chain at launch: it can&apos;t be changed later, and buyers see it before they bid.</p>
            </fieldset>
          )}

          {LAUNCH_FACTORY && LAUNCH_FACTORY.version >= 6 && (
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 text-[13px] text-chrome">Anti-sniper launch</legend>
              <div role="radiogroup" aria-label="Anti-sniper launch" className="mt-1 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    on: true,
                    title: "On",
                    note: `Recommended. Every trade in the first ${factoryWindow !== null ? `${windowLabel(factoryWindow).replace("-", " ")}s` : "minute"} after graduation clears at one price, so bots can't buy ahead of anyone. Earns a trust badge.`,
                  },
                  { on: false, title: "Off", note: "Trading opens on Uniswap the moment the auction graduates, so bots can buy first. Shown to buyers with a warning badge." },
                ].map((o) => {
                  const active = form.antiSniper === o.on;
                  return (
                    <button
                      key={o.title}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set("antiSniper", o.on)}
                      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-signal/70 bg-panel-2" : "border-line hover:border-line-2"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-[13px] ${active ? "text-chrome" : "text-muted"}`}>{o.title}</span>
                        <AntiSniperBadge seconds={o.on ? (factoryWindow ?? 60) : 0} />
                      </span>
                      <span className="mt-1.5 block text-[11.5px] leading-snug text-dim">{o.note}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-dim">Fixed on-chain at launch: it can&apos;t be changed later, and buyers see it before they bid.</p>
            </fieldset>
          )}

          {/* Batch auction toggle with an explanatory tooltip (also exposed as its description) */}
          {!LAUNCH_FACTORY && (
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
              <p className="mt-1 text-[11.5px] text-dim">
                {form.batchAuction
                  ? "Every opening order clears at the same price. Recommended."
                  : `Off: a ${OPEN_SALE_HOURS}-hour pro-rata sale. Everyone still pays one price, but buyers wait a full day to claim.`}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.batchAuction}
              aria-labelledby={id("ba-label")}
              onClick={() => set("batchAuction", !form.batchAuction)}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                form.batchAuction ? "border-signal/60 bg-signal" : "border-line-2 bg-line"
              }`}
            >
              <span
                className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-[left,background-color] ${
                  form.batchAuction ? "left-[22px] bg-void" : "left-[3px] bg-chrome/70"
                }`}
              />
            </button>
          </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-[12px] text-down">
              {error}
            </p>
          )}

          {LAUNCH_FACTORY && (
            <ul className="space-y-2 rounded-xl border border-line p-4 text-[12.5px] leading-snug text-muted">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                <span>
                  <span className="text-chrome">{V2_FEE.creatorShareBps / 100}% of protocol fees are automatically routed to your wallet upon graduation.</span>{" "}
                  The fee is {V2_FEE.feeBps / 100}% of the raise.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chrome/40" aria-hidden="true" />
                <span>
                  Liquidity is locked forever: {V2_SPLIT.lpBps / 100}% of supply and half the raise seed a Uniswap pool whose LP is burned
                  {LAUNCH_FACTORY.version >= 5 && batchOnlySeconds !== 0 ? " (after the batch-only window below)" : ""}. Your{" "}
                  {V2_SPLIT.creatorBps / 100}% and your share of the raise{" "}
                  {LAUNCH_FACTORY && LAUNCH_FACTORY.version >= 4 && form.instantUnlock ? "unlock at graduation (instant unlock)." : "vest over 30 days."}
                </span>
              </li>
              {LAUNCH_FACTORY.version >= 5 && batchOnlySeconds !== 0 && (
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chrome/40" aria-hidden="true" />
                  <span>
                    <span className="text-chrome">
                      Anti-sniper window{batchOnlySeconds !== null ? `: ${windowLabel(batchOnlySeconds).replace("-", " ")}s` : ""}.
                    </span>{" "}
                    After graduation the token trades only in 60-second batches, each cleared on-chain at one price, so nobody can
                    buy ahead of anyone. Then the liquidity moves to Uniswap, where every trading terminal can see it.
                  </span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chrome/40" aria-hidden="true" />
                <span>
                  <span className="text-chrome">One canonical pool.</span> All launch liquidity sits in a single Uniswap V2 pool on the home
                  chain, so the market is never split across chains and trades against one price.
                </span>
              </li>
            </ul>
          )}

          {canLaunchFromAccount && (
            <div className="flex flex-col gap-2">
              <div role="radiogroup" aria-label="Launch as" className="flex items-center gap-1.5 text-[12px]">
                <span className="mr-1 text-dim">Launch as</span>
                {(["account", "wallet"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={launchAs === v}
                    onClick={() => setLaunchAs(v)}
                    className={`h-7 rounded-[4px] border px-2.5 transition-colors ${launchAs === v ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
                  >
                    {v === "account" ? "Crux account · no gas" : "Wallet"}
                  </button>
                ))}
              </div>
              {accountLaunch && (
                <p className="text-[11.5px] leading-relaxed text-dim">
                  Signed with your login and launched on Base by Crux: no gas and nothing needed on Base, whatever chain your coins are on.
                  Your Crux account is the creator, so the creator fee and your share land there, withdrawable only to your bound address.
                  {LAUNCH_FACTORY?.version === 8 && " Account launches get an ordinary token address; launch from your wallet for a …5afe one."}
                </p>
              )}
            </div>
          )}

          {vamp && <VampBanner line={vamp.line} conflicts={vamp.conflicts} onLink={onClose} />}
          <button type="submit" disabled={vamp !== null} className={buttonClass("primary", "md", "w-full rounded-xl font-semibold")}>
            {accountLaunch ? "Launch from Crux account" : <>Deploy Token &amp; Initialize Auction</>} <ArrowUpRight />
          </button>
          {guard.checking && !vamp && <p className="text-center text-[11.5px] text-dim">Checking the ticker, artwork and X link against existing Crux tokens…</p>}
          {live && !isConnected && !accountLaunch && <p className="text-center text-[11.5px] text-dim">You&apos;ll be asked to connect a wallet first.</p>}
        </form>
      )}
    </Modal>
  );
}

/** The anti-vamp block: what this launch would copy, with a link to each original. */
function VampBanner({ line, conflicts, onLink }: { line: string; conflicts: Conflict[]; onLink: () => void }) {
  const originals = [...new Map(conflicts.map((c) => [c.token, c])).values()];
  return (
    <div role="alert" className="rounded-xl border border-down bg-down/15 px-4 py-3">
      <p className="text-[13px] font-semibold text-chrome">{line}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-chrome/85">
        Crux blocks launches that copy an existing token. Already on Crux:{" "}
        {originals.map((c, i) => (
          <span key={c.token}>
            {i > 0 && ", "}
            <a href={c.href} onClick={onLink} className="font-medium text-chrome underline decoration-chrome/50 underline-offset-2 hover:decoration-chrome">
              ${c.symbol}
            </a>
          </span>
        ))}
        . Change the ticker, artwork or X link to continue.
      </p>
    </div>
  );
}
