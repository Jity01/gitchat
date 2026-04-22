import { useEffect, useRef, useState } from "react";
import { C, FONT_SANS, MODE, MODELS, NODE_H, NODE_W, R, SHADOW, SHADOW_HI } from "../theme";
import type { Chat, Edge } from "../types";
import { relTime, truncate } from "../lib/format";
import { ContextRing } from "./ContextRing";
import { estChatContextTokens } from "../lib/tokens";

interface Props {
  chat: Chat;
  inbound: Edge[];
  allEdges: Edge[];
  allChats: Chat[];
  isConnDragging: boolean;
  connTarget: string | null;
  justCreated: boolean;
  onDrag: (e: React.MouseEvent, id: string) => void;
  onOpen: (id: string) => void;
  onTitle: (id: string, v: string) => void;
  onHandleDown: (e: React.MouseEvent, id: string) => void;
  onCtxMenu: (e: React.MouseEvent, id: string) => void;
}

export function ChatNode(p: Props) {
  const c = p.chat;
  const [hov, setHov] = useState(false);
  const [editing, setEditing] = useState(p.justCreated);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const isTarget = p.connTarget === c.id;
  const canReceive = c.messages.length === 0;
  const isEmpty = c.messages.length === 0;
  const showHandle = hov && !p.isConnDragging && c.messages.length > 0;

  const borderColor = isTarget
    ? canReceive
      ? C.success
      : C.danger
    : hov
      ? C.cardBdHi
      : C.cardBd;
  const shadow = hov ? SHADOW_HI : SHADOW;
  const ring = isTarget
    ? `0 0 0 4px ${(canReceive ? C.success : C.danger)}1f`
    : "";

  const model = MODELS.find((m) => m.id === c.model) || MODELS[0];
  const lastAsst = [...c.messages].reverse().find((m) => m.role === "assistant");
  const snippet = lastAsst ? truncate(lastAsst.content.replace(/\n+/g, " "), 110) : "";

  return (
    <div
      onMouseDown={(e) => {
        if (editing) return;
        p.onDrag(e, c.id);
      }}
      onDoubleClick={() => {
        if (!editing) p.onOpen(c.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        p.onCtxMenu(e, c.id);
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "absolute",
        left: c.x,
        top: c.y,
        width: NODE_W,
        height: NODE_H,
        background: C.card,
        border: `1px solid ${borderColor}`,
        borderRadius: R.md,
        cursor: p.isConnDragging ? "default" : "grab",
        padding: "14px 16px",
        fontFamily: FONT_SANS,
        userSelect: "none",
        transition: "border-color 0.2s, box-shadow 0.25s, transform 0.12s",
        boxShadow: ring ? `${ring}, ${shadow}` : shadow,
        transform: hov ? "translateY(-1px)" : "none",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* inbound context indicator: top band */}
      {p.inbound.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: -1,
            height: 3,
            borderRadius: 2,
            display: "flex",
            gap: 3,
            overflow: "hidden",
          }}
        >
          {p.inbound.map((e) => (
            <div
              key={e.id}
              style={{ flex: 1, background: MODE[e.mode].color, opacity: 0.7, borderRadius: 2 }}
            />
          ))}
        </div>
      )}

      {/* title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: model.color,
            flexShrink: 0,
          }}
        />
        {editing ? (
          <input
            ref={inputRef}
            value={c.title}
            onChange={(e) => p.onTitle(c.id, e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditing(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: C.text,
              fontSize: 14,
              fontFamily: FONT_SANS,
              fontWeight: 600,
              padding: 0,
              letterSpacing: -0.1,
            }}
          />
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 600,
              color: C.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              cursor: "text",
              letterSpacing: -0.1,
            }}
          >
            {c.title || "new chat"}
          </div>
        )}
      </div>

      {/* meta row */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: C.textMut,
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span>{model.label}</span>
        <span style={{ color: C.textDim }}>·</span>
        <span>{c.messages.length ? c.messages.length + " msgs" : "empty"}</span>
        {c.messages.length > 0 && (
          <>
            <span style={{ color: C.textDim }}>·</span>
            <span>{relTime(c.updatedAt)}</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        {c.messages.length > 0 && (
          <ContextRing
            used={estChatContextTokens(c, p.allEdges, p.allChats)}
            limit={model.contextWindow}
            size={16}
            label={false}
          />
        )}
      </div>

      {/* divider + snippet */}
      {snippet && (
        <>
          <div style={{ height: 1, background: C.cardBd, marginTop: 3, opacity: 0.7 }} />
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: C.textMut,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontWeight: 400,
            }}
          >
            {snippet}
          </div>
        </>
      )}

      {/* bottom port (outgoing) — only on non-empty cards */}
      {!isEmpty && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            p.onHandleDown(e, c.id);
          }}
          style={{
            position: "absolute",
            left: "50%",
            bottom: -7,
            transform: "translateX(-50%)",
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: showHandle ? C.accent : C.card,
            border: `2px solid ${showHandle ? C.accent : C.cardBdHi}`,
            cursor: "crosshair",
            zIndex: 20,
            transition: "background 0.15s, border-color 0.15s, transform 0.15s",
            boxShadow: showHandle ? `0 0 0 4px ${C.accentSoft}` : "none",
          }}
        />
      )}

      {/* top port indicator (incoming) — passive, only visual */}
      {isEmpty && p.isConnDragging && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -7,
            transform: "translateX(-50%)",
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: C.card,
            border: `2px dashed ${isTarget ? C.success : C.cardBdHi}`,
            zIndex: 20,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
