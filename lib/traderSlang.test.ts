import assert from "node:assert/strict";
import test from "node:test";
import { deslang, DCA_NOT_YET } from "./traderSlang.ts";
import { readMessage } from "./commandChat.ts";

const t = (s: string) => deslang(s).text;
/** The reply without keys that are just undefined (the reader sets `chain: undefined` on some paths). */
const read = (s: string) => JSON.parse(JSON.stringify(readMessage(s)));

test("buying slang: ape / send, with or without the $", () => {
  assert.equal(t("ape $5 into bonk"), "buy $5 of bonk");
  assert.equal(t("ape 5 into bonk"), "buy $5 of bonk");
  assert.equal(t("aping 10 bucks in WIF"), "buy $10 of WIF");
  assert.equal(t("send $20 on bonk"), "buy $20 of bonk");
  assert.equal(t("Send it, $5 on bonk"), "buy $5 of bonk");
});

test("selling slang: dump, cut, exit, paper hand, jeet, trim, moon bag", () => {
  assert.equal(t("dump bonk"), "sell all bonk");
  assert.equal(t("dump all my bonk"), "sell all bonk");
  assert.equal(t("cut WIF"), "sell all WIF");
  assert.equal(t("exit bonk"), "sell all bonk");
  assert.equal(t("paper hand bonk"), "sell all bonk");
  assert.equal(t("paperhand bonk"), "sell all bonk");
  assert.equal(t("jeet bonk"), "sell all bonk");
  assert.equal(t("dump half bonk"), "sell half of bonk");
  assert.equal(t("dump half of my bonk"), "sell half of bonk");
  assert.equal(t("trim half bonk"), "sell half of bonk");
  assert.equal(t("trim bonk"), "sell 25% of bonk");
  assert.equal(t("leave a moon bag on bonk"), "sell 85% of bonk");
  assert.equal(t("keep a moonbag of WIF"), "sell 85% of WIF");
});

test("tp / sl shorthand", () => {
  assert.equal(t("sl 20 on bonk"), "stop loss 20% on bonk");
  assert.equal(t("sl -15% on bonk"), "stop loss 15% on bonk");
  assert.equal(t("tp 2x on bonk"), "take profit at 2x on bonk");
  assert.equal(t("buy $5 of bonk sl 20 tp 3x"), "buy $5 of bonk stop loss 20% take profit at 3x");
});

test("initials, rugs and DCA", () => {
  assert.deepEqual(deslang("take initials on bonk").initials, { coin: "bonk" });
  assert.deepEqual(deslang("pull my initials from WIF on solana").initials, { coin: "WIF", chain: "solana" });
  assert.equal(t("is bonk rugging?"), "bonk");
  assert.equal(t("is the dev dumping on WIF"), "WIF");
  assert.equal(deslang("dca $20 over a day").notYet, DCA_NOT_YET);
});

test("plain words and coin names are left alone", () => {
  for (const s of ["buy $5 of bonk", "send", "$SEND", "moon", "jeet", "buy $5 of MOON", "sell all SEND", "what do i hold"]) assert.equal(t(s), s);
});

test("Ask Crux reads slang through to the same steps", () => {
  assert.deepEqual(read("ape 5 into bonk"), { kind: "plan", steps: [{ kind: "buy", coin: "BONK", usd: 5 }] });
  assert.deepEqual(read("leave a moon bag on bonk"), { kind: "plan", steps: [{ kind: "sell", coin: "BONK", pct: 85 }] });
  assert.deepEqual(read("sl 20 on bonk"), { kind: "plan", steps: [{ kind: "stopLoss", coin: "BONK", dropPct: 20, pct: 100 }] });
  assert.deepEqual(read("take initials on bonk"), { kind: "initials", coin: "bonk" });
  assert.deepEqual(read("is bonk rugging?"), { kind: "lookup", coin: "bonk" });
  assert.deepEqual(read("dca $20 over a day"), { kind: "error", text: DCA_NOT_YET });
  assert.deepEqual(read("$SEND"), { kind: "lookup", coin: "SEND" });
  assert.deepEqual(read("send"), { kind: "lookup", coin: "send" });
});
