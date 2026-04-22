import { useEffect, useRef } from "react";
import { C, FONT_SANS, MODE, R, SHADOW_HI } from "../theme";
import type { ModeKey } from "../theme";

interface Props {
  pos: { x: number; y: number };
  sourceTitle: string;
  onPick: (k: ModeKey) => void;
  onClose: () => void;
}

const KEYS: ModeKey[] = ["SUMMARY", "DETAILED", "CHERRY_PICK", "FULL"];

export function ModeModal({ pos, sourceTitle, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) onPick(KEYS[n - 1]);
    };
    const id = setTimeout(() => {
      window.addEventListener("mousedown", down);
      window.addEventListener("keydown", key);
    }, 10);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, onPick]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        background: C.card,
        border: `1px solid ${C.cardBd}`,
        borderRadius: R.md,
        padding: 6,
        zIndex: 200,
        boxShadow: SHADOW_HI,
        width: 280,
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ padding: "8px 10px 4px", fontSize: 11, color: C.textMut }}>
        transfer from <span style={{ color: C.text, fontWeight: 500 }}>{sourceTitle}</span>
      </div>
      <div style={{ padding: "0 10px 6px", fontSize: 11, color: C.textDim }}>
        how should context carry?
      </div>
      {KEYS.map((k, i) => {
        const m = MODE[k];
        return (
          <div
            key={k}
            onClick={() => onPick(k)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: R.sm,
              cursor: "pointer",
              marginBottom: 1,
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: m.color + "15",
                color: m.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {m.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.label}</div>
              <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.3 }}>{m.desc}</div>
            </div>
            <div
              style={{
                fontSize: 10,
                color: C.textDim,
                fontFamily: "'JetBrains Mono', monospace",
                padding: "2px 5px",
                border: `1px solid ${C.cardBd}`,
                borderRadius: 4,
              }}
            >
              {i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}
