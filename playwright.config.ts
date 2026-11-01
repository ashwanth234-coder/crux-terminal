import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the chart (e2e/), run against the test-only chart page /dev/chart-bench (synthetic trades, no chain
 * reads). That page only exists in a build made with NEXT_PUBLIC_CHART_HARNESS=1:
 *   NEXT_PUBLIC_CHART_HARNESS=1 npm run build && npm run test:e2e
 * Uses the installed Chrome (no browser download). E2E_BASE_URL points at another server.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3700",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } }, testIgnore: /(load|phone)\.spec/ },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /phone\.spec/ },
    { name: "load", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } }, testMatch: /load\.spec/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run start -- --port 3700", port: 3700, reuseExistingServer: true, timeout: 120_000 },
});
