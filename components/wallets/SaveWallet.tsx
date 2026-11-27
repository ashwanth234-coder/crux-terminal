"use client";

import { useEffect, useRef, useState } from "react";
import { useSavedWallets } from "@/hooks/useSavedWallets";
import { shortWallet, type SavedWallet, type WalletChain } from "@/lib/savedWallets";

/**
 * The ★ next to a trader: empty when the wallet isn't saved, filled when it is. A click opens its editor (nickname,
 * "Show on charts", "Notify me"). Logged out, it asks to log in. The list it sits in reads the saved wallets once
 * (useSavedWallets) and hands each star its own: a hook per row would repeat the login's reads a hundred times.
 */
export function SaveStar({ chain, address, saved, loggedIn, login }: { chain: WalletChain; address: string; saved?: SavedWallet; loggedIn: boolean; login: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => (loggedIn ? setOpen((o) => !o) : login())}
        className={`mr-1.5 ${saved ? "text-signal" : "text-dim hover:text-chrome"}`}
        title={saved ? `Saved as ${saved.name || "a wallet"}: edit` : loggedIn ? "Save this wallet" : "Log in to save wallets"}
        aria-label={saved ? "Edit saved wallet" : "Save this wallet"}
        aria-expanded={open}
      >
        {saved ? "★" : "☆"}
      </button>
      {open && <WalletEditor chain={chain} address={address} saved={saved} onClose={() => setOpen(false)} className="absolute right-0 top-5 z-30" />}
    </span>
  );
}

/** A saved wallet's settings: nickname and its two switches, Save and Remove. */
export function WalletEditor({ chain, address, saved, onClose, className = "" }: { chain: WalletChain; address: string; saved?: SavedWallet; onClose: () => void; className?: string }) {
  const s = useSavedWallets();
  const [name, setName] = useState(saved?.name ?? "");
  const [chart, setChart] = useState(saved?.chart ?? true);
  const [notify, setNotify] = useState(saved?.notify ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const run = async (f: () => Promise<string | null | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const note = await f();
      if (note) setMsg(note);
      else onClose();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} role="dialog" aria-label="Saved wallet" className={`w-[250px] rounded-[6px] border border-line-2 bg-panel p-3 font-sans text-[12px] shadow-lg ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-chrome">{saved ? "Saved wallet" : "Save wallet"}</span>
        <span className="font-mono text-[10.5px] text-dim">{shortWallet(address)}</span>
      </div>
      <input
        autoFocus
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nickname (e.g. Smart whale)"
        className="mb-2 w-full rounded-[4px] border border-line bg-void px-2 py-1 text-chrome outline-none focus:border-signal/60"
      />
      <label className="flex items-center justify-between py-1 text-muted">
        Show on charts
        <input type="checkbox" checked={chart} onChange={(e) => setChart(e.target.checked)} />
      </label>
      <label className="flex items-center justify-between py-1 text-muted" title={chain === "solana" ? "A notification each time this wallet buys or sells" : "Alerts for Base and BNB Chain wallets are coming"}>
        <span>
          Notify me {chain !== "solana" && <span className="text-dim">(Solana only for now)</span>}
        </span>
        <input type="checkbox" checked={notify} disabled={chain !== "solana"} onChange={(e) => setNotify(e.target.checked)} />
      </label>
      {msg && <p className="mt-1 text-[11px] text-signal">{msg}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => run(() => s.save({ chain, address, name: name.trim(), chart, notify }))} className="flex-1 rounded-[4px] bg-signal px-2 py-1 text-void disabled:opacity-50">
          {busy ? "…" : "Save"}
        </button>
        {saved && (
          <button type="button" disabled={busy} onClick={() => run(async () => void (await s.remove(chain, address)))} className="rounded-[4px] border border-line px-2 py-1 text-muted hover:text-down disabled:opacity-50">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
