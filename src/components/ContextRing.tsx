import { C, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  used: number;
  limit: number;
  size?: number;
  /** Show text label next to the ring. Default: true for larger rings. */
  label?: boolean;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n < 1_000_000) return Math.round(n / 1000) + "k";
  return (n / 1_000_000).toFixed(1) + "m";
}

export function ContextRing({ used, limit, size = 22, label = true }: Props) {
  const frac = limit > 0 ? Math.min(1, used / limit) : 0;
  const pct = Math.round(frac * 100);

  const r = size / 2 - 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * frac;

  const stroke =
    frac >= 0.95 ? C.danger : frac >= 0.8 ? C.accent : C.textMut;
  const track = C.cardBd;

  return (
    <div
      title={`${used.toLocaleString()} / ${limit.toLocaleString()} tokens (${pct}%)`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONT_SANS,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track}
          strokeWidth={2}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2}) scale(1 -1) translate(0 ${-size})`}
          style={{ transition: "stroke-dasharray 0.3s, stroke 0.2s" }}
        />
      </svg>
      {label && (
        <span
          style={{
            fontSize: 10.5,
            color: stroke,
            fontFamily: FONT_MONO,
            fontWeight: 500,
            letterSpacing: 0.2,
          }}
        >
          {fmtTokens(used)}
          <span style={{ color: C.textDim }}>
            /{fmtTokens(limit)}
          </span>
        </span>
      )}
    </div>
  );
}
