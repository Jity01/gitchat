import { C, FONT_MONO, FONT_SANS, MODE, R, SHADOW_HI } from "../theme";
import type { ModeKey } from "../theme";
import type { Chat } from "../types";
import { genDetailed, genSummary } from "../lib/context";

interface Props {
  mode: ModeKey;
  src: Chat;
  indices?: number[];
  onClose: () => void;
}

export function CtxPreview({ mode, src, indices, onClose }: Props) {
  let content = "";
  if (mode === "SUMMARY") content = genSummary(src.messages);
  else if (mode === "DETAILED") content = genDetailed(src.messages);
  else if (mode === "CHERRY_PICK") {
    content = (indices || [])
      .map((i) => src.messages[i])
      .filter(Boolean)
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n---\n\n");
  } else {
    content = src.messages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n---\n\n");
  }
  const m = MODE[mode];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,36,28,0.32)",
        backdropFilter: "blur(6px)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580,
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          background: C.card,
          border: `1px solid ${C.cardBd}`,
          borderRadius: R.lg,
          overflow: "hidden",
          boxShadow: SHADOW_HI,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${C.cardBd}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: m.color + "18",
                  color: m.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {m.icon}
              </div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{m.label}</div>
            </div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 3 }}>
              from "{src.title}"
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: C.textMut,
              border: `1px solid ${C.cardBd}`,
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: FONT_SANS,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", background: C.bgDeep }}>
          <pre
            style={{
              fontSize: 12.5,
              color: C.text,
              fontFamily: FONT_MONO,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              margin: 0,
            }}
          >
            {content || "(empty)"}
          </pre>
        </div>
      </div>
    </div>
  );
}
