"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoinTerminal } from "@/components/coin/CoinTerminal";
import { relay } from "@/hooks/useSolanaTrading";
import { deepestPair } from "@/lib/solanaCoins";
import { findShowcase, type MirrorStatus, type ShowcaseCoin } from "@/lib/showcase";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const E18 = 1e18;
const fmtCoins = (units: string) => (Number(units) / E18).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** One copyable address with where it lives and where to trade it. */
function Pill({ dot, label, address, trade, explorer }: { dot: string; label: string; address?: string; trade?: { name: string; href: string }; explorer?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-line-2 p-2.5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-dim">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </div>
      {address ? (
        <>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(address).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1_200)))}
            className="mt-1 block w-full truncate text-left font-mono text-[12.5px] text-chrome hover:text-signal"
            title="Copy"
          >
            {copied ? "copied ✓" : `${short(address)} ⧉`}
          </button>
          <div className="mt-1 flex gap-3 text-[11px]">
            {trade && (
              <a href={trade.href} target="_blank" rel="noopener noreferrer" className="text-muted underline decoration-line-2 hover:text-chrome">
                Trade on {trade.name} ↗
              </a>
            )}
            {explorer && (
              <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-dim hover:text-chrome">
                explorer ↗
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[12px] text-dim">Not created yet</p>
      )}
    </div>
  );
}

/** The showcase's side panel: what this is, the three addresses, and the live backing check. */
function MirrorPanel({ c }: { c: ShowcaseCoin }) {
  const status = useQuery({
    queryKey: ["mirror-status"],
    queryFn: () => relay<MirrorStatus & { ok: boolean }>("/v1/mirror/status", {}),
    refetchInterval: 5_000,
    retry: false,
  });
  const s = status.data && status.data.coin?.toLowerCase() === c.base.toLowerCase() ? status.data : null;
  // How old the keeper's last check was when this status was read (it's read every 5 s).
  const age = s?.at ? Math.max(0, Math.round((status.dataUpdatedAt - s.at) / 1000)) : null;
  const backed = s ? BigInt(s.locked) >= BigInt(s.held) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-signal/60 bg-signal/[0.06] p-3 text-[12px] leading-relaxed text-chrome">
        <p className="font-medium">Showcase · beta · test coin</p>
        <p className="mt-1 text-muted">
          A demo of one Crux coin trading on Base, Solana and BNB Chain at once. Its pools are tiny on purpose: don&apos;t buy size, prices move a lot.
        </p>
      </div>

      <div className="grid gap-2">
        <Pill dot="bg-[#0052ff]" label="Base · the coin" address={c.base} trade={{ name: "Uniswap", href: `https://app.uniswap.org/swap?chain=base&outputCurrency=${c.base}` }} explorer={`https://basescan.org/token/${c.base}`} />
        <Pill dot="bg-[#9945ff]" label="Solana · copy" address={c.solanaMint} trade={c.solanaMint ? { name: "Jupiter", href: `https://jup.ag/swap/SOL-${c.solanaMint}` } : undefined} explorer={c.solanaMint ? `https://solscan.io/token/${c.solanaMint}` : undefined} />
        <Pill dot="bg-[#f0b90b]" label="BNB Chain · copy" address={c.bnbToken} trade={c.bnbToken ? { name: "PancakeSwap", href: `https://pancakeswap.finance/swap?chain=bsc&outputCurrency=${c.bnbToken}` } : undefined} explorer={c.bnbToken ? `https://bscscan.com/token/${c.bnbToken}` : undefined} />
      </div>

      <div className="rounded-xl border border-line p-3 text-[12px]">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-dim">Backing</p>
        {s ? (
          <>
            <p className={`mt-1 font-mono ${backed ? "text-up" : "text-signal"}`}>
              Base locked {fmtCoins(s.locked)} {backed ? "≥" : "<"} Solana + BNB held {fmtCoins(s.held)}
            </p>
            <p className="mt-1 text-dim">
              Solana {fmtCoins(s.solanaHeld)} · BNB Chain {fmtCoins(s.bnbHeld)}
              {backed === false && " · catching up"}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-dim">
              <span className={`h-1.5 w-1.5 rounded-full ${s.paused ? "bg-dim" : age !== null && age < 30 ? "bg-up" : "bg-signal"}`} aria-hidden="true" />
              Keeper {s.paused ? "paused" : age !== null ? `checked ${age}s ago` : "starting"}
              {s.error && <span className="text-down"> · {s.error}</span>}
            </p>
            {s.last && <p className="mt-1 truncate text-dim">Last: {s.last}</p>}
          </>
        ) : (
          <p className="mt-1 text-dim">{status.isLoading ? "Reading…" : "The keeper isn't running yet."}</p>
        )}
        <p className="mt-2 text-[11px] leading-snug text-dim">
          Every copy traders hold on Solana or BNB Chain is matched by the same coin locked on Base. Buys and sells on the copies are passed on to the Base pool.
        </p>
      </div>
    </div>
  );
}

/** /showcase/[coin]: the mirror showcase coin on Base mainnet, its chart, its three addresses and the backing check. */
export function ShowcasePage({ coin }: { coin: string }) {
  const c = findShowcase(coin);
  const facts = useQuery({
    queryKey: ["showcase-facts", coin],
    queryFn: async () => {
      const p = await deepestPair("base", coin);
      return p ? { symbol: p.baseToken.symbol, name: p.baseToken.name, price: p.priceUsd ? Number(p.priceUsd) : undefined, mcap: p.marketCap ?? p.fdv, liquidity: p.liquidity?.usd } : null;
    },
    refetchInterval: 20_000,
  });
  const shown: ShowcaseCoin = c ?? { base: coin, name: facts.data?.name ?? "", symbol: facts.data?.symbol ?? "" };
  return (
    <CoinTerminal
      network="base"
      token={coin}
      coin={facts.data ? { ...facts.data } : facts.data}
      path={`/showcase/${coin}`}
      trade={<MirrorPanel c={shown} />}
    />
  );
}
