import { C, FONT_SANS } from "../theme";

export function Topbar() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        background: C.card,
        borderBottom: `1px solid ${C.cardBd}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        zIndex: 40,
        fontFamily: FONT_SANS,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
          letterSpacing: -0.2,
        }}
      >
        gitchat
      </span>
    </div>
  );
}
