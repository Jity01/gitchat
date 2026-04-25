import { useState } from "react";
import { C, FONT_MONO, FONT_SANS } from "../theme";
import type { ContentBlock } from "../types";

interface Props {
  use: Extract<ContentBlock, { type: "tool_use" }>;
  result?: Extract<ContentBlock, { type: "tool_result" }>;
}

export function ToolCallBlock({ use, result }: Props) {
  const [open, setOpen] = useState(false);
  const summary = summarize(use);
  const status = result ? (result.is_error ? "error" : "done") : "running";
  const statusColor =
    status === "error" ? "#c2453a" : status === "done" ? C.textMut : C.accent;

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 8,
        border: `1px solid ${C.cardBd}`,
        background: C.bgDeep,
        overflow: "hidden",
        fontFamily: FONT_SANS,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: C.text,
          fontSize: 12,
          fontFamily: FONT_SANS,
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 9, color: C.textDim, width: 10 }}>
          {open ? "▼" : "▶"}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontWeight: 600,
            fontSize: 11.5,
            color: C.text,
          }}
        >
          {use.name}
        </span>
        <span
          style={{
            flex: 1,
            color: C.textMut,
            fontFamily: FONT_MONO,
            fontSize: 11.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </span>
        <span
          style={{
            fontSize: 10,
            color: statusColor,
            fontFamily: FONT_MONO,
          }}
        >
          {status}
        </span>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${C.cardBd}` }}>
          <Pre title="input" body={pretty(use.input)} />
          {result && (
            <Pre
              title={result.is_error ? "error" : "output"}
              body={result.content || "(empty)"}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Pre({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div
        style={{
          background: "#3a2f22",
          padding: "4px 12px",
          fontSize: 10,
          color: "#c9bba0",
          fontFamily: FONT_MONO,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <pre
        style={{
          background: "#2a241c",
          padding: "10px 12px",
          margin: 0,
          fontSize: 12,
          color: "#f0e7d6",
          fontFamily: FONT_MONO,
          lineHeight: 1.55,
          maxHeight: 320,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {body}
      </pre>
    </div>
  );
}

function summarize(use: Extract<ContentBlock, { type: "tool_use" }>): string {
  const input = (use.input ?? {}) as Record<string, unknown>;
  switch (use.name) {
    case "Bash":
      return (input.command as string) || "";
    case "Edit":
    case "Write":
    case "Read":
    case "NotebookEdit":
      return (input.file_path as string) || (input.path as string) || "";
    case "Glob":
      return (input.pattern as string) || "";
    case "Grep":
      return (input.pattern as string) || "";
    case "WebFetch":
      return (input.url as string) || "";
    case "WebSearch":
      return (input.query as string) || "";
    case "TodoWrite":
      return "update todo list";
    default: {
      // First scalar field, otherwise JSON-stringify a snippet.
      for (const v of Object.values(input)) {
        if (typeof v === "string" && v.length < 200) return v;
      }
      return pretty(input).split("\n")[0] || "";
    }
  }
}

function pretty(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
