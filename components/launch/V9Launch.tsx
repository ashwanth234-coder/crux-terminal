"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatUnits, maxUint256, parseUnits, zeroAddress, type Address } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { erc20Abi } from "viem";
import { Header } from "@/components/site/Header";
import { ProChart } from "@/components/chart/ProChart";
import { buttonClass } from "@/components/ui/Button";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { simulateThenWrite } from "@/lib/preflight";
import { tradeFromAccount } from "@/lib/account";
import { launchCaip19 } from "@/lib/launchTrade";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import type { AuctionV2 } from "@/lib/launchV2";
import { FACTORY_V9, ROUTER_V9, V9_ON, curvePrice, curveV9Abi, factoryV9Abi, phaseV9, registerV9Curve, routerV9Abi, type PhaseV9 } from "@/lib/v9";

const usd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const SLIPPAGE_BPS = BigInt(1_000); // 10%, the terminal's default
const PHASE_LABEL: Record<PhaseV9, string> = { opening: "Fair opening", curve: "Trading on its curve", graduating: "Graduating", graduated: "On Uniswap" };

function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** /launch/v9/[id]: one V9 launch, through its fair opening, its curve and its Uniswap pool. */
export function V9LaunchRoute() {
  const { id: raw } = useParams<{ id: string }>();
  const id = /^\d+$/.test(raw ?? "") ? BigInt(raw) : null;
  if (!V9_ON) return <Shell><p className="text-muted">V9 launches aren&apos;t live on this site yet.</p></Shell>;
  if (id === null) return <Shell><p className="text-muted">That isn&apos;t a launch number.</p></Shell>;
  return <V9Launch id={id} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-24 sm:px-8 lg:px-12">{children}</main>
    </>
  );
}

function V9Launch({ id }: { id: bigint }) {
  const now = useNowSeconds();
  const launch = useReadContracts({ contracts: [{ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [id], chainId: TESTNET.id }] });
  const l = launch.data?.[0]?.result as { token: Address; curve: Address; pair: Address; creator: Address } | undefined;
  useEffect(() => {
    if (l) registerV9Curve(l.pair, l.curve);
  }, [l]);

  const curve = l?.curve ?? zeroAddress;
  const token = l?.token ?? zeroAddress;
  const reads = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(l), refetchInterval: 3_000 },
    contracts: [
      { address: token, abi: erc20Abi, functionName: "name", chainId: TESTNET.id },
      { address: token, abi: erc20Abi, functionName: "symbol", chainId: TESTNET.id },
      { address: token, abi: erc20Abi, functionName: "totalSupply", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "graduated", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "openingEnds", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "realUsdc", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "threshold", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "spotPrice", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "launchedAt", chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "creatorVesting", chainId: TESTNET.id },
      { address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [token, BigInt(10) ** BigInt(18)], chainId: TESTNET.id },
    ],
  });
  const r = (i: number) => reads.data?.[i]?.result;
  const name = r(0) as string | undefined;
  const symbol = (r(1) as string | undefined) ?? "…";
  const supply = (r(2) as bigint | undefined) ?? BigInt(0);
  const graduated = (r(3) as boolean | undefined) ?? false;
  const openingEnds = Number((r(4) as bigint | undefined) ?? BigInt(0));
  const realUsdc = (r(5) as bigint | undefined) ?? BigInt(0);
  const threshold = (r(6) as bigint | undefined) ?? BigInt(1);
  const spot = (r(7) as bigint | undefined) ?? BigInt(0);
  const launchedAt = Number((r(8) as bigint | undefined) ?? BigInt(0));
  const vesting = Number((r(9) as bigint | undefined) ?? BigInt(0));
  const sellOne = r(10) as readonly [bigint, bigint] | undefined;

  if (launch.isLoading) return <Shell><p className="text-muted">Reading the launch…</p></Shell>;
  if (!l) return <Shell><p className="text-muted">No V9 launch #{id.toString()} on Base Sepolia.</p></Shell>;

  const phase = phaseV9({ graduated, openingEnds, realUsdc, threshold }, now);
  // Before graduation the curve's spot price; after, what one token sells for in the pool (fees included).
  const price = graduated ? (sellOne ? Number(formatUnits(sellOne[0] + sellOne[1], 6)) : 0) : curvePrice(spot);
  const mcap = price * Number(formatUnits(supply, 18));
  const progress = graduated ? 100 : Math.min(100, Number((realUsdc * BigInt(10_000)) / threshold) / 100);
  const auction: AuctionV2 = {
    token: l.token,
    creator: l.creator,
    startTime: launchedAt,
    batchWindow: 0,
    status: 1,
    bidderCount: 0,
    settledAt: launchedAt,
    pair: l.pair,
    totalSupply: supply,
    saleSupply: supply,
    graduationTarget: threshold,
    floorPrice: BigInt(0),
    maxAllocationPerWallet: BigInt(0),
    totalDeposits: realUsdc,
    clearingPrice: BigInt(0),
  };

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] text-bright">
            {name ?? "…"} <span className="text-muted">${symbol}</span>
          </h1>
          <p className="mt-1 font-mono text-[11.5px] text-dim">
            <a href={`${TESTNET_EXPLORER}/token/${l.token}`} target="_blank" rel="noopener noreferrer" className="hover:text-chrome">
              {l.token}
            </a>{" "}
            · V9 #{id.toString()} · Base Sepolia testnet
          </p>
        </div>
        <span className="rounded-[4px] border border-line-2 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-chrome">
          {PHASE_LABEL[phase]}
          {phase === "opening" && ` · ${openingEnds - now}s`}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-4 md:grid-cols-4">
        <Stat label="Price" value={price > 0 ? `$${price.toPrecision(3)}` : "…"} />
        <Stat label="Market cap" value={mcap > 0 ? `$${mcap.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "…"} />
        <Stat label={graduated ? "Graduated with" : "Raised on the curve"} value={`$${usd(graduated ? threshold : realUsdc)} of $${usd(threshold)}`} />
        <Stat label="Creator tokens" value={vesting === 0 ? "Unlocked (creator's choice)" : `Vest over ${Math.round(vesting / 86_400)} days`} />
      </dl>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line" aria-label="Progress to graduation">
        <div className="h-full bg-up transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-dim">
        {graduated ? "Graduated: trading on its Uniswap pool on Base, liquidity burned." : `Graduates into a Uniswap pool on Base at $${usd(threshold)} (testnet scale; mainnet $10,000).`}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="min-h-[420px] min-w-0 rounded-xl border border-line lg:col-span-8">
          <ProChart auction={auction} symbol={symbol} name={name ?? null} factory={FACTORY_V9} id={id.toString()} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <TradePanel token={l.token} curve={l.curve} symbol={symbol} phase={phase} />
          <CreatorPanel token={l.token} curve={l.curve} creator={l.creator} symbol={symbol} />
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim">{label}</dt>
      <dd className="mt-1 text-[15px] text-chrome">{value}</dd>
    </div>
  );
}

/** Buy or sell from the CRUX Account (gasless, the relay) or the wallet (CruxRouterV9); deposit during a fair opening. */
function TradePanel({ token, curve, symbol, phase }: { token: Address; curve: Address; symbol: string; phase: PhaseV9 }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const crux = useCruxAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [from, setFrom] = useState<"account" | "wallet">("account");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const accountReady = Boolean(crux.account && crux.sign && crux.owner);
  const via = from === "account" && accountReady ? "account" : "wallet";
  const opening = phase === "opening";

  const amountIn = useMemo(() => {
    try {
      return amount ? parseUnits(amount, side === "buy" || opening ? 6 : 18) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [amount, side, opening]);

  const quote = useReadContracts({
    allowFailure: true,
    query: { enabled: amountIn > BigInt(0) && !opening, refetchInterval: 3_000 },
    contracts: [
      side === "buy"
        ? { address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteBuy", args: [token, amountIn], chainId: TESTNET.id }
        : { address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [token, amountIn], chainId: TESTNET.id },
    ],
  });
  const openingReads = useReadContracts({
    allowFailure: true,
    query: { enabled: opening, refetchInterval: 3_000 },
    contracts: [{ address: curve, abi: curveV9Abi, functionName: "openingTotal", chainId: TESTNET.id }],
  });
  const openingTotal = (openingReads.data?.[0]?.result as bigint | undefined) ?? BigInt(0);
  const openingQuote = useReadContracts({
    allowFailure: true,
    query: { enabled: opening && amountIn > BigInt(0), refetchInterval: 3_000 },
    contracts: [{ address: curve, abi: curveV9Abi, functionName: "quoteBuy", args: [openingTotal + amountIn], chainId: TESTNET.id }],
  });
  const openingAll = (openingQuote.data?.[0]?.result as readonly bigint[] | undefined)?.[0] ?? BigInt(0);
  // Its share of what the opening would buy if nobody else joins: more deposits only raise the one price.
  const shareIfAlone = openingTotal + amountIn > BigInt(0) ? (openingAll * amountIn) / (openingTotal + amountIn) : BigInt(0);
  const out = opening ? shareIfAlone : ((quote.data?.[0]?.result as readonly bigint[] | undefined)?.[0] ?? BigInt(0));
  const split = side === "buy" ? (quote.data?.[0]?.result as readonly bigint[] | undefined) : undefined;
  // A buy at open signs half its share-if-alone: it fills unless the opening's price ends up over twice today's.
  const minOut = opening ? out / BigInt(2) : (out * (BigInt(10_000) - SLIPPAGE_BPS)) / BigInt(10_000);

  const mine = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
    contracts: [{ address: curve, abi: curveV9Abi, functionName: "openingDeposit", args: [address ?? zeroAddress], chainId: TESTNET.id }],
  });
  const myDeposit = (mine.data?.[0]?.result as bigint | undefined) ?? BigInt(0);

  const onBase = async () => {
    if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
  };
  const approve = async (erc20: Address, spender: Address, need: bigint) => {
    const allowance = await readContract(config, { chainId: TESTNET.id, address: erc20, abi: erc20Abi, functionName: "allowance", args: [address!, spender] });
    if (allowance >= need) return;
    setBusy("Approve in your wallet (once)…");
    const hash = await simulateThenWrite(config, address!, { chainId: TESTNET.id, address: erc20, abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] });
    await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
  };
  const run = async (what: string, fn: () => Promise<string>) => {
    setNote(null);
    setBusy(what);
    try {
      setNote({ ok: true, text: await fn() });
      setAmount("");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setNote({ ok: false, text: /rejected|denied|cancel/i.test(msg) ? "Cancelled in the wallet. Nothing changed." : msg.split("\n")[0] });
    } finally {
      setBusy(null);
    }
  };

  const trade = () =>
    run("Sending…", async () => {
      if (via === "account") {
        const res = await tradeFromAccount(crux.sign!, crux.owner!, crux.account!, {
          tokenIn: side === "buy" ? TESTNET_USDC : token,
          amountIn,
          tokenOut: launchCaip19(side === "buy" ? token : TESTNET_USDC),
          minAmountOut: minOut,
        });
        if (opening) return "In the fair opening from your CRUX Account: your tokens arrive when it ends, at its one price.";
        return res.filled ? `Filled from your CRUX Account.` : `Order placed from your CRUX Account: it fills in seconds.`;
      }
      if (!address) throw new Error("Connect a wallet first.");
      await onBase();
      await approve(side === "buy" ? TESTNET_USDC : token, ROUTER_V9, amountIn);
      setBusy("Confirm in your wallet…");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const hash = await simulateThenWrite(config, address, {
        chainId: TESTNET.id,
        address: ROUTER_V9,
        abi: routerV9Abi,
        functionName: side === "buy" ? "buy" : "sell",
        args: [token, amountIn, minOut, address, deadline],
      });
      await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
      return side === "buy" ? `Bought $${symbol}.` : `Sold $${symbol}.`;
    });

  const deposit = () =>
    run("Depositing…", async () => {
      if (!address) throw new Error("Connect a wallet to join the fair opening.");
      await onBase();
      await approve(TESTNET_USDC, curve, amountIn);
      setBusy("Confirm in your wallet…");
      const hash = await simulateThenWrite(config, address, { chainId: TESTNET.id, address: curve, abi: curveV9Abi, functionName: "deposit", args: [amountIn, address] });
      await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
      return "Deposited. Everyone in the opening pays one price; claim your tokens when it ends.";
    });

  const claim = () =>
    run("Claiming…", async () => {
      await onBase();
      const hash = await simulateThenWrite(config, address!, { chainId: TESTNET.id, address: curve, abi: curveV9Abi, functionName: "claimOpening", args: [address!] });
      await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
      return "Claimed your opening tokens (and any refund).";
    });

  const fmtOut = (v: bigint) => (side === "buy" ? `${Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 })} $${symbol}` : `$${usd(v)}`);

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      {opening ? (
        <>
          <h2 className="text-[15px] font-medium text-chrome">Fair opening</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">Every deposit is bought as one order at one price when the opening ends: there&apos;s nothing to snipe.</p>
        </>
      ) : (
        <div className="flex gap-1" role="tablist">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className={`h-8 flex-1 rounded-[4px] border text-[13px] ${side === s ? (s === "buy" ? "border-up/60 text-up" : "border-down/60 text-down") : "border-line-2 text-muted"}`}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
      )}

      {accountReady && (
        <div className="mt-3 flex gap-3 text-[12px]">
          {(["account", "wallet"] as const).map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-muted">
              <input type="radio" name="v9-from" checked={from === f} onChange={() => setFrom(f)} />
              {f === "account" ? "CRUX Account (no gas, no pop-ups)" : "Wallet"}
            </label>
          ))}
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.00"
          aria-label={side === "buy" || opening ? "Amount in USDC" : `Amount in ${symbol}`}
          className="w-full bg-transparent font-mono text-[16px] text-chrome outline-none"
        />
        <span className="font-mono text-[12px] text-dim">{side === "buy" || opening ? "USDC" : `$${symbol}`}</span>
      </label>

      {opening && out > BigInt(0) && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          About {fmtOut(out)} if nobody else joins · everyone pays one price when it ends
          {via === "account" && ` · fills unless that price is over twice today's (at least ${fmtOut(minOut)}); otherwise refunded`}
        </p>
      )}
      {!opening && out > BigInt(0) && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          About {fmtOut(out)} · at least {fmtOut(minOut)} (10% slippage)
          {split && split[1] > BigInt(0) && split[2] > BigInt(0) && " · this buy reaches graduation: part on the curve, the rest in the new pool, in one transaction"}
        </p>
      )}

      <button
        type="button"
        disabled={busy !== null || amountIn === BigInt(0) || out === BigInt(0)}
        onClick={() => void (opening && via === "wallet" ? deposit() : trade())}
        className={`${buttonClass("primary", "md", "rounded-lg")} mt-3 w-full`}
      >
        {busy ?? (opening ? "Deposit into the opening" : side === "buy" ? `Buy $${symbol}` : `Sell $${symbol}`)}
      </button>

      {myDeposit > BigInt(0) && !opening && (
        <button type="button" disabled={busy !== null} onClick={() => void claim()} className={`${buttonClass("outline", "sm", "rounded-lg")} mt-2 w-full`}>
          Claim your opening tokens (${usd(myDeposit)} deposited)
        </button>
      )}
      {note && <p className={`mt-2 text-[12px] leading-snug ${note.ok ? "text-up" : "text-down"}`}>{note.text}</p>}
      {opening && via === "wallet" && <p className="mt-2 text-[11.5px] text-dim">From a wallet: claim your tokens here when the opening ends.</p>}
    </section>
  );
}

/** What the creator has earned (curve fees, then router fees after graduation) and their vested tokens, with claims. */
function CreatorPanel({ token, curve, creator, symbol }: { token: Address; curve: Address; creator: Address; symbol: string }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const crux = useCruxAccount();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const reads = useReadContracts({
    allowFailure: true,
    query: { refetchInterval: 10_000 },
    contracts: [
      { address: ROUTER_V9, abi: routerV9Abi, functionName: "creatorEarnings", args: [token], chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "creatorClaimable", chainId: TESTNET.id },
    ],
  });
  const earnings = reads.data?.[0]?.result as readonly [bigint, bigint] | undefined;
  const claimable = (reads.data?.[1]?.result as bigint | undefined) ?? BigInt(0);
  const isCreator = [address, crux.account].some((a) => a && a.toLowerCase() === creator.toLowerCase());

  const send = async (fn: "claimAllCreatorFees" | "claimCreator") => {
    if (!address) return setNote("Connect a wallet to send the claim (it pays the creator, whoever sends it).");
    setBusy(true);
    setNote(null);
    try {
      if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
      const hash =
        fn === "claimAllCreatorFees"
          ? await simulateThenWrite(config, address, { chainId: TESTNET.id, address: ROUTER_V9, abi: routerV9Abi, functionName: "claimAllCreatorFees", args: [token] })
          : await simulateThenWrite(config, address, { chainId: TESTNET.id, address: curve, abi: curveV9Abi, functionName: "claimCreator", args: [] });
      await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
      setNote(fn === "claimAllCreatorFees" ? "Fees paid to the creator." : "Vested tokens sent to the creator.");
      void reads.refetch();
    } catch (e) {
      setNote(((e as Error).message ?? String(e)).split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-line p-4 text-[12.5px]">
      <h2 className="text-[14px] font-medium text-chrome">Creator {isCreator && <span className="text-up">· you</span>}</h2>
      <p className="mt-1 font-mono text-[11px] text-dim">
        <Link href={`${TESTNET_EXPLORER}/address/${creator}`} target="_blank" className="hover:text-chrome">
          {creator.slice(0, 6)}…{creator.slice(-4)}
        </Link>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-dim">Fees earned (30% of 1%)</dt>
          <dd className="mt-0.5 text-chrome">${earnings ? usd(earnings[1]) : "…"}</dd>
        </div>
        <div>
          <dt className="text-dim">Unclaimed</dt>
          <dd className="mt-0.5 text-chrome">${earnings ? usd(earnings[0]) : "…"}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !earnings || earnings[0] === BigInt(0)} onClick={() => void send("claimAllCreatorFees")} className={buttonClass("outline", "sm", "rounded-lg")}>
          Pay out fees
        </button>
        <button type="button" disabled={busy || claimable === BigInt(0)} onClick={() => void send("claimCreator")} className={buttonClass("outline", "sm", "rounded-lg")}>
          Claim vested {claimable > BigInt(0) ? `${Number(formatUnits(claimable, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 })} $${symbol}` : `$${symbol}`}
        </button>
      </div>
      {note && <p className="mt-2 text-muted">{note}</p>}
    </section>
  );
}
