import { useEffect, useRef, useState } from "react";
import { C, FONT_MONO, FONT_SANS } from "../theme";
import {
  fsRead,
  fsWrite,
  pseudocode as pseudocodeRpc,
  type FileRead,
} from "../lib/rpc";
import { highlightCode, isCodeLikeFile, langForPath } from "../lib/hljs";
import { isMarkdownPath, renderMarkdown } from "../lib/md";

export type FileView = "code" | "pseudo" | "preview";

interface Cache {
  content: Map<string, FileRead>;
  pseudo: Map<string, string>;
}

interface Props {
  path: string;
  view: FileView;
  onViewChange: (v: FileView) => void;
  cache: Cache;
  onCacheUpdate: () => void;
}

type SaveState = "saved" | "dirty" | "saving" | "error";

const SAVE_DEBOUNCE_MS = 450;

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

export function FileViewer({ path, view, onViewChange, cache, onCacheUpdate }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pseudoLoading, setPseudoLoading] = useState(false);
  const [, tick] = useState(0);

  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const fileRead = cache.content.get(path);
  const lang = langForPath(path);
  const isCode = isCodeLikeFile(path);
  const isMd = isMarkdownPath(path);
  const canPseudo = isCode && !!fileRead && !fileRead.binary && !fileRead.too_big;
  const canPreview = isMd && !!fileRead && !fileRead.binary && !fileRead.too_big;

  const pseudoKey = fileRead ? `${path}\0${hashString(fileRead.content)}` : "";
  const pseudoText = pseudoKey ? cache.pseudo.get(pseudoKey) : undefined;

  // Snap back to code when the requested view isn't available for this file.
  useEffect(() => {
    if (view === "pseudo" && !canPseudo) onViewChange("code");
    if (view === "preview" && !canPreview) onViewChange("code");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, canPseudo, canPreview]);

  // Load file content on (re)mount or path change.
  useEffect(() => {
    let alive = true;
    setErr(null);
    setSaveErr(null);
    setSaveState("saved");
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const cached = cache.content.get(path);
    if (cached) {
      setDraft(cached.content);
      return;
    }
    setLoading(true);
    fsRead(path)
      .then((r) => {
        if (!alive) return;
        cache.content.set(path, r);
        setDraft(r.content);
        onCacheUpdate();
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Pseudocode generation.
  useEffect(() => {
    let alive = true;
    if (view !== "pseudo") return;
    if (!fileRead || !canPseudo) return;
    if (pseudoText !== undefined) return;
    if (pseudoLoading) return;

    setPseudoLoading(true);
    setErr(null);
    pseudocodeRpc(path, fileRead.content, lang ?? "plaintext")
      .then((text) => {
        if (!alive) return;
        cache.pseudo.set(pseudoKey, text);
        onCacheUpdate();
        tick((n) => n + 1);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
      })
      .finally(() => {
        if (!alive) return;
        setPseudoLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, fileRead?.content, path]);

  // Flush any pending save when path changes or component unmounts.
  useEffect(() => {
    const capturedPath = path;
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const current = cache.content.get(capturedPath);
        if (current && draftRef.current !== current.content) {
          fsWrite(capturedPath, draftRef.current)
            .then(() => {
              cache.content.set(capturedPath, {
                ...current,
                content: draftRef.current,
                size: draftRef.current.length,
              });
            })
            .catch(() => {});
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const flushSave = async (value: string) => {
    const current = cache.content.get(path);
    if (!current) return;
    if (value === current.content) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    setSaveErr(null);
    try {
      await fsWrite(path, value);
      cache.content.set(path, { ...current, content: value, size: value.length });
      setSaveState("saved");
      // Intentionally NOT calling onCacheUpdate here — FileViewer re-renders
      // itself via setSaveState, which refreshes fileRead on its own. Calling
      // it would bounce a render up to ChatView on every save and can cascade
      // into unintended state resets.
    } catch (e) {
      setSaveErr(String(e));
      setSaveState("error");
    }
  };

  const onDraftChange = (v: string) => {
    setDraft(v);
    setSaveState("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      flushSave(v);
    }, SAVE_DEBOUNCE_MS);
  };

  const forceSaveNow = () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    flushSave(draftRef.current);
  };

  const name = path.split("/").pop() || path;
  const canEdit = !!fileRead && !fileRead.binary && !fileRead.too_big;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: C.card,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderBottom: `1px solid ${C.cardBd}`,
          fontFamily: FONT_SANS,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{name}</span>
        <span style={{ fontSize: 11, color: C.textDim, fontFamily: FONT_MONO }}>{path}</span>
        <div style={{ flex: 1 }} />
        {view === "code" && canEdit && (
          <SaveStatus state={saveState} err={saveErr} onRetry={forceSaveNow} />
        )}
        <Toggle
          value={view}
          onChange={onViewChange}
          canPseudo={canPseudo}
          canPreview={canPreview}
          pseudoDisabledReason={
            !isCode
              ? "not code"
              : fileRead?.binary
                ? "binary"
                : fileRead?.too_big
                  ? "too large"
                  : undefined
          }
        />
      </div>

      <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex" }}>
        {loading && <Status>loading…</Status>}
        {err && <Status tone="err">{err}</Status>}
        {!loading && !err && fileRead?.binary && (
          <Status tone="mut">
            binary file ({fileRead.size.toLocaleString()} bytes) — preview not supported
          </Status>
        )}
        {!loading && !err && fileRead?.too_big && (
          <Status tone="mut">
            file is too large to preview ({fileRead.size.toLocaleString()} bytes)
          </Status>
        )}
        {!loading && !err && fileRead && !fileRead.binary && !fileRead.too_big && (
          <>
            {view === "code" && (
              <EditableCode
                value={draft}
                onChange={onDraftChange}
                onBlur={forceSaveNow}
                lang={lang}
              />
            )}
            {view === "pseudo" && (
              <>
                {pseudoLoading && !pseudoText && <Status>generating pseudocode…</Status>}
                {pseudoText !== undefined && <PseudoBlock text={pseudoText} />}
              </>
            )}
            {view === "preview" && fileRead && (
              <MarkdownPreview source={fileRead.content} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Textarea with a highlighted <pre> layered behind it via transparent text. */
function EditableCode({
  value,
  onChange,
  onBlur,
  lang,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  lang?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const html = highlightCode(value, lang) + "\n"; // trailing newline so highlight keeps last-line height

  const syncScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <pre
        ref={preRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          margin: 0,
          padding: "14px 16px",
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          lineHeight: 1.6,
          whiteSpace: "pre",
          overflow: "auto",
          pointerEvents: "none",
          tabSize: 2,
          color: C.text,
          background: "transparent",
        }}
      >
        <code
          className={`hljs ${lang ? "language-" + lang : ""}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
      <textarea
        ref={taRef}
        value={value}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onScroll={syncScroll}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            const ePos = el.selectionEnd;
            const next = value.slice(0, s) + "  " + value.slice(ePos);
            onChange(next);
            requestAnimationFrame(() => {
              if (taRef.current) {
                taRef.current.selectionStart = taRef.current.selectionEnd = s + 2;
              }
            });
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          margin: 0,
          padding: "14px 16px",
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          lineHeight: 1.6,
          whiteSpace: "pre",
          overflow: "auto",
          background: "transparent",
          color: "transparent",
          caretColor: C.text,
          border: "none",
          outline: "none",
          resize: "none",
          tabSize: 2,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}

function Toggle({
  value,
  onChange,
  canPseudo,
  canPreview,
  pseudoDisabledReason,
}: {
  value: FileView;
  onChange: (v: FileView) => void;
  canPseudo: boolean;
  canPreview: boolean;
  pseudoDisabledReason?: string;
}) {
  const opts: Array<{ key: FileView; label: string; disabled: boolean; title?: string }> = [
    { key: "code", label: "code", disabled: false },
  ];
  if (canPreview) {
    opts.push({ key: "preview", label: "preview", disabled: false });
  } else {
    opts.push({
      key: "pseudo",
      label: "pseudocode",
      disabled: !canPseudo,
      title: canPseudo ? undefined : `pseudocode unavailable — ${pseudoDisabledReason}`,
    });
  }
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
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => !o.disabled && onChange(o.key)}
          disabled={o.disabled}
          title={o.title}
          style={{
            padding: "3px 12px",
            fontSize: 11.5,
            fontFamily: FONT_SANS,
            fontWeight: 500,
            border: "none",
            borderRadius: 5,
            cursor: o.disabled ? "not-allowed" : "pointer",
            color: o.disabled ? C.textDim : value === o.key ? C.text : C.textMut,
            background: value === o.key && !o.disabled ? C.card : "transparent",
            boxShadow:
              value === o.key && !o.disabled ? "0 1px 2px rgba(46,37,27,0.08)" : "none",
            transition: "all 0.15s",
            opacity: o.disabled ? 0.55 : 1,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SaveStatus({
  state,
  err,
  onRetry,
}: {
  state: SaveState;
  err: string | null;
  onRetry: () => void;
}) {
  const map: Record<SaveState, { label: string; color: string }> = {
    saved: { label: "saved", color: C.textDim },
    dirty: { label: "unsaved…", color: C.textMut },
    saving: { label: "saving…", color: C.textMut },
    error: { label: "save failed", color: C.danger },
  };
  const { label, color } = map[state];
  return (
    <span
      title={state === "error" ? err || undefined : undefined}
      onClick={state === "error" ? onRetry : undefined}
      style={{
        fontSize: 11,
        color,
        fontFamily: FONT_MONO,
        cursor: state === "error" ? "pointer" : "default",
        padding: "2px 6px",
        borderRadius: 4,
        background: state === "error" ? "rgba(200,118,112,0.10)" : "transparent",
      }}
    >
      {label}
    </span>
  );
}

function Status({ children, tone }: { children: React.ReactNode; tone?: "err" | "mut" }) {
  return (
    <div
      style={{
        padding: "18px 16px",
        fontSize: 12.5,
        color: tone === "err" ? C.danger : C.textMut,
        fontFamily: FONT_SANS,
      }}
    >
      {children}
    </div>
  );
}

function PseudoBlock({ text }: { text: string }) {
  return (
    <pre
      style={{
        flex: 1,
        margin: 0,
        padding: "16px 18px",
        fontSize: 13,
        lineHeight: 1.7,
        fontFamily: FONT_MONO,
        color: C.text,
        whiteSpace: "pre-wrap",
        background: C.cardAlt,
        overflow: "auto",
      }}
    >
      {text}
    </pre>
  );
}

function MarkdownPreview({ source }: { source: string }) {
  const html = renderMarkdown(source);
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        background: C.card,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function createCache(): Cache {
  return { content: new Map(), pseudo: new Map() };
}
