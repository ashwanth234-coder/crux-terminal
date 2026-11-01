import { expect, test, type APIRequestContext, type Locator } from "@playwright/test";

// The real loading and streaming path: the shared feed (crux-solver feed-sim-server.ts: the real chain reader, pool
// store and WebSocket hub over a scripted chain) into the real chart page, through new blocks, a gap the reader didn't
// see block by block, a one-block reorg, and a dropped socket that reconnects and backfills without resetting the chart.

const SIM = process.env.FEED_SIM_URL ?? "http://127.0.0.1:8799";
const FEED = `${SIM.replace(/^http/, "ws")}/v1/feed`;
type Swap = { side: "buy" | "sell"; usdc: number; price: number };

async function sim(request: APIRequestContext, path: string, data?: object) {
  const r = await request.post(`${SIM}/sim/${path}`, data ? { data } : {});
  expect(r.ok(), `sim ${path}`).toBeTruthy();
}
const block = (request: APIRequestContext, swaps: Swap[], count = 1) => sim(request, "mine", { count, swaps });
const closeOf = (chart: Locator) => expect.poll(async () => Number(await chart.getAttribute("data-close")), { timeout: 10_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("the chart follows the shared feed through new blocks, a gap, a reorg and a reconnect", async ({ page, request }) => {
  await sim(request, "reset");
  await block(request, [{ side: "buy", usdc: 100, price: 1 }]);
  await sim(request, "step");

  await page.goto(`/dev/chart-bench?feed=${encodeURIComponent(FEED)}`);
  const chart = page.getByRole("img", { name: "$BENCH chart" });
  await expect(chart).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await closeOf(chart).toBeCloseTo(1, 5);
  const trades = () => expect.poll(() => page.evaluate(() => window.__bench!.trades()), { timeout: 10_000 });
  // Each swap moves the token once: the holder list's transfers follow the feed too.
  const transfers = () => expect.poll(() => page.evaluate(() => window.__bench!.transfers()), { timeout: 10_000 });
  await trades().toBe(1);

  // New blocks: the next trade arrives as a tick.
  await block(request, [{ side: "buy", usdc: 50, price: 1.2 }], 5);
  await sim(request, "step");
  await closeOf(chart).toBeCloseTo(1.2, 5);
  await trades().toBe(2);

  // A gap: ten blocks the reader only sees as a range, a trade in the middle of them.
  await block(request, [{ side: "sell", usdc: 30, price: 1.1 }], 6);
  await block(request, [], 4);
  await sim(request, "step");
  await closeOf(chart).toBeCloseTo(1.1, 5);
  await trades().toBe(3);
  await transfers().toBe(3);

  // A one-block reorg: the trade at 1.5 is replaced by one at 0.9; the chart and the trade list follow.
  await block(request, [{ side: "buy", usdc: 10, price: 1.5 }]);
  await sim(request, "step");
  await closeOf(chart).toBeCloseTo(1.5, 5);
  await trades().toBe(4);
  await sim(request, "reorg", { depth: 1, blocks: [[{ side: "sell", usdc: 10, price: 0.9 }]] });
  await sim(request, "step");
  await closeOf(chart).toBeCloseTo(0.9, 5);
  await trades().toBe(4);
  await transfers().toBe(4);

  // A drawing, then the socket drops while a trade lands: the page reconnects, backfills, and keeps the drawing.
  const box = (await chart.boundingBox())!;
  await page.getByRole("button", { name: /^Lines: / }).click();
  await page.getByRole("menuitemradio", { name: /^Trendline/ }).click();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3);
  await expect(page.getByRole("button", { name: "Remove 1 drawing" })).toBeEnabled();
  await sim(request, "drop");
  await expect(chart).toHaveAttribute("data-feed", "reconnecting", { timeout: 2_000 });
  // Through the reconnect the chart keeps the feed's candles (no switch of source, no flicker).
  await expect(chart).toHaveAttribute("data-close", /^0\.9/);
  await block(request, [{ side: "buy", usdc: 20, price: 1.3 }], 5);
  await sim(request, "step");
  await expect(chart).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
  await closeOf(chart).toBeCloseTo(1.3, 5);
  await trades().toBe(5);
  await transfers().toBe(5);
  await expect(page.getByRole("button", { name: "Remove 1 drawing" })).toBeEnabled();
});
