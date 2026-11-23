import assert from "node:assert/strict";
import test from "node:test";
import { bundleWarning, findBundle, walletShare, type MapHolder } from "./holderMap.ts";

const w = (owner: string, pct: number, kind: MapHolder["kind"] = "wallet"): MapHolder => ({ owner, pct, kind });

test("$MINELIUS: eight top wallets at ~2.33% each is a bundle", () => {
  const holders = [2.34, 2.34, 2.33, 2.33, 2.32, 2.32, 2.32, 2.32].map((p, i) => w(`W${i}`, p));
  const b = findBundle([w("POOL", 20, "pool"), ...holders, w("X", 0.9)]);
  assert.ok(b);
  assert.equal(b!.wallets.length, 8);
  assert.equal(bundleWarning(b!), "8 wallets hold almost the same amount (18.6% together): likely one buyer split across wallets");
});

test("a normal spread isn't a bundle; pools never count", () => {
  assert.equal(findBundle([w("A", 4.1), w("B", 3.2), w("C", 2.5), w("D", 1.9), w("E", 1.4), w("F", 1.1)]), null);
  assert.equal(findBundle([2, 2, 2, 2, 2, 2].map((p, i) => w(`P${i}`, p, "pool"))), null);
  // Five alike but under 10% together: too small to matter.
  assert.equal(findBundle([1, 1, 1, 1, 1].map((p, i) => w(`S${i}`, p))), null);
  assert.equal(walletShare([w("POOL", 30, "pool"), w("A", 5), w("DEV", 3, "creator")]), 8);
});
