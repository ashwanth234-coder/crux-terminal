import { test } from "node:test";
import assert from "node:assert/strict";
import { PANE_DEFAULTS, clampPane, dragPane, parsePaneSizes } from "./paneSizes.ts";

test("dragPane: each edge grows its pane the way it's pulled, inside its limits", () => {
  assert.equal(dragPane("rail", 230, 40), 270, "coin list: right edge pulled right");
  assert.equal(dragPane("side", 360, -60), 420, "Buy/Sell panel: left edge pulled left");
  assert.equal(dragPane("bottom", 260, -100, 900), 360, "Trades area: top edge pulled up");
  assert.equal(dragPane("rail", 230, 500), 380, "capped");
  assert.equal(dragPane("side", 360, 500), 300, "floored");
  assert.equal(dragPane("bottom", 260, -2000, 900), 680, "the chart always keeps 220 px");
  assert.equal(dragPane("bottom", 260, 2000, 900), 120);
});

test("clampPane: a broken number falls back to the default", () => {
  assert.equal(clampPane("side", Number.NaN), PANE_DEFAULTS.side);
});

test("parsePaneSizes: what was saved, or the defaults for anything missing or broken", () => {
  assert.deepEqual(parsePaneSizes(null), PANE_DEFAULTS);
  assert.deepEqual(parsePaneSizes("not json"), PANE_DEFAULTS);
  assert.deepEqual(parsePaneSizes(JSON.stringify({ rail: 300, side: 9_999, bottomHidden: true })), { rail: 300, side: 560, bottom: 260, bottomHidden: true });
  assert.deepEqual(parsePaneSizes(JSON.stringify({ rail: "wide" })), PANE_DEFAULTS);
});
