'use client'

/**
 * The hub's charts, drawn by hand.
 *
 * Inline SVG rather than a library: at this data's scale — a handful of
 * rounds, eighteen holes — a charting library is a hundred kilobytes of
 * JavaScript to draw twelve rectangles, on a phone stood on a golf course.
 *
 * Two rules carried from the dataviz method, and the reason they matter
 * here specifically:
 *
 * **Position encodes, colour reinforces.** Emerald-for-gain and
 * rust-for-loss is the app's own law, and it is also a red/green pair a
 * deutan reader cannot separate — the palette validator says so (ΔE 4.8,
 * under every floor). So polarity is never carried by colour alone: a
 * gained bar sits on one side of the zero line and a lost bar on the
 * other, every readout figure is signed, and the hue is reinforcement for
 * the readers who get it.
 *
 * **Text wears text tokens.** Figures and labels print in ink at the
 * app's opacities, never in a series colour.
 *
 * Every bar has a full-height tap target wider than the mark, and a tap
 * pins a readout above the chart — hover is not a thing a phone has.
 * Nothing here derives a figure: the caller hands values in, drawn as
 * given.
 */

import { useState } from 'react'
import { formatGained } from '@/lib/holeStats'

/** One bar of a ± chart. `detail` is the readout's second half. */
export type GainedBar = {
  label: string
  value: number
  detail?: string
}

const ACCENT = 'var(--color-accent)'
const ACCENT_DEEP = 'var(--color-accent-deep)'
const RUST = 'var(--color-rust)'
const INK = 'var(--color-ink)'
const BARK = 'var(--color-bark)'

/**
 * Gained per round: vertical bars either side of a zero line.
 *
 * One bar per round — the total, with the split kept for the tap readout
 * rather than drawn as a second series. A grouped chart here needs a
 * legend, and a legend on a phone-width panel is clutter standing where
 * the answer should be.
 */
export function GainedByRoundChart({ bars, hint }: {
  bars: GainedBar[]
  /** What the reader is looking at, shown until they tap a bar. */
  hint: string
}) {
  const [pinned, setPinned] = useState<number | null>(null)
  if (bars.length < 2) return null

  const W = 320
  const H = 132
  const PAD_X = 8
  /** The y-axis gutter. A chart read as "how much" needs its scale printed. */
  const PAD_L = 30
  const LABEL_H = 20
  const plotH = H - LABEL_H

  // The domain is what the data needs, zero always in it — a symmetric
  // domain would centre the zero line and waste half the height whenever a
  // trip's rounds all went one way.
  const top = Math.max(0, ...bars.map(b => b.value))
  const bottom = Math.min(0, ...bars.map(b => b.value))
  const span = Math.max(top - bottom, 1)
  const yOf = (v: number) => 8 + ((top - v) / span) * (plotH - 16)
  const zeroY = yOf(0)

  // Whole strokes up the axis, thinned to every other one when the range
  // would crowd them. Zero is left to the zero line, which is heavier.
  const step = span > 4 ? 2 : 1
  const ticks: number[] = []
  for (let v = Math.ceil(bottom / step) * step; v <= top + 1e-9; v += step) {
    if (v !== 0) ticks.push(v)
  }

  const slot = (W - PAD_L - PAD_X) / bars.length
  const barW = Math.min(28, Math.max(10, slot - 8))

  const current = pinned != null ? bars[pinned] : null

  return (
    <div className="pt-3">
      <p className="t-cap text-ink/65 leading-snug mb-1" aria-live="polite">
        {current
          ? <>
              <span className="text-ink">{current.label}</span>
              {' · '}
              <span className="t-num text-ink">{formatGained(current.value)}</span>
              {current.detail ? <span className="text-ink/50"> — {current.detail}</span> : null}
            </>
          : hint}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${hint}: ${bars.map(b => `${b.label} ${formatGained(b.value)}`).join(', ')}`}
      >
        {/* The scale, printed. Faint lines at the whole strokes, the number
            in the gutter; the zero line stays the heavier one because which
            side of it a bar falls is the encoding. */}
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_X} y1={yOf(v)} y2={yOf(v)}
              stroke={BARK} strokeOpacity="0.08" strokeWidth="1" />
            <text x={PAD_L - 5} y={yOf(v) + 3.5} textAnchor="end" fontSize="11"
              fill={INK} fillOpacity="0.45"
              style={{ fontVariantNumeric: 'tabular-nums' }}>
              {v > 0 ? `+${v}` : String(v)}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - PAD_X} y1={zeroY} y2={zeroY}
          stroke={BARK} strokeOpacity="0.25" strokeWidth="1" />
        <text x={PAD_L - 5} y={zeroY + 3.5} textAnchor="end" fontSize="11"
          fill={INK} fillOpacity="0.6"
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          0
        </text>

        {bars.map((b, i) => {
          const x = PAD_L + slot * i + (slot - barW) / 2
          const y = Math.min(zeroY, yOf(b.value))
          const h = Math.max(2, Math.abs(yOf(b.value) - zeroY))
          const up = b.value >= 0
          const isPinned = pinned === i
          return (
            <g key={b.label}>
              <rect
                x={x} y={y} width={barW} height={h}
                rx="4"
                fill={up ? (isPinned ? ACCENT_DEEP : ACCENT) : RUST}
                fillOpacity={isPinned ? 1 : 0.75}
              />
              <text
                x={x + barW / 2} y={H - 6}
                textAnchor="middle" fontSize="12"
                fill={INK} fillOpacity={isPinned ? 0.9 : 0.5}
              >
                {b.label}
              </text>
              {/* The tap target is the whole column, not the mark. */}
              <rect
                x={PAD_L + slot * i} y={0} width={slot} height={H}
                fill="transparent"
                role="button"
                aria-pressed={isPinned}
                aria-label={`${b.label}: ${formatGained(b.value)}`}
                onClick={() => setPinned(isPinned ? null : i)}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** One spoke of the pentagon. `value` is strokes gained per round. */
export type PentagonAxis = {
  key: string
  label: string
  value: number
  /** The readout's second half — sample size, usually. */
  detail?: string
}

/**
 * The DataGolf-style pentagon: five spokes on concentric rings, the
 * player's five figures joined into one shape. A big pentagon is a good
 * trip; a lopsided one says where the game leaks in a single glance.
 *
 * **The rings are fixed steps of strokes gained per round (−2 … +2), not
 * percentiles** — a trip's field is too small for percentiles to mean
 * much, and fixed rings let two players' shapes be compared honestly. The
 * zero ring — level with the field — is drawn heavier, because which side
 * of it a vertex sits is the encoding and the fill only agrees.
 *
 * The axes are deliberately not independent: Total is putting plus tee to
 * green, and tee to green is driving plus approach. That redundancy is
 * what makes the shape readable, and it is how the original works too.
 */
export function PentagonChart({ axes, hint }: {
  axes: PentagonAxis[]
  hint: string
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
  // The scale: −2.5 at the floor ring, +2.5 at the rim, rings at the integers.
  const MIN = -2.5
  const MAX = 2.5
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
        className="w-full h-auto"
        role="img"
        aria-label={`Strokes gained a round: ${axes.map(a => `${a.label} ${formatGained(a.value)}`).join(', ')}`}
      >
        {/* Rings at whole strokes; zero — level with the field — heavier. */}
        {[-2, -1, 1, 2].map(v => (
          <polygon key={v} points={ring(v)} fill="none"
            stroke={BARK} strokeOpacity="0.12" strokeWidth="1" />
        ))}
        <polygon points={ring(0)} fill="none"
          stroke={BARK} strokeOpacity="0.35" strokeWidth="1.25" />
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
    </div>
  )
}

/** One hole of the difficulty profile. */
export type ProfileBar = {
  holeNumber: number
  par: number
  strokeIndex: number
  averageToPar: number
  cards: number
}

/**
 * The course's difficulty, hole by hole in playing order.
 *
 * The table above ranks hardest-first; this is the same data laid out the
 * way the course is walked, which is where the shape lives — the brutal
 * stretch, the breather, the finish. Bars are neutral because height
 * already says everything; the pinned one turns emerald as a selection,
 * not a meaning.
 */
export function DifficultyProfileChart({ holes }: { holes: ProfileBar[] }) {
  const [pinned, setPinned] = useState<number | null>(null)
  if (holes.length < 6) return null

  const ordered = [...holes].sort((a, b) => a.holeNumber - b.holeNumber)
  const W = 328
  const H = 140
  const PAD_X = 6
  const LABEL_H = 20
  const plotH = H - LABEL_H

  const top = Math.max(0.5, ...ordered.map(h => h.averageToPar))
  const bottom = Math.min(0, ...ordered.map(h => h.averageToPar))
  const span = top - bottom
  const yOf = (v: number) => 8 + ((top - v) / span) * (plotH - 16)
  const zeroY = yOf(0)

  const slot = (W - PAD_X * 2) / ordered.length
  const barW = Math.max(6, slot - 3)

  const current = pinned != null ? ordered[pinned] : null

  return (
    <div className="mb-2 pt-2">
      {/* The readout appears only when a bar is pinned — no standing
          explainer, by request. The chart is the round as it is walked. */}
      {current && (
        <p className="t-cap text-ink/65 leading-snug mb-1" aria-live="polite">
          <span className="text-ink">Hole {current.holeNumber}</span>
          <span className="text-ink/50"> · par {current.par} · SI {current.strokeIndex} · </span>
          <span className="t-num text-ink">
            {current.averageToPar >= 0 ? '+' : ''}{(Math.round(current.averageToPar * 10) / 10).toFixed(1)}
          </span>
          <span className="text-ink/50"> over {current.cards} card{current.cards === 1 ? '' : 's'}</span>
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Average score to par by hole, in course order"
      >
        <line x1={PAD_X} x2={W - PAD_X} y1={zeroY} y2={zeroY}
          stroke={BARK} strokeOpacity="0.25" strokeWidth="1" />
        {ordered.map((h, i) => {
          const x = PAD_X + slot * i + (slot - barW) / 2
          const y = Math.min(zeroY, yOf(h.averageToPar))
          const height = Math.max(2, Math.abs(yOf(h.averageToPar) - zeroY))
          const isPinned = pinned === i
          return (
            <g key={h.holeNumber}>
              <rect
                x={x} y={y} width={barW} height={height} rx="3"
                fill={isPinned ? ACCENT_DEEP : BARK}
                fillOpacity={isPinned ? 1 : 0.35}
              />
              {(h.holeNumber === 1 || h.holeNumber % 3 === 0) && (
                <text
                  x={x + barW / 2} y={H - 6}
                  textAnchor="middle" fontSize="11"
                  fill={INK} fillOpacity="0.5"
                >
                  {h.holeNumber}
                </text>
              )}
              <rect
                x={PAD_X + slot * i} y={0} width={slot} height={H}
                fill="transparent"
                role="button"
                aria-pressed={isPinned}
                aria-label={`Hole ${h.holeNumber}: ${h.averageToPar >= 0 ? '+' : ''}${h.averageToPar.toFixed(1)} to par`}
                onClick={() => setPinned(isPinned ? null : i)}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
