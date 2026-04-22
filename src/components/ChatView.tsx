import { useEffect, useRef, useState } from "react";
import {
  C,
  FONT_MONO,
  FONT_SANS,
  MODE,
  MODELS,
  PERMISSION_MODES,
  R,
  SHADOW,
  SHADOW_HI,
} from "../theme";
import type { ModeKey, ModelId, PermissionMode } from "../theme";
import type { Chat, Edge, Message } from "../types";
import { CtxPreview } from "./CtxPreview";
import { Terminal } from "./Terminal";
import { FileTree } from "./FileTree";
import { FileViewer, createCache, type FileView } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { ContextRing } from "./ContextRing";
import { estChatContextTokens } from "../lib/tokens";
import { chatSend } from "../lib/rpc";
import { buildSystemPrompt } from "../lib/assemble";

interface Props {
  chat: Chat;
  edges: Edge[];
  allChats: Chat[];
  onBack: () => void;
  onTitle: (id: string, v: string) => void;
  onSetModel: (id: string, model: ModelId) => void;
  onSetCwd: (id: string, cwd: string) => void;
  onSetPermissionMode: (id: string, mode: PermissionMode) => void;
  onAppend: (id: string, m: Message) => void;
}

const SPLIT_KEY = (id: string) => `gitchat.split.${id}`;
const TREE_KEY = (id: string) => `gitchat.tree.${id}`;

export function ChatView({
  chat,
  edges,
  allChats,
  onBack,
  onTitle,
  onSetModel,
  onSetCwd,
  onSetPermissionMode,
  onAppend,
}: Props) {
  const [input, setInput] = useState("");
  const [pv, setPv] =
    useState<{ mode: ModeKey; src: Chat; indices?: number[] } | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const model = MODELS.find((m) => m.id === chat.model) || MODELS[0];
  const isCode = model.kind === "code";
  const contextUsed = estChatContextTokens(chat, edges, allChats);
  const permissionMode: PermissionMode = chat.permissionMode || "plan";

  // tabs (chat + optional file tabs). Reset when chat changes.
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "chat", kind: "chat", label: chat.title || "chat" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("chat");
  const [fileViews, setFileViews] = useState<Record<string, FileView>>({});
  const cacheRef = useRef(createCache());
  const [, forceRender] = useState(0);

  // keep chat tab's label in sync with title
  useEffect(() => {
    setTabs((p) =>
      p.map((t) => (t.id === "chat" ? { ...t, label: chat.title || "chat" } : t)),
    );
  }, [chat.title]);

  // reset tabs when switching chats entirely
  useEffect(() => {
    setTabs([{ id: "chat", kind: "chat", label: chat.title || "chat" }]);
    setActiveTabId("chat");
    setFileViews({});
    cacheRef.current = createCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  // NOTE: we used to reset tabs when chat.cwd changed, but that caused a
  // nasty flash-back-to-chat during autosave whenever the chat prop's object
  // identity shifted. Leaving file tabs alive across cwd changes is fine —
  // if a path becomes unreadable, FileViewer just surfaces an error.

  // file tree open state (persisted per chat, default closed)
  const [treeOpen, setTreeOpen] = useState<boolean>(() => {
    return localStorage.getItem(TREE_KEY(chat.id)) === "1";
  });
  const toggleTree = () => {
    setTreeOpen((open) => {
      const next = !open;
      localStorage.setItem(TREE_KEY(chat.id), next ? "1" : "0");
      return next;
    });
  };

  // splitter
  const [leftFrac, setLeftFrac] = useState<number>(() => {
    const s = localStorage.getItem(SPLIT_KEY(chat.id));
    return s ? parseFloat(s) : 0.6;
  });
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const f = Math.max(0.25, Math.min(0.85, (e.clientX - rect.left) / rect.width));
      setLeftFrac(f);
    };
    const onUp = () => {
      setDragging(false);
      localStorage.setItem(SPLIT_KEY(chat.id), String(leftFrac));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, leftFrac, chat.id]);

  useEffect(() => {
    if (activeTabId === "chat" && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages.length, activeTabId]);

  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.style.height = "auto";
      composerRef.current.style.height =
        Math.min(composerRef.current.scrollHeight, 180) + "px";
    }
  }, [input]);

  const inbound = edges
    .filter((e) => e.to === chat.id)
    .map((e) => ({ edge: e, src: allChats.find((c) => c.id === e.from) }));

  const pickCwd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const chosen = await open({ directory: true, multiple: false });
      if (typeof chosen === "string") onSetCwd(chat.id, chosen);
    } catch {
      const p = prompt("working directory path:", chat.cwd || "~");
      if (p) onSetCwd(chat.id, p);
    }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: Message = { role: "user", content: trimmed };
    onAppend(chat.id, userMsg);
    setInput("");
    setActiveTabId("chat");
    setSending(true);

    try {
      // Build the request from:
      //   • inbound-edge context as the system prompt
      //   • full chat history so far (including the user message we just appended)
      const system = buildSystemPrompt(chat, edges, allChats);
      const payloadMessages = [...chat.messages, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const reply = await chatSend({
        model: chat.model,
        system: system || undefined,
        messages: payloadMessages,
      });

      onAppend(chat.id, { role: "assistant", content: reply });
    } catch (e) {
      onAppend(chat.id, {
        role: "assistant",
        content: `⚠️ request failed: ${String(e)}`,
      });
    } finally {
      setSending(false);
    }
  };

  const openFileTab = (path: string, name: string, preferView?: "code" | "preview") => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.kind === "file" && t.path === path);
      if (existing) return prev;
      return [...prev, { id: path, kind: "file", label: name, path }];
    });
    setActiveTabId(path);
    setFileViews((prev) => {
      // If user double-clicked, always honor preferView. Otherwise keep prior or default to "code".
      if (preferView) return { ...prev, [path]: preferView };
      return prev[path] ? prev : { ...prev, [path]: "code" };
    });
  };
  const closeTab = (id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const fallback = next[idx] || next[idx - 1] || next[0];
        setActiveTabId(fallback?.id || "chat");
      }
      return next;
    });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        fontFamily: FONT_SANS,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 18px",
          borderBottom: `1px solid ${C.cardBd}`,
          background: C.card,
          position: "relative",
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: 28,
            height: 28,
            border: "none",
            background: "transparent",
            color: C.textMut,
            cursor: "pointer",
            borderRadius: 6,
            fontSize: 16,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ←
        </button>
        <input
          value={chat.title}
          onChange={(e) => onTitle(chat.id, e.target.value)}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.text,
            fontSize: 17,
            fontFamily: FONT_SANS,
            fontWeight: 600,
            flex: 1,
            padding: 0,
          }}
        />
        {isCode && (
          <button
            onClick={pickCwd}
            title="working directory"
            style={{
              fontSize: 11,
              color: C.textMut,
              background: C.bgDeep,
              border: `1px solid ${C.cardBd}`,
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              fontFamily: FONT_MONO,
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chat.cwd ? "cwd: " + chat.cwd : "pick working dir"}
          </button>
        )}
        {isCode && (
          <PermissionModeControl
            value={permissionMode}
            onChange={(m) => onSetPermissionMode(chat.id, m)}
          />
        )}
        <ContextRing used={contextUsed} limit={model.contextWindow} />
        {/* model picker */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowModelPicker((s) => !s)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 7,
              border: `1px solid ${C.cardBd}`,
              background: C.card,
              fontSize: 12,
              fontFamily: FONT_SANS,
              fontWeight: 500,
              color: C.text,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 4, background: model.color }} />
            {model.label}
            <span style={{ fontSize: 9, color: C.textDim }}>
              {showModelPicker ? "▲" : "▼"}
            </span>
          </button>
          {showModelPicker && (
            <>
              <div
                onClick={() => setShowModelPicker(false)}
                style={{ position: "fixed", inset: 0, zIndex: 99 }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  width: 220,
                  background: C.card,
                  border: `1px solid ${C.cardBd}`,
                  borderRadius: R.md,
                  boxShadow: SHADOW_HI,
                  padding: 4,
                  zIndex: 100,
                }}
              >
                {MODELS.map((md) => (
                  <div
                    key={md.id}
                    onClick={() => {
                      onSetModel(chat.id, md.id);
                      setShowModelPicker(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                      color: md.id === chat.model ? C.text : C.textMut,
                      fontWeight: md.id === chat.model ? 600 : 400,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: md.color }} />
                    <span style={{ flex: 1 }}>{md.label}</span>
                    {md.kind === "code" && (
                      <span style={{ fontSize: 10, color: C.textDim, fontFamily: FONT_MONO }}>
                        agent
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context pills */}
      {inbound.length > 0 && (
        <div
          style={{
            padding: "8px 18px",
            borderBottom: `1px solid ${C.cardBd}`,
            background: C.card,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: C.textDim,
              fontWeight: 500,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            context
          </span>
          {inbound.map((s, i) => {
            if (!s.src) return null;
            const m = MODE[s.edge.mode];
            return (
              <button
                key={i}
                onClick={() =>
                  s.src && setPv({ mode: s.edge.mode, src: s.src, indices: s.edge.indices })
                }
                style={{
                  fontSize: 11,
                  fontFamily: FONT_SANS,
                  fontWeight: 500,
                  cursor: "pointer",
                  color: m.color,
                  background: m.color + "10",
                  border: `1px solid ${m.color}30`,
                  borderRadius: 14,
                  padding: "3px 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700 }}>{m.icon}</span>
                <span style={{ color: C.text }}>{s.src.title}</span>
                <span style={{ color: C.textDim }}>·</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* File tree (claude code only, and only when cwd set) */}
        {isCode && chat.cwd && (
          <FileTree
            cwd={chat.cwd}
            collapsed={!treeOpen}
            onToggle={toggleTree}
            onOpenFile={openFileTab}
            activePath={activeTab?.kind === "file" ? activeTab.path : undefined}
          />
        )}

        {/* Middle + right (split) */}
        <div
          ref={splitRef}
          style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}
        >
          {/* Middle pane: tab bar + tab content + composer */}
          <div
            style={{
              width: isCode && chat.cwd ? `${leftFrac * 100}%` : "100%",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {/* Only show tab bar if there are file tabs */}
            {tabs.length > 1 && (
              <TabBar
                tabs={tabs}
                activeId={activeTabId}
                onSelect={setActiveTabId}
                onClose={closeTab}
                onDoubleClick={(id) => {
                  const tab = tabs.find((t) => t.id === id);
                  if (!tab || tab.kind !== "file" || !tab.path) return;
                  const ext = tab.path.toLowerCase().split(".").pop() || "";
                  const md = ext === "md" || ext === "markdown" || ext === "mdx";
                  if (!md) return;
                  const current = fileViews[tab.path] || "code";
                  setFileViews((prev) => ({
                    ...prev,
                    [tab.path!]: current === "preview" ? "code" : "preview",
                  }));
                }}
              />
            )}

            {/* Active tab content */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {activeTab?.kind === "chat" && (
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "20px 18px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {!chat.messages.length && (
                    <div style={{ marginTop: 80, color: C.textDim, fontSize: 14 }}>
                      start typing…
                    </div>
                  )}
                  <div style={{ width: "100%", maxWidth: 720 }}>
                    {chat.messages.map((m, i) => (
                      <MessageBubble key={i} m={m} />
                    ))}
                    {sending && <TypingBubble />}
                    <div ref={endRef} />
                  </div>
                </div>
              )}

              {activeTab?.kind === "file" && activeTab.path && (
                <FileViewer
                  path={activeTab.path}
                  view={fileViews[activeTab.path] || "code"}
                  onViewChange={(v) =>
                    setFileViews((p) => ({ ...p, [activeTab.path!]: v }))
                  }
                  cache={cacheRef.current}
                  onCacheUpdate={() => forceRender((n) => n + 1)}
                />
              )}
            </div>

            {/* Composer — always posts to the chat tab */}
            <div
              style={{
                borderTop: `1px solid ${C.cardBd}`,
                padding: "12px 18px",
                background: C.card,
              }}
            >
              <div
                style={{
                  maxWidth: 720,
                  margin: "0 auto",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-end",
                  background: C.card,
                  border: `1px solid ${C.cardBd}`,
                  borderRadius: R.md,
                  padding: "8px 10px 8px 14px",
                  boxShadow: SHADOW,
                }}
              >
                <textarea
                  ref={composerRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    isCode
                      ? activeTab?.kind === "file"
                        ? `ask claude about ${activeTab.label}…`
                        : "ask claude code… (the terminal on the right is live)"
                      : "type a message…"
                  }
                  rows={1}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: C.text,
                    fontSize: 14,
                    fontFamily: FONT_SANS,
                    lineHeight: 1.5,
                    resize: "none",
                    minHeight: 22,
                    maxHeight: 180,
                    padding: "4px 0",
                  }}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || sending}
                  style={{
                    background: input.trim() && !sending ? C.accent : C.cardBd,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    cursor:
                      input.trim() && !sending ? "pointer" : "not-allowed",
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  {sending ? "…" : "↑"}
                </button>
              </div>
            </div>
          </div>

          {/* splitter */}
          {isCode && chat.cwd && (
            <div
              onMouseDown={() => setDragging(true)}
              style={{
                width: 5,
                cursor: "col-resize",
                background: dragging ? C.accent : C.cardBd,
                flexShrink: 0,
              }}
            />
          )}

          {/* terminal / placeholder */}
          {isCode && (
            <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
              {chat.cwd ? (
                <Terminal chatId={chat.id} cwd={chat.cwd} />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    background: C.card,
                    borderLeft: `1px solid ${C.cardBd}`,
                    color: C.textMut,
                    fontSize: 13,
                  }}
                >
                  <div>claude code needs a working directory</div>
                  <button
                    onClick={pickCwd}
                    style={{
                      background: C.accent,
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontFamily: FONT_SANS,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    pick folder
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {pv && (
        <CtxPreview mode={pv.mode} src={pv.src} indices={pv.indices} onClose={() => setPv(null)} />
      )}
    </div>
  );
}

function PermissionModeControl({
  value,
  onChange,
}: {
  value: PermissionMode;
  onChange: (m: PermissionMode) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: `1px solid ${C.cardBd}`,
        borderRadius: 7,
        background: C.bgDeep,
        padding: 2,
      }}
    >
      {PERMISSION_MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            title={m.desc}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              fontFamily: FONT_SANS,
              fontWeight: 500,
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              color: active ? C.text : C.textMut,
              background: active ? C.card : "transparent",
              boxShadow: active ? "0 1px 2px rgba(46,37,27,0.08)" : "none",
              transition: "all 0.15s",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
      <div
        style={{
          padding: "11px 15px",
          borderRadius: "14px 14px 14px 4px",
          background: C.card,
          border: `1px solid ${C.cardBd}`,
          fontSize: 13.5,
          color: C.textMut,
          fontFamily: FONT_SANS,
          boxShadow: SHADOW,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </div>
      <style>{`
        @keyframes typing-bounce {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 0.9; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
function Dot({ delay }: { delay: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: C.textMut,
        display: "inline-block",
        animation: "typing-bounce 1.2s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

function MessageBubble({ m }: { m: Message }) {
  const isUser = m.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "11px 15px",
          borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isUser ? C.accentSoft : C.card,
          border: `1px solid ${isUser ? C.accentBd : C.cardBd}`,
          fontSize: 13.5,
          color: C.text,
          lineHeight: 1.6,
          fontFamily: FONT_SANS,
          boxShadow: isUser ? "none" : SHADOW,
        }}
      >
        {renderContent(m.content)}
      </div>
    </div>
  );
}

function renderContent(text: string): React.ReactNode[] {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((p, i) => {
    if (p.startsWith("```")) {
      const inner = p.slice(3, -3);
      const nl = inner.indexOf("\n");
      let lang = "",
        code = inner;
      if (nl > 0 && nl < 20 && !inner.slice(0, nl).includes(" ")) {
        lang = inner.slice(0, nl).trim();
        code = inner.slice(nl + 1);
      }
      return (
        <div
          key={i}
          style={{
            margin: "10px 0",
            borderRadius: 10,
            overflow: "hidden",
            border: `1px solid ${C.cardBd}`,
          }}
        >
          {lang && (
            <div
              style={{
                background: "#3a2f22",
                padding: "5px 12px",
                fontSize: 11,
                color: "#c9bba0",
                fontFamily: FONT_MONO,
                borderBottom: "1px solid #4a3d2c",
                letterSpacing: 0.5,
              }}
            >
              {lang}
            </div>
          )}
          <pre
            style={{
              background: "#2a241c",
              padding: "12px 14px",
              margin: 0,
              fontSize: 12.5,
              color: "#f0e7d6",
              fontFamily: FONT_MONO,
              lineHeight: 1.65,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {code}
          </pre>
        </div>
      );
    }
    if (!p.trim()) return null;
    return (
      <span key={i} style={{ whiteSpace: "pre-wrap" }}>
        {p}
      </span>
    );
  });
}
