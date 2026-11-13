"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createPublicClient, formatUnits, http, maxUint256, parseAbi, parseUnits, zeroAddress, type Address } from "viem";
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
import { MARKET_FILL_SECONDS, tradeFromAccount, type AccountFill } from "@/lib/account";
import { addPendingTrade, noteFill, updatePendingTrade, useLastFill, usePendingTrades } from "@/lib/pendingTrades";
import { timingMark, timingPrint, timingStart } from "@/lib/tradeTiming";
import { launchCaip19 } from "@/lib/launchTrade";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import type { AuctionV2 } from "@/lib/launchV2";
import { tokensForUsdc } from "@/lib/sellAmount";
import { CreatorNote } from "@/components/launch/V9Creator";
import { StandingOrderForm, type OrderType } from "@/components/pro/StandingOrderForm";
import { SLIPPAGE_BPS, PRICE_WINDOW_MS, afterRead, readyToSell, heldNow, minimumOut, poolMath, poolQuote, quickSellAmount, routerQuote, type Flight } from "@/lib/tradeMath";
import { FACTORY_V9, ROUTER_V9, V9_ON, curvePrice, curveV9Abi, factoryV9Abi, phaseV9, registerV9Curve, routerV9Abi, type PhaseV9 } from "@/lib/v9";

const usd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
/**
 * Reads a trade is priced from, straight from Base Sepolia's own node (NEXT_PUBLIC_BASE_SEPOLIA_RPC for a fork), not
 * through the relay's shared read cache, which answers from a couple of seconds back.
 */
const freshReads = createPublicClient({ chain: TESTNET, transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || undefined, { timeout: 8_000 }) });

/**
 * The clock for the trade panel's click handlers (they run on a press, never while rendering; the React compiler
 * can't tell for the async ones, so they read the time through here).
 */
const clock = { now: () => Date.now(), perf: () => performance.now(), random: () => Math.random() };

/** Resolves once `ready()` holds (checked every 50 ms), or after `ms` whatever it says. */
function waitFor(ready: () => boolean, ms: number): Promise<void> {
  const end = Date.now() + ms;
  return new Promise((done) => {
    const tick = () => (ready() || Date.now() >= end ? done() : setTimeout(tick, 50));
    tick();
  });
}

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
      { address: curve, abi: curveV9Abi, functionName: "feeBps", chainId: TESTNET.id },
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
  const feeBps = r(13) as number | undefined;

  // The launch as the chart, the tape and the panels take it: the same object until something in it changes. This
  // page re-renders every second (its clock); a new object each time made the chart rework every candle, holder and
  // mark each second, which showed as a stall in the middle of panning or trading.
  const auctionNow = useMemo<AuctionV2 | null>(
    () =>
      l
        ? {
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
          }
        : null,
    [l, launchedAt, supply, threshold, realUsdc],
  );

  if (launch.isLoading) return <Shell><p className="text-muted">Reading the launch…</p></Shell>;
  if (!l || !auctionNow) return <Shell><p className="text-muted">No V9 launch #{id.toString()} on Base Sepolia.</p></Shell>;

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
  const auction = auctionNow;

  const poolUsdc = graduated && reserves && token0 ? (token0.toLowerCase() === l.token.toLowerCase() ? reserves[1] : reserves[0]) : null;
  const sym = `$${symbol}`;

  // The pro terminal (as for every launch): token bar; chart and execution side by side; trades, holders, top traders
  // and your orders below. Phones stack them: bar, chart, execution, tape.
  return (
    <TerminalShell>
      <LiveTokenBar
        token={l.token}
        priceReadAt={reads.dataUpdatedAt}
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
          <TradePanel
            token={l.token}
            curve={l.curve}
            symbol={symbol}
            phase={phase}
            price={price}
            supply={Number(formatUnits(supply, 18))}
            pool={
              graduated && reserves && token0
                ? {
                    ...(token0.toLowerCase() === l.token.toLowerCase() ? { usdc: reserves[1], tokens: reserves[0] } : { usdc: reserves[0], tokens: reserves[1] }),
                    feeBps,
                    readAt: reads.dataUpdatedAt,
                    pair: l.pair,
                    usdcIs0: token0.toLowerCase() !== l.token.toLowerCase(),
                  }
                : undefined
            }
          />
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
/**
 * The token bar, with its price and market cap moving with your trades. It alone listens to your pending trades: the
 * page did, so every click re-rendered the whole terminal (chart, tape, panel) and Chrome flagged the trade input for
 * blocking the main thread (INP). Its price: where your newest trade on its way should leave it; once that's filled,
 * the price your last fill left until the page's price read (every 3 s, through a cache a few seconds behind) is newer
 * than that fill (falling back to the read sooner showed the price from before the trade for a few seconds, then
 * jumped back up); otherwise the price read.
 */
function LiveTokenBar({ token, priceReadAt, price, ...bar }: { token: Address; priceReadAt: number } & Parameters<typeof V9TokenBar>[0]) {
  const onTheWay = usePendingTrades(token);
  const lastFill = useLastFill(token);
  const newest = onTheWay.length ? onTheWay[onTheWay.length - 1] : undefined;
  const shown =
    newest?.expected && newest.expected > 0
      ? newest.expected
      : lastFill && priceReadAt < lastFill.at + LAST_FILL_HOLD_MS
        ? lastFill.price
        : price;
  return <V9TokenBar {...bar} price={shown} />;
}

/** How much newer than your last fill the page's price read must be before the header trusts it again. */
const LAST_FILL_HOLD_MS = 4_000;


/** `pool`: a graduated launch's pool reserves (USDC and tokens), for sizing a pending trade's candle at the click. */
function TradePanel({
  token,
  curve,
  symbol,
  phase,
  price,
  supply,
  pool,
}: {
  token: Address;
  curve: Address;
  symbol: string;
  phase: PhaseV9;
  price: number;
  supply: number;
  /** `feeBps`: the router's fee on pool trades (the curve's rate); `readAt`: when these reserves were read (ms). */
  pool?: { usdc: bigint; tokens: bigint; feeBps?: number; readAt: number; pair: Address; usdcIs0: boolean };
}) {
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
  /**
   * CRUX Account trades sent from this page and not yet in the balances read back (they're read every 5 s, through a
   * cache a couple of seconds behind the chain). Counted in the balances shown, so a sell can follow a buy (and a buy a
   * buy) at once instead of waiting for the next read: a sell's tokens and a buy's USDC leave at the click, a buy's
   * tokens and a sell's USDC arrive at its fill.
   */
  /** `fillBlock`: the block its fill landed in (from the relay), to tell whether a price read includes it. */
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightsRef = useRef<Flight[]>([]);
  const updateFlights = (fn: (f: Flight[]) => Flight[]) => {
    flightsRef.current = fn(flightsRef.current);
    setFlights(flightsRef.current);
  };
  /** A balance read this long after a fill includes it (the read cache runs a couple of seconds behind). */
  const SETTLED_MS = 3_000;
  // The pool's reserves, and this trader's balances, read straight from the chain every second at one known block,
  // off the click path: the page's other reads come through the shared cache, whose lag varied past 8 s (after a
  // burst, buys were priced before the burst's trades and refused as "the price has moved"). With the block known,
  // which of this page's trades they hold is exact: a fill's block comes back with the relay's reply.
  const [fresh, setFresh] = useState<{ usdc: bigint; tokens: bigint; block: bigint; at: number; held?: { tokens: bigint; usdc: bigint; holder: Address; block: bigint; at: number } } | null>(null);
  const pairAddr = pool?.pair;
  const usdcIs0 = pool?.usdcIs0;
  useEffect(() => {
    if (!pairAddr || usdcIs0 === undefined) return;
    let live = true;
    const tick = async () => {
      try {
        const block = await freshReads.getBlockNumber({ cacheTime: 0 });
        const [[r0, r1], tokens, usdc] = await Promise.all([
          freshReads.readContract({ address: pairAddr, abi: pairPriceAbi, functionName: "getReserves", blockNumber: block }) as Promise<readonly [bigint, bigint, number]>,
          holder ? freshReads.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder], blockNumber: block }) : Promise.resolve(undefined),
          holder ? freshReads.readContract({ address: TESTNET_USDC, abi: erc20Abi, functionName: "balanceOf", args: [holder], blockNumber: block }) : Promise.resolve(undefined),
        ]);
        const at = Date.now();
        // A relay reply's balances from a newer block than this read stay (they include a fill this read doesn't).
        if (live)
          setFresh((cur) => ({
            usdc: usdcIs0 ? r0 : r1,
            tokens: usdcIs0 ? r1 : r0,
            block,
            at,
            ...(holder && tokens !== undefined && usdc !== undefined
              ? { held: cur?.held && cur.held.holder === holder && cur.held.block > block ? cur.held : { tokens, usdc, holder, block, at } }
              : {}),
          }));
      } catch {
        // A missed read: the next second's, or the cached reserves meanwhile.
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 1_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pairAddr, usdcIs0, holder, token]);
  /**
   * What the trader holds, shown and traded from: the balances read from the chain at a known block (above), with
   * this page's trades that block doesn't hold yet. A buy's tokens are counted only once its fill is in a later block
   * (they arrive in that transaction); a sell's tokens come off from the click until a block after its fill holds it,
   * and a buy's USDC the same way. Any doubt counts the holding low, never high: a sell of "All" can't ask for tokens
   * the account doesn't have. (Adding each trade to a balance read at the first click counted a fill the solver shared
   * between two orders twice: the holding showed 20–35M $BG more than the account had, and selling All was refused.)
   * Before the pool is read (on the curve), the cached balances with this page's trades still on their way.
   */
  const chain = fresh?.held && fresh.held.holder === holder ? fresh.held : null;
  const heldRead = chain ?? {
    tokens: (held.data?.[0]?.result as bigint | undefined) ?? BigInt(0),
    usdc: (held.data?.[1]?.result as bigint | undefined) ?? BigInt(0),
    block: undefined,
    at: held.dataUpdatedAt,
  };
  const { tokens: tokensHeld, usdc: usdcHeld } = heldNow(heldRead as never, via === "account" ? flights : []);
  // The read and the trades as of now, for a Sell All that waits for the buys on their way (lib/tradeMath heldNow).
  const heldReadRef = useRef(heldRead);
  /** The block the pool's reserves were last read at (a quick sell waits for one that holds the burst's fills). */
  const reservesBlockRef = useRef<bigint | undefined>(undefined);
  useEffect(() => {
    reservesBlockRef.current = fresh?.block;
  }, [fresh?.block]);
  useEffect(() => {
    heldReadRef.current = heldRead;
  });
  // Trades every read holds, and past the pricing window (PRICE_WINDOW_MS), are forgotten.
  useEffect(() => {
    const done = (f: Flight) => f.filledAt !== null && Date.now() - f.filledAt > Math.max(PRICE_WINDOW_MS, 20_000);
    if (flightsRef.current.some(done)) {
      flightsRef.current = flightsRef.current.filter((f) => !done(f));
      setFlights(flightsRef.current);
    }
  }, [fresh, held.dataUpdatedAt]);
  /** The reserves to price from, and whether one of this page's trades isn't in them yet (so it's run on top). */
  const reservesNow = fresh ?? (pool ? { usdc: pool.usdc, tokens: pool.tokens, block: undefined, at: pool.readAt } : null);
  const notInReserves = (f: Flight) => (reservesNow ? afterRead(f, reservesNow) : f.filledAt === null);
  // On a graduated pool every price here is worked out on the page (poolMath, exact to the router's quotes): typing
  // "1" on Sell waited ~1 s for the button (a 250 ms pause, then two chain reads to find the tokens, and the holding's
  // value read only once the Sell tab opened). On the curve the chain is still asked.
  // The pool as it is after this page's trades that its read doesn't include yet (not back from the relay, or filled
  // after it was read, through a cache a few seconds behind), so a sell typed right after a buy is priced after it
  // (priced before it, it asked too much and the relay refused it as "the price has moved").
  const pm = (() => {
    if (opening || !pool || !reservesNow || pool.feeBps === undefined || reservesNow.usdc <= BigInt(0) || reservesNow.tokens <= BigInt(0)) return null;
    let r = { usdc: reservesNow.usdc, tokens: reservesNow.tokens };
    for (const f of flights) if (notInReserves(f)) r = poolMath({ ...r, feeBps: pool.feeBps }).after(f.buy, f.amountIn);
    return r.usdc > BigInt(0) && r.tokens > BigInt(0) ? poolMath({ ...r, feeBps: pool.feeBps }) : null;
  })();
  const heldValue = useReadContracts({
    allowFailure: true,
    query: { enabled: !pm && side === "sell" && tokensHeld > BigInt(0) && !opening, refetchInterval: 10_000 },
    contracts: [{ address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [token, tokensHeld], chainId: TESTNET.id }],
  });
  const tokensHeldUsd = pm ? pm.sellOut(tokensHeld) : (heldValue.data?.[0]?.result as readonly bigint[] | undefined)?.[0];
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
  const needsQuote = !pm && selling && picked === null && usdIn > BigInt(0) && tokensHeld > BigInt(0) && tokensHeldUsd !== undefined && usdIn < tokensHeldUsd;
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
          : pm
            ? (pm.tokensFor(usdIn) ?? tokensHeld + BigInt(1))
            : solved?.key === solveKey
              ? solved.tokens
              : BigInt(0);
  const amountIn = selling ? sellTokens : usdIn;

  const quote = useReadContracts({
    allowFailure: true,
    query: { enabled: !pm && amountIn > BigInt(0) && !opening, refetchInterval: 3_000 },
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
  const out = opening
    ? shareIfAlone
    : pm
      ? side === "buy"
        ? pm.buyOut(amountIn)
        : pm.sellOut(amountIn)
      : ((quote.data?.[0]?.result as readonly bigint[] | undefined)?.[0] ?? BigInt(0));
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
  /** This browser's trades on the chart still waiting for their real candle (read when the next one is drawn). */
  const pendingOnChart = usePendingTrades(token);
  const pendingRef = useRef(pendingOnChart);
  useEffect(() => {
    pendingRef.current = pendingOnChart;
  }, [pendingOnChart]);
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
   * An account trade on the chart the moment it's pressed (lib/pendingTrades, as on the V8 terminal): a candle from the
   * price now to the price it should leave. On a constant-product curve or pool the average fill is the geometric mean
   * of the prices before and after, so after = average² / before. The chart takes it away the moment the real trade
   * is on it; a trade that fails takes it away at once. Not in the fair opening (no price moves until it settles).
   * Returns the function that settles it: failed (gone now) or sent (gone with the real candle, or after 10 s).
   */
  /**
   * Puts the trade on the chart at the click, before anything is quoted (a small candle at the current price), and
   * returns `size(got)` to give it its height once quoted, and `settle(ok)`. `got` is what this trade alone gets now:
   * its move is the ratio after/before = (average / before)², applied on from the newest trade still pending (so rapid
   * trades stack), and kept within 3× either way. Sizing it from the minimum's quote, which counts trades ahead that
   * had often already landed, drew one candle 8× too tall and rescaled the whole chart for a moment.
   */
  const showPending = (buy: boolean, amountIn: bigint, clickAt: number) => {
    const none: { id: number; size: (got: bigint) => void; settle: (ok: boolean, tradeTx?: string, fill?: AccountFill) => void } = { id: -1, size: () => {}, settle: () => {} };
    if (opening || !(price > 0)) return none;
    const label = buy ? `Buying $${usd(amountIn)}…` : `Selling ${tokensText(amountIn)} $${symbol}…`;
    // On a graduated pool: its Confirming row (what it pays and gets) and the price it leaves, worked out at the click
    // with the router's own pool math (its fee, then Uniswap V2's getAmountOut with its 0.3%) on the reserves read from
    // the chain, run past this page's trades they don't hold yet, exactly as its quote is (localQuote). (A sell's USDC
    // was its tokens times the average of two prices from older reserves, with no fee: a 25% sell showed $4.08 for a
    // fill of $3.74.)
    const exact = (() => {
      if (!pool || !reservesNow || pool.feeBps === undefined || reservesNow.usdc <= BigInt(0) || reservesNow.tokens <= BigInt(0)) return null;
      const feeBps = pool.feeBps;
      let r = { usdc: reservesNow.usdc, tokens: reservesNow.tokens };
      for (const f of flightsRef.current) if (notInReserves(f)) r = poolMath({ ...r, feeBps }).after(f.buy, f.amountIn);
      if (r.usdc <= BigInt(0) || r.tokens <= BigInt(0)) return null;
      const m = poolMath({ ...r, feeBps });
      const next = m.after(buy, amountIn);
      const spot = (x: { usdc: bigint; tokens: bigint }) => Number(formatUnits(x.usdc, 6)) / Number(formatUnits(x.tokens, 18));
      const out = buy ? m.buyOut(amountIn) : m.sellOut(amountIn);
      const before = spot(r);
      const after = next.usdc > BigInt(0) && next.tokens > BigInt(0) ? spot(next) : NaN;
      if (!(before > 0) || !(after > 0) || out <= BigInt(0)) return null;
      return buy
        ? { before, after, usdc: Number(formatUnits(amountIn, 6)), tokens: Number(formatUnits(out, 18)) }
        : { before, after, usdc: Number(formatUnits(out, 6)), tokens: Number(formatUnits(amountIn, 18)) };
    })();
    const ahead = pendingRef.current[pendingRef.current.length - 1];
    const before = exact ? exact.before : ahead?.expected && ahead.expected > 0 ? ahead.expected : price;
    // On a graduated launch's pool its full height is known at the click, from the reserves the page already reads
    // (exact for a constant-product pool: the price goes as USDC² / k), with no wait for a quote: a stub until the
    // quote came back (0.4–0.6 s) read as "nothing happened". The pool is advanced past the trades still pending
    // (the price after them, `before`), so rapid trades stack. On the curve it's sized once quoted.
    const atClick = (() => {
      if (exact) return exact.after;
      if (!pool || pool.usdc === BigInt(0) || pool.tokens === BigInt(0)) return undefined;
      const shift = Math.sqrt(before / price);
      const ratio = buy
        ? (() => {
            const x = Number(formatUnits(pool.usdc, 6)) * shift;
            return ((x + Number(formatUnits(amountIn, 6))) / x) ** 2;
          })()
        : (() => {
            const y = Number(formatUnits(pool.tokens, 18)) / shift;
            return (y / (y + Number(formatUnits(amountIn, 18)))) ** 2;
          })();
      return Number.isFinite(ratio) && ratio > 0 ? before * Math.min(3, Math.max(1 / 3, ratio)) : undefined;
    })();
    // Its size at the click, for its row in the swaps list (it showed "…" until quoted): the side it pays is known;
    // the other comes from the average fill, which on a constant-product pool is √(price before × price after).
    const paid = buy ? Number(formatUnits(amountIn, 6)) : Number(formatUnits(amountIn, 18));
    const avg = atClick ? Math.sqrt(before * atClick) : undefined;
    const size = exact
      ? { usdc: exact.usdc, tokens: exact.tokens }
      : buy
        ? { usdc: paid, ...(avg ? { tokens: paid / avg } : {}) }
        : { tokens: paid, ...(avg ? { usdc: paid * avg } : {}) };
    const clear = addPendingTrade({ token, side: buy ? "buy" : "sell", label, price: before, ...size, ...(atClick ? { expected: atClick } : {}) });
    // Click-to-candle timing in DevTools (lib/tradeTiming): printed when its real candle is drawn.
    timingStart(clear.id, label, clickAt);
    timingMark(clear.id, "pendingAdded");
    return {
      id: clear.id,
      size: (got: bigint) => {
        if (atClick) return; // already the pool's exact move; the relay's fill snaps it to the real trade

        const usdc = Number(formatUnits(buy ? amountIn : got, 6));
        const tokens = Number(formatUnits(buy ? got : amountIn, 18));
        if (!(usdc > 0 && tokens > 0)) return;
        const avg = usdc / tokens;
        const ratio = Math.min(3, Math.max(1 / 3, (avg / price) ** 2));
        updatePendingTrade(clear.id, { expected: before * ratio, usdc, tokens });
      },
      settle: (ok: boolean, tradeTx?: string, fill?: AccountFill) => {
        if (ok) {
          timingMark(clear.id, "relayReturned");
          // Filled: the candle snaps to exactly where the real trade leaves the price (the relay's fill, as the charts
          // draw it), and the chart takes it away the moment the trade with this hash is on it (3 s at most).
          updatePendingTrade(clear.id, { tx: tradeTx ?? "none", ...(fill ? { expected: fill.priceAfter ?? fill.price } : {}) });
          if (fill) noteFill(token, fill.priceAfter ?? fill.price);
          setTimeout(clear, 6_000); // only if that trade never shows (the feed brings it with the reply)
        } else {
          clear();
          timingPrint(clear.id);
        }
      },
    };
  };

  /**
   * The minimum to sign, from a quote no older than 2 s and newer than this page's last trade. After a trade the box
   * empties and its quote stops refreshing, so typing the same amount again showed (and signed) the price from before
   * that trade: seen live, a second buy signed a minimum 15% over the price the first buy had left, and sat unfilled.
   */
  const freshMinOut = async () => {
    if (opening) return minOut; // the opening's floor is half its share-if-alone, not a live price
    const current = quote.dataUpdatedAt > lastTradeAt.current && clock.now() - quote.dataUpdatedAt < 2_000;
    const data = current ? quote.data : (await quote.refetch()).data;
    const got = (data?.[0]?.result as readonly bigint[] | undefined)?.[0] ?? BigInt(0);
    if (got === BigInt(0)) throw new Error("Couldn't get a fresh price just now: try again in a moment.");
    return (got * (BigInt(10_000) - SLIPPAGE_BPS)) / BigInt(10_000);
  };

  /**
   * What `amount` gets after this page's same-side trades that the price read doesn't include yet: a rapid second buy
   * is priced as the buy after the first, quote(both) − quote(first), so its minimum holds on a thin curve where each
   * buy moves the price 20%. Exactly which ones count: the price is read at a known block, straight from the chain (not
   * the shared read cache, seconds behind), and a trade counts if it isn't back from the relay yet or its fill landed
   * after that block. (Guessing that — counting none of the filled ones, or all of the recent ones — left one buy
   * asking too much and stuck, and another asking so little the relay refused it.) A trade the other way only moves
   * the price in this one's favour, so it isn't counted. Also returns `alone`: this trade at that block on its own.
   */
  const quoteAfterFlights = async (buy: boolean, amount: bigint, ahead?: ReadonlySet<number>) => {
    const block = await freshReads.getBlockNumber({ cacheTime: 0 });
    const read = async (b: boolean, a: bigint, at: bigint) =>
      ((await freshReads.readContract({ address: ROUTER_V9, abi: routerV9Abi, functionName: b ? "quoteBuy" : "quoteSell", args: [token, a], blockNumber: at })) as readonly bigint[])[0];
    return routerQuote(read, block, flightsRef.current.filter((f) => !ahead || ahead.has(f.id)), buy, amount);
  };

  /**
   * On a graduated pool, the same quote worked out here with no network wait (the chain read above took 0.3–0.5 s
   * from India before every trade could even be signed): CruxRouterV9's own pool math (its fee off a buy's USDC, then
   * Uniswap V2's 0.3%; a sell's swap, then its fee) on the pool reserves the page reads, run on past this page's trades
   * those reserves don't include yet (not back from the relay, or filled after they were read, through a cache a few
   * seconds behind), both sides in order. The relay still checks the minimum against the solver's own price. Null
   * when there's no pool (on the curve) or its fee isn't read yet: then the chain is asked.
   */
  const localQuote = (buy: boolean, amount: bigint, ahead?: ReadonlySet<number>) =>
    !pool || !reservesNow || pool.feeBps === undefined ? null : poolQuote(reservesNow, pool.feeBps, flightsRef.current.filter((f) => !ahead || ahead.has(f.id)), buy, amount);

  /**
   * A market trade from the CRUX Account, which never locks the panel: the next buy or sell can be pressed while this
   * one is still on its way (the relay and solver take them in turn). On the chart at the click (showPending; sized
   * from `shown`, the quote on screen, at once when there is one), its minimum 10% under a fresh quote that counts the
   * trades still ahead of it.
   */
  const accountTrade = async (buy: boolean, amount: bigint, shown?: bigint, onQueued?: () => void) => {
    const clickAt = clock.perf();
    setNote(null);
    const id = clock.now() + clock.random();
    let settle: ((ok: boolean, tradeTx?: string, fill?: AccountFill) => void) | null = null;
    let postedNow: (() => void) | null = null;
    try {
      if (!accountReady) throw new Error("Log in to trade in one click from your CRUX Account.");
      if (amount <= BigInt(0)) throw new Error(buy ? "Enter an amount to buy." : "Nothing to sell yet.");
      const onChart = showPending(buy, amount, clickAt);
      settle = onChart.settle;
      if (shown && shown > BigInt(0)) onChart.size(shown);
      // On its way from the press, before its price is read: a press right behind it (on the curve the price is a
      // chain read, a few hundred ms) is then priced after it. Counted only once its price is in (`got` 0 until then).
      // Priced after the trades pressed before it (as they stand when its price is read), never after a later one.
      const ahead = new Set(flightsRef.current.map((f) => f.id));
      // Posted after the one pressed before it (the relay then has every trade it was priced after).
      const postedBefore = postsQueued.current;
      let posted!: () => void;
      postsQueued.current = new Promise<void>((r) => (posted = r));
      postedNow = posted;
      updateFlights((fs) => [...fs, { id, buy, amountIn: amount, got: BigInt(0), filledAt: null, sent: false }]);
      onQueued?.();
      const q = localQuote(buy, amount, ahead) ?? (await quoteAfterFlights(buy, amount, ahead));
      const { got, alone } = q;
      if (got === BigInt(0)) throw new Error(settling ? "The fair opening just ended and is being settled: try again in a few seconds." : "Too small to trade.");
      onChart.size(alone);
      updateFlights((fs) => fs.map((f) => (f.id === id ? { ...f, got, sent: true } : f)));
      const res = await tradeFromAccount(crux.sign!, crux.owner!, crux.account!, {
        tokenIn: buy ? TESTNET_USDC : token,
        amountIn: amount,
        tokenOut: launchCaip19(buy ? token : TESTNET_USDC),
        // 10% under what it should get after the trades ahead; never under half of what it gets alone (lib/tradeMath).
        minAmountOut: minimumOut(q),
        fillSeconds: MARKET_FILL_SECONDS,
      }, undefined, async () => {
        await Promise.race([postedBefore, new Promise((r) => setTimeout(r, 3_000))]);
        posted();
      });
      if (!res.filled) {
        // Not filled (it missed its price, or the solver is slow): off the chart at once, and said plainly.
        settle(false);
        updateFlights((fs) => fs.filter((f) => f.id !== id));
        setTimeout(() => void held.refetch(), SETTLED_MS + 100);
        const what = buy ? `$${usd(amount)}` : `your ${tokensText(amount)} $${symbol}`;
        setNote({
          ok: false,
          text:
            res.reason === "slippage"
              ? `The price moved past your ${Number(SLIPPAGE_BPS) / 100}% limit before it filled: not ${buy ? "bought" : "sold"}. ${what} comes back to your account within ${MARKET_FILL_SECONDS} seconds.`
              : `Not filled yet: it fills in the next few seconds, or ${what} comes back to your account within ${MARKET_FILL_SECONDS} seconds.`,
        });
        return;
      }
      settle(true, res.tradeTx, res.fill);
      // What it really got: the relay's exact amount for this order (the solver may fill several orders with one pool
      // trade, each its own part), and the account's balances read right after it, at their block: the holding is the
      // chain's, never added up here. (Guessing a share of a shared trade showed 20–35M $BG more than the account had.)
      const fill = res.fill;
      const mine = res.amountOut ?? null;
      const fillBlock = res.fillBlock ?? fill?.blockNumber;
      updateFlights((fs) => fs.map((f) => (f.id === id ? { ...f, filledAt: Date.now(), ...(fillBlock !== undefined ? { fillBlock } : {}), ...(mine !== null && mine > BigInt(0) ? { got: mine } : {}) } : f)));
      if (res.held) {
        const h = res.held;
        const at = clock.now();
        // Only the balances take the reply's block: the pool's reserves keep the block they were read at.
        setFresh((cur) =>
          cur && !(cur.held && cur.held.block > h.block)
            ? { ...cur, held: { tokens: buy ? h.tokenOut : h.tokenIn, usdc: buy ? h.tokenIn : h.tokenOut, holder: crux.account!, block: h.block, at } }
            : cur,
        );
      }
      // A reply without the fill: its block from the trade's own receipt, so the pricing knows which reads hold it.
      if (!fill && res.tradeTx) {
        void freshReads
          .getTransactionReceipt({ hash: res.tradeTx })
          .then((r) => updateFlights((fs) => fs.map((f) => (f.id === id ? { ...f, fillBlock: r.blockNumber } : f))))
          .catch(() => {});
      }
      // Read the balances back once they can include it, rather than on the 5 s timer.
      setTimeout(() => void held.refetch(), SETTLED_MS + 100);
      const what = buy ? `Bought $${usd(amount)} of $${symbol}` : `Sold about $${usd(mine !== null && mine > BigInt(0) ? mine : got)} of $${symbol}`;
      setNote({ ok: true, text: `${what}.` });
    } catch (e) {
      postedNow?.();
      settle?.(false);
      updateFlights((fs) => fs.filter((f) => f.id !== id));
      const msg = (e as Error).message ?? String(e);
      setNote({ ok: false, text: msg.split("\n")[0] });
      if (/price has moved/i.test(msg)) void quote.refetch();
    } finally {
      lastTradeAt.current = Date.now();
    }
  };

  /** One tap from the CRUX Account: exactly `amount` (USDC for a buy, tokens for a sell). Nothing to type, no pop-up. */
  const quick = (amount: bigint) => void accountTrade(side === "buy", amount);
  /**
   * A quick sell of `pct` of the holding, after the buys still on their way (a second or two): their tokens arrive
   * with their fills, and "sell 50%" or "sell all" right after a burst of buys means of them too, not of what was here
   * before it (or nothing at all: "Nothing to sell yet").
   */
  const quickSell = (pct: number) => {
    // In the order pressed: each is sized once the one before it is counted (50% then All sells half, then the rest).
    sellsQueued.current = sellsQueued.current
      .then(() => waitFor(() => readyToSell(flightsRef.current, reservesBlockRef.current), 15_000))
      .then(
        () =>
          new Promise<void>((queued) => {
            void accountTrade(false, quickSellAmount(heldNow(heldReadRef.current as never, flightsRef.current).tokens, pct), undefined, queued).finally(queued);
          }),
      );
  };
  const sellsQueued = useRef<Promise<void>>(Promise.resolve());
  /** Resolves once the trade pressed last has been posted to the relay (each press posts after the one before). */
  const postsQueued = useRef<Promise<void>>(Promise.resolve());

  const trade = () => {
    // A market trade from the CRUX Account doesn't lock the panel (accountTrade); the box empties for the next one.
    if (via === "account" && !opening) {
      const amt = amountIn;
      setAmount("");
      setPicked(null);
      return accountTrade(side === "buy", amt, out);
    }
    return run("Sending…", async () => {
      if (via === "account") {
        // A buy in the fair opening: deposited by the solver, filled at the opening's one price when it ends.
        await tradeFromAccount(crux.sign!, crux.owner!, crux.account!, {
          tokenIn: TESTNET_USDC,
          amountIn,
          tokenOut: launchCaip19(token),
          minAmountOut: await freshMinOut(),
        });
        return "In the fair opening from your CRUX Account: your tokens arrive when it ends, at its one price.";
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
  };

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
                      onClick={() => quick(units)}
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
                    onClick={() => quickSell(pct)}
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
