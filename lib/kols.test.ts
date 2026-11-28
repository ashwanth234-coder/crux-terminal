import { test } from "node:test";
import assert from "node:assert/strict";
import { kolIndex, kolMarks, kolName } from "./kols.ts";

const k = (o: Partial<Parameters<typeof kolName>[0]> & { time: number; address: string }) => ({ side: "buy" as const, usd: 100, price: 0.5, tokens: 200, name: "", twitter: "", tx: `t${o.time}`, ...o });

test("KOL badges: KB / KS marks in seconds, oldest first, with the KOL's name", () => {
  const m = kolMarks([k({ time: 5_000, address: "A", name: "Cupsey" }), k({ time: 2_000, address: "0xAbC", twitter: "ansem" })]);
  assert.deepEqual(m.map((x) => [x.time, x.who, x.name, x.usd]), [[2, "kol", "@ansem", 100], [5, "kol", "Cupsey", 100]]);
  assert.equal(kolName({ name: "", twitter: "", address: "9SLPTL41SPsYkgdsMzdfJsxymEANKr5bYoBsQzJyKpKS" }), "9SLP…KpKS");
});

test("KOLs by wallet: EVM in any letter case, Solana as is", () => {
  const i = kolIndex([k({ time: 1, address: "0xAbC", name: "X" }), k({ time: 1, address: "SoLwallet", name: "Y" })]);
  assert.equal(i.get("0xabc")?.name, "X");
  assert.equal(i.get("SoLwallet")?.name, "Y");
  assert.equal(i.get("solwallet"), undefined);
});
