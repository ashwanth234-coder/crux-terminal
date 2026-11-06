"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decodeEventLog, zeroAddress, type Address, type Hex } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { erc20Abi } from "viem";
import { Header } from "@/components/site/Header";
import { buttonClass } from "@/components/ui/Button";
import { TESTNET } from "@/lib/chains";
import { simulateThenWrite } from "@/lib/preflight";
import { mineTokenSalt } from "@/lib/tokenSalt";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { FACTORY_V9, V9_ON, curveV9Abi, factoryV9Abi, launchFromAccountV9, type V9LaunchParams } from "@/lib/v9";

const metadataOf = (o: { name: string; description: string; image: string; x: string }) => {
  const json = JSON.stringify({ name: o.name, description: o.description, image: o.image, links: o.x ? { x: o.x } : {} });
  return `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
};

/** The anti-copycat check the relay runs, run here too for a wallet launch (the factory itself doesn't check). */
async function checkCopycat(symbol: string, image: string, x: string): Promise<string | null> {
  try {
    const res = await fetch("/api/launch-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, image, x }) });
    const j = (await res.json()) as { ok?: boolean; line?: string };
    return j.ok === false ? `${j.line ?? "This copies an existing Crux token"}. Change the ticker, artwork or X link.` : null;
  } catch {
    return null;
  }
}

/** /launch/v9/new: a V9 launch, from the CRUX Account (gasless) or a wallet. */
export function V9Create() {
  const router = useRouter();
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const crux = useCruxAccount();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [x, setX] = useState("");
  const [fairOpening, setFairOpening] = useState(true);
  const [custom, setCustom] = useState(false);
  const [instantUnlock, setInstantUnlock] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [from, setFrom] = useState<"account" | "wallet">("account");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountReady = Boolean(crux.account && crux.sign && crux.owner);
  const via = from === "account" && accountReady ? "account" : "wallet";
  const factoryInfo = useReadContracts({ contracts: [{ address: FACTORY_V9, abi: factoryV9Abi, functionName: "threshold", chainId: TESTNET.id }] });
  const threshold = factoryInfo.data?.[0]?.result as bigint | undefined;

  if (!V9_ON) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 pt-24 text-muted">V9 launches aren&apos;t live on this site yet.</main>
      </>
    );
  }

  const ready = name.trim() !== "" && symbol.trim() !== "" && (!instantUnlock || confirmUnlock);

  const launch = async () => {
    setError(null);
    try {
      const creator: Address | undefined = via === "account" ? crux.account! : address;
      if (!creator) throw new Error("Log in or connect a wallet to launch.");
      const meta = metadataOf({ name: name.trim(), description: description.trim(), image: image.trim(), x: x.trim() });
      const options = { instantUnlock, openingWindow: fairOpening ? 60 : 0, openingCap: BigInt(0) };
      // The token's 5afe address: the factory's init-code hash for this launch and creator, then a salt that ends in 5afe.
      setBusy("Finding your token's 5afe address…");
      const unsalted: V9LaunchParams = { name: name.trim(), symbol: symbol.trim().toUpperCase(), metadataURI: meta, salt: `0x${"00".repeat(32)}` as Hex };
      const [deployer, hash] = await Promise.all([
        readContract(config, { chainId: TESTNET.id, address: FACTORY_V9, abi: factoryV9Abi, functionName: "tokenDeployer" }),
        readContract(config, { chainId: TESTNET.id, address: FACTORY_V9, abi: factoryV9Abi, functionName: "tokenInitCodeHash", args: [unsalted, creator] }),
      ]);
      const { salt } = mineTokenSalt(deployer, hash);
      const params = { ...unsalted, salt };

      if (via === "account") {
        setBusy("Launching from your CRUX Account…");
        const nonce = await readContract(config, { chainId: TESTNET.id, address: FACTORY_V9, abi: factoryV9Abi, functionName: "nonces", args: [creator] });
        const id = await launchFromAccountV9(crux.sign!, creator, nonce, params, options);
        router.push(`/launch/v9/${id}`);
        return;
      }
      const copycat = await checkCopycat(params.symbol, image.trim(), x.trim());
      if (copycat) throw new Error(copycat);
      if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
      setBusy("Confirm the launch in your wallet…");
      const tx = await simulateThenWrite(config, address!, { chainId: TESTNET.id, address: FACTORY_V9, abi: factoryV9Abi, functionName: "launch", args: [params, options] });
      setBusy("Launching…");
      const receipt = await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash: tx });
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== FACTORY_V9.toLowerCase()) continue;
        try {
          const e = decodeEventLog({ abi: factoryV9Abi, data: log.data, topics: log.topics, eventName: "Launched" });
          router.push(`/launch/v9/${e.args.id}`);
          return;
        } catch {
          // another event
        }
      }
      throw new Error("Launched, but couldn't read its number. Find it under V9 launches.");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(/rejected|denied|cancel/i.test(msg) ? "Cancelled in the wallet. Nothing changed." : msg.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-line-2 bg-transparent px-3 py-2 text-[14px] text-chrome outline-none focus:border-chrome/50";
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-24">
        <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.4rem)] text-bright">Launch a token (V9)</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Your token trades on its own curve from the first second (after an optional fair opening), then graduates into a Uniswap pool on Base
          {threshold ? ` at $${Number(threshold) / 1e6}` : ""} with its liquidity burned. Free to launch. Base Sepolia testnet.
        </p>

        <div className="mt-6 space-y-4 text-[13px]">
          <label className="block text-muted">
            Name
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block text-muted">
            Ticker
            <input value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} className={`${field} font-mono uppercase`} />
          </label>
          <label className="block text-muted">
            Description <span className="text-dim">(optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={field} />
          </label>
          <label className="block text-muted">
            Image URL <span className="text-dim">(optional, https)</span>
            <input value={image} onChange={(e) => setImage(e.target.value)} className={field} />
          </label>
          <label className="block text-muted">
            X account <span className="text-dim">(optional)</span>
            <input value={x} onChange={(e) => setX(e.target.value)} className={field} />
          </label>

          <label className="flex items-start gap-2 text-muted">
            <input type="checkbox" checked={fairOpening} onChange={(e) => setFairOpening(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="text-chrome">60-second fair opening</span> (recommended): everyone who buys in the first minute pays one price, so there&apos;s nothing to snipe.
            </span>
          </label>

          <div className="rounded-lg border border-line p-3 text-muted">
            <p>
              <span className="text-chrome">Your creator tokens</span> (2.4% of supply) vest over <span className="text-up">30 days</span>.
            </p>
            <button type="button" onClick={() => setCustom(!custom)} className="mt-1 text-[12px] underline decoration-line-2 hover:text-chrome">
              {custom ? "Hide custom" : "Custom"}
            </button>
            {custom && (
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={instantUnlock} onChange={(e) => (setInstantUnlock(e.target.checked), setConfirmUnlock(false))} />
                  Unlock my tokens at once instead
                </label>
                {instantUnlock && (
                  <label className="flex items-start gap-2 text-down">
                    <input type="checkbox" checked={confirmUnlock} onChange={(e) => setConfirmUnlock(e.target.checked)} className="mt-0.5" />
                    <span>I understand buyers will see this launch flagged: an instant unlock lets the creator sell straight away.</span>
                  </label>
                )}
              </div>
            )}
          </div>

          {accountReady && (
            <div className="flex gap-4 text-muted">
              {(["account", "wallet"] as const).map((f) => (
                <label key={f} className="flex items-center gap-1.5">
                  <input type="radio" name="v9-launch-from" checked={from === f} onChange={() => setFrom(f)} />
                  {f === "account" ? "From my CRUX Account (no gas)" : "From my wallet"}
                </label>
              ))}
            </div>
          )}

          <button type="button" disabled={!ready || busy !== null} onClick={() => void launch()} className={`${buttonClass("primary", "md", "rounded-lg")} w-full`}>
            {busy ?? "Launch"}
          </button>
          {error && <p className="text-[12.5px] text-down">{error}</p>}
          <p className="text-[12px] text-dim">
            <Link href="/launch/v9" className="underline decoration-line-2 hover:text-chrome">
              See V9 launches
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

/** /launch/v9: every V9 launch, newest first, with its phase. */
export function V9List() {
  const count = useReadContracts({ query: { refetchInterval: 10_000 }, contracts: [{ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount", chainId: TESTNET.id }] });
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? BigInt(0));
  const ids = Array.from({ length: n }, (_, i) => BigInt(n - 1 - i)).slice(0, 50);
  const launches = useReadContracts({
    query: { enabled: n > 0 },
    contracts: ids.map((id) => ({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [id], chainId: TESTNET.id }) as const),
  });
  const rows = ids.map((id, i) => ({ id, l: launches.data?.[i]?.result as { token: Address; curve: Address } | undefined }));
  const meta = useReadContracts({
    allowFailure: true,
    query: { enabled: rows.every((r) => r.l), refetchInterval: 10_000 },
    contracts: rows.flatMap((r) => [
      { address: r.l?.token ?? zeroAddress, abi: erc20Abi, functionName: "symbol", chainId: TESTNET.id } as const,
      { address: r.l?.curve ?? zeroAddress, abi: curveV9Abi, functionName: "graduated", chainId: TESTNET.id } as const,
    ]),
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-24">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.4rem)] text-bright">V9 launches</h1>
          <Link href="/launch/v9/new" className={buttonClass("primary", "sm", "rounded-lg")}>
            Launch a token
          </Link>
        </div>
        {!V9_ON ? (
          <p className="mt-6 text-muted">V9 launches aren&apos;t live on this site yet.</p>
        ) : n === 0 ? (
          <p className="mt-6 text-muted">No V9 launches yet. Be the first.</p>
        ) : (
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {rows.map((r, i) => (
              <li key={r.id.toString()}>
                <Link href={`/launch/v9/${r.id}`} className="flex items-center justify-between py-3 hover:bg-tint/[0.02]">
                  <span className="text-chrome">
                    ${(meta.data?.[i * 2]?.result as string | undefined) ?? "…"} <span className="font-mono text-[11px] text-dim">#{r.id.toString()}</span>
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">{meta.data?.[i * 2 + 1]?.result ? "On Uniswap" : "On its curve"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
