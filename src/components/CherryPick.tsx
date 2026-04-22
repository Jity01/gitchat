import { useState } from "react";
import { C, FONT_MONO, FONT_SANS, MODE, R, SHADOW_HI } from "../theme";
import type { Message } from "../types";
import { truncate } from "../lib/format";

interface Props {
  messages: Message[];
  onDone: (indices: number[]) => void;
  onClose: () => void;
}

export function CherryPick({ messages, onDone, onClose }: Props) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
  const PK = MODE.CHERRY_PICK.color;

  const toggle = (i: number) => {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  return (
    <div
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
      onMouseUp={() => {
        setDragStart(null);
        setMoved(false);
      }}
    >
      <div
        style={{
          width: 560,
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          background: C.card,
          borderRadius: R.lg,
          overflow: "hidden",
          boxShadow: SHADOW_HI,
          border: `1px solid ${C.cardBd}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: `1px solid ${C.cardBd}`,
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>
              {MODE.CHERRY_PICK.icon} cherry pick
            </div>
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
              click to toggle · drag to range-select · {sel.size} picked
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {sel.size > 0 && (
              <button
                onClick={() => setSel(new Set())}
                style={btn(C.textMut, "transparent", C.cardBd)}
              >
                clear
              </button>
            )}
            <button
              onClick={() =>
                onDone(Array.from(sel).sort((a, b) => a - b))
              }
              disabled={!sel.size}
              style={{
                ...btn(sel.size ? "#fff" : C.textDim, sel.size ? PK : C.bgDeep, sel.size ? PK : C.cardBd),
                cursor: sel.size ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              add {sel.size}
            </button>
            <button onClick={onClose} style={btn(C.textMut, "transparent", C.cardBd)}>
              ✕
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {messages.map((m, i) => {
            const picked = sel.has(i);
            return (
              <div
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDragStart(i);
                  setMoved(false);
                }}
                onMouseEnter={() => {
                  if (dragStart === null) return;
                  if (i !== dragStart) setMoved(true);
                  const lo = Math.min(dragStart, i);
                  const hi = Math.max(dragStart, i);
                  setSel((p) => {
                    const n = new Set(p);
                    for (let j = lo; j <= hi; j++) n.add(j);
                    return n;
                  });
                }}
                onMouseUp={() => {
                  if (!moved && dragStart === i) toggle(i);
                  setDragStart(null);
                  setMoved(false);
                }}
                style={{
                  padding: "10px 18px",
                  borderBottom: `1px solid ${C.cardBd}`,
                  cursor: "pointer",
                  userSelect: "none",
                  background: picked ? PK + "0f" : "transparent",
                  borderLeft: `3px solid ${picked ? PK : "transparent"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: m.role === "user" ? C.accent : C.textMut,
                      fontFamily: FONT_MONO,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    {m.role === "user" ? "you" : "assistant"}
                  </div>
                  {picked && (
                    <div style={{ fontSize: 10, color: PK, fontFamily: FONT_MONO, fontWeight: 700 }}>✓</div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: picked ? C.text : C.textMut,
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    marginTop: 3,
                  }}
                >
                  {truncate(m.content, 220)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function btn(color: string, bg: string, border: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: `1px solid ${border}`,
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontFamily: FONT_SANS,
    cursor: "pointer",
  };
}
