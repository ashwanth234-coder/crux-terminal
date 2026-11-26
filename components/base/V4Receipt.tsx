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
import { V4_HOOK, V4_REWARDS, rewardsAbi, type V4Launch } from "@/lib/v4launch";
import { buildReceipt, canClaimYourself, fetchRewards, isAddress40, readEthUsd, readReceiptLogs, receiptFor } from "@/lib/v4receipt";

type Client = Pick<PublicClient, "readContract" | "multicall" | "getLogs" | "getBlock" | "getBlockNumber">;

/**
 * "Paid to holders: check your wallet": the coin's payout receipt for a wallet, plus one tap to share it as an image.
 * Crux sends the payouts itself; "Claim it yourself" only shows for a share that is posted and still unpaid.
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
  const wallet = isAddress40(typed.trim()) ? (typed.trim() as Address) : null;
  const coin = getAddress(address);

  const file = useQuery({ queryKey: ["v4-rewards", coin], queryFn: () => fetchRewards(RELAY_URL, coin), refetchInterval: 60_000 });
  const symbol = useQuery({
    queryKey: ["v4-symbol", coin],
    staleTime: Infinity,
    queryFn: () => client.readContract({ address: coin, abi: erc20Abi, functionName: "symbol" }).catch(() => "COIN"),
  });
  const price = useQuery({ queryKey: ["eth-usd-feed"], staleTime: 60_000, queryFn: () => readEthUsd(client) });
  const logs = useQuery({
    queryKey: ["v4-receipt-logs", coin, wallet],
    enabled: launch.windowSec > 0,
    staleTime: 30_000,
    queryFn: () => readReceiptLogs(client, V4_HOOK, V4_REWARDS, coin, wallet, launch, file.data?.snapshotAt ?? launch.launchedAt + 86_400),
  });
  const line = receiptFor(file.data, wallet);
  const claimed = useQuery({
    queryKey: ["v4-claimed", coin, wallet],
    enabled: Boolean(line),
    refetchInterval: 20_000,
    queryFn: () => client.readContract({ address: V4_REWARDS, abi: rewardsAbi, functionName: "isClaimed", args: [coin, wallet as Address] }),
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (NETWORK.testnet) return null;

  const receipt =
    wallet && logs.data
      ? buildReceipt({ symbol: symbol.data ?? "COIN", launch, file: file.data ?? null, wallet, logs: logs.data, ethUsd: price.data ?? null })
      : null;
  // A paid claim is also what isClaimed says: show "Paid" the moment the chain does.
  const claimable = canClaimYourself(line, launch.reward.posted, claimed.data === true || Boolean(receipt?.paid));

  const claim = async () => {
    if (!connected || !line || !wallet) return;
    setBusy(true);
    setError(null);
    try {
      if (chainId !== base.id) await switchChain({ chainId: base.id });
      const hash = await simulateThenWrite(config, connected, {
        address: V4_REWARDS,
        abi: rewardsAbi,
        functionName: "claim",
        args: [coin, wallet, BigInt(line.amount), line.proof],
        chainId: base.id,
      });
      await waitForTransactionReceipt(config, { hash, chainId: base.id });
      void claimed.refetch();
      void logs.refetch();
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
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "crux-receipt.png";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
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
      {wallet && !file.isPending && !file.data && !receipt && (
        <p className="mt-2 text-[12px] text-dim">The holders&rsquo; list isn&rsquo;t ready yet. It&rsquo;s posted after the first 24 hours.</p>
      )}
      {wallet && file.data && !line && logs.data && !receipt && <p className="mt-2 text-[12px] text-dim">This wallet has no share on this coin.</p>}
      {wallet && line && !receipt && logs.isPending && <p className="mt-2 text-[12px] text-dim">Reading your receipt…</p>}
      {receipt && (
        <div className="mt-3 space-y-1 text-[12.5px]">
          <p className="font-medium text-chrome">
            {receipt.coin} · launched {receipt.launchDate}
          </p>
          <p>Early buyers&rsquo; fees collected: {receipt.earlyFees}</p>
          <p>Creator&rsquo;s choice: {receipt.choice}</p>
          {receipt.held && <p>{receipt.held}</p>}
          <p className="font-mono text-[13px] text-chrome">
            {receipt.kind === "creator" ? "Your payout" : "Your share"}: {receipt.shareEth}
            {receipt.shareUsd ? ` (${receipt.shareUsd})` : ""}
          </p>
          <p>
            {receipt.paid ? "Paid" : "Not paid yet. Crux sends it to your wallet on its own."}
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
            {busy ? "Claiming…" : connected ? "Claim it yourself" : "Connect a wallet to claim it yourself"}
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
