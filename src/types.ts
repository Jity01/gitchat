import type { ModeKey, ModelId, PermissionMode } from "./theme";

export type Role = "user" | "assistant";

/** Anthropic-style content block. Plain chats only carry `text` blocks
 *  (or just rely on `Message.content`); claude-code chats carry tool_use
 *  and tool_result blocks alongside text. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export interface Message {
  role: Role;
  content: string;
  /** Present for code-mode messages; rendered as collapsible cards. */
  blocks?: ContentBlock[];
  /** True while a code-mode assistant turn is still streaming. */
  streaming?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  x: number;
  y: number;
  model: ModelId;
  messages: Message[];
  cwd?: string; // only for claude-code chats
  permissionMode?: PermissionMode; // only for claude-code chats
  /** Session id captured from the first claude turn; used for --resume. */
  agentSessionId?: string;
  updatedAt: number; // ms epoch
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  mode: ModeKey;
  indices?: number[]; // for CHERRY_PICK
}

/** Freehand ink stroke in canvas coordinates (pre-pan). */
export interface Stroke {
  id: string;
  d: string; // SVG path data in its own local frame
  color: string;
  width: number;
  /** Translate offset (allows moving the stroke without rewriting its path). */
  tx?: number;
  ty?: number;
}

/** Text annotation floated on the canvas (pre-pan). */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  /** Width in pixels; auto-sized if omitted. */
  width?: number;
}

export type CanvasTool = "select" | "pen" | "text";
