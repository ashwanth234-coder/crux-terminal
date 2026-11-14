import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/launch/LaunchView";
import { CopyValue } from "@/components/guide/CopyValue";
import { LinkButton, ArrowUpRight } from "@/components/ui/Button";
import { SETTLER_VERSION } from "@/lib/intents";
import { LIVE_NAMES, ORIGIN_NAMES, SOON_LINE } from "@/lib/networks";
import { SOLANA_KEPT_SOL, SOLANA_MIN_SOL, SOLANA_OPEN_SOL, SOLANA_RETURNED_SOL, solAmount } from "@/lib/solanaEscrow";
import { NETWORK } from "@/lib/network";
import { NETWORK_LONG, NETWORK_NAME } from "@/lib/network";

export const metadata: Metadata = {
  title: "Alpha tester guide · Crux",
  description:
    `How to test Crux on ${NETWORK_NAME}: wallet and CRUX Account setup, deposits from any chain, launching a token on its USDC curve with an optional fair opening, trading it before and after it graduates to Uniswap, standing orders, refunds and the alpha's trust model.`,
};

/** Set NEXT_PUBLIC_ALPHA_FEEDBACK_URL (Telegram, Discord or a form) to show a feedback button. */
const FEEDBACK_URL = process.env.NEXT_PUBLIC_ALPHA_FEEDBACK_URL?.trim() || null;

const TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASESCAN = NETWORK.explorer;

const SECTIONS = [
  { id: "overview", title: "Overview" },
  { id: "setup", title: "Network & wallet" },
  { id: "account", title: "Your CRUX Account" },
  { id: "auction", title: "Launch a token" },
  { id: "trading", title: "Trade" },
  { id: "troubleshooting", title: "Troubleshooting & refunds" },
  { id: "trust", title: "Trust disclosures" },
  { id: "feedback", title: "Feedback" },
] as const;

/** The live testnet contracts (Base Sepolia unless a link says otherwise). */
const CONTRACTS: { name: string; address: string; href?: string }[] = [
  { name: "CruxFactoryV9 (launches: token and curve, addresses ending in 5afe)", address: "0x4a28e8B20e312fB67c71Fa6e2F085520d3DEd8e7" },
  { name: "CruxRouterV9 (trades on the curve or the pool; the 1% fee and its split)", address: "0x86A518410EFfa9cAEbf92BD87DEe08678bA39682" },
  { name: "CruxV9ListingAdapter (lists launches for Crux orders)", address: "0x086025304A4876603538Dc2dc3826329BD3d671E" },
  { name: "Example: $MT, a graduated launch (token)", address: "0xFDEB957b4bb701768dF0f4Ff17227796cf155Afe" },
  { name: "Example: $MT's curve (CruxCurveV9)", address: "0x49Ab768b8E01374Ba5678055fD8fbd56f2a22719" },
  { name: "Example: $MT's Uniswap V2 pool (LP burned to 0x…dEaD)", address: "0xbc02813a2BDecB1bEF62401e44D8748cF4429FF6" },
  { name: "CruxFactoryV8 and V7 (earlier batch launches, still tradeable)", address: "0xdB9f226fb44D5E8d25e2aACA4f7080c83011CfB5" },
  { name: "CruxSettlerV4 (holds orders until they fill)", address: "0x399147a5960A120A3b8b89A33a30500a561145D9" },
  { name: "CruxDestinationSettlerV2 (fills)", address: "0x62e5ed6BC2f604fad76152045559805c11D1cdf4" },
  { name: "CruxLister (automatic listing)", address: "0xCC99DaBf30b73978be799957717a2f7600cb39BF" },
  { name: "CruxFillProver (confirms cross-chain fills, via Hyperlane)", address: "0x7cb1aDd4975CbF1a5a3FA4fd60F11b010E4b29e8" },
  { name: "CruxAccountFactoryV3 (CRUX Accounts, addresses ending in 5afe)", address: "0xBD7AF76bcc2D080364a0c3C138ef82efCF8E12DF" },
  { name: "CruxAccountFactoryV2 (earlier Crux accounts, standing orders)", address: "0xf8962965f04e20B95dAdD931fDe00121906a97DC" },
  { name: "Admin Safe (2-of-3)", address: "0x49441cbA3cF9Db98d39Df4bDf8bF1a9D4Ea4fb6d" },
  { name: "Crux filler + keeper wallet", address: "0xDEbbE137f2AB252e28d1070F687010C0909d0492" },
  { name: "Earlier filler + keeper wallet (retired 2026-11-01)", address: "0x69E422d3Cca945a44210684b57F85f556212AD67" },
  {
    name: "crux_escrow (Pay from Solana, Solana devnet)",
    address: "51VZTKfmnS85fvJ1rEBCuVQveqHg2XeN44ZiHeeNa8m5",
    href: "https://explorer.solana.com/address/51VZTKfmnS85fvJ1rEBCuVQveqHg2XeN44ZiHeeNa8m5?cluster=devnet",
  },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line py-10 sm:py-12">
      <h2 id={`${id}-title`} className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1] text-bright [font-stretch:108%]">
        {title}
      </h2>
      <div className="mt-6 max-w-[44rem] space-y-5 text-[15px] leading-relaxed text-chrome/75">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-panel">
      {items.map((item, i) => (
        <li key={i} className="flex gap-4 px-4 py-3.5 text-[14px] leading-relaxed text-chrome/80">
          <span className="mt-0.5 font-mono text-[12px] text-dim">{String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${tone === "warn" ? "border-down/40 bg-down/5" : "border-line-2 bg-panel"}`}>
      <p className="flex items-center gap-2 text-[13.5px] font-medium text-chrome">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "warn" ? "bg-down" : "bg-signal"}`} aria-hidden="true" />
        {title}
      </p>
      <div className="mt-1.5 text-[13.5px] leading-relaxed text-chrome/70">{children}</div>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-chrome underline decoration-line-2 underline-offset-2 hover:decoration-chrome">
      {children}
    </a>
  );
}

const b = (t: string) => <span className="text-chrome">{t}</span>;

export default function AlphaGuidePage() {
  return (
    <Shell mode="live">
      <div className="lg:grid lg:grid-cols-12 lg:gap-10">
        {/* Contents: sticky on desktop, a plain list on phones */}
        <aside className="lg:col-span-3">
          <nav aria-label="Guide sections" className="lg:sticky lg:top-8">
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
              <span className="block text-bright">Alpha tester guide.</span>
              <span className="block text-steel">{NETWORK_LONG}.</span>
            </h1>
            <p className="mt-6 max-w-[40rem] text-[16px] leading-relaxed text-chrome/70">
              Everything you need to launch a token, trade it on its USDC curve and after it graduates to Uniswap, from a wallet or a
              gasless CRUX Account funded from any chain. Every token here is a test token with no value.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[`${NETWORK.label} · ${NETWORK.chain.id}`, "Test tokens only", "Unaudited contracts"].map((t) => (
                <span key={t} className="rounded-[4px] border border-line-2 px-3 py-1 text-[11.5px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          </header>

          <Section id="overview" title="1. Overview & objective">
            <p>
              Thanks for joining the Crux alpha. Before mainnet we want to prove three things with real people, on a real chain:
            </p>
            <ul className="space-y-2.5">
              <li>
                {b("Fair launches.")} Launching is free. Each token trades on its own bonding curve priced in USDC from the first
                second, and can start with an optional one-minute fair opening where every buyer pays one price, so bots get no
                first-block edge. At its target it graduates to one Uniswap V2 pool on Base, with the pool&apos;s liquidity burned.
              </li>
              <li>
                {b("Creators earn.")} Every trade pays a 1% fee in USDC: 30% to the token&apos;s creator, 70% to Crux. The
                creator&apos;s 2.4% of supply vests over 30 days by default.
              </li>
              <li>
                {b("A CRUX Account.")} Log in with email or Google, deposit test USDC from any chain, and trade, launch and buy at open
                with no gas and no wallet pop-ups.
              </li>
            </ul>
            <p>
              {b("Chains.")} Tokens, curves and pools live on {NETWORK_NAME}. You can deposit and trade from {LIVE_NAMES} (testnets;
              Solana devnet), and nothing has to be bridged. {SOON_LINE}.
            </p>
            <p>Use it like you would a real product, try to break it, and tell us what confused you.</p>
          </Section>

          <Section id="setup" title="2. Network & wallet setup">
            <p>Add {NETWORK_NAME} to your wallet (MetaMask: Settings → Networks → Add network → Add a network manually):</p>
            <dl className="divide-y divide-line rounded-xl border border-line bg-panel text-[13.5px]">
              {[
                ["Network name", <span key="n">{NETWORK_NAME}</span>],
                ["RPC URL", <CopyValue key="r" value="https://sepolia.base.org" label="RPC URL" />],
                ["Chain ID", <CopyValue key="c" value={String(NETWORK.chain.id)} label="chain ID" />],
                ["Currency", <span key="cur">ETH</span>],
                ["Block explorer", <CopyValue key="e" value={BASESCAN} label="block explorer URL" />],
              ].map(([k, v]) => (
                <div key={k as string} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0">{v}</dd>
                </div>
              ))}
            </dl>

            <Callout title="You need both test ETH and test USDC">
              {b("ETH")} pays gas for every approval and contract call (launching, bidding, claiming, placing an order).{" "}
              {b("USDC")} is what you bid and trade with. Without ETH nothing sends; without USDC there&apos;s nothing to bid.
            </Callout>

            <Steps
              items={[
                <>
                  {b("Test ETH")} from the <Ext href="https://www.alchemy.com/faucets/base-sepolia">Alchemy {NETWORK_NAME} faucet</Ext> or
                  the <Ext href="https://console.optimism.io/faucet">Superchain faucet</Ext>. Some faucets ask you to sign in or hold a
                  tiny mainnet balance; if one refuses, try the other. A few cents&apos; worth of test ETH lasts the whole alpha.
                </>,
                <>
                  {b("Test USDC")} from <Ext href="https://faucet.circle.com">faucet.circle.com</Ext>: pick {b(`${NETWORK_NAME}`)}, paste
                  your address and request.
                </>,
                <>
                  Show it in MetaMask: Tokens → Import tokens → paste Circle&apos;s test USDC address (6 decimals):
                  <div className="mt-2">
                    <CopyValue value={TESTNET_USDC} label="test USDC address" />
                  </div>
                </>,
              ]}
            />
          </Section>

          <Section id="account" title="3. Your CRUX Account">
            <p>
              A CRUX Account is a smart account on {NETWORK_NAME} (its address ends in <code className="font-mono text-[13.5px] text-chrome">5afe</code>). It trades, launches and buys at
              open without gas or pop-ups, and its funds can only ever be withdrawn to the wallet you bind to it.
            </p>
            <Steps
              items={[
                <>
                  Click {b("Log in")} in the top bar and sign in with email or Google. Your account&apos;s balance then shows in the top
                  bar: click it to open the account page, and bind your withdrawal wallet when asked.
                </>,
                <>
                  Under {b("Deposit")}, pick the chain your test USDC is on in {b("Deposit from")} (each shows your balance there):{" "}
                  {b(`${NETWORK_NAME}`)}, Arbitrum Sepolia, Ethereum Sepolia, BNB Chain testnet or Solana devnet. Enter an amount and press{" "}
                  {b("Deposit")}.
                </>,
                <>
                  From {NETWORK_NAME} it&apos;s one transfer, with no fee, and arrives at once. From another chain your wallet escrows the
                  USDC there and Crux pays it into your account on Base in about a minute, also with no fee. You need a little of that
                  chain&apos;s gas token (Solana: about {SOLANA_MIN_SOL} devnet SOL).
                </>,
                <>
                  You can also send test USDC on {b(`${NETWORK_NAME}`)} straight to your account address ({b("Copy")} at the top of
                  Deposit), from an exchange or another wallet. Only on {NETWORK_NAME}: USDC sent to that address on any other chain
                  doesn&apos;t reach the account.
                </>,
              ]}
            />
          </Section>

          <Section id="auction" title="4. Workflow 1: launch a token">
            <Steps
              items={[
                <>Click {b("Launch")} in the top bar and log in with your CRUX Account (or connect a wallet).</>,
                <>Type a name and a ticker; a description, an image URL and your X account are optional.</>,
                <>
                  Leave {b("60-second fair opening")} on (recommended) or turn it off. With it on, everyone who buys in the first minute
                  pays one price, set when it ends: arriving first buys nothing.
                </>,
                <>
                  Your creator tokens (2.4% of supply) vest over 30 days. Under {b("Custom")} you can unlock them at once instead: buyers
                  then see the launch flagged.
                </>,
                <>
                  Press {b("Launch")}. From a CRUX Account there&apos;s no gas and no pop-up. The token&apos;s address ends in{" "}
                  <code className="font-mono text-[13.5px] text-chrome">5afe</code>, and a copycat check stops a ticker, image or X
                  account that copies an existing launch.
                </>,
              ]}
            />
            <Callout title="How a token's price moves">
              Before graduation a token trades on its own constant-product curve, priced in USDC: buys raise the price, sells lower
              it. When the USDC on the curve reaches its target ({b("$10")} on testnet; {b("$10,000")} planned for mainnet), it
              graduates to one Uniswap V2 pool on Base, at the curve&apos;s last price, with the pool&apos;s LP tokens sent to
              0x…dEaD (burned) and the curve&apos;s leftover tokens burned. A buy that crosses the target is split automatically:
              part on the curve, the rest in the new pool, in one transaction.
            </Callout>
            <p className="text-[14px] text-chrome/65">
              Fees: 1% of every trade, in USDC, on the curve and in the pool: 30% to the creator, 70% to Crux. Creators see what
              they&apos;ve earned and pay it out under {b("Account → Manage → Creator rewards")}.
            </p>
          </Section>

          <Section id="trading" title="5. Workflow 2: trade">
            <Steps
              items={[
                <>
                  Open {b("Terminal")} in the top bar (it opens the newest token) or pick a token on {b("Discover")}. The token bar
                  shows its price, market cap, liquidity or how far it is to graduation, holders and age.
                </>,
                <>
                  In the trade panel choose {b("Buy")} or {b("Sell")} and type an amount in {b("USDC")}. For a sell,{" "}
                  {b("25%")} / {b("50%")} / {b("Max")} pick a share of what you hold. The line under the box says what you get and
                  the minimum signed into the order (10% slippage).
                </>,
                <>
                  Logged in, the order pays from your {b("CRUX Account")}: no gas, no pop-up. From a wallet, approve once, then
                  confirm the trade.
                </>,
                <>
                  From a CRUX Account it fills in about 3 to 6 seconds; the trade then shows on the chart and in the tape below it
                  (Swaps, Holders &amp; PnL, Top traders, My orders).
                </>,
                <>
                  {b("Standing orders")}: the order-type menu has {b("Buy the dip")}, {b("Take profit")}, {b("Stop loss")},{" "}
                  {b("Trailing stop")} and {b("Take profit + stop loss")}. Sign once; the keeper sends it from your CRUX Account when the
                  price gets there, with the page closed.
                </>,
              ]}
            />
            <Callout tone="warn" title="Keep trades small">
              Testnet curves and pools hold only a few dollars, so a $1 trade can move the price by a quarter or more. Your
              order&apos;s minimum-received limit protects you: if it can&apos;t be met, nothing fills and you get your money back.
            </Callout>
            <p className="text-[14px] text-chrome/65">
              What a trade costs: the 1% fee above, plus, after graduation, Uniswap&apos;s 0.3% pool fee; a CRUX Account trade also
              includes Crux&apos;s 0.3% spread. All are in the quote you see before you trade.
            </p>
            <Callout title="Paying from another chain">
              In the order form, tap a source under {b("Buying power")}: {ORIGIN_NAMES}, or a {b("Crux account")}. {SOON_LINE}.
              <br />
              {b("From an EVM wallet")}, you approve (if needed) and submit on that chain, paying a little of its test gas token
              (ETH, or tBNB on BNB Chain). Crux fills on Base; your USDC there is released only once the fill is confirmed back on
              that chain. {b("From a Crux account")}: no gas and no pop-up.
              <br />
              {b("From Solana")}, the order is filled on Base in about 20 seconds. Your wallet needs {SOLANA_MIN_SOL} devnet SOL:
              opening the order costs {solAmount(SOLANA_OPEN_SOL)} in fees and storage, {solAmount(SOLANA_RETURNED_SOL)} comes
              back when it fills or is refunded, and {solAmount(SOLANA_KEPT_SOL)} stays with the escrow&apos;s records.
            </Callout>
          </Section>

          <Section id="troubleshooting" title="6. Troubleshooting & refunds">
            <p>{b("An order didn't fill.")} Every order has a 10-minute fill deadline. If it isn&apos;t filled:</p>
            <Steps
              items={[
                <>
                  Open the token in {b("Terminal")} and choose {b("My orders")}. Past its deadline, your order reads{" "}
                  {b("Not filled in time · refund available at …")}, with a countdown.
                </>,
                <>
                  {SETTLER_VERSION >= 3
                    ? "As soon as the deadline passes (about 10 minutes after you placed it), "
                    : "About an hour after the deadline (roughly 70 minutes after you placed it), "}
                  click {b("Refund test USDC")} (or the token,
                  for a sell) and confirm. Refunds always return to your own address; nobody else can redirect them.
                </>,
              ]}
            />
            <p className="text-[14px] text-chrome/65">
              Paid from another chain: the refund opens 6 hours after the deadline, on that chain. Orders paid from Solana are listed
              under {b("Paid from Solana")} in My orders, in the browser you placed them from, with the same refund time and button.
            </p>
            <p>
              {b("MetaMask says “Requested resource not available” or hangs.")} Its {NETWORK_NAME} RPC is congested. Settings → Networks
              → {NETWORK_NAME} → replace the RPC URL with:
            </p>
            <CopyValue value="https://base-sepolia-rpc.publicnode.com" label="backup RPC URL" />
            <ul className="space-y-2.5 text-[14px]">
              <li>
                {b("“Not enough test USDC”")} → top up at faucet.circle.com. {b("A transaction won't send")} → check you have test
                ETH.
              </li>
              <li>
                {b("Basescan shows a different sender")} → if your wallet is a smart account (EIP-7702), your wallet provider&apos;s
                relayer may appear as the sender. The contracts still credit your address; the site shows a note when this applies.
              </li>
            </ul>
          </Section>

          <Section id="trust" title="7. Transparent trust disclosures">
            <p>This alpha is deliberately simple. You should know exactly what you&apos;re trusting:</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
              {[
                ["One filler.", "A single filler run by the Crux team fills every order. If it's down, orders don't fill and you refund after the deadline."],
                ["Escrow pays only the proven filler.", "On Base, the settler releases your funds only to the filler the destination contract recorded as delivering your exact order; nobody else, the team included, can redirect it. Unfilled orders refund to you after the deadline."],
                ["Cross-chain orders are confirmed back on the paying chain.", "Paid from Ethereum, Arbitrum or BNB Chain testnets, or from Solana devnet: your funds on that chain are released only when a Hyperlane message from the Crux fill prover on Base proves who filled the order. This trusts Hyperlane's validators (the default security module). With no proof, you refund 6 hours after the deadline."],
                ["Crux accounts: withdrawals only to your wallet.", "An email or Google account can trade, but its funds can only be withdrawn to the wallet you bound. Changing that wallet waits 48 hours (a timelock), and your current wallet can cancel the change and sweep everything to itself."],
                ["Standing orders run without you.", "Take profit, stop loss, trailing stop, buy-the-dip and buy-at-open orders wait for their moment with this page closed. Your signed floor is enforced on-chain, so an order can never fill below it; the keeper decides when to send it. Orders in one group (TP + SL) are one-cancels-the-other: when one fills, the other can't."],
                ["Automatic listing, admin by a Safe.", "Graduated tokens are listed for Crux orders by a permissionless lister. Admin settings (the fee treasury, new factories, session limits) need 2 of the 3 signers of the Crux Safe."],
                ["Unaudited contracts, testnet only.", "Nothing here has been audited. The next contract set (including settler V5) is frozen for an external audit that hasn't started yet. Never use a wallet that holds real funds, and never share a private key or seed phrase with anyone, including us."],
              ].map(([t, d]) => (
                <li key={t} className="px-4 py-3.5 text-[14px] leading-relaxed text-chrome/75">
                  {b(t)} {d}
                </li>
              ))}
            </ul>
            <p className="text-[14px] text-chrome/65">What you can verify yourself, on Basescan (and Solana Explorer):</p>
            <dl className="divide-y divide-line rounded-xl border border-line bg-panel text-[13px]">
              {CONTRACTS.map((c) => (
                <div key={c.address} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <dt className="text-muted">{c.name}</dt>
                  <dd>
                    <Ext href={c.href ?? `${BASESCAN}/address/${c.address}`}>
                      <span className="font-mono text-[12px]">
                        {c.address.slice(0, 6)}…{c.address.slice(-4)}
                      </span>
                    </Ext>
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="feedback" title="8. Feedback & bug reports">
            <p>The most useful reports include:</p>
            <ul className="grid gap-2 text-[14px] sm:grid-cols-2">
              {[
                "Your wallet address",
                "The transaction hash (Basescan link)",
                "The token page URL",
                "What you expected vs. what happened",
                "A screenshot",
                "Browser and wallet (e.g. Chrome + MetaMask)",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-chrome/80">
                  <span className="h-1 w-1 rounded-full bg-chrome/40" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
            {FEEDBACK_URL ? (
              <LinkButton href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="mt-2">
                Send feedback <ArrowUpRight />
              </LinkButton>
            ) : (
              <p className="text-[14px] text-chrome/65">
                Post reports in the channel your alpha invite came from. Confusing moments are as valuable as bugs: if you hesitated,
                tell us where.
              </p>
            )}
          </Section>
        </div>
      </div>
    </Shell>
  );
}
