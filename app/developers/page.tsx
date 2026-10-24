import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/launch/LaunchView";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Market data API · Crux",
  description:
    "Crux's public market data API on Base Sepolia testnet: every graduated launch's pair, its trades (Uniswap V2 swaps and anti-sniper batch fills) and OHLCV candles. No key, any origin.",
};

const SECTIONS = [
  { id: "overview", title: "Overview" },
  { id: "pairs", title: "Pairs" },
  { id: "trades", title: "Trades" },
  { id: "candles", title: "Candles" },
  { id: "feeds", title: "Launches & token list" },
  { id: "notes", title: "Data notes" },
] as const;

const EXAMPLE_PAIR = "0xB345b312298ab90bf4b854982D20636EfDfe092D";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line py-10 sm:py-12">
      <h2 id={`${id}-title`} className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1] text-bright [font-stretch:108%]">
        {title}
      </h2>
      <div className="mt-6 max-w-[48rem] space-y-5 text-[15px] leading-relaxed text-chrome/75">{children}</div>
    </section>
  );
}

function Endpoint({ path, cache }: { path: string; cache: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      <span className="rounded-[3px] border border-up/40 px-1.5 py-0.5 text-[11px] text-up">GET</span>
      <span className="text-bright">{path}</span>
      <span className="text-[11.5px] text-dim">· cached {cache}</span>
    </p>
  );
}

function Params({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line bg-panel text-[13.5px]">
      {rows.map(([name, what]) => (
        <div key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="font-mono text-chrome">{name}</dt>
          <dd className="text-chrome/70">{what}</dd>
        </div>
      ))}
    </dl>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-void p-4 font-mono text-[12px] leading-relaxed text-chrome/80">
      <code>{children}</code>
    </pre>
  );
}

const c = (t: string) => <code className="font-mono text-[13px] text-chrome">{t}</code>;

export default function DevelopersPage() {
  return (
    <Shell mode="live">
      <div className="lg:grid lg:grid-cols-12 lg:gap-10">
        <aside className="lg:col-span-3">
          <nav aria-label="API sections" className="lg:sticky lg:top-8">
            <p className="text-[12px] text-muted">On this page</p>
            <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-2.5">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex items-baseline gap-2 text-[13px] text-chrome/70 transition-colors hover:text-chrome">
                    <span className="font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="mt-10 lg:col-span-9 lg:mt-0">
          <header className="pb-10">
            <h1 className="font-display text-[clamp(2.2rem,4.8vw,3.8rem)] leading-[0.95]">
              <span className="block text-bright">Market data API.</span>
              <span className="block text-steel">Base Sepolia testnet.</span>
            </h1>
            <p className="mt-6 max-w-[42rem] text-[16px] leading-relaxed text-chrome/70">
              Every graduated Crux launch&apos;s market, its trades and its candles, read live from the chain. The same numbers the Crux
              terminal shows: its chart and tape decode trades with the same code.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Public · no key", "Any origin (CORS)", "JSON", "Test tokens only"].map((t) => (
                <span key={t} className="rounded-[4px] border border-line-2 px-3 py-1 text-[11.5px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          </header>

          <Section id="overview" title="1. Overview">
            <p>
              Base URL {c(SITE_URL)}. Every endpoint is a plain {c("GET")} returning JSON, open to any origin and cached at the edge for a few
              seconds. Errors return {c("{ \"error\": \"…\" }")} with status 400 (bad parameter), 404 (unknown pair) or 503 (the chain
              couldn&apos;t be read; retry).
            </p>
            <p>
              A market is identified by its {c("pair")}: the launch token&apos;s Uniswap V2 pair with test USDC, whose LP tokens are burned.
              Every response carries {c("chainId")} 84532, {c("network")} &quot;base-sepolia&quot; and {c("testnet")} true.
            </p>
          </Section>

          <Section id="pairs" title="2. Pairs">
            <Endpoint path="/api/pairs" cache="30 s" />
            <p>Every graduated launch&apos;s market, newest launch first. Add {c("?pair=0x…")} for one.</p>
            <Params
              rows={[
                ["venue", "Where the liquidity trades now: \"uniswap-v2\", or \"crux-batch-pool\" during a launch's anti-sniper window (one 60-second batch at one price; the pair is empty and locked until the liquidity migrates)."],
                ["batchOnlyUntil", "Unix seconds the anti-sniper window ends, while it's on; otherwise null."],
                ["priceUsd", "Mid price from the live reserves, in test USDC per whole token."],
                ["reserves", "base (tokens) and quote (test USDC), as decimal strings."],
                ["liquidityUsd · marketCapUsd", "2 × quote reserve; price × total supply."],
                ["antiSniperSeconds", "The launch's batch-only window after graduation: 0 when the creator turned anti-sniper off (and for launches before V5)."],
                ["creatorVestingDays", "30, or 0 for an instant unlock."],
                ["urls", "Terminal page, Basescan pair and token, and this pair's trades and candles."],
              ]}
            />
            <Code>{`curl ${SITE_URL}/api/pairs?pair=${EXAMPLE_PAIR}

{ "chainId": 84532, "network": "base-sepolia", "testnet": true,
  "pair": {
    "id": "${EXAMPLE_PAIR}", "dex": "uniswap-v2",
    "baseToken": { "address": "0x5182…B106", "symbol": "V6C", "decimals": 18 },
    "quoteToken": { "address": "0x036C…CF7e", "symbol": "USDC", "decimals": 6 },
    "venue": "uniswap-v2", "batchOnlyUntil": null,
    "priceUsd": 2.56e-9, "liquidityUsd": 1.24, "antiSniperSeconds": 60,
    "creatorVestingDays": 30, "lpBurned": true, … } }`}</Code>
          </Section>

          <Section id="trades" title="3. Trades">
            <Endpoint path="/api/trades?pair=0x…" cache="10 s" />
            <p>
              A market&apos;s trades, newest first: Uniswap V2 swaps, and fills from the anti-sniper batch pool at their batch&apos;s uniform price.
            </p>
            <Params
              rows={[
                ["pair", "Required. The market's pair address."],
                ["limit", "Trades per page: default 100, at most 500."],
                ["before", "A block number: only trades in earlier blocks. Each response's next link pages back with it."],
              ]}
            />
            <Params
              rows={[
                ["side", "\"buy\" (USDC in, tokens out of the pool) or \"sell\"."],
                ["priceUsd", "This fill's price in test USDC per token, the 0.3% pool fee included."],
                ["baseAmount · quoteAmount", "Tokens and test USDC traded, as decimal strings."],
                ["venue · batch", "\"uniswap-v2\", or \"batch-pool\" with the batch it cleared in."],
                ["viaCruxSolver", "True when the Crux solver traded it to fill a user's intent (the solver then delivers to the user)."],
                ["time", "Unix seconds of the trade's block."],
              ]}
            />
            <Code>{`curl "${SITE_URL}/api/trades?pair=${EXAMPLE_PAIR}&limit=2"

{ "truncated": false, "next": null,
  "trades": [
    { "time": 1792833535, "side": "buy", "priceUsd": 2.49e-9,
      "baseAmount": "8020987.94…", "quoteAmount": "0.019939",
      "venue": "uniswap-v2", "viaCruxSolver": true, "txHash": "0x819b…", … },
    { "time": 1792826788, "side": "buy", "priceUsd": 2.01e-9,
      "baseAmount": "49874937.46…", "quoteAmount": "0.1",
      "venue": "batch-pool", "batch": 0, "viaCruxSolver": false, … } ] }`}</Code>
          </Section>

          <Section id="candles" title="4. Candles">
            <Endpoint path="/api/candles?pair=0x…&interval=5m" cache="15 s" />
            <p>
              OHLCV candles, oldest first, built from the trades as the terminal&apos;s chart builds them: each candle opens at the previous
              close, and the first at the launch&apos;s auction clearing price. Quiet intervals have no candle.
            </p>
            <Params
              rows={[
                ["pair", "Required."],
                ["interval", "1m, 5m (default), 15m, 1h, 4h or 1d."],
                ["limit", "The most recent N candles: default 300, at most 1000."],
              ]}
            />
            <Code>{`curl "${SITE_URL}/api/candles?pair=${EXAMPLE_PAIR}&interval=1h"

{ "interval": "1h", "intervalSeconds": 3600, "truncated": false,
  "candles": [ { "time": 1792825200, "open": 1.67e-9, "high": 2.01e-9,
                 "low": 1.67e-9, "close": 2.01e-9, "volumeUsd": 0.1, "trades": 1 }, … ] }`}</Code>
          </Section>

          <Section id="feeds" title="5. Launches & token list">
            <Endpoint path="/api/launches" cache="60 s" />
            <p>
              Every launch, including ones still in their auction, with its phase ({c("?phase=graduated")}, open, scheduled, closed or
              cancelled), raise, clearing price, creator vesting and anti-sniper window.
            </p>
            <Endpoint path="/tokenlist.json" cache="60 s" />
            <p>Graduated launch tokens in the standard Uniswap token-list format, for wallets and swap interfaces.</p>
          </Section>

          <Section id="notes" title="6. Data notes">
            <ul className="list-disc space-y-2.5 pl-5">
              <li>Everything is on Base Sepolia testnet: test tokens with no value, priced in test USDC.</li>
              <li>
                Trades and candles cover at most the last three days of a market; {c("truncated")} is true when older trades exist but
                aren&apos;t included.
              </li>
              <li>
                Pairs report a mid price from reserves; trades report execution prices (fee included), so the two differ slightly.
              </li>
              <li>Responses are cached at the edge for the times shown; poll no faster than that.</li>
            </ul>
          </Section>
        </div>
      </div>
    </Shell>
  );
}
