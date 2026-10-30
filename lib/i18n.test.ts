import assert from "node:assert/strict";
import test from "node:test";
import { DICTIONARIES, LANGS, translate, type Key } from "./i18n.ts";

const keys = Object.keys(DICTIONARIES.en) as Key[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every language has every key, non-empty, with the same placeholders as English", () => {
  for (const { code } of LANGS) {
    const dict = DICTIONARIES[code];
    assert.deepEqual(Object.keys(dict).sort(), [...keys].sort(), `${code} has exactly the English keys`);
    for (const key of keys) {
      assert.ok(dict[key].trim().length > 0, `${code}.${key} is empty`);
      assert.deepEqual(placeholders(dict[key]), placeholders(DICTIONARIES.en[key]), `${code}.${key} placeholders`);
    }
  }
});

test("fills placeholders and keeps unknown ones", () => {
  assert.equal(translate("en", "badge.vested", { days: 30 }), "30D vested");
  assert.equal(translate("zh", "badge.antiSniper", { window: "60s" }), "防狙击 60s");
  assert.equal(translate("en", "vault.protected"), "Protected · withdrawals only to {address}");
});
