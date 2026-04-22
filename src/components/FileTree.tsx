import { useEffect, useRef, useState } from "react";
import { C, FONT_MONO, FONT_SANS } from "../theme";
import { fsCreateFile, fsList, type FsEntry } from "../lib/rpc";

interface Props {
  cwd: string;
  collapsed: boolean;
  onToggle: () => void;
  /** preferView is set when user double-clicks a markdown file → open in preview. */
  onOpenFile: (path: string, name: string, preferView?: "code" | "preview") => void;
  activePath?: string;
}

export function FileTree({ cwd, collapsed, onToggle, onOpenFile, activePath }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Map<string, FsEntry[]>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExpanded(new Set());
    setEntries(new Map());
    setErr(null);
    setCreating(false);
    setNewName("");
    setCreateErr(null);
    if (!collapsed) loadDir(cwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  useEffect(() => {
    if (!collapsed && !entries.has(cwd)) loadDir(cwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  async function loadDir(path: string) {
    try {
      const list = await fsList(path);
      setEntries((p) => {
        const n = new Map(p);
        n.set(path, list);
        return n;
      });
    } catch (e) {
      setErr(String(e));
    }
  }

  function toggle(path: string) {
    const isOpen = expanded.has(path);
    if (isOpen) {
      setExpanded((p) => {
        const n = new Set(p);
        n.delete(path);
        return n;
      });
    } else {
      setExpanded((p) => new Set(p).add(path));
      if (!entries.has(path)) loadDir(path);
    }
  }

  async function commitCreate() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      setNewName("");
      setCreateErr(null);
      return;
    }
    if (name.includes("/") || name === "." || name === "..") {
      setCreateErr("name cannot contain '/' or be '.' / '..'");
      return;
    }
    if (!cwd) {
      setCreateErr("no working directory");
      return;
    }
    const base = cwd.replace(/\/+$/, "");
    const full = base + "/" + name;
    try {
      await fsCreateFile(full);
    } catch (e) {
      setCreateErr(String(e));
      return;
    }
    setCreating(false);
    setNewName("");
    setCreateErr(null);
    // Reload listing; don't let a listing error crash the whole flow.
    try {
      await loadDir(cwd);
    } catch {
      /* listing refresh best-effort */
    }
    // Open as a tab; don't let a parent callback throw.
    try {
      onOpenFile(full, name);
    } catch {
      /* parent bug shouldn't kill tree */
    }
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 30,
          flexShrink: 0,
          borderRight: `1px solid ${C.cardBd}`,
          background: C.card,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 10,
        }}
      >
        <button
          onClick={onToggle}
          title="show files"
          style={{
            width: 24,
            height: 24,
            border: "none",
            background: "transparent",
            color: C.textMut,
            cursor: "pointer",
            borderRadius: 5,
            fontSize: 13,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ▸
        </button>
      </div>
    );
  }

  function renderNode(path: string, depth: number): React.ReactNode {
    const items = entries.get(path);
    if (!items) return null;
    return items.map((e) => (
      <div key={e.path}>
        <Row
          entry={e}
          depth={depth}
          isOpen={expanded.has(e.path)}
          active={activePath === e.path}
          onClick={() => (e.is_dir ? toggle(e.path) : onOpenFile(e.path, e.name))}
          onDoubleClick={
            e.is_dir
              ? undefined
              : () => {
                  const ext = e.name.toLowerCase().split(".").pop() || "";
                  const md = ext === "md" || ext === "markdown" || ext === "mdx";
                  onOpenFile(e.path, e.name, md ? "preview" : "code");
                }
          }
        />
        {e.is_dir && expanded.has(e.path) && renderNode(e.path, depth + 1)}
      </div>
    ));
  }

  const rootName = cwd.split("/").filter(Boolean).pop() || cwd;

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: `1px solid ${C.cardBd}`,
        background: C.card,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 10px 10px 12px",
          borderBottom: `1px solid ${C.cardBd}`,
          gap: 6,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: C.textMut,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          files
        </span>
        <span
          style={{
            fontSize: 11,
            color: C.textDim,
            fontFamily: FONT_MONO,
            maxWidth: 100,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={cwd}
        >
          {rootName}
        </span>
        <button
          onClick={() => {
            setCreating(true);
            setCreateErr(null);
          }}
          title="new file"
          style={{
            width: 20,
            height: 20,
            border: "none",
            background: "transparent",
            color: C.textMut,
            cursor: "pointer",
            borderRadius: 4,
            fontSize: 14,
            lineHeight: "18px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          +
        </button>
        <button
          onClick={onToggle}
          title="collapse"
          style={{
            width: 20,
            height: 20,
            border: "none",
            background: "transparent",
            color: C.textMut,
            cursor: "pointer",
            borderRadius: 4,
            fontSize: 12,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.bgDeep)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ◂
        </button>
      </div>

      {/* inline new-file input */}
      {creating && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "6px 10px",
            borderBottom: `1px solid ${C.cardBd}`,
            background: C.bgDeep,
          }}
        >
          <input
            ref={inputRef}
            value={newName}
            placeholder="new-file.ts"
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
                setCreateErr(null);
              }
            }}
            onBlur={() => {
              if (!newName.trim()) {
                setCreating(false);
                setCreateErr(null);
              }
            }}
            style={{
              background: C.card,
              border: `1px solid ${C.cardBd}`,
              borderRadius: 5,
              outline: "none",
              color: C.text,
              fontSize: 12,
              fontFamily: FONT_MONO,
              padding: "5px 8px",
            }}
          />
          {createErr && (
            <div style={{ fontSize: 10.5, color: C.danger, marginTop: 4 }}>{createErr}</div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {err ? (
          <div style={{ padding: "12px", fontSize: 12, color: C.danger }}>{err}</div>
        ) : (
          renderNode(cwd, 0)
        )}
      </div>
    </div>
  );
}

function Row({
  entry,
  depth,
  isOpen,
  active,
  onClick,
  onDoubleClick,
}: {
  entry: FsEntry;
  depth: number;
  isOpen: boolean;
  active: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `3px 10px 3px ${10 + depth * 12}px`,
        fontSize: 12.5,
        color: active ? C.text : C.textMut,
        background: active ? C.accentSoft : "transparent",
        cursor: "pointer",
        userSelect: "none",
        fontWeight: active ? 500 : 400,
        borderLeft: `2px solid ${active ? C.accent : "transparent"}`,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = C.bgDeep;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 12,
          fontSize: 9,
          color: C.textDim,
          textAlign: "center",
        }}
      >
        {entry.is_dir ? (isOpen ? "▾" : "▸") : ""}
      </span>
      <span
        style={{
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {entry.name}
      </span>
    </div>
  );
}
