# Ask Crux trading desk: Phase 1 proposal (2026-11-23)

Status: proposal for approval. No code changed.

## 1. What exists today (audit)

| Piece | Where | What it does | Gap for this plan |
|---|---|---|---|
| Command reader | `lib/commandIntent.ts` (248 lines) | Rule-based English to `TradeStep[]` (buy, sell, takeProfit, stopLoss, trailing, dip, wait). The same words always mean the same thing. **No AI.** | A buy gets no exit plan unless one is typed. |
| Chat, scan, copy | `lib/commandChat.ts`, `lib/coinScan.ts`, `lib/walletCopy.ts`, `components/command/CommandBar.tsx` (1,206 lines) | The card, confirm flow, scans and copy-trading (in the browser). | The card shows steps, not a plan with presets. |
| Buy check | `lib/buySafety.ts`, `hooks/useBuyCheck.ts` | Blocks traps (honeypot, sell tax 30% or more, balance-changing owner, empty pool); other warnings need "Buy anyway". **Runs in the browser.** | No size-vs-liquidity or round-trip-impact check. The server doesn't run it independently. |
| Price orders | `crux-solver/scripts/coinorders.ts` (310 lines) | takeProfit, stopLoss, trailing, dip. Prices polled about every 2 s; `firing` status plus one trade per login at a time; a restart never re-sends; up to 3 retries on busy routes. | **(a)** `group` cancels *every* sibling when *any* leg fires, so "sell 50% at 2x **and keep** a trailing stop" is impossible. **(b)** Triggers are priced off the price when placed, not the actual entry fill. **(c)** Amounts are fixed coin units, not "% of the bag". **(d)** Slippage is fixed (no escalation on emergency exits). **(e)** No stop that moves to breakeven, no audit trail per leg. |
| Profit/loss | `crux-solver/scripts/positions.ts` | Records every confirmed fill (cost and units per coin). | Already gives us the entry price to arm exits from. |
| Zod | — | **Not installed in either repo.** | Add it (free, about 13 kB in the browser). |

## 2. My recommendations on the brief

1. **Keep the reader rule-based in Phase 1; don't add an LLM yet.**
   - The three presets are fixed templates, so they need no AI.
   - The "rationale" line can be generated from the plan's numbers, which is deterministic and can never hallucinate.
   - An LLM would add 0.5-2 s per message and a running cost, which breaks the $0 rule, and the trading path gains
     nothing from it.
   - **Later (optional):** an LLM only as a fallback for phrasing the rule reader doesn't understand. Its output must pass
     the same Zod `TradePlan` schema, coins still come from Crux's own search, and it sits behind a switch.
   - This keeps the boundary in the brief: language model → validated plan → server re-checks everything → your click.
2. **Route transparency must show the real route.** Today cash sits on each chain (Rule B); there's no Relay hop yet.
   So the card says, for example, "Paid from your Solana cash → Jupiter · fee $0.05 · about 1 s". It never names a
   route Crux didn't take.
3. **Phase 2's kill switch reverses your earlier call** ("alerts, not auto-sells: many buy after a dev sells"). As an
   **optional, per-trade, off-by-default** toggle it's fine. Just confirming that's what you want before Phase 2.
4. **"Breakeven" should include fees:** move the stop to the entry price plus about 1% (the round-trip fee and
   slippage), or "breakeven" sells at a small loss.
5. **Honesty on fills:** stops and trails watch prices polled every 2 s. A memecoin can gap through a stop, and the fill
   is whatever the market pays (within the escalating slippage). The card should say "stop at about −25%", never
   "guaranteed".

## 3. `TradePlan` schema (Zod, shared by site and server)

```ts
import { z } from "zod";

export const MAX_TRADE_USD = 1_000; // the server's cap too (with today's $100 approval caps on EVM)

const pct = z.number().min(1).max(100);
const LegId = z.string().regex(/^[a-z0-9-]{1,24}$/);

export const ExitLeg = z.discriminatedUnion("kind", [
  // Sell `sellPct` of the bag bought (as filled) when the price reaches entry × `atMultiple`.
  z.object({ kind: z.literal("takeProfit"), id: LegId, sellPct: pct, atMultiple: z.number().gt(1).max(1_000) }),
  // The hard floor: sells everything left at entry × (1 − dropPct/100). Optionally moves up to breakeven once
  // `breakevenAfter` (a take-profit leg's id) has filled.
  z.object({ kind: z.literal("stopLoss"), id: LegId, dropPct: z.number().min(1).max(95), breakevenAfter: LegId.optional() }),
  // A trailing stop on `sellPct` of the bag: tracks the highest price since entry, sells on a `trailPct` drop from it.
  z.object({ kind: z.literal("trailing"), id: LegId, sellPct: pct, trailPct: z.number().min(1).max(90) }),
]);

export const TradePlan = z
  .object({
    version: z.literal(1),
    preset: z.enum(["conservative", "balanced", "aggressive", "custom"]),
    chain: z.enum(["solana", "base", "bnb"]),
    coin: z.string().min(32).max(44), // resolved by Crux's search; never produced by a language model
    entryUsd: z.number().positive().max(MAX_TRADE_USD),
    exits: z.array(ExitLeg).max(6),
    rationale: z.string().max(280), // generated from the numbers, plain English
  })
  .superRefine((p, ctx) => {
    const sells = p.exits.filter((l) => l.kind !== "stopLoss").reduce((s, l) => s + l.sellPct, 0);
    if (sells > 100) ctx.addIssue({ code: "custom", message: "Exits sell more than 100% of the bag" });
    if (p.exits.filter((l) => l.kind === "stopLoss").length > 1) ctx.addIssue({ code: "custom", message: "One hard stop at most" });
    const ids = p.exits.map((l) => l.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate leg ids" });
    for (const l of p.exits)
      if (l.kind === "stopLoss" && l.breakevenAfter && !p.exits.some((x) => x.id === l.breakevenAfter && x.kind === "takeProfit"))
        ctx.addIssue({ code: "custom", message: "breakevenAfter must name a take-profit leg" });
  });
```

**Presets** (sell percentages are of the bag as filled):

| Preset | Exits |
|---|---|
| Conservative | `tp1` 75% at 1.3×; `sl` −15%, `breakevenAfter: "tp1"` |
| **Balanced (default)** | `tp1` 50% at 2× (recovers the stake); `trail` 50% at 20%; `sl` −25% |
| Aggressive | `tp1` 25% at 2×; `tp2` 25% at 4×; `trail` 50% at 25%; `sl` −35% |
| Custom | Exactly what the trader typed. If there's no stop, the card adds the line "No stop-loss set: add a −25% floor?" (one click). |

## 4. Order groups: state machine (server, `crux-solver`)

**Storage:** stays a JSON file (like today's orders), written atomically. One `OrderGroup` holds one entry plus its exit
legs.

```
Group:  armed_waiting_entry ──entry filled──▶ active ──all units sold / hard stop or trail filled──▶ closed
                    │                            │
                    └──entry failed──▶ cancelled  └──trader cancels──▶ cancelled (open legs cancelled)

Leg:    armed ──trigger hit + group lock taken──▶ firing ──tx confirmed──▶ filled
          │                                         │
          │                                         ├─ busy/slippage error ──▶ armed (retry, escalated slippage)
          └─ sibling terminal leg fired ──▶ cancelled └─ out of retries ──▶ failed (push alert)
```

**Rules:**
1. **Arm from the real fill.** Prices and coin amounts come from the entry's confirmed fill (`positions.ts`), not the
   price at placement.
2. **Legs are a % of the bag as filled,** turned into coin units at arm time. A partial take-profit leaves the others
   armed.
3. **OCO, atomic:**
   - A **stop-loss** or a **trailing leg that would empty the bag** is *terminal*.
   - Before it sends, the runner marks every other armed leg `cancelled` and saves, *then* trades. A crash after
     saving can never fire a sibling.
   - A take-profit is *non-terminal*: it reduces the units on the other legs proportionally, and if it's the
     `breakevenAfter` target, it moves the stop to entry plus about 1%.
4. **Idempotency:**
   - One `firing` leg per group at a time, through a per-group lock.
   - A leg moves armed → firing only through a compare-and-set on `{status, version}`, saved before sending.
   - Every send carries an idempotency key `groupId:legId:attempt`.
   - After a restart, a `firing` leg is **reconciled** (read the wallet's coin balance and the last tx), never blindly
     resent.
5. **Emergency slippage escalation** (stop-loss and trailing exits only):
   - 3% → 8% → 15% → 25% across up to 4 attempts, about 2 s apart, while the trigger still holds.
   - Take-profits keep 3% and simply retry.
6. **Audit log per group:** every arm, trigger, attempt (with slippage), tx hash, fill price and cancellation, with a
   timestamp. It's shown on the card ("History") and kept 30 days.
7. **Today's single orders** (`coinorders.ts`) keep working unchanged. Groups run in the same 2-second price loop.

### Founder's guardrails (approved 2026-11-23; these override anything above that conflicts)

**G1. Trailing stop activation.**
- In Balanced and Aggressive, the trailing leg is **not armed at entry**. Until TP1 fills, only the hard floor (and the
  take-profits) watch the bag.
- When TP1 fills, the trailing leg arms on the remaining moonbag. Its high watermark starts at **TP1's fill price**.
- The hard floor stays armed underneath as a backstop.

**G2. Group lock on a terminal exit (stop-loss or a trailing stop that empties the bag).**
- The group moves to **`EXITING`**: no sibling can fire, but siblings are **not** cancelled yet.
- Siblings become `CANCELLED` only once the sell **confirms on-chain**.
- If every retry fails, the group goes to **`EXIT_FAILED`**: a loud log line, a push alert, the siblings stay locked
  (never two competing sells), and the card shows "Sell now" (one tap). There is never an orphaned bag without a record.

**G3. MEV-safe slippage escalation.**
- Default steps: 3% → 8% → 15%.
- 25% only when a **fresh quote's measured price impact** needs it (impact + 2% margin, capped at 25%).
- By chain:
  - **Base:** no public mempool, so the quote rule alone applies.
  - **Solana:** Helius Sender. It helps, but it isn't a guarantee, so the quote rule applies.
  - **BNB Chain:** a public mempool, so it is never above the quote-justified level.
- Each attempt's slippage and quoted impact go into the audit log.

**G4. Dust floor on partial exits.**
- If a partial take-profit would leave a remainder worth **under $2** (or below the route's minimum swap), sell
  **100%** instead.
- The other legs then close with the group.

## 5. Desk Check (server, parallel, before Confirm)

`POST /v1/desk-check { token, chain, coin, usd }` runs everything at once (`Promise.all`; target under 900 ms):

| Check | Source | Amber when | Red (Confirm disabled) |
|---|---|---|---|
| Size vs pool | DexScreener liquidity | Size over 2% of pool liquidity | — |
| Round-trip impact | A buy quote plus a sell-back quote of that output (Jupiter / Kyber) | Over 4%: suggests the size that keeps it at about 2% | Over 25% |
| Momentum | 1h volume ÷ liquidity, 5m buys/sells | Volume/liquidity under 0.1 (dead) or over 20 (frenzy) | — |
| Holders | Solana: `/v1/solana/holders`; EVM: GoPlus | Top-10 over 50%, creator over 10%, bundle pattern | — |
| Safety | Today's `buySafety` rules, **run on the server** | Warnings | Honeypot or sell fails, sell tax 30% or more, owner can change balances, **mint or freeze authority active**, empty pool |
| Limits | Server caps (`MAX_TRADE_USD`, EVM approval cap, cash available) | — | Over cap or not enough cash |
| Route | The actual route | Shows "Solana cash → Jupiter · $0.05 · ~1 s" | — |

**Latency:**
- The Desk Check runs **while the card is open**, in parallel with the existing prepare-on-hover. Confirm still sends
  the already-prepared trade (the existing ~1.3 s path).
- If the check isn't back yet, Confirm waits for it, capped at 1.5 s; then it shows "Couldn't finish the check" and
  needs a tick to proceed.
- **The server re-runs the red checks right before sending** (cached for 10 s), so a stale card can't bypass them.

## 6. File-by-file plan (Phase 1 only)

**crux-solver**

1. `scripts/tradeplan.ts` (new): the Zod schema, preset builder, `exitsFromFill()` (plan + fill → armed legs). Tests.
2. `scripts/ordergroups.ts` (new): the group state machine, runner (shares `coinorders.ts`'s price loop and `tradeAs`),
   OCO, lock, reconcile, slippage escalation, audit log. Tests: OCO, double-trigger, restart reconcile, breakeven move,
   trailing high-watermark, partial take-profit sizing, escalation.
3. `scripts/deskcheck.ts` (new): the parallel checks above, plus the pre-send recheck. Tests with stubbed sources.
4. `scripts/buySafety` on the server: a port of the site's `classify()` (the same rules, so both sides agree).
5. `relay.ts` and `solver.ts`: `POST /v1/desk-check`, `/v1/order-groups/place | list | cancel`; Zod-validate every body.
6. `package.json`: add `zod`.

**crux-terminal**

1. `lib/tradePlan.ts` (new): the same schema, presets, the plain-English rationale generator. Tests.
2. `lib/commandIntent.ts`: a buy produces a `TradePlan` (Balanced by default); typed exits produce `custom`, plus the
   missing-stop suggestion.
3. `components/command/TradePlanCard.tsx` (new): three preset chips, editable legs (one tap each), the Desk Check banner
   (green / amber / red, with plain lines), Confirm disabled on red, the "Nothing happens until you confirm" footer, a
   History tab.
4. `components/command/CommandBar.tsx`: use the plan card for buys and scans; after the entry fills, place the group
   (entry tx plus plan).
5. `hooks/useDeskCheck.ts` (new): calls `/v1/desk-check` when the card opens, in parallel with prepare.
6. `package.json`: add `zod`.

**Not touched:** the trade paths themselves (`soltraderelay.ts`, `bnbtraderelay.ts`, prepare and fast send), and
today's single orders.

## 7. Rollout

1. Server and site behind a switch (`ASK_CRUX_PLANS=on`), tested with your own small real-money buys:
   - Balanced on a liquid coin;
   - a forced stop (a tight −3% stop on a volatile coin);
   - a restart mid-trade.
2. Then default-on. Phase 2 only after these pass.

**Estimate:** about 3-4 working sessions (server engine and tests first, then the card).
