import { expect, test, type Page } from "@playwright/test";
import { decodeFunctionData, getAddress, parseAbi, recoverTypedDataAddress, type Hex } from "viem";
import { ACCOUNT, OWNER, RESERVES, USDC, installFakes, routeNetwork, type RelayCall } from "./fakes";

// The order panel end to end in the real components (/dev/order-bench): the fair-launch buy, the CRUX Account vs
// external-wallet funding, one-click buys and the slippage they sign, and a deposit from a wallet into the account.
// The chain, the wallet and the relay are stand-ins (e2e/fakes.ts); what the page signs and sends is checked as the
// relay or the wallet would receive it.

const FLOOR = BigInt(10) ** BigInt(19);
const PROJECTED = BigInt(2) * FLOOR;

const TRADE_TYPES = {
  Trade: [
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "tokenOut", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "fillDeadline", type: "uint32" },
    { name: "batchWindow", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** A buy of `usdc` (6 decimals) from the pool: tokens out before fees, as the panel quotes it (constant product). */
const quoteOut = (usdc: bigint) => (usdc * BigInt(997) * RESERVES.token) / (RESERVES.usdc * BigInt(1000) + usdc * BigInt(997));

async function open(page: Page, scenario: string, o: Parameters<typeof installFakes>[1] = {}) {
  await installFakes(page, o);
  const posted = await routeNetwork(page);
  await page.goto(`/dev/order-bench?scenario=${scenario}`);
  return posted;
}

async function trades(posted: RelayCall[], n: number) {
  await expect.poll(() => posted.filter((p) => p.path === "/v1/account/trade").length, { timeout: 10_000 }).toBe(n);
  return posted.filter((p) => p.path === "/v1/account/trade");
}

test.describe("fair-launch opening", () => {
  test("one amount, one Buy (Fair Launch) button; the max price is set for you (10x projected)", async ({ page }) => {
    await open(page, "open");
    const panel = page.getByRole("region", { name: "Fair launch" });
    await expect(panel.getByRole("heading", { name: "Fair launch" })).toBeVisible();
    // No auction jargon on the primary path.
    expect(await panel.innerText()).not.toMatch(/\bbid\b/i);
    await panel.getByLabel("Amount in USDC").fill("25");
    await panel.getByRole("button", { name: /^Buy \(Fair Launch\)/ }).first().click();
    await expect.poll(() => page.evaluate(() => window.__benchOrders!.length)).toBe(1);
    const order = await page.evaluate(() => window.__benchOrders![0]);
    expect(order).toEqual({ kind: "deposit", amount: String(25e6), maxPrice: (PROJECTED * BigInt(10)).toString() });
    await expect(panel.getByText(/Locked in the opening batch: \$25\.00 committed/)).toBeVisible();
  });

  test("the opening pot shows what's committed, how many buyers, the implied market cap and the countdown", async ({ page }) => {
    await open(page, "open");
    const pot = page.getByRole("group", { name: "Opening pot" });
    await expect(pot).toBeVisible();
    // The bench's auction: $6,000 from 3 buyers toward a $10,000 target, about 3 minutes left.
    await expect(pot.getByLabel("$6,000.00 committed")).toBeVisible();
    await expect(pot.getByText("3", { exact: true })).toBeVisible();
    await expect(pot.getByText("$4,000 more", { exact: true })).toBeVisible();
    await expect(pot.getByText(/opens in/)).toBeVisible();
    // $6,000 in the first 2 minutes with 3 left: on pace to pass $10,000.
    await expect(pot.getByText(/On track: at this pace it fills/)).toBeVisible();
  });

  test("⚙️ Advanced: a buyer's own max price replaces the automatic one", async ({ page }) => {
    await open(page, "open");
    const panel = page.getByRole("region", { name: "Fair launch" });
    await expect(panel.getByRole("button", { name: /Set my own max price/ })).toHaveCount(0);
    await panel.getByRole("button", { name: /Advanced/ }).click();
    await panel.getByRole("button", { name: /Set my own max price/ }).click();
    await panel.getByLabel("Max price per token").fill("0.00005");
    await panel.getByLabel("Amount in USDC").fill("40");
    await panel.getByRole("button", { name: /^Buy \(Fair Launch\)/ }).first().click();
    await expect.poll(() => page.evaluate(() => window.__benchOrders!.length)).toBe(1);
    const order = await page.evaluate(() => window.__benchOrders![0]);
    // $0.00005 per token, in the factory's 24-decimal price units.
    expect(order.maxPrice).toBe((BigInt(5) * BigInt(10) ** BigInt(19)).toString());
    expect(order.amount).toBe(String(40e6));
  });
});

test.describe("fair-launch opening from the CRUX Account", () => {
  test("the account queues a buy at open: a standing buy whose trigger is the automatic max price", async ({ page }) => {
    const posted = await open(page, "open", { account: true });
    const panel = page.getByRole("region", { name: "Fair launch" });
    await expect(panel.getByRole("radio", { name: "CRUX Account" })).toHaveAttribute("aria-checked", "true");
    await panel.getByLabel("Amount in USDC").fill("25");
    await panel.getByRole("button", { name: /^Buy at open · CRUX Account/ }).first().click();
    await expect.poll(() => posted.filter((p) => p.path === "/v1/standing").length).toBe(1);
    const { order } = posted.find((p) => p.path === "/v1/standing")!.body as { order: Record<string, string | number> };
    expect(Number(order.kind)).toBe(1);
    expect(String(order.amountIn)).toBe(String(25e6));
    // 10x projected, from the factory's 24-decimal price units to the order's 18.
    expect(Number(order.triggerPrice) / Number((PROJECTED * BigInt(10)) / BigInt(10) ** BigInt(6))).toBeCloseTo(1, 6);
    expect(await page.evaluate(() => window.__benchOrders!.length)).toBe(0);
    await expect(panel.getByText(/Queued: \$25\.00 from your CRUX Account/)).toBeVisible();
  });

  test("before the opening starts, the account can already queue its buy at open; the wallet waits for the countdown", async ({ page }) => {
    const posted = await open(page, "scheduled", { account: true });
    const section = page.getByRole("region", { name: "Buy at open" });
    await expect(page.getByText("Deposits open in 2 minutes.")).toBeVisible();
    await expect(section.getByRole("radio", { name: "Wallet" })).toBeDisabled();
    await section.getByLabel("Amount in USDC").fill("10");
    await section.getByRole("button", { name: /^Buy at open · CRUX Account/ }).first().click();
    await expect.poll(() => posted.filter((p) => p.path === "/v1/standing").length).toBe(1);
    const { order } = posted.find((p) => p.path === "/v1/standing")!.body as { order: Record<string, string | number> };
    expect(String(order.amountIn)).toBe(String(10e6));
  });

  test("before the opening starts, a visitor without an account sees only when deposits open", async ({ page }) => {
    await open(page, "scheduled");
    await expect(page.getByText("Deposits open in 2 minutes.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Buy at open" })).toHaveCount(0);
  });

  test("the wallet is one tap away and pays into the opening auction as before", async ({ page }) => {
    await open(page, "open", { account: true });
    const panel = page.getByRole("region", { name: "Fair launch" });
    await panel.getByRole("radio", { name: "Wallet" }).click();
    await panel.getByLabel("Amount in USDC").fill("25");
    await panel.getByRole("button", { name: /^Buy \(Fair Launch\)/ }).first().click();
    await expect.poll(() => page.evaluate(() => window.__benchOrders!.length)).toBe(1);
  });
});

test.describe("trading from the CRUX Account", () => {
  test("the CRUX Account is the default; external wallets are one tap away and back", async ({ page }) => {
    await open(page, "trade", { account: true });
    const account = page.getByRole("radio", { name: /CRUX Account/ });
    await expect(account).toHaveAttribute("aria-checked", "true");
    await expect(account).toContainText("($250.00)");
    await expect(account).toContainText("Instant • 0 Gas");
    // The chain picker stays tucked away until asked for.
    await expect(page.getByRole("radiogroup", { name: /Pay from/i })).toHaveCount(0);
    await page.getByRole("button", { name: /Or pay directly from external wallet/ }).click();
    await expect(account).toHaveAttribute("aria-checked", "false");
    const chains = page.getByRole("radiogroup", { name: /Pay from/i });
    for (const name of ["Base", "Arbitrum", "Ethereum", "BNB Chain", "Solana"]) await expect(chains.getByRole("radio", { name: new RegExp(`^${name}`) })).toBeVisible();
    await account.click();
    await expect(account).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radiogroup", { name: /Pay from/i })).toHaveCount(0);
  });

  test("a quick size buys in one click, signed by the login key with the default 10% slippage", async ({ page }) => {
    const posted = await open(page, "trade", { account: true });
    await page.getByRole("button", { name: /^\$10\b/ }).first().click();
    const [t] = await trades(posted, 1);
    const trade = t.body.trade as Record<string, string | number>;
    expect(getAddress(trade.tokenIn as string)).toBe(getAddress(USDC));
    expect(trade.amountIn).toBe(String(10e6));
    // The signed floor: the quote (less the 0.3% Crux spread) minus 10%, so at most 90% of the raw quote.
    const min = BigInt(trade.minAmountOut);
    const raw = quoteOut(BigInt(10e6));
    expect(min).toBeLessThanOrEqual((raw * BigInt(90)) / BigInt(100));
    expect(min).toBeGreaterThan((raw * BigInt(88)) / BigInt(100));
    // Signed by the account's login key, for this account.
    const signer = await recoverTypedDataAddress({
      domain: { name: "CruxAccount", version: "1", chainId: 84532, verifyingContract: ACCOUNT },
      types: TRADE_TYPES,
      primaryType: "Trade",
      message: {
        tokenIn: trade.tokenIn as Hex,
        amountIn: BigInt(trade.amountIn),
        tokenOut: String(trade.tokenOut),
        minAmountOut: min,
        fillDeadline: Number(trade.fillDeadline),
        batchWindow: Number(trade.batchWindow),
        nonce: BigInt(trade.nonce),
        deadline: BigInt(trade.deadline),
      },
      signature: t.body.signature as Hex,
    });
    expect(signer).toBe(OWNER);
    expect(getAddress(t.body.owner as string)).toBe(OWNER);
  });

  test("slippage set to 20% is what the next order signs", async ({ page }) => {
    const posted = await open(page, "trade", { account: true });
    await page.getByRole("button", { name: /^\$10\b/ }).first().click();
    const [first] = await trades(posted, 1);
    await page.getByRole("button", { name: /^Slippage/ }).click();
    await page.getByRole("dialog", { name: "Trade settings" }).getByRole("button", { name: "20%", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Slippage/ })).toContainText("20%");
    await page.getByRole("button", { name: /^\$10\b/ }).first().click();
    const [, second] = await trades(posted, 2);
    const at10 = Number((first.body.trade as Record<string, string>).minAmountOut);
    const at20 = Number((second.body.trade as Record<string, string>).minAmountOut);
    // Same size, same pool: the floor moves from 90% to 80% of the same quote.
    expect(at20 / at10).toBeCloseTo(0.8 / 0.9, 3);
  });

  test("one-click off: a quick size only fills the box, the button places it", async ({ page }) => {
    const posted = await open(page, "trade", { account: true });
    await page.getByRole("button", { name: /^Slippage/ }).click();
    await page.getByRole("checkbox", { name: /One-click trading/ }).uncheck();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^\$20\b/ }).first().click();
    await expect(page.getByLabel(/USDC to spend/)).toHaveValue("20");
    await page.waitForTimeout(500);
    expect(posted.filter((p) => p.path === "/v1/account/trade")).toHaveLength(0);
    await page.getByRole("button", { name: /Buy now · CRUX Account/ }).first().click();
    const [t] = await trades(posted, 1);
    expect((t.body.trade as Record<string, string>).amountIn).toBe(String(20e6));
  });

  test("in the protection window the account's buy reads Buy (Fair Launch); the wallet batch is under Advanced", async ({ page }) => {
    const posted = await open(page, "protected", { account: true, protected: true });
    await expect(page.getByRole("heading", { name: "Fair launch" })).toBeVisible();
    await page.getByLabel(/USDC to spend/).fill("15");
    await page.getByRole("button", { name: /^Buy \(Fair Launch\)/ }).first().click();
    const [t] = await trades(posted, 1);
    expect((t.body.trade as Record<string, string>).amountIn).toBe(String(15e6));
    await page.getByRole("button", { name: /Advanced: join the batch straight from a wallet/ }).click();
    await expect(page.getByRole("button", { name: /Back to the simple buy/ })).toBeVisible();
  });
});

test.describe("deposit", () => {
  test("a deposit from the connected wallet is one USDC transfer to the CRUX Account", async ({ page }) => {
    await open(page, "account", { account: true, wallet: true });
    // The deposit box for the connected wallet (the cross-chain one below has its own).
    const amount = page.locator("#deposit-amount");
    await expect(amount).toBeVisible({ timeout: 15_000 });
    await amount.fill("15");
    // The button beside that box (the input sits in its own wrapper, inside the row with the button).
    await amount.locator("xpath=ancestor::div[2]").getByRole("button", { name: "Deposit", exact: true }).click();
    await expect(page.getByText(/Deposited \$15\.00 test USDC from your wallet/)).toBeVisible({ timeout: 15_000 });
    const txs = await page.evaluate(() => (window as unknown as { __walletTxs: { to: string; data: Hex }[] }).__walletTxs);
    expect(txs).toHaveLength(1);
    expect(getAddress(txs[0].to)).toBe(getAddress(USDC));
    const { functionName, args } = decodeFunctionData({ abi: parseAbi(["function transfer(address, uint256) returns (bool)"]), data: txs[0].data });
    expect(functionName).toBe("transfer");
    expect(getAddress(args[0])).toBe(getAddress(ACCOUNT));
    expect(args[1]).toBe(BigInt(15e6));
  });
});

test.describe("launch form", () => {
  test("launch size: Small is the default and graduates with one wallet; each size sets its opening length", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^launch$/i }).first().click();
    const sizes = page.getByRole("radiogroup", { name: "Launch size" });
    await expect(sizes).toBeVisible({ timeout: 20_000 });
    const small = sizes.getByRole("radio").filter({ hasText: "Small" });
    await expect(small).toHaveAttribute("aria-checked", "true");
    await expect(small).toContainText("raises $3.00");
    await expect(small).toContainText("1+ buyer · up to $3.00 each");
    await expect(small).toContainText("60s open");
    await expect(sizes.getByRole("radio").filter({ hasText: "Community" })).toContainText("5m open");
    await expect(sizes.getByRole("radio").filter({ hasText: "Wide" })).toContainText("10m open");
    // The raw fields and the opening length appear only for Custom.
    await expect(page.getByLabel("Graduation target")).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Fair-launch protection" })).toHaveCount(0);
    await sizes.getByRole("radio").filter({ hasText: "Custom" }).click();
    await expect(page.getByLabel("Graduation target")).toHaveValue("3");
    await expect(page.getByRole("radiogroup", { name: "Fair-launch protection" })).toBeVisible();
  });
});
