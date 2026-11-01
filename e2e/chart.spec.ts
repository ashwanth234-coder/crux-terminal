import { expect, test, type Locator, type Page } from "@playwright/test";

// The chart's controls, driven with a real mouse and keyboard in Chrome, against the test chart (/dev/chart-bench).
// Each test starts from a clean browser (no saved layout).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

async function openChart(page: Page): Promise<{ chart: Locator; box: { x: number; y: number; width: number; height: number } }> {
  await page.goto("/dev/chart-bench?trades=3000&hours=6");
  const chart = page.getByRole("img", { name: "$BENCH chart" });
  await expect(chart).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const box = (await chart.boundingBox())!;
  return { chart, box };
}

/** A point on the price axis, halfway down the price pane. */
const axisPoint = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width - 25, y: box.y + box.height * 0.4 });

test("timeframes live in one dropdown that shows the current one", async ({ page }) => {
  await openChart(page);
  const tf = page.getByRole("group", { name: "Timeframe" });
  await expect(tf.getByRole("button")).toHaveCount(1);
  await expect(tf).toHaveText(/Auto/);
  await tf.getByRole("button").click();
  await expect(page.getByRole("menuitemradio", { name: /^1 second/ })).toBeVisible();
  await page.getByRole("menuitemradio", { name: /^1 hour/ }).click();
  await expect(tf).toHaveText(/1h/);
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  await tf.getByRole("button").click();
  await page.getByRole("menuitemradio", { name: /^Auto/ }).click();
  await expect(tf).toHaveText(/Auto/);
});

test("an indicator is added from the menu and removed from the legend", async ({ page }) => {
  await openChart(page);
  await page.getByRole("button", { name: "Indicators", exact: true }).click();
  await page.getByRole("textbox", { name: "Search indicators" }).fill("RSI");
  await page.getByRole("menuitemcheckbox", { name: /^RSI/ }).first().click();
  await page.keyboard.press("Escape");
  const remove = page.getByRole("button", { name: /^Remove RSI/ });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
});

test("right-click on the price axis opens the scale menu; modes tick and reset", async ({ page }) => {
  const { box } = await openChart(page);
  const at = axisPoint(box);
  await page.mouse.click(at.x, at.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Price scale" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /Logarithmic/ }).click();
  await expect(menu).toHaveCount(0);
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: /Logarithmic/ }).getByText("✓")).toBeVisible();
  await menu.getByRole("menuitem", { name: /Invert scale/ }).click();
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: /Invert scale/ }).getByText("✓")).toBeVisible();
  await menu.getByRole("menuitem", { name: /Reset price scale/ }).click();
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: /Regular/ }).getByText("✓")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Invert scale/ }).getByText("✓")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("the wheel on the price axis stretches it; A fits it back", async ({ page }) => {
  const { box } = await openChart(page);
  const at = axisPoint(box);
  const fit = page.getByRole("button", { name: "Fit the price scale to the data" });
  await expect(fit).toHaveCount(0);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -400);
  await expect(fit).toBeVisible();
  await fit.click();
  await expect(fit).toHaveCount(0);
});

test("dragging the chart back in time shows », which jumps to the newest bar", async ({ page }) => {
  const { box } = await openChart(page);
  const jump = page.getByRole("button", { name: "Scroll to the newest bar" });
  await expect(jump).toHaveCount(0);
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4, { steps: 12 });
  await page.mouse.up();
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(jump).toHaveCount(0);
});

test("a trendline is drawn with two clicks and removed from the palette", async ({ page }) => {
  const { box } = await openChart(page);
  await page.getByRole("button", { name: /^Lines: / }).click();
  await page.getByRole("menuitemradio", { name: /^Trendline/ }).click();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3);
  const remove = page.getByRole("button", { name: "Remove 1 drawing" });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(page.getByRole("button", { name: "Remove 0 drawings" })).toBeDisabled();
});

test("a single click with a drawing tool leaves no zero-size drawing", async ({ page }) => {
  const { box } = await openChart(page);
  await page.getByRole("button", { name: /^Lines: / }).click();
  await page.getByRole("menuitemradio", { name: /^Trendline/ }).click();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await expect(page.getByRole("button", { name: "Remove 0 drawings" })).toBeDisabled();
});

test("the chart style menu switches styles", async ({ page }) => {
  await openChart(page);
  await page.getByRole("button", { name: /^Chart style: Candles/ }).click();
  await page.getByRole("menuitem", { name: /^Line$/ }).click();
  await expect(page.getByRole("button", { name: /^Chart style: Line/ })).toBeVisible();
  await page.getByRole("button", { name: /^Chart style: Line/ }).click();
  await page.getByRole("menuitem", { name: /^Candles$/ }).click();
  await expect(page.getByRole("button", { name: /^Chart style: Candles/ })).toBeVisible();
});

for (const width of [1280, 1440, 1920]) {
  test(`the toolbar fits without overlaps at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openChart(page);
    const report = await page.getByRole("group", { name: "Timeframe" }).evaluate((group) => {
      const bar = group.parentElement!;
      const kids = [...bar.children].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      const overlaps = kids.filter((a, i) => kids.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom && b.top < a.bottom));
      return { overflow: bar.scrollWidth - bar.clientWidth, overlaps: overlaps.length, pageOverflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(report.overlaps).toBe(0);
    expect(report.pageOverflow).toBe(0);
    if (width >= 1440) expect(report.overflow).toBeLessThanOrEqual(0);
  });
}
