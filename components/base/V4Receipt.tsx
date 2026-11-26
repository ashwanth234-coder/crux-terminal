"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, getAddress, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { NETWORK } from "@/lib/network";
import { simulateThenWrite } from "@/lib/preflight";
import { RELAY_URL } from "@/lib/readCache";
import { V4_HOOK, V4_REWARDS, readCreator, rewardsAbi, type V4Launch } from "@/lib/v4launch";
import { buildReceipt, canClaimYourself, fetchRewards, isAddress40, listState, readEarlyFees, readEthUsd, readWalletPaid, receiptFor } from "@/lib/v4receipt";

type Client = Pick<PublicClient, "readContract" | "multicall" | "getLogs" | "getBlock" | "getBlockNumber">;

/**
 * "Paid to holders: check your wallet": the coin's payout receipt for a wallet, plus one tap to share it as an image.
 * Crux sends the payouts itself; "Claim it yourself" only shows for a share that is posted and still unpaid.
 * Nothing but the (cheap) list is read until a wallet is entered, and no log is scanned for a wallet with no share.
 */
export function V4Receipt({ address, launch, client }: { address: string; launch: V4Launch; client: Client }) {
  const { address: connected, chainId } = useConnection();
  const config = useConfig();
  const { mutateAsync: switchChain } = useSwitchChain();
  const [typed, setTyped] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (connected && !touched) setTyped(connected);
  }, [connected, touched]);
  const wallet = isAddress40(typed.trim()) ? getAddress(typed.trim()) : null;
  const coin = getAddress(address);

  const list = useQuery({ queryKey: ["v4-rewards", coin], queryFn: () => fetchRewards(RELAY_URL, coin), refetchInterval: 60_000 });
  const file = list.data?.status === "ok" ? list.data.file : null;
  const line = receiptFor(file, wallet);
  const creator = useQuery({ queryKey: ["v4-creator", coin], enabled: Boolean(wallet), staleTime: 300_000, queryFn: () => readCreator(client, coin) });
  const isCreator = Boolean(wallet && creator.data && creator.data.toLowerCase() === wallet.toLowerCase());
  const listKnown = list.data !== undefined && list.data.status !== "error";
  /** Only a wallet that has a line (or is the creator) has anything to look up on chain. */
  const hasReceipt = Boolean(wallet && listKnown && !creator.isPending && (line || isCreator));

  const symbol = useQuery({
    queryKey: ["v4-symbol", coin],
    enabled: hasReceipt,
    staleTime: Infinity,
    queryFn: () => client.readContract({ address: coin, abi: erc20Abi, functionName: "symbol" }).catch(() => "COIN"),
  });
  const price = useQuery({ queryKey: ["eth-usd-feed"], enabled: hasReceipt, staleTime: 60_000, queryFn: () => readEthUsd(client) });
  // The same for every wallet: read once per coin.
  const fees = useQuery({ queryKey: ["v4-early-fees", coin], enabled: hasReceipt, staleTime: 300_000, queryFn: () => readEarlyFees(client, V4_HOOK, coin, launch) });
  const snapshotAt = file?.snapshotAt ?? launch.launchedAt + 86_400;
  const paid = useQuery({
    queryKey: ["v4-wallet-paid", coin, wallet, snapshotAt],
    enabled: hasReceipt,
    staleTime: 30_000,
    queryFn: () => readWalletPaid(client, V4_HOOK, V4_REWARDS, coin, wallet as Address, launch, snapshotAt),
  });
  const claimed = useQuery({
    queryKey: ["v4-claimed", coin, wallet],
    enabled: Boolean(line),
    refetchInterval: 20_000,
    queryFn: () => client.readContract({ address: V4_REWARDS, abi: rewardsAbi, functionName: "isClaimed", args: [coin, wallet as Address] }),
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (NETWORK.testnet) return null;

  const ready = hasReceipt && paid.data && !fees.isPending && !symbol.isPending;
  const receipt =
    ready && wallet
      ? buildReceipt({ symbol: symbol.data ?? "COIN", launch, file, wallet, logs: { earlyFees: fees.data ?? null, ...paid.data! }, ethUsd: price.data ?? null })
      : null;
  // The file is only good for a claim once its root is the one the Safe posted on chain.
  const state = listState(file?.root, launch.reward);
  const claimable = canClaimYourself(line, file?.root, launch.reward, claimed.data === true || Boolean(receipt?.paid));
  const mismatch = Boolean(receipt && receipt.kind === "holder" && !receipt.paid && state === "mismatch");
  const mine = Boolean(connected && wallet && connected.toLowerCase() === wallet.toLowerCase());

  const claim = async () => {
    if (!connected || !line) return;
    setBusy(true);
    setError(null);
    try {
      if (chainId !== base.id) await switchChain({ chainId: base.id });
      const hash = await simulateThenWrite(config, connected, {
        address: V4_REWARDS,
        abi: rewardsAbi,
        functionName: "claim",
        args: [coin, getAddress(line.account), BigInt(line.amount), line.proof],
        chainId: base.id,
      });
      await waitForTransactionReceipt(config, { hash, chainId: base.id });
      void claimed.refetch();
      void paid.refetch();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  const imageUrl = wallet ? `/api/receipt?coin=${coin}&wallet=${wallet}` : null;
  const share = async () => {
    if (!imageUrl) return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const f = new File([blob], "crux-receipt.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], text: `My ${receipt?.coin ?? "coin"} payout on Crux` });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "crux-receipt.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      // Closing the share sheet is not an error.
      if ((e as Error)?.name === "AbortError") return;
      window.open(imageUrl, "_blank", "noopener");
    }
  };

  return (
    <section aria-label="Holders' receipt" className="mb-3 rounded-xl border border-line p-4">
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-dim">Paid to holders: check your wallet</p>
      <input
        value={typed}
        onChange={(e) => {
          setTouched(true);
          setTyped(e.target.value);
        }}
        placeholder="Paste a wallet address (0x…)"
        spellCheck={false}
        aria-label="Wallet address"
        className="mt-2 w-full rounded-lg border border-line bg-transparent px-2.5 py-1.5 font-mono text-[11.5px] text-chrome outline-none focus:border-accent"
      />
      {!wallet && typed.trim() !== "" && <p className="mt-2 text-[12px] text-dim">That doesn&rsquo;t look like a wallet address.</p>}
      {wallet && list.data?.status === "error" && (
        <p className="mt-2 text-[12px] text-dim">
          Couldn&rsquo;t reach Crux just now.{" "}
          <button type="button" className="underline" onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      )}
      {wallet && list.data?.status === "none" && !isCreator && (
        <p className="mt-2 text-[12px] text-dim">The holders&rsquo; list isn&rsquo;t posted yet. It&rsquo;s posted after the first 24 hours.</p>
      )}
      {wallet && listKnown && !creator.isPending && !line && !isCreator && list.data?.status === "ok" && (
        <p className="mt-2 text-[12px] text-dim">This wallet has no share on this coin.</p>
      )}
      {hasReceipt && !receipt && (paid.isPending || fees.isPending) && <p className="mt-2 text-[12px] text-dim">Reading your receipt…</p>}
      {hasReceipt && isCreator && !line && paid.data && !receipt && <p className="mt-2 text-[12px] text-dim">No creator payout has been sent to this wallet yet.</p>}
      {receipt && (
        <div className="mt-3 space-y-1 text-[12.5px]">
          <p className="font-medium text-chrome">
            {receipt.coin} · launched {receipt.launchDate}
          </p>
          <p>Early buyers&rsquo; fees collected: {receipt.earlyFees}</p>
          <p>Creator&rsquo;s choice: {receipt.choice}</p>
          {receipt.held && <p>{receipt.held}</p>}
          {mismatch ? (
            <p className="text-dim">This list doesn&rsquo;t match the posted one yet.</p>
          ) : (
            <p className="font-mono text-[13px] text-chrome">
              {receipt.kind === "creator" ? "Your payout" : "Your share"}: {receipt.shareEth}
              {receipt.shareUsd ? ` (${receipt.shareUsd})` : ""}
            </p>
          )}
          <p>
            {receipt.paid
              ? "Paid"
              : mismatch
                ? "Nothing to claim from it until it does."
                : state === "unposted"
                  ? "Not paid yet. Waiting to be posted — then it’s sent to your wallet automatically."
                  : "Not paid yet. Crux sends it to your wallet on its own."}
            {receipt.tx && receipt.tx !== "0x" && (
              <>
                {" · "}
                <a href={`${NETWORK.explorer}/tx/${receipt.tx}`} target="_blank" rel="noopener noreferrer" className="underline">
                  See the transaction
                </a>
              </>
            )}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {claimable && (
          <button
            type="button"
            onClick={claim}
            disabled={busy || !connected}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-chrome disabled:opacity-50"
          >
            {busy ? "Claiming…" : !connected ? "Connect a wallet to claim" : mine ? "Claim it yourself" : "Claim for this wallet (you pay the gas)"}
          </button>
        )}
        {receipt && (
          <button type="button" onClick={share} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-chrome">
            Share as an image
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12px] text-down">{error}</p>}
    </section>
  );
}
