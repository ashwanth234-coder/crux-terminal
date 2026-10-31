import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/launch/LaunchView";
import { CopyValue } from "@/components/guide/CopyValue";
import { LinkButton, ArrowUpRight } from "@/components/ui/Button";
import { SETTLER_VERSION } from "@/lib/intents";
import { LIVE_NAMES, ORIGIN_NAMES, SOON_LINE } from "@/lib/networks";
import { SOLANA_KEPT_SOL, SOLANA_MIN_SOL, SOLANA_OPEN_SOL, SOLANA_RETURNED_SOL, solAmount } from "@/lib/solanaEscrow";

export const metadata: Metadata = {
  title: "Alpha tester guide · Crux",
  description:
    "How to test Crux on Base Sepolia: wallet setup, faucets, launching and bidding in a batch auction, trading graduated tokens with one signature, paying from other chains, refunds and the alpha's trust model.",
};

/** Set NEXT_PUBLIC_ALPHA_FEEDBACK_URL (Telegram, Discord or a form) to show a feedback button. */
const FEEDBACK_URL = process.env.NEXT_PUBLIC_ALPHA_FEEDBACK_URL?.trim() || null;

const TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASESCAN = "https://sepolia.basescan.org";

const SECTIONS = [
  { id: "overview", title: "Overview" },
  { id: "setup", title: "Network & wallet" },
  { id: "auction", title: "Launch & bid" },
  { id: "trading", title: "Trade graduated tokens" },
  { id: "troubleshooting", title: "Troubleshooting & refunds" },
  { id: "trust", title: "Trust disclosures" },
  { id: "feedback", title: "Feedback" },
] as const;

/** The live testnet contracts (Base Sepolia unless a link says otherwise). */
const CONTRACTS: { name: string; address: string; href?: string }[] = [
  { name: "CruxFactoryV7 (launches)", address: "0xeacB98371D5597c20A9ECDf6f09726817489722e" },
  { name: "CruxSettlerV4 (holds orders until they fill)", address: "0x399147a5960A120A3b8b89A33a30500a561145D9" },
  { name: "CruxDestinationSettlerV2 (fills)", address: "0x62e5ed6BC2f604fad76152045559805c11D1cdf4" },
  { name: "CruxLister (automatic listing)", address: "0xCC99DaBf30b73978be799957717a2f7600cb39BF" },
  { name: "CruxFillProver (confirms cross-chain fills, via Hyperlane)", address: "0x7cb1aDd4975CbF1a5a3FA4fd60F11b010E4b29e8" },
  { name: "CruxAccountFactoryV2 (Crux accounts)", address: "0xf8962965f04e20B95dAdD931fDe00121906a97DC" },
  { name: "Admin Safe (2-of-3)", address: "0x49441cbA3cF9Db98d39Df4bDf8bF1a9D4Ea4fb6d" },
  { name: "Crux filler + keeper wallet", address: "0x69E422d3Cca945a44210684b57F85f556212AD67" },
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
              <span className="block text-steel">Base Sepolia testnet.</span>
            </h1>
            <p className="mt-6 max-w-[40rem] text-[16px] leading-relaxed text-chrome/70">
              Everything you need to launch a token, bid in a fair batch auction and trade graduated tokens with one signature. Every
              token here is a test token with no value.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Base Sepolia · 84532", "Test tokens only", "Unaudited contracts"].map((t) => (
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
                {b("Batch auctions.")} A launch sells in one window (the creator picks 60 seconds, 5 minutes, 1 hour or 24 hours) and
                every filled bid pays one uniform clearing price.
              </li>
              <li>{b("Limit bids and caps.")} You can cap the price you&apos;ll pay, and each wallet&apos;s deposit is capped by the creator.</li>
              <li>
                {b("One-signature trading.")} After a launch graduates, you trade its token by signing an order. Crux fills it from
                the token&apos;s locked Uniswap V2 pool in a batch where everyone pays the same price.
              </li>
            </ul>
            <p>
              {b("Chains.")} Tokens, auctions and pools live on Base Sepolia. You can trade from {LIVE_NAMES} (testnets; Solana
              devnet), and nothing has to be bridged. {SOON_LINE}. Auction bids pay from Base Sepolia for now.
            </p>
            <p>Use it like you would a real product, try to break it, and tell us what confused you.</p>
          </Section>

          <Section id="setup" title="2. Network & wallet setup">
            <p>Add Base Sepolia to your wallet (MetaMask: Settings → Networks → Add network → Add a network manually):</p>
            <dl className="divide-y divide-line rounded-xl border border-line bg-panel text-[13.5px]">
              {[
                ["Network name", <span key="n">Base Sepolia</span>],
                ["RPC URL", <CopyValue key="r" value="https://sepolia.base.org" label="RPC URL" />],
                ["Chain ID", <CopyValue key="c" value="84532" label="chain ID" />],
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
                  {b("Test ETH")} from the <Ext href="https://www.alchemy.com/faucets/base-sepolia">Alchemy Base Sepolia faucet</Ext> or
                  the <Ext href="https://console.optimism.io/faucet">Superchain faucet</Ext>. Some faucets ask you to sign in or hold a
                  tiny mainnet balance; if one refuses, try the other. A few cents&apos; worth of test ETH lasts the whole alpha.
                </>,
                <>
                  {b("Test USDC")} from <Ext href="https://faucet.circle.com">faucet.circle.com</Ext>: pick {b("Base Sepolia")}, paste
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

          <Section id="auction" title="3. Workflow 1: the batch auction">
            <p>{b("Launch a token")} (creators):</p>
            <Steps
              items={[
                <>Click {b("Launch")} in the top bar.</>,
                <>Fill in name and symbol. Keep the initial supply at 1,000,000,000.</>,
                <>
                  Set a {b("graduation target")} (e.g. $3 to $10). Tip: with 1B supply, a target divisible by 3 (like $3 or $9) lets one
                  wallet at the cap fill the sale exactly.
                </>,
                <>
                  Set {b("Scheduled start")} (3+ minutes, so people can arrive) and {b("Max allocation per wallet")}. The hint under it
                  shows each wallet&apos;s deposit limit and how many buyers the sale needs.
                </>,
                <>
                  Choose a {b("5 min")} batch window, click {b("Deploy Token & Initialize Auction")} and confirm in your wallet. You land
                  on the auction page: share that link with the cohort.
                </>,
              ]}
            />

            <p>{b("Bid")} (everyone):</p>
            <Steps
              items={[
                <>Open the auction link. When the status turns {b("Deposits open")}, the bid panel appears.</>,
                <>
                  Type an amount, or tap {b("25%")}, {b("50%")} or {b("MAX")}. MAX is the most you can bid: your test USDC balance or
                  your remaining wallet cap, whichever is lower.
                </>,
                <>
                  Optional: turn on {b("Limit price")} and set the most you&apos;ll pay per token (the contract&apos;s{" "}
                  <code className="font-mono text-[12.5px]">maxPricePerToken</code>). It rounds down to the nearest 1% price step. If the
                  batch clears above your limit, your whole bid is refunded.
                </>,
                <>
                  Read the {b("Risk preview")}: your worst price, the minimum you receive, and what selling everything at graduation
                  would return. Then click {b("Submit batch bid")}. The first time, your wallet asks twice: approve the exact amount,
                  then place the bid. Watch the {b("Demand curve")} and the {b("Projected clearing")} price move as others bid.
                </>,
                <>
                  When the window closes, the Crux keeper settles the auction automatically within about 15 seconds (anyone can also
                  press Settle). Then {b("Claim tokens")}: your tokens at the clearing price plus any unused USDC. If demand missed the
                  target, it cancels and you {b("Claim refund")} in full.
                </>,
              ]}
            />

            <Callout title="The anti-sniper guarantee">
              Arriving first buys nothing. Whether you bid in the first second or the last, every filled bid pays the same clearing
              price, and per-wallet caps stop one address from taking the sale. Bids are public on-chain while the window is open
              (not sealed), so use a limit price if you care about the ceiling.
            </Callout>
            <p className="text-[14px] text-chrome/65">
              On graduation, 30% of supply and half the raise seed a Uniswap V2 pool whose LP tokens go to 0x…dEaD, locked forever.
              Creators receive 70% of the 1% protocol fee at once; their share of the raise and their 10% of supply vest over 30 days,
              unless the creator chose an instant unlock at launch. Every launch shows which with a badge: {b("30D vested")} or a red{" "}
              {b("Instant unlock")}.
            </p>
          </Section>

          <Section id="trading" title="4. Workflow 2: trading graduated tokens">
            <Steps
              items={[
                <>
                  Open {b("Terminal")} in the top navigation on a graduated token ($V3, $QC2 or a new one), or open a graduated
                  launch&apos;s page and use {b("Trade on Crux")}.
                </>,
                <>
                  Choose Buy or Sell and enter a small amount (or tap {b("$0.01")} / {b("$0.05")}). Read the {b("Risk preview")}: what
                  you receive, the minimum signed into your order, the slippage and the cost of selling straight back.
                </>,
                <>
                  Click {b("Sign order")}: approve the exact amount, sign the order (the signature itself is free), then submit it.
                  Approving and submitting each cost a little test ETH. The settler holds your funds until the order fills.
                </>,
                <>
                  Within about a minute, Crux&apos;s next batch swaps in the token&apos;s Uniswap V2 pool and delivers to your wallet;
                  everyone in that batch pays the same price. The screen shows {b("Filled")}.
                </>,
              ]}
            />
            <Callout tone="warn" title="Keep trades tiny: $0.01 to $0.05">
              Testnet pools hold only a few dollars ($V3 about $1.50, $QC2 about $3). A $0.02 buy already moves the price 1 to 2%.
              Bigger orders get heavy slippage by design of an AMM, and Crux skips orders that would move a pool more than
              10% in one batch. Your order&apos;s minimum-received limit protects you: if it can&apos;t be met, nothing fills and
              you refund.
            </Callout>
            <p className="text-[14px] text-chrome/65">
              A token marked {b("not listed")} graduated moments ago: the keeper lists every graduation of a Crux factory
              automatically, usually within seconds. Fees: a 0.30% Crux spread plus Uniswap&apos;s 0.3% pool fee, both included in
              the quote.
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

          <Section id="troubleshooting" title="5. Troubleshooting & refunds">
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
              {b("MetaMask says “Requested resource not available” or hangs.")} Its Base Sepolia RPC is congested. Settings → Networks
              → Base Sepolia → replace the RPC URL with:
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

          <Section id="trust" title="6. Transparent trust disclosures">
            <p>This alpha is deliberately simple. You should know exactly what you&apos;re trusting:</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
              {[
                ["One filler.", "A single filler run by the Crux team fills every order. If it's down, orders don't fill and you refund after the deadline."],
                ["Escrow pays only the proven filler.", "On Base, the settler releases your funds only to the filler the destination contract recorded as delivering your exact order; nobody else, the team included, can redirect it. Unfilled orders refund to you after the deadline."],
                ["Cross-chain orders are confirmed back on the paying chain.", "Paid from Ethereum, Arbitrum or BNB Chain testnets, or from Solana devnet: your funds on that chain are released only when a Hyperlane message from the Crux fill prover on Base proves who filled the order. This trusts Hyperlane's validators (the default security module). With no proof, you refund 6 hours after the deadline."],
                ["Crux accounts: withdrawals only to your wallet.", "An email or Google account can trade, but its funds can only be withdrawn to the wallet you bound. Changing that wallet waits 48 hours (a timelock), and your current wallet can cancel the change and sweep everything to itself."],
                ["Standing orders run without you.", "Take profit, stop loss, trailing stop and buy-the-dip orders wait for their price with this page closed. Your signed floor is enforced on-chain, so an order can never fill below it; the keeper decides when to send it. Orders in one group (TP + SL) are one-cancels-the-other: when one fills, the other can't."],
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

          <Section id="feedback" title="7. Feedback & bug reports">
            <p>The most useful reports include:</p>
            <ul className="grid gap-2 text-[14px] sm:grid-cols-2">
              {[
                "Your wallet address",
                "The transaction hash (Basescan link)",
                "The auction or page URL",
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
