// Load test of the chart's math at mainnet-launch size: a day of a busy launch (100,000 trades) turned into candles and
// every study, the work the chart redoes when a new trade arrives. Fails if a step slows past its budget, so a
// regression that would make a hot launch's chart stutter shows up here first. Budgets are wide (a slow CI machine
// passes); the numbers printed are the ones to watch.
import assert from "node:assert/strict";
import test from "node:test";
import { fillGaps, toCandles, type Fill } from "./candles.ts";
import { EMPTY_CONTEXT, STUDIES, computeInstance } from "./indicators.ts";

function fills(n: number, hours: number): Fill[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const now = 1_800_000_000;
  let price = 0.00002;
  return Array.from({ length: n }, (_, i) => {
    price *= 1 + (rand() - 0.48) * 0.02;
    return { time: now - hours * 3_600 + Math.floor((i / n) * hours * 3_600), price, usdc: BigInt(Math.round((5 + rand() * 500) * 1e6)) };
  });
}

const time = (fn: () => unknown) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

test("a day of a busy launch: candles and every study within a frame budget per update", () => {
  const f = fills(100_000, 24);
  const now = f[f.length - 1].time;
  const rows: string[] = [];
  for (const interval of [1, 60, 300]) {
    let candles = toCandles(f, interval, 0.00002);
    const build = time(() => (candles = fillGaps(toCandles(f, interval, 0.00002), interval, now)));
    let studies = 0;
    let worst = { id: "", ms: 0 };
    for (const s of STUDIES) {
      const ms = time(() => computeInstance({ id: s.id }, candles, EMPTY_CONTEXT));
      studies += ms;
      if (ms > worst.ms) worst = { id: s.id, ms };
    }
    rows.push(`${interval}s: ${candles.length} candles · build ${build.toFixed(1)} ms · all ${STUDIES.length} studies ${studies.toFixed(1)} ms (slowest ${worst.id} ${worst.ms.toFixed(1)} ms)`);
    // One update with five studies on (a heavy but normal setup) must fit well inside a second.
    assert.ok(build < 400, `${interval}s candles took ${build.toFixed(0)} ms`);
    assert.ok(worst.ms < 250, `${worst.id} took ${worst.ms.toFixed(0)} ms on ${candles.length} candles`);
  }
  console.log(rows.join("\n"));
});
