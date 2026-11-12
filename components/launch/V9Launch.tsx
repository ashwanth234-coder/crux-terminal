"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatUnits, maxUint256, parseAbi, parseUnits, zeroAddress, type Address } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { erc20Abi } from "viem";
import { Header } from "@/components/site/Header";
import { ChartGrid } from "@/components/chart/ChartGrid";
import { TerminalShell } from "@/components/pro/TerminalShell";
import { LiveTape } from "@/components/pro/LiveTape";
import { Momentum } from "@/components/pro/Momentum";
import { V9TokenBar } from "@/components/launch/V9TokenBar";
import { Menu } from "@/components/ui/Menu";
import { TradeSettingsButton } from "@/components/pro/TradeSettingsButton";
import { useTradeSettings } from "@/hooks/useTradeSettings";
import { buttonClass } from "@/components/ui/Button";
import { TESTNET } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { simulateThenWrite } from "@/lib/preflight";
import { tradeFromAccount } from "@/lib/account";
import { launchCaip19 } from "@/lib/launchTrade";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import type { AuctionV2 } from "@/lib/launchV2";
import { tokensForUsdc } from "@/lib/sellAmount";
import { CreatorNote } from "@/components/launch/V9Creator";
import { StandingOrderForm, type OrderType } from "@/components/pro/StandingOrderForm";
import { FACTORY_V9, ROUTER_V9, V9_ON, curvePrice, curveV9Abi, factoryV9Abi, phaseV9, registerV9Curve, routerV9Abi, type PhaseV9 } from "@/lib/v9";

const usd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const SLIPPAGE_BPS = BigInt(1_000); // 10%, the terminal's default

function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** /launch/v9/[id]: one V9 launch, through its fair opening, its curve and its Uniswap pool. */


/** The pool price is quoted for this many tokens (a whole token is worth less than one USDC unit). */
const PRICE_LOT_TOKENS = 1_000_000;
const pairPriceAbi = parseAbi(["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"]);
const PRICE_LOT = BigInt(PRICE_LOT_TOKENS) * BigInt(10) ** BigInt(18);
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
  // A trader picked in the tape: the tape and the chart's marks filter to that wallet.
  const [focus, setFocus] = useState<Address | null>(null);
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
      { address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [token, PRICE_LOT], chainId: TESTNET.id },
      { address: l?.pair ?? zeroAddress, abi: pairPriceAbi, functionName: "getReserves", chainId: TESTNET.id },
      { address: l?.pair ?? zeroAddress, abi: pairPriceAbi, functionName: "token0", chainId: TESTNET.id },
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
  const reserves = r(11) as readonly [bigint, bigint, number] | undefined;
  const token0 = r(12) as Address | undefined;

  if (launch.isLoading) return <Shell><p className="text-muted">Reading the launch…</p></Shell>;
  if (!l) return <Shell><p className="text-muted">No V9 launch #{id.toString()} on Base Sepolia.</p></Shell>;

  const phase = phaseV9({ graduated, openingEnds, realUsdc, threshold }, now);
  // Before graduation the curve's spot price; after, what one token sells for in the pool (fees included).
  // After graduation, the pool's own price (USDC reserve / token reserve), the same number the chart closes on; the
  // router's sell quote for a million tokens (fee and impact included) only when the reserves aren't read yet.
  const poolSpot =
    reserves && token0 && l
      ? (() => {
          const [tok, usd] = token0.toLowerCase() === l.token.toLowerCase() ? [reserves[0], reserves[1]] : [reserves[1], reserves[0]];
          return tok > BigInt(0) ? Number(formatUnits(usd, 6)) / Number(formatUnits(tok, 18)) : 0;
        })()
      : 0;
  const quoted = sellOne ? Number(formatUnits(sellOne[0] + sellOne[1], 6)) / PRICE_LOT_TOKENS : 0;
  const price = graduated ? poolSpot || quoted : curvePrice(spot);
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

  const poolUsdc = graduated && reserves && token0 ? (token0.toLowerCase() === l.token.toLowerCase() ? reserves[1] : reserves[0]) : null;
  const sym = `$${symbol}`;

  // The pro terminal (as for every launch): token bar; chart and execution side by side; trades, holders, top traders
  // and your orders below. Phones stack them: bar, chart, execution, tape.
  return (
    <TerminalShell>
      <V9TokenBar
        id={id}
        auction={auction}
        symbol={symbol}
        name={name ?? null}
        phase={phase}
        price={price}
        realUsdc={realUsdc}
        threshold={threshold}
        poolUsdc={poolUsdc}
        vestingSeconds={vesting}
        openingLeft={Math.max(0, openingEnds - now)}
        now={now}
      />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-px bg-line max-lg:pb-28 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)_minmax(190px,28%)]">
        <section aria-label="Chart" className="bg-void p-1.5 max-lg:h-[72svh] max-lg:min-h-[460px] lg:col-start-1 lg:row-start-1 lg:min-h-0">
          {launchedAt > 0 ? (
            <ChartGrid auction={auction} symbol={sym} name={name ?? null} factory={FACTORY_V9} id={id.toString()} focus={focus} onFocus={setFocus} />
          ) : (
            <p className="p-4 text-[12.5px] text-muted">Loading the chart…</p>
          )}
        </section>

        <aside aria-label="Execution" className="flex flex-col gap-3 bg-panel p-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto">
          <TradePanel token={l.token} curve={l.curve} symbol={symbol} phase={phase} price={price} supply={Number(formatUnits(supply, 18))} />
          {launchedAt > 0 && <Momentum auction={auction} symbol={symbol} />}
          <CreatorNote creator={l.creator} symbol={symbol} />
        </aside>

        <section aria-label="Trades, holders and orders" className="min-h-[260px] bg-void p-3 lg:col-start-1 lg:row-start-2">
          <LiveTape factory={FACTORY_V9} id={id.toString()} auction={auction} graduated live={false} symbol={sym} version={8} focus={focus} onFocus={setFocus} curve />
        </section>
      </div>
    </TerminalShell>
  );
}

/** Buy or sell from the CRUX Account (gasless, the relay) or the wallet (CruxRouterV9); deposit during a fair opening. */
function TradePanel({ token, curve, symbol, phase, price, supply }: { token: Address; curve: Address; symbol: string; phase: PhaseV9; price: number; supply: number }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const crux = useCruxAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  // Market, or a standing order (buy the dip; stop loss, take profit, trailing, both) that the keeper sends from the
  // CRUX Account when the price gets there, with this page closed.
  const [orderType, setOrderType] = useState<OrderType>("market");
  // The one-click sizes: your four quick-buy dollar amounts and quick-sell shares, edited with the gear beside them.
  const settings = useTradeSettings();
  const [from, setFrom] = useState<"account" | "wallet">("account");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const accountReady = Boolean(crux.account && crux.sign && crux.owner);
  const via = from === "account" && accountReady ? "account" : "wallet";
  const opening = phase === "opening";
  // Between the opening's end and its settlement (the solver or keeper settles it within seconds) nothing can be
  // priced yet: say so, rather than "too small".
  const settledRead = useReadContracts({
    allowFailure: true,
    query: { enabled: phase === "curve" || phase === "graduating", refetchInterval: 2_000 },
    contracts: [{ address: curve, abi: curveV9Abi, functionName: "openingSettled", chainId: TESTNET.id }],
  });
  const settling = (phase === "curve" || phase === "graduating") && settledRead.data?.[0]?.result === false;
  // A message from the opening ("your tokens arrive when it ends") is stale once it has ended.
  const [wasOpening, setWasOpening] = useState(opening);
  if (wasOpening !== opening) {
    setWasOpening(opening);
    if (!opening) setNote(null);
  }

  // What the trader holds where this trade pays from (their CRUX Account or wallet), and what all their tokens sell
  // for: a sell is typed in USDC, and its tokens are worked out from these.
  const holder = via === "account" ? crux.account : address;
  const held = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(holder), refetchInterval: 5_000 },
    contracts: [
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder ?? zeroAddress], chainId: TESTNET.id },
      { address: TESTNET_USDC, abi: erc20Abi, functionName: "balanceOf", args: [holder ?? zeroAddress], chainId: TESTNET.id },
    ],
  });
  const tokensHeld = (held.data?.[0]?.result as bigint | undefined) ?? BigInt(0);
  const usdcHeld = (held.data?.[1]?.result as bigint | undefined) ?? BigInt(0);
  const heldValue = useReadContracts({
    allowFailure: true,
    query: { enabled: side === "sell" && tokensHeld > BigInt(0) && !opening, refetchInterval: 10_000 },
    contracts: [{ address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [token, tokensHeld], chainId: TESTNET.id }],
  });
  const tokensHeldUsd = (heldValue.data?.[0]?.result as readonly bigint[] | undefined)?.[0];
  const selling = side === "sell" && !opening;

  // Every amount is typed in USDC: a buy spends it; a sell asks for about that much back.
  const usdIn = useMemo(() => {
    try {
      return amount ? parseUnits(amount, 6) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [amount]);
  // A sell's tokens: picked as a share of the holding (25% / 50% / Max), or found for the USDC typed. Two quotes: a
  // first guess in proportion to what the whole holding sells for, then corrected by what that guess sells for (a
  // smaller sale moves the price less, so it returns a little more per token).
  const [picked, setPicked] = useState<bigint | null>(null);
  // Only the quoted case is found in an effect (it reads the chain); the others follow from what's on screen.
  const solveKey = `${usdIn}:${tokensHeld}:${tokensHeldUsd ?? ""}`;
  const needsQuote = selling && picked === null && usdIn > BigInt(0) && tokensHeld > BigInt(0) && tokensHeldUsd !== undefined && usdIn < tokensHeldUsd;
  const [solved, setSolved] = useState<{ key: string; tokens: bigint } | null>(null);
  useEffect(() => {
    if (!needsQuote || !tokensHeldUsd) return;
    let live = true;
    const t = setTimeout(async () => {
      const tokens = await tokensForUsdc(usdIn, tokensHeld, tokensHeldUsd, async (t) => {
        const [got] = (await readContract(config, { chainId: TESTNET.id, address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [token, t] })) as readonly bigint[];
        return got;
      });
      if (live) setSolved({ key: solveKey, tokens });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [needsQuote, solveKey, usdIn, tokensHeld, tokensHeldUsd, config, token]);
  const sellTokens = !selling
    ? BigInt(0)
    : picked !== null
      ? picked
      : usdIn === BigInt(0) || tokensHeld === BigInt(0) || !tokensHeldUsd
        ? BigInt(0)
        : usdIn >= tokensHeldUsd
          ? usdIn === tokensHeldUsd
            ? tokensHeld
            : tokensHeld + BigInt(1) // more than the holding: shown as over the balance
          : solved?.key === solveKey
            ? solved.tokens
            : BigInt(0);
  const amountIn = selling ? sellTokens : usdIn;

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

  const overHeld = holder !== undefined && held.data !== undefined && (selling ? amountIn > tokensHeld : amountIn > usdcHeld);
  const quoted = quote.data !== undefined && !quote.isFetching;
  // The price read itself failing (a node down for a moment) is not a zero quote.
  const quoteFailed = quote.isError || quote.data?.[0]?.status === "failure";
  const tokensText = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 });
  // Why the button is off, in words (it used to grey out silently).
  const reason =
    amountIn === BigInt(0)
      ? null
      : overHeld
        ? selling
          ? `Your $${symbol}${via === "account" ? " in your CRUX Account" : ""} sells for about $${usd(tokensHeldUsd ?? BigInt(0))}. Try that or less, or press Max.`
          : `Not enough USDC${via === "account" ? " in your CRUX Account" : ""} ($${usd(usdcHeld)}).`
        : settling
          ? "The fair opening just ended and is being settled: trading opens in a few seconds."
          : !opening && quoteFailed
            ? "Couldn't get a price just now: retrying…"
          : !opening && quoted && out === BigInt(0)
          ? selling
            ? "Too small to sell: try a larger amount, or a quick sell."
            : "Too small to buy anything."
          : null;

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
  /** When this page's last trade finished: a quote read before then is from the price before it. */
  const lastTradeAt = useRef(0);
  const run = async (what: string, fn: () => Promise<string>) => {
    setNote(null);
    setBusy(what);
    try {
      setNote({ ok: true, text: await fn() });
      setAmount("");
      setPicked(null);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setNote({ ok: false, text: /rejected|denied|cancel/i.test(msg) ? "Cancelled in the wallet. Nothing changed." : msg.split("\n")[0] });
      // The relay refused it because the price moved: show the new price straight away (the amount is still typed).
      if (/price has moved/i.test(msg)) void quote.refetch();
    } finally {
      lastTradeAt.current = Date.now();
      setBusy(null);
    }
  };

  /**
   * The minimum to sign, from a quote no older than 2 s and newer than this page's last trade. After a trade the box
   * empties and its quote stops refreshing, so typing the same amount again showed (and signed) the price from before
   * that trade: seen live, a second buy signed a minimum 15% over the price the first buy had left, and sat unfilled.
   */
  const freshMinOut = async () => {
    if (opening) return minOut; // the opening's floor is half its share-if-alone, not a live price
    const current = quote.dataUpdatedAt > lastTradeAt.current && Date.now() - quote.dataUpdatedAt < 2_000;
    const data = current ? quote.data : (await quote.refetch()).data;
    const got = (data?.[0]?.result as readonly bigint[] | undefined)?.[0] ?? BigInt(0);
    if (got === BigInt(0)) throw new Error("Couldn't get a fresh price just now: try again in a moment.");
    return (got * (BigInt(10_000) - SLIPPAGE_BPS)) / BigInt(10_000);
  };

  /** One tap from the CRUX Account: a fresh quote for exactly `amount` (USDC for a buy, tokens for a sell), signed with a
   *  minimum 10% under it, sent through the relay. Nothing to type, no pop-up. */
  const quick = (label: string, amount: bigint) =>
    run(`${label}…`, async () => {
      if (!accountReady) throw new Error("Log in to trade in one click from your CRUX Account.");
      if (amount <= BigInt(0)) throw new Error("Nothing to sell yet.");
      const buy = side === "buy";
      const [got] = (await readContract(config, {
        chainId: TESTNET.id,
        address: ROUTER_V9,
        abi: routerV9Abi,
        functionName: buy ? "quoteBuy" : "quoteSell",
        args: [token, amount],
      })) as readonly bigint[];
      if (got === BigInt(0)) throw new Error(settling ? "The fair opening just ended and is being settled: try again in a few seconds." : "Too small to trade.");
      const res = await tradeFromAccount(crux.sign!, crux.owner!, crux.account!, {
        tokenIn: buy ? TESTNET_USDC : token,
        amountIn: amount,
        tokenOut: launchCaip19(buy ? token : TESTNET_USDC),
        minAmountOut: (got * (BigInt(10_000) - SLIPPAGE_BPS)) / BigInt(10_000),
      });
      const what = buy ? `Bought $${usd(amount)} of $${symbol}` : `Sold about $${usd(got)} of $${symbol}`;
      return res.filled ? `${what}.` : `${what}: order placed, it fills in seconds.`;
    });

  const trade = () =>
    run("Sending…", async () => {
      if (via === "account") {
        const min = await freshMinOut();
        const res = await tradeFromAccount(crux.sign!, crux.owner!, crux.account!, {
          tokenIn: side === "buy" ? TESTNET_USDC : token,
          amountIn,
          tokenOut: launchCaip19(side === "buy" ? token : TESTNET_USDC),
          minAmountOut: min,
        });
        if (opening) return "In the fair opening from your CRUX Account: your tokens arrive when it ends, at its one price.";
        return res.filled ? `Filled from your CRUX Account.` : `Order placed from your CRUX Account: it fills in seconds.`;
      }
      if (!address) throw new Error("Connect a wallet first.");
      await onBase();
      await approve(side === "buy" ? TESTNET_USDC : token, ROUTER_V9, amountIn);
      // Priced after the approval (which can take a while in the wallet), not before it.
      const min = await freshMinOut();
      setBusy("Confirm in your wallet…");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const hash = await simulateThenWrite(config, address, {
        chainId: TESTNET.id,
        address: ROUTER_V9,
        abi: routerV9Abi,
        functionName: side === "buy" ? "buy" : "sell",
        args: [token, amountIn, min, address, deadline],
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
              onClick={() => {
                setSide(s);
                setPicked(null);
                setAmount("");
                setOrderType("market");
              }}
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

      {!opening && (
        <Menu<OrderType>
          className="mt-3"
          label="Order type"
          value={orderType}
          onChange={(t) => {
            setOrderType(t);
            // Standing orders run from the CRUX Account (the keeper sends them with this page closed).
            if (t !== "market") setFrom("account");
          }}
          options={
            side === "buy"
              ? [
                  { value: "market", label: "Market: buy now" },
                  { value: "dip", label: "Buy the dip" },
                ]
              : [
                  { value: "market", label: "Market: sell now" },
                  { value: "takeProfit", label: "Take profit" },
                  { value: "stopLoss", label: "Stop loss" },
                  { value: "trailing", label: "Trailing stop" },
                  { value: "bracket", label: "Take profit + stop loss" },
                ]
          }
        />
      )}

      {!opening && orderType === "market" && via === "account" && (
        // One tap trades from the CRUX Account at a fresh quote, with a minimum 10% under it: no typing, no pop-up.
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.14em] text-dim">{side === "buy" ? "Quick buy · one click" : "Quick sell · one click"}</p>
            <TradeSettingsButton side={side} />
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {side === "buy"
              ? settings.buyPresets.map((d) => {
                  const units = parseUnits(String(d), 6);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={busy !== null || (held.data !== undefined && usdcHeld < units)}
                      onClick={() => void quick(`Buying $${d} of $${symbol}`, units)}
                      className="h-9 rounded-lg border border-up/40 font-mono text-[12.5px] text-up transition-colors hover:border-up hover:bg-up/[0.06] disabled:opacity-35"
                    >
                      ${d}
                    </button>
                  );
                })
              : settings.sellPresets.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={busy !== null || tokensHeld === BigInt(0)}
                    onClick={() => void quick(`Selling ${pct}% of your $${symbol}`, (tokensHeld * BigInt(Math.round(pct * 100))) / BigInt(10_000))}
                    className="h-9 rounded-lg border border-down/40 font-mono text-[12.5px] text-down transition-colors hover:border-down hover:bg-down/[0.06] disabled:opacity-35"
                  >
                    {pct >= 100 ? "All" : `${pct}%`}
                  </button>
                ))}
          </div>
        </div>
      )}

      {!opening && orderType !== "market" ? (
        <div className="mt-3">
          <StandingOrderForm
            type={orderType}
            crux={crux}
            token={token}
            decimals={18}
            symbol={symbol}
            price={price > 0 ? price : null}
            supply={supply}
            tokenBalance={via === "account" ? tokensHeld : null}
            reserves={null}
          />
        </div>
      ) : (
      <>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setPicked(null);
            setAmount(e.target.value.replace(/[^\d.]/g, ""));
          }}
          placeholder="0.00"
          aria-label="Amount in USDC"
          className="w-full bg-transparent font-mono text-[16px] text-chrome outline-none"
        />
        <span className="font-mono text-[12px] text-dim">USDC</span>
      </label>

      {holder && held.data !== undefined && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-dim">
          <span>
            {selling
              ? `You hold ${tokensText(tokensHeld)} $${symbol}${tokensHeldUsd !== undefined ? ` (about $${usd(tokensHeldUsd)})` : ""}`
              : `USDC: $${usd(usdcHeld)}`}
          </span>
        </div>
      )}

      {opening && out > BigInt(0) && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          About {fmtOut(out)} if nobody else joins · everyone pays one price when it ends
          {via === "account" && ` · fills unless that price is over twice today's (at least ${fmtOut(minOut)}); otherwise refunded`}
        </p>
      )}
      {!opening && out > BigInt(0) && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          {selling ? `Sells ${tokensText(amountIn)} $${symbol} · about ${fmtOut(out)}` : `About ${fmtOut(out)}`} · at least {fmtOut(minOut)} (10% slippage)
          {split && split[1] > BigInt(0) && split[2] > BigInt(0) && " · this buy reaches graduation: part on the curve, the rest in the new pool, in one transaction"}
        </p>
      )}

      <button
        type="button"
        disabled={busy !== null || amountIn === BigInt(0) || out === BigInt(0) || overHeld}
        onClick={() => void (opening && via === "wallet" ? deposit() : trade())}
        className={`${buttonClass("primary", "md", "rounded-lg")} mt-3 w-full`}
      >
        {busy ?? (opening ? "Deposit into the opening" : side === "buy" ? `Buy $${symbol}` : `Sell $${symbol}`)}
      </button>

      {reason && !busy && <p className="mt-2 text-[12px] leading-snug text-down">{reason}</p>}
      </>
      )}

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
