import { useEffect } from "react";
import { C, FONT_SANS, R, SHADOW_HI } from "../theme";

interface Props {
  x: number;
  y: number;
  label?: string;
  onDelete: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, label = "delete chat", onDelete, onClose }: Props) {
  useEffect(() => {
    const h = () => onClose();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Close on ANY outside pointer interaction, not only left-click. Deferred
    // slightly so the opening event doesn't immediately dismiss.
    const id = setTimeout(() => {
      window.addEventListener("mousedown", h);
      window.addEventListener("contextmenu", h);
      window.addEventListener("keydown", esc);
    }, 10);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", h);
      window.removeEventListener("contextmenu", h);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
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
