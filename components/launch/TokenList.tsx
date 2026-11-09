"use client";

import Link from "next/link";
import { erc20Abi, formatUnits, parseAbi, zeroAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { Header } from "@/components/site/Header";
import { buttonClass } from "@/components/ui/Button";
import { TokenAvatar } from "@/components/pro/TokenAvatar";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { useNow } from "@/hooks/useLaunchAuction";
import { TESTNET } from "@/lib/chains";
import { FACTORY_V9, V9_ON, curvePrice, curveV9Abi, factoryV9Abi } from "@/lib/v9";

const pairAbi = parseAbi(["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"]);
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const ageText = (s: number) => (s < 3_600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86_400 ? `${Math.floor(s / 3_600)}h` : `${Math.floor(s / 86_400)}d`);

type Launch = { token: Address; curve: Address; pair: Address; creator: Address };

/**
 * Discover: every launch, newest first, with its avatar, where it trades (fair opening, curve, Uniswap), market cap,
 * how far it is to graduation or its pool's liquidity, and its age. Each row opens the token's terminal.
 */
export function TokenList() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-24 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.4rem)] text-bright">Discover</h1>
            <p className="mt-1 text-[13px] text-muted">Every token launched on Crux, newest first. Base Sepolia testnet.</p>
          </div>
          <Link href="/launch/v9/new" className={buttonClass("primary", "sm", "rounded-lg")}>
            Launch a token
          </Link>
        </div>
        <TokenTable />
      </main>
    </>
  );
}

/** The launches table, newest first (`limit` rows at most): Discover, and the homepage's live markets. */
export function TokenTable({ limit = 100 }: { limit?: number }) {
  const count = useReadContracts({ query: { refetchInterval: 10_000 }, contracts: [{ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount", chainId: TESTNET.id }] });
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? BigInt(0));
  const ids = Array.from({ length: n }, (_, i) => BigInt(n - 1 - i)).slice(0, limit);
  const launches = useReadContracts({
    query: { enabled: n > 0, staleTime: Infinity },
    contracts: ids.map((id) => ({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [id], chainId: TESTNET.id }) as const),
  });

  return (
    <>
        {!V9_ON ? (
          <p className="mt-6 text-muted">Launches aren&apos;t live on this site yet.</p>
        ) : count.isPending ? (
          <p className="mt-6 text-muted">Reading launches…</p>
        ) : n === 0 ? (
          <p className="mt-6 text-muted">No launches yet. Be the first.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-dim">
                  <th className="px-4 py-2.5 font-normal">Token</th>
                  <th className="px-4 py-2.5 font-normal">Where</th>
                  <th className="px-4 py-2.5 text-right font-normal">Market cap</th>
                  <th className="px-4 py-2.5 text-right font-normal">Raised / liquidity</th>
                  <th className="px-4 py-2.5 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ids.map((id, i) => {
                  const l = launches.data?.[i]?.result as Launch | undefined;
                  return l ? <Row key={id.toString()} id={id} l={l} /> : null;
                })}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

function Row({ id, l }: { id: bigint; l: Launch }) {
  const meta = useTokenMeta(l.token);
  const clock = useNow();
  const reads = useReadContracts({
    allowFailure: true,
    query: { refetchInterval: 15_000 },
    contracts: [
      { address: l.token, abi: erc20Abi, functionName: "symbol", chainId: TESTNET.id },
      { address: l.token, abi: erc20Abi, functionName: "name", chainId: TESTNET.id },
      { address: l.token, abi: erc20Abi, functionName: "totalSupply", chainId: TESTNET.id },
      { address: l.curve, abi: curveV9Abi, functionName: "graduated", chainId: TESTNET.id },
      { address: l.curve, abi: curveV9Abi, functionName: "openingEnds", chainId: TESTNET.id },
      { address: l.curve, abi: curveV9Abi, functionName: "realUsdc", chainId: TESTNET.id },
      { address: l.curve, abi: curveV9Abi, functionName: "threshold", chainId: TESTNET.id },
      { address: l.curve, abi: curveV9Abi, functionName: "spotPrice", chainId: TESTNET.id },
      { address: l.curve, abi: curveV9Abi, functionName: "launchedAt", chainId: TESTNET.id },
      { address: l.pair ?? zeroAddress, abi: pairAbi, functionName: "getReserves", chainId: TESTNET.id },
      { address: l.pair ?? zeroAddress, abi: pairAbi, functionName: "token0", chainId: TESTNET.id },
    ],
  });
  const r = (i: number) => reads.data?.[i]?.result;
  const symbol = (r(0) as string | undefined) ?? "…";
  const name = r(1) as string | undefined;
  const supply = Number(formatUnits((r(2) as bigint | undefined) ?? BigInt(0), 18));
  const graduated = (r(3) as boolean | undefined) ?? false;
  const openingEnds = Number((r(4) as bigint | undefined) ?? BigInt(0));
  const realUsdc = (r(5) as bigint | undefined) ?? BigInt(0);
  const threshold = (r(6) as bigint | undefined) ?? BigInt(0);
  const spot = (r(7) as bigint | undefined) ?? BigInt(0);
  const launchedAt = Number((r(8) as bigint | undefined) ?? BigInt(0));
  const reserves = r(9) as readonly [bigint, bigint, number] | undefined;
  const token0 = r(10) as Address | undefined;
  const [tok, usd] = reserves && token0 ? (token0.toLowerCase() === l.token.toLowerCase() ? [reserves[0], reserves[1]] : [reserves[1], reserves[0]]) : [BigInt(0), BigInt(0)];
  const price = graduated ? (tok > BigInt(0) ? Number(formatUnits(usd, 6)) / Number(formatUnits(tok, 18)) : 0) : curvePrice(spot);
  const now = clock ?? launchedAt;
  const opening = !graduated && openingEnds > now;
  const where = graduated ? "On Uniswap" : opening ? "Fair opening" : "On its curve";
  const pct = threshold > BigInt(0) ? Math.min(100, Number((realUsdc * BigInt(10_000)) / threshold) / 100) : 0;

  return (
    <tr className="text-[13px] hover:bg-tint/[0.02]">
      <td className="px-4 py-3">
        <Link href={`/launch/v9/${id}`} className="flex items-center gap-3">
          <TokenAvatar token={l.token} image={meta.image} symbol={symbol} size={32} />
          <span className="min-w-0">
            <span className="block text-chrome">${symbol}</span>
            {name && <span className="block truncate text-[11.5px] text-dim">{name}</span>}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${graduated ? "text-up" : opening ? "text-signal" : "text-muted"}`}>{where}</span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-chrome">{price > 0 && supply > 0 ? usdCompact.format(price * supply) : "…"}</td>
      <td className="px-4 py-3 text-right font-mono text-muted">
        {graduated ? (
          usd > BigInt(0) ? `${usdCompact.format((Number(usd) / 1e6) * 2)} liq` : "…"
        ) : (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="h-1 w-16 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-up" style={{ width: `${pct}%` }} />
            </span>
            {pct.toFixed(0)}%
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-dim">{launchedAt > 0 ? ageText(now - launchedAt) : "…"}</td>
    </tr>
  );
}
