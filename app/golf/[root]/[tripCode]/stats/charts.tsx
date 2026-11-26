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
 * brown-for-loss is the app's own law (lib/resultTone.ts — never red for a
 * loss: it was rust once, a red/green pair a deutan reader cannot separate).
 * Polarity is still never carried by colour alone: a
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
        className="w-full h-auto font-serif"
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
                fill={up ? (isPinned ? ACCENT_DEEP : ACCENT) : BARK}
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

// The pentagon is the site's one (app/components/stats/PentagonChart.tsx):
// the stats hub and a golfer's career stats draw the same chart.
export { PentagonChart, type PentagonAxis } from '@/app/components/stats/PentagonChart'

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
        className="w-full h-auto font-serif"
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
