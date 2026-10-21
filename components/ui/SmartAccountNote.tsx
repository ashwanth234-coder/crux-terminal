"use client";

import type { Address } from "viem";
import { useBytecode } from "wagmi";
import { TESTNET } from "@/lib/chains";

/** EIP-7702 delegation designator: an EOA running smart-account code carries 0xef0100 ‖ delegate as its code. */
const DELEGATION_PREFIX = "0xef0100";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** True when `address` is an EIP-7702 smart account on Base Sepolia. */
function useSmartAccount(address: Address | null | undefined) {
  const { data: code } = useBytecode({
    address: address ?? undefined,
    chainId: TESTNET.id,
    query: { enabled: Boolean(address), staleTime: 60_000 },
  });
  return Boolean(address && code?.toLowerCase().startsWith(DELEGATION_PREFIX));
}

function explain(address: Address) {
  return `Your wallet is a smart account (EIP-7702), so Basescan may show your wallet provider's relayer as the transaction sender. The contracts still credit your address, ${short(address)}.`;
}

/**
 * Smart-account wallets (EIP-7702) often submit through their wallet provider's relayer, so explorers list that
 * relayer as the sender. Shown only to such wallets, so nobody wonders whose address is on the transaction.
 */
export function SmartAccountNote({ address, className = "" }: { address: Address | null | undefined; className?: string }) {
  const smart = useSmartAccount(address);
  if (!address || !smart) return null;
  return <p className={`text-[11.5px] leading-snug text-dim ${className}`}>{explain(address)}</p>;
}

/** The same note as a quiet ⓘ beside the wallet: shown on hover or keyboard focus, only for smart accounts. */
export function SmartAccountHint({ address }: { address: Address | null | undefined }) {
  const smart = useSmartAccount(address);
  if (!address || !smart) return null;
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="About your smart-account wallet"
        className="grid h-6 w-6 place-items-center rounded-full text-dim transition-colors hover:text-chrome focus-visible:text-chrome"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 7.2v3.6M8 5.1v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-64 rounded-md border border-line-2 bg-panel-2 p-3 text-[11.5px] leading-snug text-muted opacity-0 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.9)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {explain(address)}
      </span>
    </span>
  );
}
