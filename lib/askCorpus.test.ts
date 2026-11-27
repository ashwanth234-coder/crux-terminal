import { test } from "node:test";
import assert from "node:assert/strict";
import { readMessage } from "./commandChat.ts";
import { CORPUS } from "./askCorpus.ts";

test("Ask Crux reads everyday ways of typing (the corpus)", () => {
  const misses: string[] = [];
  for (const c of CORPUS) {
    const r = readMessage(c.say, undefined, c.last);
    if (!c.want(r)) misses.push(`"${c.say}" → ${JSON.stringify(r).slice(0, 140)} (should be: ${c.means})`);
  }
  if (process.env.CORPUS_REPORT) console.log(`${CORPUS.length - misses.length}/${CORPUS.length} read right\n${misses.join("\n")}`);
  assert.deepEqual(misses, []);
});
