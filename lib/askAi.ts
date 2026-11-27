import type { CommandChain, CommandStep } from "./commandIntent.ts";
import type { Reply } from "./commandChat.ts";

/**
 * Ask Crux's AI (crux-solver askcrux.ts, docs/superpowers/specs/2026-11-27-ask-crux-ai.md): what the fixed patterns
 * can't read goes to the server's AI, which answers in words and with the chat's own cards. It never trades: a plan it
 * shows goes through the same confirm card as a typed command.
 */
export type AiTurn = { role: "user" | "assistant"; text: string };
export type AiCard =
  | { kind: "plan"; steps: CommandStep[] }
  | { kind: "lookup"; coin: string; chain?: CommandChain }
  | { kind: "coins"; title: string; chain: CommandChain; coins: { address: string; symbol?: string; note?: string }[] }
  | { kind: "portfolio" }
  | { kind: "trending"; chain?: CommandChain }
  | { kind: "orders" };
export type AiAnswer = { text: string; cards: AiCard[]; limited?: boolean };

/** The most turns the page keeps and sends (the server reads the last 16). */
export const AI_HISTORY = 16;

/** Whether a message goes to the AI: always once a conversation with it has started, else when the patterns miss. */
export function goesToAi(reply: Reply, inAiConversation: boolean, answeringQuestion: boolean): boolean {
  if (answeringQuestion) return false; // "How much?" → "$20": the pattern's own question, answered
  if (inAiConversation) return true;
  return reply.kind === "error" || reply.kind === "ask";
}

/** The AI's cards as the chat's replies (the same cards a typed command gets). */
export function cardsToReplies(cards: AiCard[]): Reply[] {
  return cards.map((c): Reply => (c.kind === "orders" ? { kind: "orders", cancel: false } : c));
}

/**
 * The assistant's turn as it goes back in the history: its words plus what it showed, with addresses, so a follow-up
 * ("his coins", "buy 20 of it") knows what "his" and "it" are without looking everything up again.
 */
export function assistantTurn(a: AiAnswer): string {
  const shown = a.cards.map((c) => {
    switch (c.kind) {
      case "plan":
        return `a plan to confirm: ${c.steps.map((s) => (s.kind === "wait" ? `wait ${s.seconds}s` : `${s.kind} ${s.coin}${s.chain ? ` on ${s.chain}` : ""}`)).join(", ")}`;
      case "lookup":
        return `the coin ${c.coin}${c.chain ? ` on ${c.chain}` : ""}`;
      case "coins":
        return `${c.title} (${c.chain}): ${c.coins.map((x) => `${x.symbol ?? "?"} ${x.address}`).join(", ")}`;
      default:
        return c.kind === "portfolio" ? "the trader's coins" : c.kind;
    }
  });
  return [a.text, ...(shown.length ? [`(Shown: ${shown.join("; ")})`] : [])].filter(Boolean).join("\n");
}

/** The coin open on screen, from the page's address (/sol/<mint>, /base/0x…, /bnb/0x…, /token/0x…), for "is this safe?". */
export function pageCoin(pathname: string | null): { coin: string; chain: CommandChain } | null {
  const m = pathname?.match(/^\/(sol|solana|base|bnb|token)\/([A-Za-z0-9]{20,64})(?:[/?#]|$)/);
  if (!m) return null;
  const chain: CommandChain = m[1] === "sol" || m[1] === "solana" ? "solana" : m[1] === "bnb" ? "bnb" : "base";
  return { chain, coin: m[2] };
}
