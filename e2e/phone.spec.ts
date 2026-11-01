import { expect, test } from "@playwright/test";

// The chart on a phone (Pixel 7 size, touch): nothing scrolls sideways, and the main controls work by tap.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("phone: no sideways scroll, timeframe and scale menus work by tap", async ({ page }) => {
  await page.goto("/dev/chart-bench?trades=3000&hours=6");
  const chart = page.getByRole("img", { name: "$BENCH chart" });
  await expect(chart).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

  const tf = page.getByRole("group", { name: "Timeframe" });
  await tf.getByRole("button").tap();
  await page.getByRole("menuitemradio", { name: /^5 minutes/ }).tap();
  await expect(tf).toHaveText(/5m/);

  await page.getByRole("button", { name: "Indicators", exact: true }).tap();
  const search = page.getByRole("textbox", { name: "Search indicators" });
  await expect(search).toBeVisible();
  // The menu stays on screen (it once ran off the right edge on phones).
  const box = (await search.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
