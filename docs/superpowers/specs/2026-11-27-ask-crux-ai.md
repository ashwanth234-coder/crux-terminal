# Ask Crux, smarter: a real AI behind the chat (plan, 2026-11-27)

## Why

Ask Crux reads fixed word patterns only (lib/commandIntent.ts, lib/traderSlang.ts: "no language model", the $0 rule of
2026-11-24). Anything typed another way fails, and it can't hold a conversation ("pull this creator's address", "his
coins that reached $50k", "how many of them rugged?"). Founder 2026-11-27: make the free tier smarter now; a paid
advanced tier comes later (from the Crux balance or a monthly subscription, never per message).

## What changes

- **Instant path kept.** A message the patterns read exactly (a trade, a coin check, your coins, trending, orders)
  still answers instantly, as today. Anything else, and every message while a conversation with the AI is going, goes
  to the AI.
- **The AI answers in words and shows the cards Ask Crux already has**: a trade plan (confirm card, unchanged limits),
  a coin check, your coins, trending, your orders, plus one new card: a list of coins (e.g. a creator's launches).
- **It never trades.** It can only propose steps of the kinds Ask Crux already runs (buy, sell, take profit, stop loss,
  trailing stop, buy the dip, wait); the confirm card checks and runs them. $1,000 per trade cap, server and page.
- **It looks things up, read-only, on Crux's server:**
  - find a coin by name, ticker or address (DexScreener);
  - a coin's numbers and safety signs (DexScreener; GoPlus on Base / BNB Chain; Jupiter on Solana: creator, how many
    coins that creator launched and how many graduated, top holders' share, the creator's share);
  - a creator's coins: Solana, read from the creator's recent transactions (the latest few hundred), with each coin's
    value now and, for the biggest ones, its highest value (GeckoTerminal); Base: Crux's own launches by that creator.
    It says plainly how far back it looked.
- **Answers come from those reads only**, never from the model's memory of prices; when a read fails it says so.
- **Coin names and descriptions are data**, never instructions (a coin called "ignore your rules" can't steer it).

## Where it runs

Crux's server (crux-solver), `POST /v1/ask { token, messages, context }` -> `{ ok, text, cards }`:
- the login is checked (Privy token), so only Crux accounts use it;
- the free tier's limits: 60 messages per login per day and a daily total across everyone (env), so the bill is
  bounded; past them it says so in plain words and the instant path still works;
- the model: Claude Opus 5.5 (`ASK_CRUX_MODEL` changes it), low effort (chat), refusal fallback on;
- off unless `ASK_CRUX_AI=on` and `ANTHROPIC_API_KEY` is set (the founder puts the key in the server's env file).

## Build

| # | Task | Where |
|---|---|---|
| A1 | The lookups (coin search, coin facts, creator, creator's coins) with tests on recorded data | crux-solver |
| A2 | The AI loop: tools, the card tools, limits, the system prompt; tests with a stand-in model | crux-solver |
| A3 | The chat: instant path first, else the AI; text answers; the coin-list card | crux-terminal |
| A4 | Review, then 30 real phrases run against the real model (founder's key, a few cents), then deploy on a go | both |

## Costs (free tier)

About $0.01–0.02 per AI message at Claude Opus 5.5's prices; the daily caps bound it. The instant path costs nothing.
