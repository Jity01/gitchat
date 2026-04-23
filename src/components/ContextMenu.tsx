import { useEffect, useRef } from "react";
import { C, FONT_SANS, R, SHADOW_HI } from "../theme";

interface Props {
  x: number;
  y: number;
  label?: string;
  onDelete: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, label = "delete chat", onDelete, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      // Don't close if the interaction is inside the menu itself.
      if (rootRef.current && rootRef.current.contains(e.target as Node)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Close on ANY outside pointer interaction, not only left-click. Deferred
    // slightly so the opening event doesn't immediately dismiss. Use capture
    // phase so child handlers that call stopPropagation (e.g. node/stroke drag)
    // don't prevent the menu from closing.
    const id = setTimeout(() => {
      window.addEventListener("mousedown", h, true);
      window.addEventListener("contextmenu", h, true);
      window.addEventListener("keydown", esc);
    }, 10);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", h, true);
      window.removeEventListener("contextmenu", h, true);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: C.card,
        border: `1px solid ${C.cardBd}`,
        borderRadius: R.md,
        padding: 4,
        zIndex: 500,
        boxShadow: SHADOW_HI,
        minWidth: 140,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        onClick={onDelete}
        style={{
          padding: "8px 12px",
          borderRadius: R.sm,
          cursor: "pointer",
          fontSize: 13,
          color: C.danger,
          fontWeight: 500,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(200,118,112,0.10)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {label}
      </div>
    </div>
  );
}
