/* deep cream · kraft · warm brown — echoes the terminal palette */
export const C = {
  bg: "#e4d4ad",         // deep kraft canvas
  bgDeep: "#d8c79b",     // sunken / hover
  grid: "#c9b789",       // dot grid on canvas
  card: "#ecdcb9",       // paper — slightly lighter than bg for elevation
  cardAlt: "#d9c99d",    // empty-card tint / pseudo block
  cardBd: "#b89f6e",     // rich tan border
  cardBdHi: "#9a8253",   // hover border
  text: "#2e251b",       // deep brown
  textMut: "#5f4f33",    // secondary
  textDim: "#8e7c55",    // tertiary
  accent: "#b77a3c",     // amber
  accentSoft: "rgba(183,122,60,0.14)",
  accentBd: "rgba(183,122,60,0.36)",
  success: "#7a9a5f",    // sage
  danger: "#c87670",     // dusty rose
  codeBg: "#2a241c",
  codeText: "#f0e7d6",
  panel: "#ecdcb9",
};

export const MODE = {
  SUMMARY: { label: "summary", color: "#7a9a5f", icon: "~", desc: "compressed recap" },
  DETAILED: { label: "detailed", color: "#6b8db5", icon: "≡", desc: "bullets & structure" },
  CHERRY_PICK: { label: "cherry pick", color: "#c47d8a", icon: "✂", desc: "hand-picked messages" },
  FULL: { label: "full inherit", color: "#9a8566", icon: "∞", desc: "everything, verbatim" },
} as const;
export type ModeKey = keyof typeof MODE;

export const MODELS = [
  {
    id: "sonnet",
    label: "claude sonnet 4.6",
    color: "#6b8db5",
    kind: "plain" as const,
    contextWindow: 200_000,
  },
  {
    id: "opus",
    label: "claude opus 4.7",
    color: "#8d6ba5",
    kind: "plain" as const,
    contextWindow: 200_000,
  },
  {
    id: "code",
    label: "claude code",
    color: "#b77a3c",
    kind: "code" as const,
    contextWindow: 200_000,
  },
];
export type ModelId = (typeof MODELS)[number]["id"];

export type PermissionMode = "plan" | "accept" | "bypass";
export const PERMISSION_MODES: { id: PermissionMode; label: string; desc: string }[] = [
  { id: "plan", label: "plan", desc: "propose changes before acting" },
  { id: "accept", label: "accept edits", desc: "auto-approve file edits" },
  { id: "bypass", label: "bypass", desc: "run any tool without asking" },
];

/* grid & node sizing */
export const CELL = 60;
export const NODE_W = 240;
export const NODE_H = 120;

/* typography */
export const FONT_SANS =
  "'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

/* radii + shadow — warm diffuse */
export const R = { sm: 8, md: 12, lg: 16 };
export const SHADOW =
  "0 1px 1px rgba(46,37,27,0.05), 0 4px 16px rgba(46,37,27,0.06)";
export const SHADOW_HI =
  "0 2px 4px rgba(46,37,27,0.07), 0 12px 32px rgba(46,37,27,0.10)";

export const snapR = (v: number) => Math.round(v / CELL) * CELL;
export const snapF = (v: number) => Math.floor(v / CELL) * CELL;
