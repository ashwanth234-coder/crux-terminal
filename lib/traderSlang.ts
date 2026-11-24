/**
 * Trader slang → the plain commands Ask Crux already reads (docs/superpowers/specs/2026-11-24-ask-crux-coach-design.md,
 * "Trader slang"). Hand-written rewrites, one test each, no AI. A rewrite only fires when the slang word is followed by
 * what it acts on (an amount, "half", a coin), so a coin really called SEND or MOON is never mistaken for slang.
 * Whatever it becomes still lands on the confirm card, in plain words: slang never skips confirm.
 */
import type { CommandChain } from "./commandIntent.ts";

export const DCA_NOT_YET = "Crux can't spread a buy over time yet. Try one buy, like “buy $20 of BONK”.";

export type Deslanged = {
  text: string;
  /** "take initials on X": sell enough of X to get back what was put in (needs the trader's entry, so the page works it out). */
  initials?: { coin: string; chain?: CommandChain };
  /** Slang for something Crux can't do yet: say so plainly. */
  notYet?: string;
};

const CHAINS: Record<string, CommandChain> = { base: "base", solana: "solana", sol: "solana", bnb: "bnb", bsc: "bnb" };
const AMOUNT = String.raw`\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(?:usd[ct]?|dollars?|bucks)?`;
/** Whole-message rewrites, tried in order; the first that matches wins. */
const WHOLE: [RegExp, (m: RegExpMatchArray) => string][] = [
  [new RegExp(String.raw`^(?:ape|aping|aped|send(?:\s+it)?|sending)[,\s]+(?:in\s+)?${AMOUNT}\s+(?:into|in|on|of)\s+(.+)$`, "i"), (m) => `buy $${m[1]} of ${m[2]}`],
  [/^(?:dump|trim|sell)\s+half\s+(?:of\s+)?(?:my\s+)?(.+)$/i, (m) => `sell half of ${m[1]}`],
  [/^(?:leave|keep)\s+(?:me\s+)?(?:a\s+)?moon\s?bag\s+(?:on|of|in)\s+(?:my\s+)?(.+)$/i, (m) => `sell 85% of ${m[1]}`],
  [/^(?:dump|cut|exit|paper\s?hand|jeet)\s+(?:all\s+)?(?:of\s+)?(?:my\s+)?(.+)$/i, (m) => `sell all ${m[1]}`],
  [/^trim\s+(?:my\s+)?(.+)$/i, (m) => `sell 25% of ${m[1]}`],
  [/^is\s+(\S+)\s+(?:rugging|a\s+rug|rugged|dead)\??$/i, (m) => m[1]],
  [/^(?:is\s+)?the\s+dev\s+(?:dumping|selling)\s+(?:on\s+)?(\S+)\??$/i, (m) => m[1]],
];

export function deslang(raw: string): Deslanged {
  const s = raw.trim();
  if (/^dca\b/i.test(s)) return { text: s, notYet: DCA_NOT_YET };
  const init = s.match(/^(?:take|pull|get)\s+(?:out\s+)?(?:my\s+)?initials?\s+(?:on|from|out\s+of|of|in)\s+\$?([A-Za-z0-9]+)(?:\s+on\s+(base|solana|sol|bnb|bsc))?\??$/i);
  if (init) return { text: s, initials: { coin: init[1], ...(init[2] ? { chain: CHAINS[init[2].toLowerCase()] } : {}) } };
  let text = s;
  for (const [re, to] of WHOLE) {
    const m = text.match(re);
    if (m) {
      text = to(m);
      break;
    }
  }
  // Inline shorthand anywhere in a command: "sl 20" / "sl -15%" → stop loss, "tp 2x" → take profit.
  text = text.replace(/\bsl\s*-?\s*(\d+(?:\.\d+)?)\s*%?(?=\s|$)/gi, "stop loss $1%").replace(/\btp\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*x\b/gi, "take profit at $1x");
  return { text };
}
