import { test } from "node:test";
import assert from "node:assert/strict";
import { coinLinks, launchpadOf, safeLink } from "./coinLinks.ts";

test("safeLink: only https links, nothing else gets a link", () => {
  assert.equal(safeLink("https://polymarket.com/perps"), "https://polymarket.com/perps");
  assert.equal(safeLink("http://example.com"), null);
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("  "), null);
  assert.equal(safeLink(undefined), null);
  assert.equal(safeLink(`https://a.com/${"x".repeat(600)}`), null, "absurdly long");
});

test("coinLinks: Jupiter's links first, DexScreener's fill the gaps, each kind once", () => {
  const jup = { website: "https://polymarket.com/perps/commodities", twitter: "https://x.com/bat0n336/status/2126320953902641466" };
  const dex = {
    websites: [{ label: "Website", url: "https://other.example" }],
    socials: [
      { type: "twitter", url: "https://x.com/someone" },
      { type: "telegram", url: "https://t.me/coin" },
      { type: "discord", url: "javascript:bad()" },
    ],
  };
  assert.deepEqual(coinLinks(jup, dex), [
    { kind: "website", label: "Website", url: "https://polymarket.com/perps/commodities" },
    { kind: "x", label: "X", url: "https://x.com/bat0n336/status/2126320953902641466" },
    { kind: "telegram", label: "Telegram", url: "https://t.me/coin" },
  ]);
  assert.deepEqual(coinLinks(null, null), []);
  assert.deepEqual(coinLinks(null, { socials: [{ type: "discord", url: "https://discord.gg/abc" }] }), [{ kind: "discord", label: "Discord", url: "https://discord.gg/abc" }]);
});

test("launchpadOf: the launchpad a coin came from, only when it's known", () => {
  assert.equal(launchpadOf({ network: "solana", token: "39nuVgw8RCVC8PgGuuuaa8WoAERA61cTw85oUvBLT2va", jupiter: "pump.fun" }), "pump.fun");
  assert.equal(launchpadOf({ network: "solana", token: "Abc123pump" }), "pump.fun", "pump.fun mints end in pump");
  assert.equal(launchpadOf({ network: "solana", token: "Abc123bonk" }), "LetsBonk");
  assert.equal(launchpadOf({ network: "solana", token: "Abc123", dexId: "pumpfun" }), "pump.fun");
  assert.equal(launchpadOf({ network: "base", token: "0x0C959d32561DBC20FDaBd136220e177f7Bab5aFE" }), "Crux");
  assert.equal(launchpadOf({ network: "bsc", token: "0xabc", dexId: "fourmeme" }), "four.meme");
  assert.equal(launchpadOf({ network: "bsc", token: "0x1234567890abcdef1234567890abcdef12344444" }), "four.meme");
  assert.equal(launchpadOf({ network: "base", token: "0xabc", dexId: "zora" }), "Zora");
  assert.equal(launchpadOf({ network: "base", token: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", dexId: "uniswap" }), null);
  assert.equal(launchpadOf({ network: "solana", token: "So11111111111111111111111111111111111111112", jupiter: "  " }), null);
});
