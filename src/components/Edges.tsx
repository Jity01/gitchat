import { C, MODE, NODE_H, NODE_W } from "../theme";
import type { Chat, Edge } from "../types";

interface Props {
  chats: Chat[];
  edges: Edge[];
  liveArrow: { fromId: string; x2: number; y2: number; validTarget: boolean | null } | null;
  frozenArrow?: { fromId: string; toId: string } | null;
  onEdgeDelete?: (id: string) => void;
}

export function Edges({ chats, edges, liveArrow, frozenArrow }: Props) {
  // dotted grid
  const gridEls: React.ReactElement[] = [];
  for (let x = 0; x < 60; x++) {
    for (let y = 0; y < 40; y++) {
      gridEls.push(
        <circle
          key={`d${x}-${y}`}
          cx={x * 60}
          cy={y * 60}
          r={0.9}
          fill={C.grid}
          opacity={0.9}
        />,
      );
    }
  }

  const bottomPort = (c: Chat) => ({ x: c.x + NODE_W / 2, y: c.y + NODE_H });
  const topPort = (c: Chat) => ({ x: c.x + NODE_W / 2, y: c.y });

  const edgeEls: React.ReactElement[] = [];
  const midChips: React.ReactElement[] = [];
  edges.forEach((e) => {
    const f = chats.find((c) => c.id === e.from);
    const t = chats.find((c) => c.id === e.to);
    if (!f || !t) return;
    const s = bottomPort(f);
    const tp = topPort(t);
    // Vertical bezier — bows out in the y-axis
    const dy = Math.max(50, Math.abs(tp.y - s.y) * 0.5);
    const d = `M ${s.x} ${s.y} C ${s.x} ${s.y + dy}, ${tp.x} ${tp.y - dy}, ${tp.x} ${tp.y}`;
    const col = MODE[e.mode].color;
    edgeEls.push(
      <path
        key={e.id}
        d={d}
        stroke={col}
        strokeOpacity={0.6}
        strokeWidth={1.75}
        fill="none"
      />,
    );
    const mx = (s.x + tp.x) / 2;
    const my = (s.y + tp.y) / 2;
    midChips.push(
      <g key={"chip-" + e.id} transform={`translate(${mx}, ${my})`}>
        <circle r={11} fill={C.card} stroke={col} strokeWidth={1.25} />
        <text
          x={0}
          y={0.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontFamily="'JetBrains Mono', monospace"
          fontWeight={700}
          fill={col}
        >
          {MODE[e.mode].icon}
        </text>
      </g>,
    );
  });

  let frozenEl: React.ReactElement | null = null;
  if (frozenArrow) {
    const f = chats.find((c) => c.id === frozenArrow.fromId);
    const t = chats.find((c) => c.id === frozenArrow.toId);
    if (f && t) {
      const s = bottomPort(f);
      const tp = topPort(t);
      const dy = Math.max(50, Math.abs(tp.y - s.y) * 0.5);
      const d = `M ${s.x} ${s.y} C ${s.x} ${s.y + dy}, ${tp.x} ${tp.y - dy}, ${tp.x} ${tp.y}`;
      frozenEl = (
        <path
          d={d}
          stroke={C.accent}
          strokeOpacity={0.8}
          strokeWidth={2}
          fill="none"
        />
      );
    }
  }

  let liveEl: React.ReactElement | null = null;
  if (liveArrow) {
    const f = chats.find((c) => c.id === liveArrow.fromId);
    if (f) {
      const s = bottomPort(f);
      const dy = Math.max(50, Math.abs(liveArrow.y2 - s.y) * 0.5);
      const d = `M ${s.x} ${s.y} C ${s.x} ${s.y + dy}, ${liveArrow.x2} ${liveArrow.y2 - dy}, ${liveArrow.x2} ${liveArrow.y2}`;
      const col =
        liveArrow.validTarget === null
          ? C.textDim
          : liveArrow.validTarget
            ? C.success
            : C.danger;
      liveEl = (
        <path
          d={d}
          stroke={col}
          strokeOpacity={0.85}
          strokeWidth={1.75}
          strokeDasharray="5,5"
          fill="none"
        />
      );
    }
  }

  return (
    <svg
      className="gl"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "all",
        zIndex: 0,
      }}
    >
      {gridEls}
      {edgeEls}
      {frozenEl}
      {liveEl}
      {midChips}
    </svg>
  );
}
