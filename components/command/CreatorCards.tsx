"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { relay } from "@/hooks/useSolanaTrading";
import { CHAIN_NAME, findCoins, type FoundCoin, type LaunchLite } from "@/lib/commandCoins";
import { fmtCompact } from "@/lib/solanaCoins";
import type { CommandChain } from "@/lib/commandIntent";

type OnCommand = (command: string, say?: string) => void;
type CreatorAnswer = { creator: string | null; record?: { coins?: number; graduated?: number; holdsPct?: number }; notes: string[] };
type CreatorCoin = { address: string; symbol?: string; name?: string; mcapNowUsd?: number; peakMcapUsd?: number; graduated?: boolean };
type CoinsAnswer = { creator: string | null; total: number | null; graduated?: number; coins: CreatorCoin[]; note: string };

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const explorer = (chain: CommandChain, a: string) => (chain === "solana" ? `https://solscan.io/account/${a}` : chain === "bnb" ? `https://bscscan.com/address/${a}` : `https://basescan.org/address/${a}`);

/** The coin a word means (as the coin card finds it): Crux launches first, then the markets. */
function useCoin(word: string, chain?: CommandChain) {
  const launches = useQuery({
    queryKey: ["launch-feed"],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: LaunchLite[] }).launches;
    },
  });
  const ready = launches.data !== undefined || launches.isError;
  return useQuery({ queryKey: ["cmd-coin", word.toLowerCase(), chain ?? ""], enabled: ready, staleTime: 60_000, queryFn: async () => (await findCoins(word, chain, launches.data ?? []))[0] ?? null });
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1_500);
      })}
      className="rounded border border-line-2 px-1.5 text-[11.5px] text-muted hover:text-chrome"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Missing({ word }: { word: string }) {
  return <p className="text-muted">{`I couldn't find a coin called “${word}”. Paste its address and ask again.`}</p>;
}

/** "Who made BONK": the creator's wallet (copy, explorer), how many coins they made and how many graduated. */
export function CreatorCard({ coin, chain, onCommand }: { coin: string; chain?: CommandChain; onCommand: OnCommand }) {
  const found = useCoin(coin, chain);
  const c = found.data;
  const answer = useQuery({ queryKey: ["creator", c?.chain, c?.address], enabled: !!c, staleTime: 5 * 60_000, queryFn: () => relay<CreatorAnswer>("/v1/creator", { chain: c!.chain, address: c!.address }) });
  if (found.isPending) return <p className="animate-pulse text-muted">Finding {coin}…</p>;
  if (!c) return <Missing word={coin} />;
  if (answer.isPending) return <p className="animate-pulse text-muted">Looking up who made ${c.symbol}…</p>;
  if (answer.isError) return <p className="text-down">{(answer.error as Error).message}</p>;
  const a = answer.data!;
  if (!a.creator) return <p className="text-muted">{`Who made $${c.symbol} isn't known yet. ${a.notes[0] ?? ""}`}</p>;
  const r = a.record;
  return (
    <div>
      <p>
        ${c.symbol} was made by{" "}
        <a href={explorer(c.chain, a.creator)} target="_blank" rel="noopener noreferrer" className="font-mono text-chrome underline decoration-line-2">
          {short(a.creator)}
        </a>{" "}
        <Copy text={a.creator} />
      </p>
      {r?.coins !== undefined && (
        <p className="mt-1 text-[13px] text-muted">
          {`They've made ${r.coins} coin${r.coins === 1 ? "" : "s"}${r.graduated !== undefined ? `, ${r.graduated} graduated to a full market` : ""}.`}
          {r.holdsPct !== undefined && ` They hold ${r.holdsPct < 0.01 ? "almost none" : `${r.holdsPct.toFixed(1)}%`} of $${c.symbol} now.`}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onCommand(`coins by the ${c.address} creator on ${c.chain}`, "Show their coins")} className="rounded-full border border-line-2 px-3 py-1 text-[12.5px] text-muted hover:border-chrome/40 hover:text-chrome">
          Show their coins
        </button>
        <button type="button" onClick={() => onCommand(`coins by the ${c.address} creator on ${c.chain} that hit $50000`, "Their coins that hit $50k+")} className="rounded-full border border-line-2 px-3 py-1 text-[12.5px] text-muted hover:border-chrome/40 hover:text-chrome">
          Their coins that hit $50k+
        </button>
      </div>
    </div>
  );
}

/** "His coins that hit 50k": the creator's coins, biggest peak first, each tappable to check it. */
export function CreatorCoinsCard({ coin, chain, minPeakUsd, onCommand }: { coin: string; chain?: CommandChain; minPeakUsd?: number; onCommand: OnCommand }) {
  const found = useCoin(coin, chain);
  const c: FoundCoin | null | undefined = found.data;
  const answer = useQuery({
    queryKey: ["creator-coins", c?.chain, c?.address, minPeakUsd ?? 0],
    enabled: !!c,
    staleTime: 5 * 60_000,
    queryFn: () => relay<CoinsAnswer>("/v1/creator-coins", { chain: c!.chain, address: c!.address, ...(minPeakUsd ? { minPeakUsd } : {}) }),
  });
  if (found.isPending) return <p className="animate-pulse text-muted">Finding {coin}…</p>;
  if (!c) return <Missing word={coin} />;
  if (answer.isPending) return <p className="animate-pulse text-muted">Reading the coins ${c.symbol}&rsquo;s creator made… this can take up to 20 seconds.</p>;
  if (answer.isError) return <p className="text-down">{(answer.error as Error).message}</p>;
  const a = answer.data!;
  const over = minPeakUsd ? ` that reached ${fmtCompact(minPeakUsd)}` : "";
  return (
    <div>
      <p>
        {a.total === null
          ? a.note
          : a.coins.length === 0
            ? `None of the ${a.total} coin${a.total === 1 ? "" : "s"} $${c.symbol}'s creator made${over || " could be read"}.`
            : `$${c.symbol}'s creator made ${a.total} coin${a.total === 1 ? "" : "s"}${a.graduated !== undefined ? ` (${a.graduated} graduated)` : ""}. ${minPeakUsd ? `${a.coins.length}${over}:` : "The biggest:"}`}
      </p>
      {a.coins.length > 0 && (
        <ul className="mt-1.5 divide-y divide-line-2 rounded-lg border border-line-2">
          {a.coins.slice(0, 12).map((x, i) => {
            const peak = x.peakMcapUsd;
            const now = x.mcapNowUsd;
            const fell = peak && now !== undefined && now < peak * 0.1;
            return (
              <li key={`${x.address}-${i}`}>
                <button type="button" onClick={() => onCommand(`check ${x.address} on ${c.chain}`, x.symbol ? `$${x.symbol}` : "Check this coin")} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-tint/[0.04]">
                  <span className="min-w-0">
                    <span className="font-medium text-chrome">{x.symbol ? `$${x.symbol}` : short(x.address)}</span>
                    <span className="ml-2 text-[12.5px] text-muted">
                      {peak ? `peak ${fmtCompact(peak)} · ` : ""}
                      {now !== undefined ? `now ${fmtCompact(now)}` : ""}
                    </span>
                    {fell && <span className="ml-2 text-[12px] text-down">fell over 90%</span>}
                  </span>
                  <span className="shrink-0 text-[12px] text-dim">Check ›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {a.total !== null && <p className="mt-1.5 text-[11.5px] text-dim">{a.note}</p>}
      <p className="sr-only">{CHAIN_NAME[c.chain]}</p>
    </div>
  );
}
