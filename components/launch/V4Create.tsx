"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, http, type Address } from "viem";
import { base } from "viem/chains";
import { Header } from "@/components/site/Header";
import { buttonClass } from "@/components/ui/Button";
import { RESERVED_TEXT, checkCopycat, metadataOf, squareImage } from "@/components/launch/V9Create";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { relay } from "@/hooks/useSolanaTrading";
import { useWalletTrading } from "@/hooks/useBnbTrading";
import { isReservedName } from "@/lib/antiVamp";
import { BASE_RPCS, NETWORK } from "@/lib/network";
import { RELAY_URL, postRelay } from "@/lib/session";
import { rulesText } from "@/lib/v4launch";
import { DEFAULT_MIX, DEFAULT_WINDOW, DESCRIPTION_MAX_CHARS, MAX_FIRST_BUY_USD, NAME_MAX_BYTES, TICKER_MAX_BYTES, V4_FACTORY, V4_WINDOWS, fitBytes, makeSaltKeeper, mixBps, mixProblem, previewLaunch, v4FactoryAbi, type Mix } from "@/lib/v4create";

const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });
const WINDOW_LABEL: Record<number, string> = { 0: "Off", 60: "1 min", 180: "3 min", 300: "5 min" };
const MIX_ROWS: { key: keyof Mix; label: string }[] = [
  { key: "you", label: "To you" },
  { key: "floor", label: "This coin's locked floor" },
  { key: "holders", label: "Holders" },
];

/**
 * /launch/new: a Crux coin launched from the login's own Base wallet (crux-solver /v1/v4/launch). Not linked from the
 * nav until the demo is recorded. The coin's 5afe address is mined here for that wallet, again after every edit.
 */
export function V4Create() {
  const router = useRouter();
  const crux = useCruxAccount();
  const wallet = useWalletTrading("base", null);
  const { getAccessToken } = usePrivy();
  const { addSigners } = useSigners();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [x, setX] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [windowSec, setWindowSec] = useState<number>(DEFAULT_WINDOW);
  const [mix, setMix] = useState<Mix>(DEFAULT_MIX);
  const [firstBuy, setFirstBuy] = useState("0");
  // Vesting (30 days, up to 10%) is left out while a first buy is capped at $50: at the opening value $50 can't reach
  // the 2% a creator may hold unlocked, so vesting would do nothing. It comes back if the first-buy cap rises.
  const vest = false;
  /** A launch sent but not seen landing yet: where to look. */
  const [pending, setPending] = useState<{ coin: string; link: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saltFor = useRef(
    makeSaltKeeper((i) => client.readContract({ address: V4_FACTORY, abi: v4FactoryAbi, functionName: "coinInitCodeHash", args: [i.name, i.symbol, i.metadataURI, i.creator] })),
  ).current;

  const fees = useQuery({
    queryKey: ["v4-factory-fees"],
    enabled: !NETWORK.testnet,
    staleTime: 60_000,
    queryFn: async () => {
      const [startBps, cruxEarlyBps] = await Promise.all([
        client.readContract({ address: V4_FACTORY, abi: v4FactoryAbi, functionName: "earlyStartBps" }),
        client.readContract({ address: V4_FACTORY, abi: v4FactoryAbi, functionName: "cruxEarlyBps" }),
      ]);
      return { startBps: Number(startBps), cruxEarlyBps: Number(cruxEarlyBps) };
    },
  });
  const rules = useMemo(() => (fees.data ? rulesText(previewLaunch({ windowSec, mix, ...fees.data })) : []), [fees.data, windowSec, mix]);
  const yourShare = fees.data ? 100 - fees.data.cruxEarlyBps / 100 : 90;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setUploadError("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > 15 * 1024 * 1024) return setUploadError("That file is over 15 MB. Pick a smaller one.");
    setUploading(true);
    try {
      const res = await postRelay("/v1/images", { data: await squareImage(file) });
      setImage(String(res.url));
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (NETWORK.testnet) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 pt-24 text-muted">These launches are on Base only, not on this test site.</main>
      </>
    );
  }

  const buyUsd = Number(firstBuy || "0");
  const buyOk = Number.isFinite(buyUsd) && buyUsd >= 0 && buyUsd <= MAX_FIRST_BUY_USD && (buyUsd === 0 || buyUsd >= 1);
  const cash = wallet.holdings ? Number(wallet.holdings.cash) / 10 ** wallet.holdings.cashDecimals : null;
  const enoughCash = buyUsd === 0 || cash === null || cash >= buyUsd;
  const mixWhy = mixProblem(mix);
  const reserved = isReservedName(name) || isReservedName(symbol);
  const ready = name.trim() !== "" && symbol.trim() !== "" && !reserved && mixWhy === null && buyOk && enoughCash && fees.data !== undefined;
  const step = (key: keyof Mix, by: number) => setMix((m) => ({ ...m, [key]: Math.min(100, Math.max(0, m[key] + by)) }));

  const launch = async () => {
    setError(null);
    setPending(null);
    try {
      if (!crux.loggedIn) return crux.login();
      const creator: Address | null = crux.owner;
      if (!creator) throw new Error("Your account is still loading. Try again in a moment.");
      const sym = symbol.trim().toUpperCase();
      const copycat = await checkCopycat(sym, name.trim(), image.trim(), x.trim());
      if (copycat) throw new Error(copycat);
      const metadataURI = metadataOf({ name: name.trim(), description: description.trim(), image: image.trim(), x: x.trim() });
      setBusy("Finding your coin's 5afe address…");
      const { salt } = await saltFor({ name: name.trim(), symbol: sym, metadataURI, creator });
      setBusy(buyUsd > 0 ? "Buying ETH with your cash, then launching…" : "Launching…");
      const body = async () => {
        const token = await getAccessToken();
        if (!token) throw new Error("Log in first.");
        return { token, name: name.trim(), symbol: sym, metadataURI, salt, vest, window: windowSec, ...mixBps(mix), firstBuy: String(Math.round(buyUsd * 1e6)) };
      };
      type Launched = { coin: string; pending?: boolean; link?: string };
      let r: Launched;
      try {
        r = await relay<Launched>("/v1/v4/launch", await body());
      } catch (e) {
        // The wallet hasn't let Crux sign for it on Base yet: one silent approval, then the launch again.
        if (!/Turn on .* trading/i.test((e as Error).message)) throw e;
        setBusy("Turning on Base for your wallet (once)…");
        const health = (await (await fetch(`${RELAY_URL}/v1/health`)).json()) as { baseTrading?: { signerId: string; policyId: string } };
        if (!health.baseTrading) throw new Error("Launching from Crux isn't switched on yet.");
        await addSigners({ address: creator, signers: [{ signerId: health.baseTrading.signerId, policyIds: [health.baseTrading.policyId] }] });
        for (let attempt = 1; ; attempt++) {
          await new Promise((ok) => setTimeout(ok, attempt === 1 ? 1_500 : 2_500));
          try {
            r = await relay<Launched>("/v1/v4/launch", await body());
            break;
          } catch (err) {
            if (!/Turn on .* trading/i.test((err as Error).message)) throw err;
            if (attempt >= 8) throw new Error("Base is still turning on for your wallet. Wait a few seconds and press Launch again.");
          }
        }
      }
      // Sent but not seen landing in time: it may still land. Say where to look instead of calling it a failure.
      if (r.pending) return setPending({ coin: r.coin, link: r.link ?? "" });
      router.push(`/base/${r.coin}`);
    } catch (e) {
      setError(((e as Error).message ?? String(e)).split("\n")[0]);
    } finally {
      setBusy(null);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-line-2 bg-transparent px-3 py-2 text-[14px] text-chrome outline-none focus:border-chrome/50";
  const chip = (on: boolean) => `h-9 rounded-lg border px-3 text-[12.5px] transition-colors ${on ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:border-chrome/40"}`;
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-24">
        <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.4rem)] text-bright">Launch a coin</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          From your Crux wallet on Base. Free to launch: Crux pays the network fee. Its liquidity is locked forever.
        </p>

        <div className="mt-6 space-y-4 text-[13px]">
          <label className="block text-muted">
            Name
            <input value={name} onChange={(e) => setName(fitBytes(e.target.value, NAME_MAX_BYTES))} className={field} />
          </label>
          <label className="block text-muted">
            Ticker
            <input value={symbol} onChange={(e) => setSymbol(fitBytes(e.target.value.replace(/[^A-Za-z0-9]/g, ""), TICKER_MAX_BYTES))} className={`${field} font-mono uppercase`} />
          </label>
          {reserved && (
            <p role="alert" className="text-[12.5px] text-down">
              {RESERVED_TEXT}
            </p>
          )}
          <label className="block text-muted">
            Description <span className="text-dim">(optional)</span>
            <textarea value={description} maxLength={DESCRIPTION_MAX_CHARS} onChange={(e) => setDescription([...e.target.value].slice(0, DESCRIPTION_MAX_CHARS).join(""))} rows={2} className={field} />
          </label>
          <div className="text-muted">
            Image <span className="text-dim">(optional)</span>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-2 text-[10px] text-dim">
                {/^https:\/\//.test(image) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the creator's own picture, any host
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  "None"
                )}
              </span>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line-2 px-3 text-[12.5px] text-chrome transition-colors hover:border-chrome/50 has-[:disabled]:opacity-50">
                {uploading ? "Uploading…" : image ? "Change picture" : "Upload picture"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ""))} className="sr-only" />
              </label>
              {image && !uploading && (
                <button type="button" onClick={() => setImage("")} className="text-[12px] underline decoration-line-2 hover:text-chrome">
                  Remove
                </button>
              )}
            </div>
            {uploadError && <p className="mt-1 text-[12px] text-down">{uploadError}</p>}
            <label className="mt-2 block text-[12px] text-dim">
              or paste an image link (https)
              <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" className={field} />
            </label>
          </div>
          <label className="block text-muted">
            X link <span className="text-dim">(optional)</span>
            <input value={x} onChange={(e) => setX(e.target.value)} placeholder="https://x.com/…" className={field} />
          </label>

          <div className="text-muted">
            Early buyers&apos; fee
            <p className="text-[12px] text-dim">Buyers in the first minutes pay an extra fee that falls to zero. It makes sniping your launch costly.</p>
            <div className="mt-2 flex gap-2">
              {V4_WINDOWS.map((w) => (
                <button key={w} type="button" onClick={() => setWindowSec(w)} className={chip(windowSec === w)} aria-pressed={windowSec === w}>
                  {WINDOW_LABEL[w]}
                </button>
              ))}
            </div>
          </div>

          {windowSec > 0 && (
            <div className="text-muted">
              Where your {yourShare}% of it goes
              <div className="mt-2 space-y-2">
                {MIX_ROWS.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3">
                    <span className="text-chrome">{row.label}</span>
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => step(row.key, -10)} disabled={mix[row.key] <= 0} className={chip(false)} aria-label={`Less ${row.label}`}>
                        −
                      </button>
                      <span className="w-12 text-center font-mono text-chrome">{mix[row.key]}%</span>
                      <button type="button" onClick={() => step(row.key, 10)} disabled={mix[row.key] >= 100} className={chip(false)} aria-label={`More ${row.label}`}>
                        +
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              {mixWhy && <p className="mt-1 text-[12px] text-down">{mixWhy}</p>}
            </div>
          )}

          <div className="text-muted">
            <label className="block">
              Your first buy <span className="text-dim">($0 to ${MAX_FIRST_BUY_USD}, from your cash)</span>
              <input value={firstBuy} inputMode="decimal" onChange={(e) => setFirstBuy(e.target.value.replace(/[^0-9.]/g, ""))} className={`${field} font-mono`} />
            </label>
            <p className="mt-1 text-[12px] text-dim">
              Bought before anyone else, with no early fee.{cash !== null ? ` You have $${cash.toFixed(2)}.` : ""}
            </p>
            {!buyOk && <p className="mt-1 text-[12px] text-down">A first buy is $1 to ${MAX_FIRST_BUY_USD}, or $0 for none.</p>}
            {buyOk && !enoughCash && <p className="mt-1 text-[12px] text-down">You don&apos;t have that much cash.</p>}
          </div>

          <div className="rounded-lg border border-line p-3 text-muted">
            <p className="text-chrome">Your coin&apos;s rules</p>
            {rules.length === 0 ? <p className="mt-1">Loading…</p> : rules.map((line) => <p key={line} className="mt-1">{line}</p>)}
            <p className="mt-1">No creator holds more than 2% unlocked at launch.</p>
            <p className="mt-1 text-[12px] text-dim">These are set at launch and can never change.</p>
          </div>

          <button type="button" disabled={!ready || busy !== null} onClick={() => void launch()} className={`${buttonClass("primary", "md", "rounded-lg")} w-full`}>
            {busy ?? (crux.loggedIn ? "Launch" : "Log in to launch")}
          </button>
          {error && <p className="text-[12.5px] text-down">{error}</p>}
          {pending && (
            <p role="status" className="text-[12.5px] text-muted">
              Your launch was sent and is still landing on Base.{" "}
              {pending.link && (
                <a href={pending.link} target="_blank" rel="noreferrer" className="underline decoration-line-2 hover:text-chrome">
                  See it on Basescan
                </a>
              )}
              {pending.link ? " or " : " "}
              <a href={`/base/${pending.coin}`} className="underline decoration-line-2 hover:text-chrome">
                open your coin
              </a>{" "}
              in a moment. Don&apos;t launch it again.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
