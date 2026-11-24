# Ask Crux Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crux watches the trader's coins and offers the right move as one-tap cards (10 hand-written trader rules), understands trader slang, and talks with warmth, humour and a little sass. It never trades on its own.

**Architecture:** One pure rulebook (`coach.ts`), copied in crux-solver and crux-terminal and kept in step like `tradeplan.ts`. The server evaluates the 4 urgent rules on coins with an open plan (every Ask Crux buy gets one, a watch-only plan for "No plan") and pushes them by Web Push. The page evaluates the 6 review rules when Ask Crux opens, merges the server's live cards, and applies the one-card-per-coin cap.

**Tech Stack:** TypeScript, node:test (both repos), Next.js + React Query (site), the existing relay/solver (server), Web Push via `alerts.tell`.

**Spec:** `docs/superpowers/specs/2026-11-24-ask-crux-coach-design.md`

## Global Constraints

- No language model anywhere. Every rule, slang phrase and voice line is hand-written and tested.
- Crux never trades on its own: every card button sends a command that lands on the normal confirm card.
- Plain words in card text: no pool / liquidity / slippage / chain / gas words ("cash in the coin's market", "hard to sell").
- Voice guardrails: empathy only after a loss (no jokes); no sass on urgency-3 cards; after a floor sale or two losses today the only suggestion is a break; never mocks, never promises.
- One card per coin (highest urgency; ties by order S2, S3, S4, S1, B2, B3, B1, B5); B4 and B6 at most one each; at most 5 cards shown.
- Gate: server switch `ASK_CRUX_COACH=on`, same `ASK_CRUX_PLANS_ALLOWLIST`. Off = no change for anyone.
- $0: no new paid services, no new per-user holdings scans on the server (only coins with an open plan).
- Never run Prettier on crux-terminal; edit with Edit or small node scripts; watch CRLF files (`crux-solver/scripts/ordergroups.ts` is CRLF).
- crux-solver deploy: run `npm ci` on the server only if package.json changed (no new deps are planned).

## Review Focus

1. **A plan with no exits (watch-only)** must never sell, never count as "has a floor", and still close when the coins leave the wallet. Test in Task 3.
2. **A coin with several open plans** (two buys of BONK): S1/S4 judge each plan, but the cap still shows one card for the coin. Test in Task 1 (`capCards`) and Task 4.
3. **Missing data** (price or market cash unreadable, EVM coin with no liquidity figure): the rule stays silent, never fires on `undefined`. Tests in Task 1.
4. **Quiet periods across a restart:** the server must not re-push the same card after a restart. Persist `lastSent`; test in Task 4.
5. **Slang that collides with a coin name** ("send", "moon", "bag" are real tickers): a bare `$SEND` / pasted address still looks the coin up. Test in Task 2.

---

### Task 1: The shared rulebook

**Files:**
- Create: `crux-terminal/lib/coach.ts`, `crux-terminal/lib/coach.test.ts`
- Create: `crux-solver/scripts/coach.ts` (same content, header says "copy of crux-terminal lib/coach.ts; keep in step"), `crux-solver/scripts/coach.test.ts` (same tests)

**Interfaces:**
- Produces:
  - `type RuleId = "creatorSelling" | "cashLeaving" | "nearFloor" | "twoXNoPlan" | "oversized" | "pullback" | "noFloor" | "deadBags" | "concentration" | "idleCash"` (this order is the tie-break order)
  - `type CoinRef = { chain: "solana" | "base" | "bnb"; address: string; symbol: string }`
  - `type CardAction = { label: string; command: string; say?: string }` (same shape as commandChat `ChatOption`)
  - `type Card = { rule: RuleId; coin?: CoinRef; urgency: 1 | 2 | 3; text: string; actions: CardAction[]; at: number }`
  - `const QUIET_MS: Record<RuleId, number>`: twoXNoPlan 6 h, creatorSelling 30 min, cashLeaving 30 min, nearFloor 15 min, page rules 24 h
  - Server rules: `twoXNoPlan(f: { coin; price; entry; hasTakeProfit: boolean }, now): Card | null`, `creatorSelling(f: { coin; soldPct: number; all: boolean }, now)`, `cashLeaving(f: { coin; cashNow?: number; cashHigh1h?: number }, now)`, `nearFloor(f: { coin; price?: number; floor?: number; dropPct: number }, now)`
  - Page rules: `oversized(f: { coin; valueUsd; marketCash?: number }, now)`, `pullback(f: { coin; price?: number; peak?: number }, now)`, `noFloor(f: { coin; valueUsd; hasFloor: boolean }, now)`, `deadBags(f: { coins: { coin: CoinRef; valueUsd: number; heldMs?: number; pnlPct?: number; marketCash?: number }[] }, now)`, `concentration(f: { coin; valueUsd; totalUsd }, now)`, `idleCash(f: { cashUsd; totalUsd; boughtThisSession: boolean; lossesToday: number }, now)`
  - `capCards(cards: Card[]): Card[]`
  - `quiet(rule: RuleId, lastAt: number | undefined, now: number): boolean`

Thresholds (spec): 2× entry; creator ≥ 20%; market cash ≥ 30% below its 1 h high; price within 5% above floor; value > 3% of market cash; price ≥ 40% under peak; no floor when value ≥ $2; dead when (held > 24 h AND down > 65%) OR market cash < $1,000 (founder 2026-11-24: never on value alone, a $1 buy is $0.98 after fees); one coin > 60% of total; idle when cash ≥ $20 and ≥ 50% of total, not when `lossesToday >= 1`.

Card text and buttons (exact copy; `$S` = symbol, `N` = rounded number). Commands use the coin address and ` on <chain>` like YourCoins does:
- twoXNoPlan (2): "Up 2× on $S and no exit plan? Bold. Lock some in?" · Sell half (`sell half of <addr> on <chain>`), Floor at −25% (`stop loss 25% on <addr> on <chain>`)
- creatorSelling (3): "The creator of $S just sold N% of their coins." / "The creator of $S sold everything they held." · Sell all, Sell half
- cashLeaving (3): "Cash is leaving $S's market fast. It may get hard to sell." · Sell all, Sell half
- nearFloor (2): "$S is close to your floor (−N%)." · Sell now (`sell all …`), Keep my floor (no command: dismiss)
- oversized (2): "Your $S is big for its market. Selling it all at once would cost you." · Sell half
- pullback (2): "$S has fallen N% from its high since you bought." · Sell half, Floor at −25%
- noFloor (2): "$S has no floor. A fall isn't capped." · Floor at −25%
- deadBags (1): "These N coins are just sitting there looking sad ($Y total). Sweep them?" · Sell them all (one command per coin joined with " and ", ≤ MAX_STEPS coins)
- concentration (1): "$S is N% of everything you hold." · Sell a quarter (`sell 25% of …`)
- idleCash (1): "$Y doing nothing. No pressure. Want me to find something?" · Find me a coin (`what's trending`)

- [ ] **Step 1: Write the failing tests** (`coach.test.ts`, both repos): one `test()` per rule with a firing case, a just-under-threshold silent case, and an `undefined`-data silent case; plus:
  - `capCards`: creatorSelling + nearFloor + twoXNoPlan on one coin → exactly `[creatorSelling]`; two `concentration` → one; eight coins → length 5, urgency descending.
  - `idleCash` with `lossesToday: 1` → `null`.
  - `quiet("nearFloor", now - 14 * 60_000, now) === true`, `quiet("nearFloor", now - 16 * 60_000, now) === false`.
  - `deadBags` with 9 dust coins → one card whose `sell` command has at most 6 steps.
- [ ] **Step 2: Run** `node --test lib/coach.test.ts` (site) / `node --test scripts/coach.test.ts` (server). Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `lib/coach.ts`, then copy it to `crux-solver/scripts/coach.ts` (import paths only differ).
- [ ] **Step 4: Run** both test files, then `npm test` in both repos. Expected: PASS.
- [ ] **Step 5: Commit** in each repo: `Coach: the shared 10-rule rulebook with the one-card-per-coin cap`.

### Task 2: Trader slang

**Files:**
- Create: `crux-terminal/lib/traderSlang.ts`, `crux-terminal/lib/traderSlang.test.ts`
- Modify: `crux-terminal/lib/commandChat.ts` (`readMessage` runs `deslang` first; `Reply` gains `{ kind: "initials"; coin: string; chain?: CommandChain }`)

**Interfaces:**
- Produces: `deslang(text: string): { text: string; initials?: { coin: string } ; notYet?: string }`; `Reply` kind `"initials"` (resolved by Task 5).

Mapping (spec table): `ape|send|aping` `$N (into|on|in) X` → `buy $N of X`; `take|pull (my )?initials (on|from) X` → `initials` reply; `(leave|keep) a moon ?bag (on|of) X` → `sell 85% of X`; `dump|cut|exit|paper ?hand|jeet` `(it|all|X)` → `sell all X`; `dump|trim half (of )?X` → `sell half of X`; `trim X` → `sell 25% of X`; `sl N` / `sl -N%` → `stop loss N%`; `tp Nx` → `take profit at Nx`; `bags|my bags|pnl` → portfolio (already in readQuestion); `is X rugging|is the dev dumping on X` → lookup of X; `dca …` → `notYet: "Crux can't spread a buy over time yet. Try one buy, like \"buy $20 of BONK\"."`

- [ ] **Step 1: Write the failing tests**: one assertion per row above (`deslang("ape $5 into bonk").text === "buy $5 of bonk"`, …); `readMessage("take initials on BONK")` → `{ kind: "initials", coin: "BONK" }`; collisions: `readMessage("$SEND")` and `readMessage("send")` stay `lookup`, `readMessage("buy $5 of MOON")` stays a buy of MOON; `readMessage("dca $20 over a day")` → `error` with the notYet text.
- [ ] **Step 2: Run** `node --test lib/traderSlang.test.ts lib/commandChat.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** `deslang` as an ordered list of `[RegExp, replacement]` rewrites applied once, before `readQuestion`; only rewrite when the slang verb is followed by an amount or "it/all/half" or a coin word, so a bare ticker is untouched.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, no existing test changes.
- [ ] **Step 5: Commit**: `Ask Crux understands trader slang (ape, initials, moon bag, dump, trim, tp/sl)`.

### Task 3: Every Ask Crux buy is watched (watch-only plan)

**Files:**
- Modify: `crux-terminal/components/command/CommandBar.tsx` (PlanCard effect: when `planEligible && planChoice === "none"`, place `watchPlan(...)`; note "Crux is watching it for you." on success, silent on failure)
- Modify: `crux-terminal/lib/tradePlan.ts` (+ `watchPlan(chain, coin, entryUsd): TradePlan` = preset "custom", `exits: []`, rationale "Watching only: no automatic sells.")
- Test: `crux-terminal/lib/tradePlan.test.ts`, `crux-solver/scripts/ordergroups.test.ts`, `crux-solver/scripts/ordergroupsrunner.test.ts`

**Interfaces:**
- Founder 2026-11-24: at most **5 open watch-only plans per login** (the server refuses a 6th with 429 "Crux is already watching 5 coins for you."; the page stays silent); they close by themselves once sold (fitToWallet).
- Produces: watch-only groups (`plan.exits.length === 0`, `legs: []`) that Task 4 reads; `wantEntry` now true for "none" too.

- [ ] **Step 1: Failing tests**: site `watchPlan` passes the schema with `exits: []`; server pure: `nextAction(watchGroup, anyPrice) === null`; runner: a watch-only group at a −90% price sends nothing, and closes via `fitToWallet` when the wallet empties.
- [ ] **Step 2: Run** both suites. Expected: site FAIL (`watchPlan` missing); server tests may already pass (document if so).
- [ ] **Step 3: Implement** `watchPlan`; PlanCard sends it for "No plan"; the "No stop-loss set" warning stays.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .`, `npx eslint` on touched files (site) and `npm test` (server). Expected: PASS.
- [ ] **Step 5: Commit** (both repos): `Ask Crux: a "No plan" buy is still watched (no automatic sells)`.

### Task 4: Server coach (4 urgent rules, push, cards route)

**Files:**
- Create: `crux-solver/scripts/coachrunner.ts`, `crux-solver/scripts/coachrunner.test.ts`
- Modify: `crux-solver/scripts/ordergroupsrunner.ts` (dep `onPrice?(g: OrderGroup, unitPrice: number): void`, called in `tick` for every active group that has a price)
- Modify: `crux-solver/scripts/solcreatoralert.ts` (+ `watchFor(userId, owner, mint): Promise<void>` without the HTTP layer, and dep `onSold?(e: { userId; mint; symbol; soldPct; all }): void` called in `check`)
- Modify: `crux-solver/scripts/relay.ts` (route `POST /v1/coach/cards`, health `askCruxCoach: true` when on), `crux-solver/scripts/solver.ts` (wire when `ASK_CRUX_COACH=on` and order groups are on)

**Interfaces:**
- Consumes: `coach.ts` rules, `capCards`, `quiet`, `QUIET_MS`; `OrderGroup` (`entryPrice`, `legs`, `status`, `decimals`, `owner`); `marketOf(chain, coin)` → `{ liquidityUsd? }`.
- Produces: `makeCoach(d: { tell; market(chain, coin): Promise<{ liquidityUsd?: number }>; userOf(token): Promise<string>; allowed(userId): Promise<boolean>; watchCreator?(userId, owner, mint): Promise<void>; file: string; log; now? })` returning `{ onPrice(g, unitPrice), onCreatorSold(e), pollMarkets(groups), handle(body, ip) }`. `handle` returns `{ ok, cards: Card[], peaks: Record<groupId, number> }`: every server alert is kept 24 h and shown in Ask Crux too, so it reaches the trader even with notifications blocked (founder 2026-11-24) (peaks feed Task 5's pullback rule).
- State file `coach.json`: `{ lastSent: Record<"userId|rule|coin", number>, peaks: Record<groupId, number>, cards: Card[] (last 24 h per user) }`.

Behaviour: `onPrice` keeps the per-group peak (USD per coin), and evaluates twoXNoPlan (`hasTakeProfit` = any armed takeProfit leg) and nearFloor (floor = armed stopLoss trigger). `pollMarkets` every 60 s reads market cash per watched coin, keeps a 1 h high, evaluates cashLeaving. `onCreatorSold` → creatorSelling. A card is pushed (`tell(owner, { title: card.text, body: actionsLine, url })`) only when `!quiet(rule, lastSent)`; then `lastSent` saved. When a Solana group is placed, the coach calls `watchCreator` (errors ignored: unknown creator is fine).

- [ ] **Step 1: Failing tests** with fake deps: 2× with no take-profit pushes once, not again within 6 h, again after; a group with an armed take-profit at 2× is silent; near floor pushes; a restart (new `makeCoach` on the same file) doesn't re-push inside the quiet period; cashLeaving fires at −30% from the hour's high and not at −29%; creator sale pushes with urgency 3; `handle` refuses a non-allowlisted login (403) and returns only the caller's cards.
- [ ] **Step 2: Run** `node --test scripts/coachrunner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `coachrunner.ts`, the two hooks, the route and the wiring (off unless `ASK_CRUX_COACH=on`; log `relay: Ask Crux coach on` / `off`).
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: PASS, all earlier tests unchanged.
- [ ] **Step 5: Commit**: `Coach on the server: 2x-no-plan, creator selling, cash leaving, near floor, by push`.

### Task 5: Page coach (6 review rules, cards in Ask Crux, initials)

**Files:**
- Create: `crux-terminal/hooks/useCoach.ts`, `crux-terminal/components/command/CoachCards.tsx`
- Modify: `crux-terminal/components/portfolio/YourCoins.tsx` (extract its row-building into `export function useCoinRows(): { rows: Row[]; reading: boolean; valueUsd: number }`, reused by YourCoins unchanged and by `useCoach`; `Row` gains `marketCash?: number` from Solana facts `liquidity`)
- Modify: `crux-terminal/components/command/CommandBar.tsx` (when Ask Crux opens and the coach is on, the first item is `<CoachCards onCommand={…} />`; handle Reply `initials`)

**Interfaces:**
- Consumes: Task 1 page rules + `capCards`; `/v1/coach/cards` (Task 4) for server cards and `peaks`; `useOneBalance()` for cash; order groups `list` (floor = any open group with an armed stopLoss leg) and `useCoinOrders()` (a pending stop-loss order also counts as a floor); session outcomes for `boughtThisSession` / `lossesToday`.
- Produces: `useCoach(): { cards: Card[]; reading: boolean }`; `useAskCruxCoach(): boolean` (health `askCruxCoach` AND `useAskCruxPlans()`); `dismiss(card)` stored in localStorage (try/catch) and respected via `quiet`.

`initials` reply: find the coin's row with `entry`; sell share = `min(100, ceil(entryUsd / valueUsd × 100))`; reply "Took your initials…" text comes from Task 6 after the trade; when there's no entry or value ≤ entry, answer "You're not up on $S yet, so there's nothing to take out." with a Sell half option.

- [ ] **Step 1: Failing tests**: pure helper `reviewCards(input): Card[]` in `lib/coach.ts` style (put it in `lib/coachReview.ts` with `lib/coachReview.test.ts`): given rows, cash, floors, peaks, server cards → expected capped list (e.g. one BONK row at 2× with no floor + a server twoXNoPlan card → only the server card for BONK; a $0.40 row + a $0.30 row → one deadBags card; cash $50 of $60 total → idleCash; after `lossesToday: 1` → no idleCash). `initialsShare(entryUsd: 5, valueUsd: 12) === 42`.
- [ ] **Step 2: Run** `node --test lib/coachReview.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `coachReview.ts`, `useCoinRows`, `useCoach`, `CoachCards` (heading "Here's what I'd look at", each card: text, urgency dot like DeskBanner, its buttons via `onCommand`, a small "Not now" that dismisses), the `initials` handling.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .`, eslint on touched files, `NEXT_PUBLIC_V9=1 npm run build`. Then the browser check: with the coach hook forced on locally (revert after), open Ask Crux logged out/fake account and screenshot the cards block rendering from fixture data. Expected: all PASS, cards render at phone width without overflow.
- [ ] **Step 5: Commit**: `Coach in Ask Crux: review cards on open, one per coin, and "take initials"`.

### Task 6: Crux's voice

**Files:**
- Create: `crux-terminal/lib/coachVoice.ts`, `crux-terminal/lib/coachVoice.test.ts`; copy as `crux-solver/scripts/coachvoice.ts` (+ test)
- Modify: `crux-terminal/components/command/CommandBar.tsx` (outcome text gets a voice line), `crux-solver/scripts/ordergroupsrunner.ts` (plan-sale push bodies use the voice)

**Interfaces:**
- Produces: `type Moment = "profitTaken" | "bigWin" | "floorSold" | "rough" | "initials"`; `voice(moment: Moment, seed: number, vars?: { symbol?: string; usd?: string }): string`; `momentOf(o: { side: "buy" | "sell"; pnlPct?: number; byFloor?: boolean; lossesToday: number }): Moment | null`.

Lines (spec): profitTaken "Good job. Money in the bank beats money on a chart." · "Initials out. Everything from here is a free ride."; bigWin (≥ 3×) "Look at you. Screenshot it, then set a floor."; floorSold "Sorry, that one hurt. Your floor did its job and kept it small."; rough (2+ losses today) "Rough day. Nothing wrong with a break: the coins will still be here."; initials "Took your initials: sold enough to get your $X back. The rest keeps riding." Add 1–2 more per moment in the same spirit; rotate by `seed`.

- [ ] **Step 1: Failing tests**: `momentOf({ side: "sell", pnlPct: -20, byFloor: true, lossesToday: 1 }) === "floorSold"`; second loss → `"rough"`; `pnlPct: 250` → `"bigWin"`; `pnlPct: 30` → `"profitTaken"`; a buy → `null`; guardrail: no `floorSold`/`rough` line contains "!" or a joke word list (`lol|lmao|rekt|ngmi|cope`); `voice` rotates (seed 0 and 1 give different lines when a moment has two).
- [ ] **Step 2: Run** the voice tests. Expected: FAIL.
- [ ] **Step 3: Implement** the voice module and use it: Ask Crux sell outcomes append `voice(...)`; the server's floor-sale push body becomes the floorSold line, take-profit push the profitTaken line.
- [ ] **Step 4: Run** `npm test` (both), tsc, eslint, build. Expected: PASS.
- [ ] **Step 5: Commit** (both repos): `Crux's voice: empathy after losses, praise on profits, a little sass`.

### Task 7: Ship behind the switch

**Files:**
- Modify: `crux-terminal/docs/ask-crux-desk-phase1.md` (coach rollout lines), the spec's status line.

- [ ] **Step 1: Full checks**: `npm test` + `npx tsc --noEmit -p .` (server); `npm test` + tsc + `NEXT_PUBLIC_V9=1 npm run build` (site). Expected: all PASS.
- [ ] **Step 2: Ask the founder to deploy** (both). Server: push, pull, chown, restart (no `npm ci`: package.json unchanged, check with `git diff origin/main..HEAD -- package.json`). The founder adds `ASK_CRUX_COACH=on` to `/etc/crux/crux-solver.env` himself, or approves the one `sed` line.
- [ ] **Step 3: Live check**: log shows `relay: Ask Crux coach on`; health has `askCruxCoach: true`; the founder opens Ask Crux on his account and sees the review block; a small "No plan" buy shows `placed custom` with 0 legs in the log.
- [ ] **Step 4: Commit** docs: `Coach rollout notes`.
