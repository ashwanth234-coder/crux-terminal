# Ask Crux coach: 10 trader rules (Option C MVP)

Status: design, approved in direction by the founder 2026-11-24. **Not to be coded until the three Phase 1
real-money tests pass on mainnet** (Test 1 passed, Test 3 passed, Test 2 pending).

## Why

For the Jesse (Base) demo. A fast terminal that trades with USDC is no longer special (Torch and others have it).
Crux's edge is a terminal that **thinks like a trader**: it watches your coins, recognises the moments a good
trader reacts to, and hands you the right move as one tap. First in line, not "another terminal".

## Goals

- 10 hand-written, deterministic trader rules. No language model: free, predictable, every rule unit-tested.
- One shared rulebook (pure functions, same code in crux-solver and crux-terminal, kept in step like tradePlan.ts).
- Option C: 4 urgent rules run on the server for watched coins and reach the trader with Crux closed; 6 review
  rules run in the page when Ask Crux opens.
- Every suggestion is a card: one plain sentence, one to two one-tap buttons, an urgency, a quiet period.
- A 60-second demo moment: "Crux pinged me while the page was closed, I tapped once, done."

## Non-goals (V2 or later)

- Habit/history rules (revenge-buying, overtrading, selling winners early): new users have no history yet.
- The other ~100 rules. The engine is built so a rule is one function plus one test; adding them later is cheap.
- Telegram delivery (see Delivery).
- Rug kill switch / any automatic action.

## Anti-goals (a failure even if it works)

- **Crux acts on its own.** Never. Every card only suggests; the trader taps. ("Alerts, not auto-sells.")
- **Spam.** More than one card per coin at a time, or the same card again inside its quiet period.
- **Jargon.** No pool / liquidity / slippage / chain words in card text. "Cash in the coin's market", "hard to sell".
- **Advice that sounds like a promise.** Cards describe what is happening and offer a move; they never predict.
- **New spend.** $0 rule: reuse the price reads and push already running.

## Constraints

- Gated like Phase 1: new switch `ASK_CRUX_COACH=on` plus the existing `ASK_CRUX_PLANS_ALLOWLIST`.
- Base public RPC is overloaded and Solana has no backup provider: the server only evaluates coins it already
  reads each tick (open plan groups). No new per-user holdings scans on the server.
- Plain-language rules from crux-plain-language-ux apply to all copy.

## Approaches

- **A. Everything on the server** (every coin of every user, 24/7). Strongest claim, but multiplies RPC load we
  can't pay for. Rejected.
- **B. Everything in the page.** Cheapest, but can't say "it watched while you were away". Rejected for the demo.
- **C. One rulebook, two places (chosen by the founder).** Urgent rules on the server for watched coins (push);
  review rules in the page on opening Ask Crux.

## Watched coins (server)

A coin is watched when the trader has an **open order group** for it. To make "2x with no plan" possible, a buy
through Ask Crux with **No plan** places a watch-only group (a plan with `exits: []`; the schema already allows
it) using the same server-read fill. This also gives every Ask Crux buy a real entry price. *(my call)*

## The 10 rules

Urgency: 3 = act now, 2 = worth a look, 1 = FYI. Prices are USD per coin; entry is the group's fill price.

### Server, urgent (push + shown in Ask Crux)

| # | Rule | Fires when | Card text (draft) | Buttons | Urgency | Quiet |
|---|---|---|---|---|---|---|
| S1 | 2x with no plan | price ≥ 2 × entry and no armed take-profit on the group | "$X is up 2× and nothing is set to sell. Lock some in?" | Sell half · Set Balanced plan | 2 | 6 h |
| S2 | Creator selling | the coin's creator sold ≥ 20% of what they held (reuse solcreatoralert.ts; Solana first) | "The creator of $X just sold N% of their coins." | Sell all · Sell half | 3 | 30 min |
| S3 | Cash leaving the market | the coin's market cash (liquidity) is down ≥ 30% from its 1 h high *(threshold my call)* | "Cash is leaving $X's market fast. It may get hard to sell." | Sell all · Sell half | 3 | 30 min |
| S4 | Price near your floor | price is within 5% above the group's floor trigger *(my call)* | "$X is close to your floor (−N%)." | Sell now · Keep my floor | 2 | 15 min |

### Page, review (when Ask Crux opens; reads the holdings it already reads)

| # | Rule | Fires when | Card text (draft) | Buttons | Urgency |
|---|---|---|---|---|---|
| B1 | No floor set | a held coin worth ≥ $2 has no open floor | "$X has no floor. A fall isn't capped." | Floor at −25% | 2 |
| B2 | Thin market / oversized | position value > 3% of the coin's market cash *(my call)*; at buy time the existing Desk Check covers this | "Your $X is big for its market. Selling it all at once would cost you." | Sell half | 2 |
| B3 | Big pullback from peak | price ≥ 40% below the highest price since entry (from the chart candles since the buy; 24 h high if no entry known) *(my call)* | "$X has fallen N% from its high since you bought." | Sell half · Set floor | 2 |
| B4 | One coin is most of your money | one coin > 60% of coins + cash | "$X is N% of everything you hold." | Sell a quarter | 1 |
| B5 | Dead bags | coins worth < $1, or 24 h volume < $1,000 *(my call)* | "N coins look dead (worth $Y total)." | Sell them all | 1 |
| B6 | Idle cash | cash ≥ $20 and ≥ 50% of total, no buy in Ask Crux this session *(my call)* | "You have $Y ready to trade." | Find me a coin | 1 |

## Priority cap

- **One card per coin**: if several rules fire for a coin, show only the highest urgency; ties go by the order in
  the tables above (S2, S3, S4, S1, B2, B3, B1, B5). The rest are dropped, not queued.
- Portfolio-wide cards (B4, B6): at most one each.
- Server pushes respect each rule's quiet period per coin per trader; a card the trader dismisses starts it too.
- The page shows server cards that are still live first, then review cards, highest urgency first, at most 5.

## Delivery (page closed)

**Web Push, now.** It is already built and live: VAPID keys are in the server env, `alerts.ts` handles signed
subscriptions, and creator-sell alerts already push through it. $0 and zero new setup. Caveat: on iPhone it only
works once Crux is added to the home screen.

**Telegram later.** Traders live there and it would be strong, but it needs a bot, an account-linking flow and a
second delivery path. V2.

## Where it shows

- Push notification: the card text; tapping opens Ask Crux with that card on top.
- Ask Crux: on open, a "Here's what I'd look at" block of cards above the input, using the existing one-tap command
  buttons (YourCoins compact rows already send `sell half of …`, `stop loss 20% on …`).
- Every button runs through the normal confirm card. Nothing trades without the trader's confirm.

## Testing

- Each rule: fires / doesn't fire at the edge of its threshold, and its quiet period (pure tests, both repos).
- Priority cap: three rules on one coin → one card, the right one.
- Server: a watch-only group from a No-plan buy; S1 and S4 fire once per quiet period; no trades are ever sent.
- Live: founder's allowlisted account, small buy, a forced S4 via a tight floor (as in Test 2).

## Left to the builder

Exact copy polish, card layout, where the rulebook file lives, how market-cash history (S3) is kept in memory,
and the dismiss storage (local per browser is fine for MVP).
