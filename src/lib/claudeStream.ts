import type { ContentBlock, Message } from "../types";

export interface ClaudeReducerOutcome {
  /** Updated assistant message draft. */
  message: Message;
  /** Captured on the very first `system` event of a fresh session. */
  sessionId?: string;
  /** Set when the CLI emits its terminal `result` event. */
  done?: boolean;
  /** Reported when the CLI emits an error event we want surfaced. */
  error?: string;
}

/** Fold one stream-json event from `claude -p --output-format stream-json` into
 *  the in-flight assistant message draft. The CLI emits these top-level types:
 *
 *    - `system`     — initial handshake with `session_id` (subtype: "init")
 *    - `assistant`  — one or more content blocks (text deltas + tool_use)
 *    - `user`       — usually carries `tool_result` blocks for the agent's
 *                     own tool_use calls. We fold these into the same
 *                     assistant message so the UI groups call+result tightly.
 *    - `stream_event` — partial-message deltas (when --include-partial-messages)
 *    - `result`     — terminal event with full final transcript + usage
 */
export function reduceClaudeEvent(
  draft: Message,
  event: unknown,
): ClaudeReducerOutcome {
  if (!event || typeof event !== "object") return { message: draft };
  const ev = event as Record<string, unknown>;
  const type = typeof ev.type === "string" ? (ev.type as string) : "";

  // Always work on a copy so React state updates are detected.
  const next: Message = {
    ...draft,
    blocks: draft.blocks ? [...draft.blocks] : [],
  };

  switch (type) {
    case "system": {
      const subtype = (ev.subtype as string) || "";
      const sessionId = (ev.session_id as string) || undefined;
      if (subtype === "init" && sessionId) {
        return { message: next, sessionId };
      }
      return { message: next };
    }

    case "assistant": {
      const message = ev.message as Record<string, unknown> | undefined;
      const content = message?.content as unknown[] | undefined;
      if (Array.isArray(content)) {
        for (const block of content) appendBlock(next, block);
        next.content = textOf(next.blocks!);
      }
      return { message: next };
    }

    case "user": {
      // Tool-result turns: the CLI synthesizes a "user" message containing
      // tool_result blocks for each tool the assistant just invoked. We
      // attach these to the same assistant message so the UI can pair each
      // tool_use with its tool_result by id.
      const message = ev.message as Record<string, unknown> | undefined;
      const content = message?.content as unknown[] | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "tool_result") appendBlock(next, b);
        }
      }
      return { message: next };
    }

    case "stream_event": {
      // Partial-message deltas. We mostly already get full blocks via the
      // `assistant` events, but if a text delta arrives here we merge it
      // into the trailing text block for tighter live feedback.
      const sevent = ev.event as Record<string, unknown> | undefined;
      const stype = (sevent?.type as string) || "";
      if (stype === "content_block_delta") {
        const delta = sevent?.delta as Record<string, unknown> | undefined;
        const dtext = (delta?.text as string) || "";
        if (dtext) {
          mergeText(next, dtext);
          next.content = textOf(next.blocks!);
        }
      }
      return { message: next };
    }

    case "result": {
      // Terminal. Reconcile content from the final blocks and clear streaming.
      next.streaming = false;
      next.content = textOf(next.blocks ?? []);
      const isError = ev.is_error === true || ev.subtype === "error";
      return {
        message: next,
        done: true,
        error: isError
          ? typeof ev.result === "string"
            ? (ev.result as string)
            : "agent reported an error"
          : undefined,
      };
    }

    default:
      return { message: next };
  }
}

function appendBlock(msg: Message, raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const b = raw as Record<string, unknown>;
  const blocks = (msg.blocks ||= []);
  switch (b.type) {
    case "text": {
      const text = (b.text as string) || "";
      // Merge sequential text blocks so we don't fragment the bubble.
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") {
        last.text = last.text + text;
      } else {
        blocks.push({ type: "text", text });
      }
      return;
    }
    case "tool_use": {
      blocks.push({
        type: "tool_use",
        id: (b.id as string) || "",
        name: (b.name as string) || "",
        input: b.input,
      });
      return;
    }
    case "tool_result": {
      const content = b.content;
      const text = Array.isArray(content)
        ? content
            .map((c) => {
              if (c && typeof c === "object") {
                const cc = c as Record<string, unknown>;
                if (typeof cc.text === "string") return cc.text;
              }
              return typeof c === "string" ? c : JSON.stringify(c);
            })
            .join("\n")
        : typeof content === "string"
          ? content
          : JSON.stringify(content ?? "");
      blocks.push({
        type: "tool_result",
        tool_use_id: (b.tool_use_id as string) || "",
        content: text,
        is_error: b.is_error === true,
      });
      return;
    }
  }
}

function mergeText(msg: Message, text: string) {
  const blocks = (msg.blocks ||= []);
  const last = blocks[blocks.length - 1];
  if (last && last.type === "text") {
    last.text = last.text + text;
  } else {
    blocks.push({ type: "text", text });
  }
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}
