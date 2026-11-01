import { expect, test, type Page } from "@playwright/test";

// Load test: the chart under a mainnet-sized launch. Each case loads a history, streams trades in at a busy launch's
// rate for a few seconds, and reads frame times from the page (window.__bench). Printed numbers are the ones to watch;
// the budgets fail the run if the chart would visibly stutter.

type Summary = { frames: number; p50: number; p95: number; p99: number; max: number; over50: number; longTasks: number; longTaskMs: number; trades: number };

async function open(page: Page, query: string, setup?: (page: Page) => Promise<void>) {
  await page.goto(`/dev/chart-bench?${query}`);
  await expect(page.getByRole("group", { name: "Timeframe" }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  if (setup) await setup(page);
}

async function measure(page: Page, rate: number, seconds: number): Promise<Summary> {
  await page.evaluate((r) => {
    window.__bench!.reset();
    window.__bench!.stream(r);
  }, rate);
  await page.waitForTimeout(seconds * 1_000);
  return page.evaluate(() => {
    window.__bench!.stream(0);
    return window.__bench!.summary();
  });
}

async function pickInterval(page: Page, label: string) {
  await page.getByRole("group", { name: "Timeframe" }).first().getByRole("button").click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${label}`) }).click();
}

async function addStudies(page: Page, names: string[]) {
  for (const name of names) {
    await page.getByRole("button", { name: "Indicators", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Search indicators" }).fill(name);
    await page.getByRole("menuitemcheckbox", { name: new RegExp(`^${name}`) }).first().click();
    await page.keyboard.press("Escape");
  }
}

const report = (name: string, s: Summary) =>
  console.log(`${name}: ${s.trades} trades · frames p50 ${s.p50} ms, p95 ${s.p95} ms, p99 ${s.p99} ms, max ${s.max} ms · ${s.over50} frames over 50 ms · long tasks ${s.longTasks} (${s.longTaskMs} ms)`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("busy launch, auto timeframe: 100k trades over 24 h, 50 trades/s", async ({ page }) => {
  await open(page, "trades=100000&hours=24");
  const s = await measure(page, 50, 8);
  report("auto · 100k · 50/s", s);
  expect(s.p95).toBeLessThan(34);
  expect(s.over50).toBeLessThan(s.frames * 0.05);
});

test("worst case: 1-second candles over 24 h with EMA, RSI and MACD, 20 trades/s", async ({ page }) => {
  await open(page, "trades=100000&hours=24", async (p) => {
    await pickInterval(p, "1 second");
    await addStudies(p, ["EMA", "RSI", "MACD"]);
    await p.waitForTimeout(1_000);
  });
  const s = await measure(page, 20, 8);
  report("1s · 3 studies · 100k · 20/s", s);
  expect(s.p95).toBeLessThan(50);
  expect(s.over50).toBeLessThan(s.frames * 0.1);
});

test("launch minute: 2k trades in 10 min, 200 trades/s burst", async ({ page }) => {
  await open(page, "trades=2000&hours=0.17");
  const s = await measure(page, 200, 6);
  report("launch burst · 200/s", s);
  expect(s.p95).toBeLessThan(34);
});

test("a week of a big token: 300k trades over 7 days, 50 trades/s", async ({ page }) => {
  await open(page, "trades=300000&hours=168");
  const s = await measure(page, 50, 8);
  report("week · 300k · 50/s", s);
  expect(s.p95).toBeLessThan(34);
  expect(s.over50).toBeLessThan(s.frames * 0.05);
});
