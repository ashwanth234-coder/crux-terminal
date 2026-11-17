"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { useSolanaTrading } from "@/hooks/useSolanaTrading";
import { IS_TESTNET } from "@/lib/network";

type Net = "base" | "solana" | "bnb";

/**
 * Add money (plan phase E): one question, "which network are you sending on?", then the one address for it, with
 * Copy and a QR code. Both land in the one Crux balance: the account address takes Base USDC (and, later, every 0x
 * network); the Solana address takes Solana USDC. Nothing else about chains is said.
 */
export function AddMoneyButton({ className = "" }: { className?: string }) {
  const crux = useCruxAccount();
  const [open, setOpen] = useState(false);
  if (!crux.loggedIn || !crux.account) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-signal/60 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-signal transition-colors hover:bg-signal/10 ${className}`}
        title="Add money to your Crux account"
      >
        <span aria-hidden="true">+</span>
        <span className="hidden sm:inline">Add money</span>
      </button>
      {open && <AddMoneySheet onClose={() => setOpen(false)} />}
    </>
  );
}

function AddMoneySheet({ onClose }: { onClose: () => void }) {
  const crux = useCruxAccount();
  const { holdings } = useSolanaTrading(null);
  const [net, setNet] = useState<Net>("base");
  // BNB Chain: the login's own wallet (Crux's account contract can't trade there); its USDT is the BNB-side cash.
  const address = net === "base" ? crux.account : net === "bnb" ? crux.owner : (holdings?.wallet ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nets: { key: Net; label: string; note: string }[] = [
    { key: "base", label: "Base", note: IS_TESTNET ? "Test USDC on Base Sepolia for now" : "USDC on Base" },
    { key: "solana", label: "Solana", note: "USDC on Solana" },
    { key: "bnb", label: "BNB Chain", note: "USDT on BNB Chain" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-money-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-t-2xl border border-line-2 bg-panel p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="add-money-title" className="text-[17px] text-chrome">
            Add money
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded text-dim hover:text-chrome">
            ✕
          </button>
        </div>

        <p className="mt-3 text-[13px] text-muted">Which network are you sending USDC on?</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Network">
          {nets.map((n) => (
            <button
              key={n.key}
              type="button"
              role="radio"
              aria-checked={net === n.key}
              onClick={() => setNet(n.key)}
              className={`rounded-lg border px-3 py-2.5 text-left ${net === n.key ? "border-chrome/60 bg-tint/[0.05]" : "border-line hover:border-line-2"}`}
            >
              <span className="block text-[14px] text-chrome">{n.label}</span>
              <span className="block text-[11px] text-dim">{n.note}</span>
            </button>
          ))}
        </div>

        {address ? <SendTo address={address} /> : <p className="mt-5 text-[13px] text-dim">Getting your address…</p>}

        <p className="mt-4 text-[11.5px] leading-relaxed text-dim">
          Send <span className="text-chrome">{net === "bnb" ? "USDT only" : "USDC only"}</span>, on the network you picked. It lands in your Crux balance by itself
          {net === "solana" ? " and is ready for Solana coins straight away. No SOL needed." : net === "bnb" ? " and is ready for BNB Chain coins straight away. No BNB needed." : "."}
        </p>
      </div>
    </div>
  );
}

/** The address with a QR code and a Copy button. */
function SendTo({ address }: { address: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(address, { margin: 1, width: 360, color: { dark: "#000000", light: "#ffffff" } }).then((u) => live && setQr(u));
    return () => {
      live = false;
    };
  }, [address]);
  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
        <img src={qr} alt="QR code of your deposit address" className="h-44 w-44 rounded-lg" />
      ) : (
        <div className="h-44 w-44 rounded-lg bg-line" />
      )}
      <code className="w-full break-all rounded-lg border border-line bg-void/60 px-3 py-2 text-center font-mono text-[12.5px] text-chrome">{address}</code>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        className="h-10 w-full rounded-lg bg-signal text-[13px] font-semibold text-black hover:opacity-90"
      >
        {copied ? "Copied" : "Copy address"}
      </button>
    </div>
  );
}
