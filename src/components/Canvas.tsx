import { useEffect, useRef, useState } from "react";
import { C, CELL, FONT_SANS, NODE_H, NODE_W, snapF, snapR } from "../theme";
import type { ModeKey } from "../theme";
import type { CanvasTool, Chat, Edge, Stroke, TextBox } from "../types";
import { ChatNode } from "./ChatNode";
import { Edges } from "./Edges";
import { ModeModal } from "./ModeModal";
import { ContextMenu } from "./ContextMenu";
import { CherryPick } from "./CherryPick";
import { CtxPreview } from "./CtxPreview";
import { CanvasTools, INK_COLORS } from "./CanvasTools";

interface Props {
  chats: Chat[];
  edges: Edge[];
  strokes: Stroke[];
  textBoxes: TextBox[];
  onCreateChat: (x: number, y: number) => string;
  onMoveChat: (id: string, x: number, y: number) => void;
  onTitle: (id: string, v: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenChat: (id: string) => void;
  onCreateEdge: (from: string, to: string, mode: ModeKey, indices?: number[]) => void;
  onAddStroke: (s: Stroke) => void;
  onUpdateStroke: (id: string, patch: Partial<Stroke>) => void;
  onRemoveStroke: (id: string) => void;
  onAddTextBox: (t: TextBox) => void;
  onUpdateTextBox: (id: string, t: Partial<TextBox>) => void;
  onRemoveTextBox: (id: string) => void;
  onOpenImport: () => void;
}

function isOccupied(x: number, y: number, chats: Chat[]): boolean {
  return chats.some(
    (c) =>
      x < c.x + NODE_W &&
      x + CELL > c.x &&
      y < c.y + NODE_H &&
      y + CELL > c.y,
  );
}
function hitTest(mx: number, my: number, chats: Chat[]): Chat | undefined {
  return chats.find(
    (c) => mx >= c.x && mx <= c.x + NODE_W && my >= c.y && my <= c.y + NODE_H,
  );
}

export function Canvas(p: Props) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<string | null>(null);
  const [dragOff, setDragOff] = useState({ x: 0, y: 0 });
  const [newId, setNewId] = useState<string | null>(null);
  const [hovCell, setHovCell] = useState<{ x: number; y: number } | null>(null);
  const [connTarget, setConnTarget] = useState<string | null>(null);
  const [liveArrow, setLiveArrow] =
    useState<{ fromId: string; x2: number; y2: number; validTarget: boolean | null } | null>(null);
  const [frozenArrow, setFrozenArrow] =
    useState<{ fromId: string; toId: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; chatId: string } | null>(null);
  const [modal, setModal] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const [cherry, setCherry] = useState<{ from: string; to: string } | null>(null);
  const [preview, setPreview] =
    useState<{ mode: ModeKey; src: Chat; indices?: number[] } | null>(null);

  const [tool, setTool] = useState<CanvasTool>("select");
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [drawing, setDrawing] = useState<{ points: { x: number; y: number }[] } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [annoMenu, setAnnoMenu] =
    useState<{ x: number; y: number; kind: "stroke" | "text"; id: string } | null>(null);

  const chatsRef = useRef<Chat[]>(p.chats);
  const panRef = useRef(pan);
  const connRef = useRef<{ fromId: string } | null>(null);
  const cvsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatsRef.current = p.chats;
  }, [p.chats]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const canReceive = (id: string) => {
    const c = chatsRef.current.find((x) => x.id === id);
    if (!c) return false;
    if (!connRef.current) return true;
    if (connRef.current.fromId === id) return false;
    const dup = p.edges.some(
      (e) => e.from === connRef.current!.fromId && e.to === id,
    );
    return !dup;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!connRef.current) return;
      const pn = panRef.current;
      const cx = e.clientX - pn.x;
      const cy = e.clientY - pn.y - 44;
      const hit = hitTest(cx, cy, chatsRef.current);
      const tid = hit && hit.id !== connRef.current.fromId ? hit.id : null;
      setConnTarget(tid);
      setLiveArrow({
        fromId: connRef.current.fromId,
        x2: cx,
        y2: cy,
        validTarget: tid ? canReceive(tid) : null,
      });
    };
    const onUp = (e: MouseEvent) => {
      if (!connRef.current) return;
      const pn = panRef.current;
      const cx = e.clientX - pn.x;
      const cy = e.clientY - pn.y - 44;
      const hit = hitTest(cx, cy, chatsRef.current);
      const tid = hit && hit.id !== connRef.current.fromId ? hit.id : null;
      if (tid && canReceive(tid)) {
        const tgt = chatsRef.current.find((c) => c.id === tid)!;
        setPending({ from: connRef.current.fromId, to: tid });
        setModal({
          x: tgt.x + NODE_W / 2 - 140,
          y: tgt.y + NODE_H + 14,
        });
        setFrozenArrow({ fromId: connRef.current.fromId, toId: tid });
      }
      connRef.current = null;
      setLiveArrow(null);
      setConnTarget(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onHandleDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    connRef.current = { fromId: id };
    const c = p.chats.find((ch) => ch.id === id);
    if (!c) return;
    setLiveArrow({
      fromId: id,
      x2: e.clientX - pan.x,
      y2: e.clientY - pan.y - 44,
      validTarget: null,
    });
  };

  // Coordinate of a mouse event in canvas-inner (pre-pan) space.
  const toCanvasCoords = (ev: React.MouseEvent | MouseEvent) => ({
    x: ev.clientX - pan.x,
    y: ev.clientY - pan.y - 44,
  });

  const onCvsDown = (e: React.MouseEvent) => {
    if (connRef.current || modal) return;
    const t = e.target as Element;
    const onBackground = t === cvsRef.current || !!t.closest(".gl");
    if (!onBackground) return;

    if (tool === "pen") {
      const { x, y } = toCanvasCoords(e);
      setDrawing({ points: [{ x, y }] });
      return;
    }
    if (tool === "text" || tool === "select") {
      // For text: handle in click. For select: pan.
      if (tool === "select") {
        setPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
      return;
    }
  };

  const onCvsMove = (e: React.MouseEvent) => {
    if (panning) setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    if (drag) {
      const x = snapR(e.clientX - pan.x - dragOff.x);
      const y = snapR(e.clientY - pan.y - dragOff.y - 44);
      p.onMoveChat(drag, x, y);
    }
    if (drawing) {
      const { x, y } = toCanvasCoords(e);
      // Simple distance filter to avoid redundant points.
      const last = drawing.points[drawing.points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 1.5) {
        setDrawing({ points: [...drawing.points, { x, y }] });
      }
    }
    if (tool === "select" && !connRef.current && !drag && !panning) {
      setHovCell({
        x: snapF(e.clientX - pan.x),
        y: snapF(e.clientY - pan.y - 44),
      });
    } else setHovCell(null);
  };

  const onCvsUp = () => {
    setPanning(false);
    setDrag(null);
    if (drawing) {
      if (drawing.points.length >= 2) {
        p.onAddStroke({
          id: "s" + Date.now(),
          d: pointsToPath(drawing.points),
          color: inkColor,
          width: 2.25,
        });
      }
      setDrawing(null);
    }
  };

  const onNodeDrag = (e: React.MouseEvent, id: string) => {
    if (connRef.current) return;
    if (tool !== "select") return; // node drag is select-mode only
    e.stopPropagation();
    const c = p.chats.find((ch) => ch.id === id);
    if (!c) return;
    setDrag(id);
    setDragOff({ x: e.clientX - pan.x - c.x, y: e.clientY - pan.y - c.y - 44 });
  };

  const onCvsClick = (e: React.MouseEvent) => {
    if (drag || panning || connRef.current || modal || ctxMenu) return;
    const t = e.target as Element;
    const onBackground = t === cvsRef.current || !!t.closest(".gl");
    if (!onBackground) return;

    const gx = snapF(e.clientX - pan.x);
    const gy = snapF(e.clientY - pan.y - 44);

    if (tool === "select") {
      if (!isOccupied(gx, gy, p.chats)) {
        const id = p.onCreateChat(gx, gy);
        setNewId(id);
        setTimeout(() => setNewId(null), 100);
      }
      return;
    }
    if (tool === "text") {
      const { x, y } = toCanvasCoords(e);
      const id = "t" + Date.now();
      p.onAddTextBox({ id, x: x - 60, y: y - 12, text: "", color: inkColor });
      setEditingTextId(id);
      return;
    }
    // pen: clicks on the background don't do anything extra.
  };

  const pickMode = (mode: ModeKey) => {
    if (!pending) return;
    const src = p.chats.find((c) => c.id === pending.from);
    if (mode === "CHERRY_PICK" && src && src.messages.length) {
      setCherry({ from: pending.from, to: pending.to });
      setModal(null);
      return;
    }
    p.onCreateEdge(pending.from, pending.to, mode);
    if (src && src.messages.length) setPreview({ mode, src });
    setPending(null);
    setModal(null);
    setFrozenArrow(null);
  };

  const showHover =
    tool === "select" &&
    hovCell &&
    !isOccupied(hovCell.x, hovCell.y, p.chats) &&
    !ctxMenu &&
    !modal &&
    !connRef.current;

  const cursor =
    tool === "pen"
      ? "crosshair"
      : tool === "text"
        ? "text"
        : panning
          ? "grabbing"
          : liveArrow
            ? "crosshair"
            : "default";

  return (
    <div
      style={{
        position: "fixed",
        top: 44,
        left: 0,
        right: 0,
        bottom: 0,
        background: C.bg,
        overflow: "hidden",
        cursor,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CanvasTools
        tool={tool}
        onToolChange={setTool}
        color={inkColor}
        onColorChange={setInkColor}
        onImport={p.onOpenImport}
      />

      {p.chats.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.textMut,
            fontSize: 14,
            fontFamily: FONT_SANS,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          click anywhere to start a chat
        </div>
      )}
      <div
        ref={cvsRef}
        onMouseDown={onCvsDown}
        onMouseMove={onCvsMove}
        onMouseUp={onCvsUp}
        onMouseLeave={() => {
          onCvsUp();
          setHovCell(null);
        }}
        onClick={onCvsClick}
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          zIndex: 2,
        }}
      >
        <Edges
          chats={p.chats}
          edges={p.edges}
          liveArrow={liveArrow}
          frozenArrow={frozenArrow}
        />

        {/* strokes + live drawing — one svg over everything else in the layer */}
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {p.strokes.map((s) => {
            const tx = s.tx || 0;
            const ty = s.ty || 0;
            const interactive = tool === "select";
            return (
              <g key={s.id} transform={`translate(${tx} ${ty})`}>
                {/* Visible ink */}
                <path
                  d={s.d}
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.85}
                  pointerEvents="none"
                />
                {/* Invisible fat hit target so hover/drag are forgiving */}
                {interactive && (
                  <path
                    d={s.d}
                    stroke="transparent"
                    strokeWidth={16}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    pointerEvents="stroke"
                    onMouseDown={(ev) => {
                      ev.stopPropagation();
                      const startX = ev.clientX;
                      const startY = ev.clientY;
                      const mm = (me: MouseEvent) => {
                        const dx = me.clientX - startX;
                        const dy = me.clientY - startY;
                        if (Math.hypot(dx, dy) > 3) {
                          p.onUpdateStroke(s.id, { tx: tx + dx, ty: ty + dy });
                        }
                      };
                      const mu = () => {
                        window.removeEventListener("mousemove", mm);
                        window.removeEventListener("mouseup", mu);
                      };
                      window.addEventListener("mousemove", mm);
                      window.addEventListener("mouseup", mu);
                    }}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setAnnoMenu({
                        x: ev.clientX,
                        y: ev.clientY,
                        kind: "stroke",
                        id: s.id,
                      });
                    }}
                    style={{ cursor: "grab" }}
                  />
                )}
              </g>
            );
          })}
          {drawing && (
            <path
              d={pointsToPath(drawing.points)}
              stroke={inkColor}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.85}
            />
          )}
        </svg>

        {/* text boxes */}
        {p.textBoxes.map((tb) => (
          <TextBoxView
            key={tb.id}
            box={tb}
            editing={editingTextId === tb.id}
            setEditing={(v) => setEditingTextId(v ? tb.id : null)}
            onChange={(t) => p.onUpdateTextBox(tb.id, { text: t })}
            onMove={(x, y) => p.onUpdateTextBox(tb.id, { x, y })}
            onRequestDelete={(cx, cy) =>
              setAnnoMenu({ x: cx, y: cy, kind: "text", id: tb.id })
            }
            tool={tool}
          />
        ))}

        {showHover && (
          <div
            key={hovCell!.x + "-" + hovCell!.y}
            style={{
              position: "absolute",
              left: hovCell!.x + CELL / 2,
              top: hovCell!.y + CELL / 2,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 3,
              fontSize: 18,
              color: C.textDim,
              fontFamily: FONT_SANS,
              fontWeight: 300,
              userSelect: "none",
            }}
          >
            +
          </div>
        )}

        {p.chats.map((c) => (
          <ChatNode
            key={c.id}
            chat={c}
            inbound={p.edges.filter((e) => e.to === c.id)}
            allEdges={p.edges}
            allChats={p.chats}
            isConnDragging={!!liveArrow}
            connTarget={connTarget}
            justCreated={c.id === newId}
            onDrag={onNodeDrag}
            onOpen={p.onOpenChat}
            onTitle={p.onTitle}
            onHandleDown={onHandleDown}
            onCtxMenu={(e, id) => setCtxMenu({ x: e.clientX, y: e.clientY, chatId: id })}
          />
        ))}

        {modal && pending && (
          <ModeModal
            pos={modal}
            sourceTitle={p.chats.find((c) => c.id === pending.from)?.title || ""}
            onPick={pickMode}
            onClose={() => {
              setModal(null);
              setPending(null);
              setFrozenArrow(null);
            }}
          />
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onDelete={() => {
            p.onDeleteChat(ctxMenu.chatId);
            setCtxMenu(null);
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {annoMenu && (
        <ContextMenu
          x={annoMenu.x}
          y={annoMenu.y}
          label={annoMenu.kind === "stroke" ? "delete line" : "delete text"}
          onDelete={() => {
            if (annoMenu.kind === "stroke") p.onRemoveStroke(annoMenu.id);
            else p.onRemoveTextBox(annoMenu.id);
            setAnnoMenu(null);
          }}
          onClose={() => setAnnoMenu(null)}
        />
      )}

      {cherry && (
        <CherryPick
          messages={p.chats.find((c) => c.id === cherry.from)?.messages || []}
          onDone={(indices) => {
            p.onCreateEdge(cherry.from, cherry.to, "CHERRY_PICK", indices);
            const src = p.chats.find((c) => c.id === cherry.from);
            if (src) setPreview({ mode: "CHERRY_PICK", src, indices });
            setCherry(null);
            setPending(null);
            setFrozenArrow(null);
          }}
          onClose={() => {
            setCherry(null);
            setPending(null);
            setFrozenArrow(null);
          }}
        />
      )}

      {preview && (
        <CtxPreview
          mode={preview.mode}
          src={preview.src}
          indices={preview.indices}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/** Quadratic-smoothed SVG path from polyline points. */
function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y}, ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function TextBoxView({
  box,
  editing,
  setEditing,
  onChange,
  onMove,
  onRequestDelete,
  tool,
}: {
  box: TextBox;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (t: string) => void;
  onMove: (x: number, y: number) => void;
  onRequestDelete: (clientX: number, clientY: number) => void;
  tool: CanvasTool;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  // Drag-vs-click distinction.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    boxX: number;
    boxY: number;
    moved: boolean;
  } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editing) return; // let textarea own its events
    if (tool !== "select" && tool !== "text") return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      moved: false,
    };
    const mm = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.moved && Math.hypot(dx, dy) > 3) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        onMove(dragRef.current.boxX + dx, dragRef.current.boxY + dy);
      }
    };
    const mu = () => {
      const moved = dragRef.current?.moved;
      dragRef.current = null;
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      // Treat as click only if it didn't become a drag.
      if (!moved) {
        if (tool === "text" || tool === "select") setEditing(true);
      }
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  };

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // If we were editing, blur cleanly before popping the menu.
    setEditing(false);
    onRequestDelete(e.clientX, e.clientY);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        minWidth: 80,
        maxWidth: 280,
        padding: "4px 8px",
        border: `1px dashed ${box.color}66`,
        borderRadius: 6,
        background: "rgba(251,248,242,0.6)",
        color: box.color,
        fontFamily: FONT_SANS,
        fontSize: 13,
        lineHeight: 1.4,
        fontWeight: 500,
        zIndex: 5,
        cursor: editing
          ? "text"
          : tool === "select" || tool === "text"
            ? "grab"
            : "default",
        userSelect: "none",
      }}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={box.text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          rows={Math.max(1, box.text.split("\n").length)}
          style={{
            width: 260,
            background: "transparent",
            border: "none",
            outline: "none",
            color: box.color,
            fontFamily: FONT_SANS,
            fontSize: 13,
            lineHeight: 1.4,
            fontWeight: 500,
            resize: "none",
            padding: 0,
          }}
        />
      ) : (
        <span style={{ whiteSpace: "pre-wrap" }}>
          {box.text || <em style={{ opacity: 0.6 }}>(click to edit)</em>}
        </span>
      )}
    </div>
  );
}
