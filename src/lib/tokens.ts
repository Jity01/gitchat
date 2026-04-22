import type { Chat, Edge } from "../types";
import { genDetailed, genSummary } from "./context";

/** Rough char→token heuristic (Anthropic tokenizer averages ~4 chars/token). */
export function estTokens(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/**
 * Estimate the total tokens that the next request in this chat will consume:
 * inbound-edge snapshots + the existing message history.
 *
 * We deliberately don't include the user's pending draft or the next reply —
 * this reflects "how full is the context right now."
 */
export function estChatContextTokens(
  chat: Chat,
  edges: Edge[],
  allChats: Chat[],
): number {
  let total = 0;
  // Inbound edge snapshots
  for (const e of edges) {
    if (e.to !== chat.id) continue;
    const src = allChats.find((c) => c.id === e.from);
    if (!src) continue;
    if (e.mode === "SUMMARY") total += estTokens(genSummary(src.messages));
    else if (e.mode === "DETAILED") total += estTokens(genDetailed(src.messages));
    else if (e.mode === "CHERRY_PICK") {
      const idxs = e.indices || [];
      for (const i of idxs) {
        const m = src.messages[i];
        if (m) total += estTokens(m.content);
      }
    } else {
      // FULL
      for (const m of src.messages) total += estTokens(m.content);
    }
  }
  // Chat's own messages
  for (const m of chat.messages) total += estTokens(m.content);
  return total;
}
