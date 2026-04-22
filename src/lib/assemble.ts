import type { Chat, Edge } from "../types";
import { MODE } from "../theme";
import { genDetailed, genSummary } from "./context";

/**
 * Build the system prompt for a chat by assembling all inbound edge snapshots
 * into one block. Returns an empty string if there are no inbound edges (and
 * no persona/system baked in).
 */
export function buildSystemPrompt(
  chat: Chat,
  edges: Edge[],
  allChats: Chat[],
): string {
  const inbound = edges.filter((e) => e.to === chat.id);
  if (!inbound.length) return "";

  const blocks: string[] = [
    "You have received the following context from upstream conversations. Treat each block as prior knowledge informing the current chat — don't explicitly quote it unless the user asks about it.",
    "",
  ];

  for (const e of inbound) {
    const src = allChats.find((c) => c.id === e.from);
    const srcTitle = src?.title || "(deleted)";
    const mode = MODE[e.mode];
    blocks.push(`--- ${mode.label.toUpperCase()} — from "${srcTitle}" ---`);

    if (!src) {
      blocks.push("(source chat deleted; edge snapshot unavailable)");
      blocks.push("");
      continue;
    }

    if (e.mode === "SUMMARY") {
      blocks.push(genSummary(src.messages));
    } else if (e.mode === "DETAILED") {
      blocks.push(genDetailed(src.messages));
    } else if (e.mode === "CHERRY_PICK") {
      const idxs = e.indices || [];
      const picked = idxs.map((i) => src.messages[i]).filter(Boolean);
      blocks.push(
        picked.map((m) => `[${m.role}] ${m.content}`).join("\n\n---\n\n"),
      );
    } else {
      // FULL
      blocks.push(
        src.messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n---\n\n"),
      );
    }
    blocks.push("");
  }

  return blocks.join("\n");
}
