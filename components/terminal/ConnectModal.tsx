"use client";

import { useEffect, useState } from "react";
import { useConnect, useConnectors, type Connector } from "wagmi";
import { Modal, KineticLoader } from "@/components/ui/Modal";
import { initFarcaster } from "@/lib/farcaster";

const COPY: Record<string, { name: string; detail: string }> = {
  farcaster: { name: "Farcaster Wallet", detail: "The wallet in this Farcaster client" },
  coinbaseWalletSDK: { name: "Coinbase Smart Wallet", detail: "Passkey sign-in · no extension" },
  walletConnect: { name: "WalletConnect", detail: "Scan with any mobile wallet" },
  injected: { name: "Browser Wallet", detail: "Injected provider" },
};

function describe(c: Connector) {
  return COPY[c.id] ?? { name: c.name, detail: "Detected in this browser" };
}

function ConnectorIcon({ connector }: { connector: Connector }) {
  if (connector.icon) {
    // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs supplied by EIP-6963
    return <img src={connector.icon} alt="" className="h-7 w-7 rounded-lg" />;
  }
  if (connector.id === "farcaster") {
    return (
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#855DCD]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path d="M7 6.5h10v11h-1.8v-4.6a3.2 3.2 0 0 0-6.4 0v4.6H7v-11Z" fill="white" />
        </svg>
      </span>
    );
  }
  if (connector.id === "coinbaseWalletSDK") {
    return (
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0052FF]">
        <span className="h-3 w-3 rounded-[3px] bg-white" />
      </span>
    );
  }
  if (connector.id === "walletConnect") {
    return (
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#3B99FC]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5.5 9.5c3.6-3.4 9.4-3.4 13 0M8 12.5c2.2-2 5.8-2 8 0" />
        </svg>
      </span>
    );
  }
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg border border-line-2 text-chrome">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <rect x="2" y="4" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11" cy="8.5" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const all = useConnectors();
  const { mutate: connect, isPending, variables, error, reset } = useConnect({
    mutation: { onSuccess: onClose },
  });

  // The Farcaster connector auto-connects inside a client and is useless elsewhere.
  const [inMiniApp, setInMiniApp] = useState(false);
  useEffect(() => {
    let live = true;
    void initFarcaster().then((v) => live && setInMiniApp(v));
    return () => {
      live = false;
    };
  }, []);

  // Inside a Farcaster client its own wallet leads the list (a manual fallback if
  // auto-connect was interrupted); elsewhere it is useless, so it is hidden.
  // Hide the generic injected entry when EIP-6963 already discovered named wallets.
  const discovered = all.some((c) => c.type === "injected" && c.id !== "injected");
  const connectors = all
    .filter((c) => (c.id === "farcaster" ? inMiniApp : !(discovered && c.id === "injected")))
    .sort((a, b) => Number(b.id === "farcaster") - Number(a.id === "farcaster"));

  const close = () => {
    reset();
    onClose();
  };

  const pendingId = isPending && variables && "id" in variables.connector ? variables.connector.id : null;

  return (
    <Modal open={open} onClose={close} title="Connect a wallet" subtitle="One balance across every chain you hold.">
      <ul className="space-y-2">
        {connectors.map((c) => {
          const { name, detail } = describe(c);
          const pending = pendingId === c.id;
          return (
            <li key={c.uid}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => connect({ connector: c })}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-void/50 px-3.5 py-3 text-left transition-colors hover:border-signal/50 hover:bg-white/[0.03] disabled:opacity-60"
              >
                <ConnectorIcon connector={c} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[14px] text-chrome">{name}</span>
                  <span className="block truncate text-[11.5px] text-muted">{detail}</span>
                </span>
                {pending ? (
                  <KineticLoader className="text-signal" />
                ) : (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-dim" aria-hidden="true">
                    <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-down/30 bg-down/10 px-3 py-2 font-mono text-[11px] text-down">
          {error.name === "UserRejectedRequestError" ? "Request rejected in wallet." : error.message.split("\n")[0]}
        </p>
      )}

      <p className="mt-5 font-mono text-[10px] leading-relaxed text-dim">
        Crux reads Base, BSC and Robinhood Chain balances to build your unified buying power. Nothing is signed until you
        confirm an intent.
      </p>
    </Modal>
  );
}
