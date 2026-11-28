"use client";

import Link from "next/link";
import { useState } from "react";
import { WalletEditor } from "@/components/wallets/SaveWallet";
import { useSavedWallets } from "@/hooks/useSavedWallets";
import { explorer } from "@/lib/coinMarket";
import { shortWallet, walletKey, walletLabel, type WalletChain } from "@/lib/savedWallets";

const CHAIN_WORD: Record<WalletChain, string> = { solana: "Solana", base: "Base", bnb: "BNB Chain" };
const net = (c: WalletChain) => (c === "bnb" ? "bsc" : c);

function ago(ms: number) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3_600 ? `${Math.floor(s / 60)}m ago` : s < 86_400 ? `${Math.floor(s / 3_600)}h ago` : `${Math.floor(s / 86_400)}d ago`;
}

/** The Portfolio's saved wallets: each with its switches, and their latest buys and sells Crux saw. */
export function SavedWalletsList() {
  const s = useSavedWallets();
  const [editing, setEditing] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<string | null>(null);
  if (!s.loggedIn) return null;
  const typed = paste.trim();
  const kind = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(typed) ? "solana" : /^0x[0-9a-fA-F]{40}$/.test(typed) ? "evm" : null;
  const add = async (chain: WalletChain) => {
    setNote(null);
    try {
      await s.save({ chain, address: typed, name: "", chart: true, notify: false });
      setPaste("");
      setNote("Saved. Its buys and sells show on charts; tap Edit to name it or get notifications.");
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  return (
    <section aria-labelledby="saved-wallets-h">
      <h2 id="saved-wallets-h" className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-dim">
        Saved wallets
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste a wallet to follow (a trader, a KOL)"
          aria-label="Wallet address to save"
          className="min-w-0 flex-1 rounded-lg border border-line bg-void px-3 py-2 font-mono text-[12px] text-chrome placeholder:font-sans placeholder:text-dim"
        />
        {kind === "solana" && (
          <button type="button" onClick={() => void add("solana")} className="rounded-lg border border-signal px-3 py-2 text-[12px] text-signal hover:bg-signal/10">
            Save Solana wallet
          </button>
        )}
        {kind === "evm" && (
          <>
            <button type="button" onClick={() => void add("base")} className="rounded-lg border border-signal px-3 py-2 text-[12px] text-signal hover:bg-signal/10">
              Save on Base
            </button>
            <button type="button" onClick={() => void add("bnb")} className="rounded-lg border border-signal px-3 py-2 text-[12px] text-signal hover:bg-signal/10">
              Save on BNB Chain
            </button>
          </>
        )}
      </div>
      {typed && !kind && <p className="mb-3 text-[12px] text-dim">That doesn&apos;t look like a wallet address.</p>}
      {note && <p className="mb-3 text-[12px] text-muted">{note}</p>}
      {s.wallets.length === 0 ? (
        <p className="rounded-xl border border-line px-4 py-3 text-[12.5px] text-muted">
          {s.loading ? "Reading…" : "None yet. Tap ☆ next to a trader on any coin's trades or holder map to save them, give them a nickname, and see their trades on charts or get a notification when they trade."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {s.wallets.map((w) => {
            const k = walletKey(w.chain, w.address);
            return (
              <li key={k} className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-signal">★</span>
                  <a href={explorer(net(w.chain)).account(w.address)} target="_blank" rel="noopener noreferrer" className="truncate text-chrome hover:underline">
                    {walletLabel(w)}
                  </a>
                  {w.name && <span className="font-mono text-[11px] text-dim">{shortWallet(w.address)}</span>}
                  <span className="rounded-[3px] border border-line-2 px-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">{CHAIN_WORD[w.chain]}</span>
                </span>
                <span className="flex items-center gap-3 text-[11.5px] text-dim">
                  <span className={w.chart ? "text-muted" : ""}>{w.chart ? "On charts" : "Not on charts"}</span>
                  <span className={w.notify ? "text-muted" : ""}>{w.notify ? "Notifies you" : "No alerts"}</span>
                  <button type="button" onClick={() => setEditing(editing === k ? null : k)} className="text-muted hover:text-chrome">
                    Edit
                  </button>
                </span>
                {editing === k && <WalletEditor chain={w.chain} address={w.address} saved={w} onClose={() => setEditing(null)} className="absolute right-3 top-9 z-30" />}
              </li>
            );
          })}
        </ul>
      )}
      {s.events.length > 0 && (
        <>
          <p className="mb-1 mt-3 text-[10px] uppercase tracking-[0.14em] text-dim">Their latest trades</p>
          <ul className="space-y-1 font-mono text-[11.5px]">
            {s.events.slice(0, 10).map((e) => (
              <li key={`${e.tx}${e.mint}`} className="flex flex-wrap items-center gap-2">
                <span className="text-dim">{ago(e.at)}</span>
                <span className="text-signal">{e.name}</span>
                <span className={e.side === "buy" ? "text-up" : "text-down"}>{e.side === "buy" ? "bought" : "sold"}</span>
                <Link href={`/sol/${e.mint}`} className="text-chrome hover:underline">
                  ${e.symbol}
                </Link>
                {e.sol > 0 && <span className="text-muted">{e.sol.toFixed(e.sol >= 10 ? 1 : 3)} SOL</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
