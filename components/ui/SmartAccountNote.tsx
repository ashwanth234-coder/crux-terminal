"use client";

import type { Address } from "viem";
import { useBytecode } from "wagmi";
import { TESTNET } from "@/lib/chains";

/** EIP-7702 delegation designator: an EOA running smart-account code carries 0xef0100 ‖ delegate as its code. */
const DELEGATION_PREFIX = "0xef0100";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Smart-account wallets (EIP-7702) often submit through their wallet provider's relayer, so explorers list that
 * relayer as the sender. Shown only to such wallets, so nobody wonders whose address is on the transaction.
 */
export function SmartAccountNote({ address, className = "" }: { address: Address | null | undefined; className?: string }) {
  const { data: code } = useBytecode({
    address: address ?? undefined,
    chainId: TESTNET.id,
    query: { enabled: Boolean(address), staleTime: 60_000 },
  });
  if (!address || !code?.toLowerCase().startsWith(DELEGATION_PREFIX)) return null;
  return (
    <p className={`text-[11.5px] leading-snug text-dim ${className}`}>
      Your wallet is a smart account (EIP-7702), so Basescan may show your wallet provider&apos;s relayer as the
      transaction sender. The contracts still credit your address, <span className="font-mono">{short(address)}</span>.
    </p>
  );
}
