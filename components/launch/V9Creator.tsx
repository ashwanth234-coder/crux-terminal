"use client";

import { useState } from "react";
import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { simulateThenWrite } from "@/lib/preflight";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { FACTORY_V9, ROUTER_V9, curveV9Abi, factoryV9Abi, routerV9Abi } from "@/lib/v9";

const usd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** What the creator has earned (curve fees, then router fees after graduation) and their vested tokens, with claims. */
export function CreatorPanel({ token, curve, creator, symbol }: { token: Address; curve: Address; creator: Address; symbol: string }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const crux = useCruxAccount();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const reads = useReadContracts({
    allowFailure: true,
    query: { refetchInterval: 10_000 },
    contracts: [
      { address: ROUTER_V9, abi: routerV9Abi, functionName: "creatorEarnings", args: [token], chainId: TESTNET.id },
      { address: curve, abi: curveV9Abi, functionName: "creatorClaimable", chainId: TESTNET.id },
    ],
  });
  const earnings = reads.data?.[0]?.result as readonly [bigint, bigint] | undefined;
  const claimable = (reads.data?.[1]?.result as bigint | undefined) ?? BigInt(0);
  const isCreator = [address, crux.account].some((a) => a && a.toLowerCase() === creator.toLowerCase());

  const send = async (fn: "claimAllCreatorFees" | "claimCreator") => {
    if (!address) return setNote("Connect a wallet to send the claim (it pays the creator, whoever sends it).");
    setBusy(true);
    setNote(null);
    try {
      if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
      const hash =
        fn === "claimAllCreatorFees"
          ? await simulateThenWrite(config, address, { chainId: TESTNET.id, address: ROUTER_V9, abi: routerV9Abi, functionName: "claimAllCreatorFees", args: [token] })
          : await simulateThenWrite(config, address, { chainId: TESTNET.id, address: curve, abi: curveV9Abi, functionName: "claimCreator", args: [] });
      await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
      setNote(fn === "claimAllCreatorFees" ? "Fees paid to the creator." : "Vested tokens sent to the creator.");
      void reads.refetch();
    } catch (e) {
      setNote(((e as Error).message ?? String(e)).split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-line p-4 text-[12.5px]">
      <h2 className="text-[14px] font-medium text-chrome">Creator {isCreator && <span className="text-up">· you</span>}</h2>
      <p className="mt-1 font-mono text-[11px] text-dim">
        <Link href={`${TESTNET_EXPLORER}/address/${creator}`} target="_blank" className="hover:text-chrome">
          {creator.slice(0, 6)}…{creator.slice(-4)}
        </Link>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-dim">Fees earned (30% of 1%)</dt>
          <dd className="mt-0.5 text-chrome">${earnings ? usd(earnings[1]) : "…"}</dd>
        </div>
        <div>
          <dt className="text-dim">Unclaimed</dt>
          <dd className="mt-0.5 text-chrome">${earnings ? usd(earnings[0]) : "…"}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !earnings || earnings[0] === BigInt(0)} onClick={() => void send("claimAllCreatorFees")} className={buttonClass("outline", "sm", "rounded-lg")}>
          Pay out fees
        </button>
        <button type="button" disabled={busy || claimable === BigInt(0)} onClick={() => void send("claimCreator")} className={buttonClass("outline", "sm", "rounded-lg")}>
          Claim vested {claimable > BigInt(0) ? `${Number(formatUnits(claimable, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 })} $${symbol}` : `$${symbol}`}
        </button>
      </div>
      {note && <p className="mt-2 text-muted">{note}</p>}
    </section>
  );
}


/**
 * Creator rewards on the CRUX Account page: every V9 token this account (or the connected wallet) created, each with
 * its fees (30% of the 1% trading fee) and vested tokens to claim.
 */
export function CreatorRewards() {
  const crux = useCruxAccount();
  const { address } = useConnection();
  const count = useReadContracts({ query: { refetchInterval: 30_000 }, contracts: [{ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount", chainId: TESTNET.id }] });
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? BigInt(0));
  const ids = Array.from({ length: n }, (_, i) => BigInt(i));
  const launches = useReadContracts({
    query: { enabled: n > 0, refetchInterval: 30_000 },
    contracts: ids.map((id) => ({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [id], chainId: TESTNET.id }) as const),
  });
  const me = [crux.account, address].filter(Boolean).map((a) => a!.toLowerCase());
  const mine = (launches.data ?? [])
    .map((r, i) => ({ id: ids[i], l: r.result as { token: Address; curve: Address; creator: Address } | undefined }))
    .filter((x) => x.l && me.includes(x.l.creator.toLowerCase()));
  const symbols = useReadContracts({
    query: { enabled: mine.length > 0 },
    contracts: mine.map((x) => ({ address: x.l!.token, abi: [{ type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const, functionName: "symbol", chainId: TESTNET.id }) as const),
  });
  if (me.length === 0) return null;
  return (
    <section className="rounded-xl border border-line p-5 sm:p-6">
      <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-dim">Creator rewards</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">Tokens you launched on Crux V9: you earn 30% of the 1% fee on every trade, paid in USDC.</p>
      {launches.isPending && n > 0 ? (
        <p className="mt-3 text-[12.5px] text-dim">Reading your launches…</p>
      ) : mine.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-dim">
          No launches yet. <Link href="/launch/v9/new" className="text-chrome underline decoration-line-2">Launch a token</Link> to start earning.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {mine.map((x, i) => {
            const symbol = (symbols.data?.[i]?.result as string | undefined) ?? "TOKEN";
            return (
              <div key={x.l!.token}>
                <Link href={`/launch/v9/${x.id}`} className="text-[13px] text-chrome hover:text-signal">
                  ${symbol} <span className="text-dim">· V9 #{x.id.toString()}</span>
                </Link>
                <div className="mt-2">
                  <CreatorPanel token={x.l!.token} curve={x.l!.curve} creator={x.l!.creator} symbol={symbol} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** On a token's page: who created it, and for its creator, where their rewards are. */
export function CreatorNote({ creator, symbol }: { creator: Address; symbol: string }) {
  const crux = useCruxAccount();
  const { address } = useConnection();
  const isCreator = [address, crux.account].some((a) => a && a.toLowerCase() === creator.toLowerCase());
  return (
    <p className="rounded-xl border border-line px-4 py-3 text-[12.5px] text-muted">
      {isCreator ? (
        <>
          You created ${symbol}.{" "}
          <Link href="/account" className="text-chrome underline decoration-line-2 hover:text-signal">
            Your creator rewards are in your CRUX Account →
          </Link>
        </>
      ) : (
        <>
          Created by{" "}
          <a href={`${TESTNET_EXPLORER}/address/${creator}`} target="_blank" rel="noopener noreferrer" className="font-mono text-chrome hover:text-signal">
            {creator.slice(0, 6)}…{creator.slice(-4)}
          </a>{" "}
          · earns 30% of the trading fee
        </>
      )}
    </p>
  );
}
