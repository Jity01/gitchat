import { C, FONT_SANS } from "../theme";

export interface Tab {
  id: string;
  kind: "chat" | "file";
  label: string;
  path?: string;
}

interface Props {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onDoubleClick?: (id: string) => void;
}

export function TabBar({ tabs, activeId, onSelect, onClose, onDoubleClick }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: C.card,
        borderBottom: `1px solid ${C.cardBd}`,
        fontFamily: FONT_SANS,
        minHeight: 34,
        overflowX: "auto",
      }}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            onDoubleClick={() => onDoubleClick?.(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 10px 0 14px",
              cursor: "pointer",
              borderRight: `1px solid ${C.cardBd}`,
              background: active ? C.bg : "transparent",
              borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
              fontSize: 12.5,
              color: active ? C.text : C.textMut,
              fontWeight: active ? 500 : 400,
              userSelect: "none",
              maxWidth: 220,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 10, color: C.textDim, marginRight: 2 }}>
              {t.kind === "chat" ? "✦" : "·"}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 160,
              }}
              title={t.path || t.label}
            >
              {t.label}
            </span>
            {t.kind === "file" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                aria-label="close tab"
                style={{
                  width: 16,
                  height: 16,
                  marginLeft: 4,
                  border: "none",
                  background: "transparent",
                  color: C.textDim,
                  cursor: "pointer",
                  borderRadius: 3,
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.cardBd)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
    </div>
  );
}
