import type { ModeKey, ModelId, PermissionMode } from "./theme";

export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
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
