import { C, FONT_SANS, R, SHADOW } from "../theme";
import type { CanvasTool } from "../types";

export const INK_COLORS = [
  "#b77a3c", // amber (default)
  "#7a9a5f", // sage
  "#6b8db5", // dusty blue
  "#c47d8a", // rose
  "#8e7c55", // muted walnut
];

interface Props {
  tool: CanvasTool;
  onToolChange: (t: CanvasTool) => void;
  color: string;
  onColorChange: (c: string) => void;
  onImport: () => void;
}

export function CanvasTools({ tool, onToolChange, color, onColorChange, onImport }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 4,
        background: C.card,
        border: `1px solid ${C.cardBd}`,
        borderRadius: R.md,
        boxShadow: SHADOW,
        zIndex: 30,
        fontFamily: FONT_SANS,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <ToolButton
        active={tool === "select"}
        title="select & pan"
        onClick={() => onToolChange("select")}
      >
        ⌂
      </ToolButton>
      <ToolButton
        active={tool === "pen"}
        title="draw freehand"
        onClick={() => onToolChange("pen")}
      >
        ✎
      </ToolButton>
      <ToolButton
        active={tool === "text"}
        title="add text"
        onClick={() => onToolChange("text")}
      >
        T
      </ToolButton>

      <Divider />

      {/* color swatches */}
      {INK_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onColorChange(c)}
          title={c}
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${color === c ? C.text : "transparent"}`,
            background: c,
            cursor: "pointer",
            padding: 0,
            transition: "border-color 0.15s, transform 0.1s",
            transform: color === c ? "scale(1.05)" : "scale(1)",
          }}
        />
      ))}

      <Divider />

      <button
        onClick={onImport}
        title="import a conversation by pasting it"
        style={{
          fontSize: 11.5,
          fontFamily: FONT_SANS,
          fontWeight: 500,
          color: C.text,
          background: "transparent",
          border: "none",
          borderRadius: 6,
          padding: "4px 10px",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        import chat
      </button>
    </div>
  );
}

function ToolButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28,
        height: 26,
        border: "none",
        background: active ? C.bgDeep : "transparent",
        color: active ? C.text : C.textMut,
        fontSize: 14,
        fontFamily: FONT_SANS,
        fontWeight: 600,
        cursor: "pointer",
        borderRadius: 6,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = C.bgDeep;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: C.cardBd,
        margin: "0 3px",
        flexShrink: 0,
      }}
    />
  );
}
