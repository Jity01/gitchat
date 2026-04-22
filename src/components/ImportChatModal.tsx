import { useEffect, useRef, useState } from "react";
import { C, FONT_MONO, FONT_SANS, R, SHADOW_HI } from "../theme";
import { importPastedChat } from "../lib/rpc";
import type { Message } from "../types";

interface Props {
  onDone: (title: string, messages: Message[]) => void;
  onClose: () => void;
}

export function ImportChatModal({ onDone, onClose }: Props) {
  const [pasted, setPasted] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] =
    useState<{ title: string; messages: Message[] } | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    pasteRef.current?.focus();
  }, []);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await importPastedChat(pasted.trim());
      const msgs: Message[] = res.messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));
      setPreview({ title: res.title || "imported chat", messages: msgs });
      setCustomTitle(res.title || "imported chat");
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const commit = () => {
    if (!preview) return;
    onDone(customTitle.trim() || preview.title, preview.messages);
  };

  const canRun = !loading && pasted.trim().length >= 20;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,36,28,0.38)",
        backdropFilter: "blur(6px)",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: C.card,
          border: `1px solid ${C.cardBd}`,
          borderRadius: R.lg,
          boxShadow: SHADOW_HI,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${C.cardBd}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              import chat
            </div>
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 3 }}>
              paste a conversation and we'll extract the messages
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

        {!preview && (
          <div
            style={{
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.textMut,
                background: C.bgDeep,
                border: `1px solid ${C.cardBd}`,
                borderRadius: 7,
                padding: "8px 12px",
                lineHeight: 1.5,
              }}
            >
              open the conversation in your browser → select the text (⌘A
              inside the chat area) → copy (⌘C) → paste below.
            </div>
            <textarea
              ref={pasteRef}
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setErr(null);
              }}
              placeholder="paste the conversation here…"
              style={{
                minHeight: 260,
                background: C.bgDeep,
                border: `1px solid ${C.cardBd}`,
                borderRadius: 7,
                outline: "none",
                color: C.text,
                fontSize: 12.5,
                fontFamily: FONT_MONO,
                padding: "10px 12px",
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={run}
                disabled={!canRun}
                style={{
                  background: canRun ? C.accent : C.cardBd,
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontFamily: FONT_SANS,
                  fontWeight: 600,
                  cursor: canRun ? "pointer" : "not-allowed",
                }}
              >
                {loading ? "extracting…" : "extract messages"}
              </button>
            </div>
          </div>
        )}

        {err && (
          <div
            style={{
              padding: "0 18px 12px",
              fontSize: 12,
              color: C.danger,
              fontFamily: FONT_MONO,
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {err}
          </div>
        )}

        {preview && (
          <>
            <div
              style={{
                padding: "12px 18px 8px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <label style={{ fontSize: 11, color: C.textMut, fontWeight: 500 }}>
                title
              </label>
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                style={{
                  flex: 1,
                  background: C.bgDeep,
                  border: `1px solid ${C.cardBd}`,
                  borderRadius: 6,
                  outline: "none",
                  color: C.text,
                  fontSize: 13,
                  fontFamily: FONT_SANS,
                  padding: "5px 9px",
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                borderTop: `1px solid ${C.cardBd}`,
                padding: "10px 18px",
                background: C.bgDeep,
                fontSize: 12.5,
                color: C.text,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 0,
              }}
            >
              <div style={{ fontSize: 11, color: C.textMut }}>
                {preview.messages.length} messages extracted
              </div>
              {preview.messages.slice(0, 20).map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: FONT_MONO,
                      color: m.role === "user" ? C.accent : C.textMut,
                      textTransform: "uppercase",
                      fontWeight: 600,
                      flexShrink: 0,
                      width: 62,
                      paddingTop: 2,
                    }}
                  >
                    {m.role}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      whiteSpace: "pre-wrap",
                      color: C.text,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.content.length > 260
                      ? m.content.slice(0, 260) + "…"
                      : m.content}
                  </span>
                </div>
              ))}
              {preview.messages.length > 20 && (
                <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic" }}>
                  …and {preview.messages.length - 20} more
                </div>
              )}
            </div>
            <div
              style={{
                padding: "12px 18px",
                borderTop: `1px solid ${C.cardBd}`,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => {
                  setPreview(null);
                  setCustomTitle("");
                }}
                style={{
                  background: "transparent",
                  color: C.textMut,
                  border: `1px solid ${C.cardBd}`,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontFamily: FONT_SANS,
                  cursor: "pointer",
                }}
              >
                back
              </button>
              <button
                onClick={commit}
                disabled={!preview.messages.length}
                style={{
                  background: preview.messages.length ? C.accent : C.cardBd,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 16px",
                  fontSize: 12,
                  fontFamily: FONT_SANS,
                  fontWeight: 600,
                  cursor: preview.messages.length ? "pointer" : "not-allowed",
                }}
              >
                add as new chat
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
