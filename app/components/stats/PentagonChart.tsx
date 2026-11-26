'use client'

import { useState } from 'react'
import { formatGained } from '@/lib/holeStats'

/** One spoke of the pentagon. `value` is strokes gained per round. */
export type PentagonAxis = {
  key: string
  label: string
  value: number
  /** The readout's second half — sample size, usually. */
  detail?: string
}

const ACCENT = 'var(--color-accent)'
const ACCENT_DEEP = 'var(--color-accent-deep)'
const INK = 'var(--color-ink)'
const BARK = 'var(--color-bark)'

/**
 * The scale the rings are drawn on: whole strokes, never narrower than
 * −2.5 to +2.5, widened to whatever the figures need — a scratch benchmark
 * puts a twenty-handicapper's long game a long way inside the zero ring.
 */
function scaleFor(values: number[]): { min: number; max: number; rings: number[] } {
  const min = Math.min(-2.5, Math.floor(Math.min(...values)) - 0.5)
  const max = Math.max(2.5, Math.ceil(Math.max(...values)) + 0.5)
  const span = max - min
  const step = span > 24 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1
  const rings: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) if (v !== 0) rings.push(v)
  return { min, max, rings }
}

/**
 * The DataGolf-style pentagon, the site's one: five spokes on concentric
 * rings, the player's five figures joined into one shape. A big pentagon is
 * a good spell; a lopsided one says where the game leaks in a single glance.
 * The stats hub draws it against the field, a golfer's career page against a
 * benchmark golfer (lib/careerStats.ts).
 *
 * **The rings are fixed steps of strokes gained per round, not
 * percentiles** — fixed rings let two shapes be compared honestly. The zero
 * ring — level with the field, or the benchmark — is drawn dashed and
 * heavier, because which side of it a vertex sits is the encoding and the
 * fill only agrees. `zeroLabel` names it.
 *
 * The axes are deliberately not independent: Total is putting plus tee to
 * green, and tee to green is driving plus approach. That redundancy is what
 * makes the shape readable.
 */
export function PentagonChart({ axes, hint, zeroLabel }: {
  axes: PentagonAxis[]
  hint: string
  /** What the zero ring is — "Your handicap", "Scratch". Absent, it goes unnamed. */
  zeroLabel?: string
}) {
  const [pinned, setPinned] = useState<number | null>(null)
  if (axes.length !== 5) return null

  const W = 328
  const H = 252
  const CX = W / 2
  const CY = 128
  const R = 88
  /**
   * The floor ring. The scale's minimum renders here, not at the centre —
   * two poor figures collapsing to the middle turned the pentagon into a V,
   * with the shape's worst corners carrying no shape at all. A quarter of
   * the radius keeps even a bad profile a visible five-sided thing.
   */
  const R_FLOOR = 24
  const { min: MIN, max: MAX, rings } = scaleFor(axes.map(a => a.value))
  const rOf = (v: number) =>
    R_FLOOR + (R - R_FLOOR) * (Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 5
  const pt = (i: number, r: number): [number, number] =>
    [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))]
  const ring = (v: number) =>
    Array.from({ length: 5 }, (_, i) => pt(i, rOf(v)).map(n => n.toFixed(1)).join(',')).join(' ')

  const shape = axes
    .map((a, i) => pt(i, rOf(a.value)).map(n => n.toFixed(1)).join(','))
    .join(' ')

  const current = pinned != null ? axes[pinned] : null

  return (
    <div className="pt-3">
      <p className="t-cap text-ink/65 leading-snug mb-1" aria-live="polite">
        {current
          ? <>
              <span className="text-ink">{current.label}</span>
              {' · '}
              <span className="t-num text-ink">{formatGained(current.value)}</span>
              <span className="text-ink/50"> a round</span>
              {current.detail ? <span className="text-ink/50"> — {current.detail}</span> : null}
            </>
          : hint}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto font-serif"
        role="img"
        aria-label={`Strokes gained a round: ${axes.map(a => `${a.label} ${formatGained(a.value)}`).join(', ')}`}
      >
        {rings.map(v => (
          <polygon key={v} points={ring(v)} fill="none"
            stroke={BARK} strokeOpacity="0.12" strokeWidth="1" />
        ))}
        <polygon points={ring(0)} fill="none"
          stroke={BARK} strokeOpacity="0.45" strokeWidth="1.25" strokeDasharray="3 3" />
        {/* The spokes, centre to rim. */}
        {axes.map((_, i) => {
          const [x, y] = pt(i, R)
          return (
            <line key={i} x1={CX} y1={CY} x2={x} y2={y}
              stroke={BARK} strokeOpacity="0.12" strokeWidth="1" />
          )
        })}

        {/* The player. */}
        <polygon points={shape} fill={ACCENT} fillOpacity="0.16"
          stroke={ACCENT_DEEP} strokeWidth="1.75" strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = pt(i, rOf(a.value))
          const isPinned = pinned === i
          return (
            <circle key={a.key} cx={x} cy={y} r={isPinned ? 4.5 : 3}
              fill={isPinned ? ACCENT_DEEP : ACCENT} />
          )
        })}

        {/* Labels sit past the rim, with the signed figure underneath —
            the number is on the chart, not behind a tap. */}
        {axes.map((a, i) => {
          const [x, y] = pt(i, R + 14)
          const c = Math.cos(angle(i))
          const anchor = Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end'
          const isPinned = pinned === i
          return (
            <g key={a.key}>
              <text x={x} y={y} textAnchor={anchor} fontSize="12"
                fill={INK} fillOpacity={isPinned ? 0.95 : 0.65}>
                {a.label}
              </text>
              <text x={x} y={y + 14} textAnchor={anchor} fontSize="12"
                fontWeight="600" fill={INK} fillOpacity={isPinned ? 1 : 0.85}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatGained(a.value)}
              </text>
              {/* The tap target: a generous circle over the vertex region. */}
              <circle cx={x} cy={y} r="30" fill="transparent"
                role="button"
                aria-pressed={isPinned}
                aria-label={`${a.label}: ${formatGained(a.value)} a round`}
                onClick={() => setPinned(isPinned ? null : i)} />
            </g>
          )
        })}
      </svg>
      {zeroLabel && (
        <p className="t-cap text-ink/50 flex items-center justify-end gap-2 -mt-1">
          <svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" stroke={BARK} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
          {zeroLabel}
        </p>
      )}
    </div>
  )
}
