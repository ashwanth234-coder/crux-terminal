"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentityToken, usePrivy, usePrivyClient_experimental } from "@privy-io/react-auth";
import { buttonClass } from "@/components/ui/Button";
import { Shell } from "@/components/launch/LaunchView";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { RELAY_URL } from "@/lib/session";

/** BONK: a liquid default to try a first trade with. */
const DEFAULT_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const BUY_PRESETS = [1, 2, 5];
const SELL_PRESETS = [25, 50, 100];
const LOCK_AVAILABLE = false;

type Holdings = {
  wallet: string;
  locked: boolean;
  sol: string;
  usdc: string;
  coin: { amount: string; decimals: number | null } | null;
  token: { name?: string; symbol?: string; icon?: string; usdPrice?: number; decimals?: number } | null;
};
type Result =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; side: "buy" | "sell"; signature: string; fee: string; timings: Record<string, number>; closedAccount: boolean }
  | { kind: "error"; message: string };

async function relay<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RELAY_URL}${path}`, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? `The relay said ${res.status}`);
  return json;
}

const usd = (units6: string | bigint) => `$${(Number(units6) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Solana buys and sells from the one Crux account (multi-chain Step 2). A click sends one request with the login's
 * Privy token; Crux's server builds the Jupiter route, signs (Privy + Crux's sponsor, which pays all SOL costs) and
 * lands it. Proceeds stay as USDC on Solana for the next trade. Mainnet: real money.
 */
export function SolanaTrade() {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const privyClient = usePrivyClient_experimental();
  const { identityToken } = useIdentityToken();
  const [mint, setMint] = useState(DEFAULT_MINT);
  const [draftMint, setDraftMint] = useState(DEFAULT_MINT);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [custom, setCustom] = useState("");
  const [turbo, setTurbo] = useState(false);
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const token = useCallback(async () => {
    const t = await getAccessToken();
    if (!t) throw new Error("Log in first.");
    return t;
  }, [getAccessToken]);
  /** Signing needs Privy's own session token too (Privy's wallet API rejects the app token); the relay checks both name you. */
  const tokens = useCallback(
    async () => ({ token: await token(), privyToken: (await privyClient.getAccessToken()) ?? undefined, identityToken: identityToken ?? undefined }),
    [token, privyClient, identityToken],
  );

  const refresh = useCallback(async () => {
    try {
      setHoldings(await relay<Holdings>("/v1/solana/holdings", { token: await token(), mint }));
    } catch (e) {
      setResult({ kind: "error", message: (e as Error).message });
    }
  }, [token, mint]);

  useEffect(() => {
    if (!crux.loggedIn) return;
    const first = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [crux.loggedIn, refresh]);

  const trade = async (side: "buy" | "sell", amount: string) => {
    setResult({ kind: "busy", label: side === "buy" ? "Buying…" : "Selling…" });
    const clicked = performance.now();
    try {
      const r = await relay<{ signature: string; fee: string; timings: Record<string, number>; closedAccount: boolean }>("/v1/solana/trade", {
        ...(await tokens()),
        side,
        mint,
        amount,
        turbo,
        slippageBps: 300,
      });
      setResult({ kind: "done", side, signature: r.signature, fee: r.fee, closedAccount: r.closedAccount, timings: { ...r.timings, "click to confirmed (your browser)": Math.round(performance.now() - clicked) } });
      void refresh();
    } catch (e) {
      setResult({ kind: "error", message: (e as Error).message });
    }
  };

  const lock = async () => {
    setResult({ kind: "busy", label: "Locking your Solana wallet (2-of-2)…" });
    try {
      await relay("/v1/solana/lock", await tokens());
      setResult({ kind: "idle" });
      void refresh();
    } catch (e) {
      setResult({ kind: "error", message: (e as Error).message });
    }
  };

  const decimals = holdings?.coin?.decimals ?? holdings?.token?.decimals ?? 0;
  const coinAmount = holdings?.coin ? BigInt(holdings.coin.amount) : BigInt(0);
  const symbol = holdings?.token?.symbol ?? "coin";
  const busy = result.kind === "busy";

  return (
    <Shell mode="live">
      <div className="mx-auto flex max-w-[640px] flex-col gap-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Solana · mainnet · real money</p>
          <h1 className="mt-2 font-display-md text-[28px] text-chrome">Trade Solana coins</h1>
          <p className="mt-1 text-[13px] text-muted">From your one Crux account. Crux pays every Solana fee; you never need SOL.</p>
        </div>

        {!crux.loggedIn ? (
          <button type="button" onClick={crux.login} className={buttonClass("primary", "md", "font-semibold")}>
            Log in with email or Google
          </button>
        ) : (
          <>
            <section className="rounded-xl border border-line p-4">
              <label htmlFor="sol-mint" className="text-[12px] text-dim">Coin (Solana address)</label>
              <div className="mt-1 flex gap-2">
                <input
                  id="sol-mint"
                  value={draftMint}
                  onChange={(e) => setDraftMint(e.target.value.trim())}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-void/60 px-3 py-2 font-mono text-[12px] text-chrome outline-none focus:border-line-2"
                />
                <button type="button" onClick={() => setMint(draftMint)} className={buttonClass("outline", "sm")}>
                  Load
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
                {holdings?.token?.icon && <img src={holdings.token.icon} alt="" className="h-8 w-8 rounded-full" />}
                <div className="text-[13px]">
                  <p className="text-chrome">
                    {holdings?.token?.name ?? "…"} <span className="text-dim">${symbol}</span>
                  </p>
                  <p className="font-mono text-[12px] text-muted">{holdings?.token?.usdPrice !== undefined ? `$${holdings.token.usdPrice.toPrecision(4)}` : "price …"}</p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-3 gap-3 text-[12px]">
              <div className="rounded-lg border border-line p-3">
                <p className="text-dim">USDC on Solana</p>
                <p className="mt-1 font-mono text-[15px] text-chrome">{holdings ? usd(holdings.usdc) : "…"}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-dim">{symbol} held</p>
                <p className="mt-1 font-mono text-[15px] text-chrome">{holdings?.coin ? (Number(coinAmount) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "…"}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-dim">Wallet lock</p>
                <p className={`mt-1 text-[13px] ${holdings?.locked ? "text-up" : "text-signal"}`}>{holdings ? (holdings.locked ? "2-of-2 ✓" : "Not yet") : "…"}</p>
              </div>
            </section>

            {/* Hidden until Privy accepts login tokens for server-side signing (the 2-of-2 needs them); trades are signed
                by the Crux signer the login added for deposits, inside its deposits-and-trades rules. */}
            {LOCK_AVAILABLE && holdings && !holdings.locked && (
              <section className="rounded-xl border border-signal/50 bg-signal/[0.04] p-4 text-[12.5px] text-muted">
                <p className="text-chrome">One-time: lock your Solana wallet</p>
                <p className="mt-1">
                  Your Solana wallet becomes &ldquo;your login + Crux, both required&rdquo;. A stolen login alone can&rsquo;t move or export anything, and
                  Crux alone can&rsquo;t either. Crux only co-signs trades that pay you.
                </p>
                <button type="button" disabled={busy} onClick={() => void lock()} className={buttonClass("primary", "sm", "mt-3")}>
                  Lock it (2-of-2)
                </button>
              </section>
            )}

            <section className="rounded-xl border border-line p-4">
              <p className="text-[12px] text-dim">Buy {symbol} with USDC</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BUY_PRESETS.map((d) => (
                  <button key={d} type="button" disabled={busy} onClick={() => void trade("buy", String(d * 1e6))} className={buttonClass("primary", "sm", "font-semibold")}>
                    Buy ${d}
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  placeholder="$ other"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-24 rounded-lg border border-line bg-void/60 px-2 py-1.5 font-mono text-[12px] text-chrome outline-none"
                />
                <button type="button" disabled={busy || !Number(custom)} onClick={() => void trade("buy", String(Math.round(Number(custom) * 1e6)))} className={buttonClass("outline", "sm")}>
                  Buy
                </button>
              </div>
              <p className="mt-4 text-[12px] text-dim">Sell {symbol} for USDC (stays on Solana for your next trade)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SELL_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy || coinAmount === BigInt(0)}
                    onClick={() => void trade("sell", p === 100 ? "all" : ((coinAmount * BigInt(p)) / BigInt(100)).toString())}
                    className={buttonClass("outline", "sm")}
                  >
                    Sell {p}%
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
                Turbo: faster landing, Crux pays a bigger tip (fee: 0.5%, at least $0.05)
              </label>
            </section>

            {result.kind === "busy" && <p className="text-[13px] text-muted">{result.label}</p>}
            {result.kind === "error" && <p className="rounded-lg border border-down/50 px-4 py-3 text-[13px] text-down">{result.message}</p>}
            {result.kind === "done" && (
              <section className="rounded-lg border border-up/40 px-4 py-3 text-[12.5px] text-muted">
                <p className="text-up">
                  {result.side === "buy" ? "Bought" : "Sold"} · Crux fee {usd(result.fee)}
                  {result.closedAccount ? " · emptied coin account closed" : ""} ·{" "}
                  <a href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2">
                    view on Solscan
                  </a>
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 font-mono text-[11.5px]">
                  {Object.entries(result.timings).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v} ms
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {holdings && (
              <p className="text-[11.5px] text-dim">
                Your Solana address: <span className="font-mono">{holdings.wallet}</span>. Add USDC on Solana (mainnet) here to trade.
              </p>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
