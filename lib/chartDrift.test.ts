import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// crux-solver keeps a copy of this chart math (scripts/chart) for server-side alerts. This fails the moment the two
// differ, apart from the copy header and ".ts" import extensions, so a change here can't ship without its copy.
// Runs where both repos sit side by side; skipped elsewhere (e.g. Vercel builds).
const here = dirname(fileURLToPath(import.meta.url));
const SOLVER_CHART = process.env.CRUX_SOLVER_CHART ?? join(here, "../../crux-solver/scripts/chart");
const FILES = ["candles.ts", "indicators.ts", "tradeDecode.ts"];

const normalize = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/^\/\/ Copied from crux-terminal[^\n]*\n\/\/[^\n]*\n/, "")
    .replace(/(from "\.\/[A-Za-z0-9_]+)\.ts"/g, '$1"');

test("crux-solver's copy of the chart math matches this one", { skip: !existsSync(SOLVER_CHART) && "crux-solver isn't checked out beside crux-terminal" }, () => {
  for (const f of FILES) {
    assert.equal(normalize(readFileSync(join(SOLVER_CHART, f), "utf8")), normalize(readFileSync(join(here, f), "utf8")), `crux-solver scripts/chart/${f} has drifted from lib/${f}: copy it over`);
  }
});
