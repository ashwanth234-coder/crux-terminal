"use client";

import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { buttonClass } from "@/components/ui/Button";

function short(key: string) {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Solana wallet picker in the terminal's own modal language (no third-party modal UI). */
export function SolanaConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, wallet, publicKey, connected, connecting, select, disconnect } = useWallet();

  const ready = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable,
  );
  const notInstalled = wallets.filter((w) => w.readyState === WalletReadyState.NotDetected);

  return (
    <Modal open={open} onClose={onClose} title="Connect Solana" subtitle="Adds SOL and SPL-USDC to your unified buying power.">
      {/* Wallet detection only exists in the browser; building the list while closed would
          differ between server and client render (hydration mismatch). */}
      {!open ? null : connected && publicKey ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-signal/40 bg-signal/[0.05] px-3.5 py-3">
            {wallet?.adapter.icon && (
              // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the wallet
              <img src={wallet.adapter.icon} alt="" className="h-7 w-7 rounded-lg" />
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[14px] text-chrome">{wallet?.adapter.name ?? "Solana wallet"}</span>
              <span className="block font-mono text-[12px] text-muted">{short(publicKey.toBase58())}</span>
            </span>
            <span className="text-[12px] text-signal">Connected</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass("primary", "sm", "flex-1 rounded-lg")}>
              Done
            </button>
            <button
              type="button"
              onClick={() => void disconnect().then(onClose)}
              className={buttonClass("outline", "sm", "flex-1 rounded-lg")}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {ready.map((w) => {
              const pending = connecting && wallet?.adapter.name === w.adapter.name;
              return (
                <li key={w.adapter.name}>
                  <button
                    type="button"
                    disabled={connecting}
                    // Selecting is enough: the provider's autoConnect connects the chosen wallet.
                    onClick={() => select(w.adapter.name)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-void/50 px-3.5 py-3 text-left transition-colors hover:border-signal/50 hover:bg-white/[0.03] disabled:opacity-60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the wallet */}
                    <img src={w.adapter.icon} alt="" className="h-7 w-7 rounded-lg" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[14px] text-chrome">{w.adapter.name}</span>
                      <span className="block text-[11.5px] text-muted">
                        {w.readyState === WalletReadyState.Installed ? "Detected in this browser" : "Opens the web wallet in a popup"}
                      </span>
                    </span>
                    {pending && <KineticLoader className="text-signal" />}
                  </button>
                </li>
              );
            })}
            {notInstalled.map((w) => (
              <li key={w.adapter.name}>
                <a
                  href={w.adapter.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-left opacity-80 transition-colors hover:border-line-2 hover:opacity-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the wallet */}
                  <img src={w.adapter.icon} alt="" className="h-7 w-7 rounded-lg grayscale" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[14px] text-chrome">{w.adapter.name}</span>
                    <span className="block text-[11.5px] text-muted">Not installed · get the extension</span>
                  </span>
                  <span className="text-[12px] text-dim">↗</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[11.5px] leading-relaxed text-dim">
            Crux only reads your SOL and USDC balances. Nothing is signed or sent from this step.
          </p>
        </>
      )}
    </Modal>
  );
}
