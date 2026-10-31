import assert from "node:assert/strict";
import test from "node:test";
import { imageDataUri, parseTokenMeta } from "./tokenMeta.ts";

const meta = (o: object) => `data:application/json;base64,${Buffer.from(JSON.stringify(o)).toString("base64")}`;
const WEBP = "data:image/webp;base64,UklGRhYAAABXRUJQVlA4IAoAAAAwAQCdASoBAAEAAA==";

test("an uploaded display image (small PNG/JPEG/WebP data URI) is kept", () => {
  assert.equal(parseTokenMeta(meta({ image: WEBP })).image, WEBP);
  assert.equal(imageDataUri(WEBP.replace("webp", "png")), WEBP.replace("webp", "png"));
});

test("https images still work; SVG, oversized or malformed data URIs are dropped", () => {
  assert.equal(parseTokenMeta(meta({ image: "https://example.com/a.png" })).image, "https://example.com/a.png");
  assert.equal(parseTokenMeta(meta({ image: "http://example.com/a.png" })).image, null);
  assert.equal(imageDataUri("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), null);
  assert.equal(imageDataUri(`data:image/png;base64,${"A".repeat(40_000)}`), null);
  assert.equal(imageDataUri('data:image/png;base64,AAAA"onerror="x'), null);
});

test("launches without Farcaster still parse, and older Farcaster links still show", () => {
  assert.equal(parseTokenMeta(meta({ links: { x: "@crux", website: "https://crux.example" } })).links.farcaster, null);
  assert.equal(parseTokenMeta(meta({ links: { farcaster: "@crux" } })).links.farcaster, "https://farcaster.xyz/crux");
});

test("Telegram and GitHub take a handle or a link; launches without them show none", () => {
  const links = parseTokenMeta(meta({ links: { telegram: "@cruxchat", github: "crux-labs" } })).links;
  assert.equal(links.telegram, "https://t.me/cruxchat");
  assert.equal(links.github, "https://github.com/crux-labs");
  assert.equal(parseTokenMeta(meta({ links: { github: "https://github.com/crux-labs/app" } })).links.github, "https://github.com/crux-labs/app");
  assert.equal(parseTokenMeta(meta({ links: { telegram: "javascript:alert(1)" } })).links.telegram, null);
  assert.equal(parseTokenMeta(meta({ links: { x: "@crux" } })).links.github, null);
});
