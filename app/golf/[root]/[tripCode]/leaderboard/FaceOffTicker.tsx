'use client'

/**
 * Two tags facing off, as a ticker (Ross, 9 Nov 2026): each tag's points in
 * a block of its own colour at either end, the points up for grabs and what
 * wins it between them, and a mark for every point across the card — the
 * left tag's filling in from the left edge, the right tag's from the right,
 * a match in play in a softened version of the colour of whoever is ahead.
 * The marks are score entry's hole strip; the sums are lib/faceOff.ts.
 */

import { type FaceOff, type TickFill, softened } from '@/lib/faceOff'
import { formatPoints } from '@/lib/sessions'
import type { SideColour } from '@/lib/matchSides'
import { cardClass, LiveDot } from '@/app/components/ui'

/**
 * One mark: its bands side by side inside it, left to right — solid where
 * one covers it, split where a half meets it. Pieces, never a gradient
 * (the style guide's rule).
 */
function Tick({ t, left, right }: { t: TickFill; left: SideColour; right: SideColour }) {
  const bands: [number, string][] = [
    [t.leftWon, left.fill],
    [t.leftLive, softened(left.fill)],
    [Math.max(0, 1 - t.leftWon - t.leftLive - t.rightLive - t.rightWon), 'var(--color-tint)'],
    [t.rightLive, softened(right.fill)],
    [t.rightWon, right.fill],
  ]
  return (
    <div className="h-2 rounded-full overflow-hidden flex bg-tint" style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
      {bands.filter(([w]) => w > 1e-6).map(([w, c], i) => (
        <div key={i} className="h-full" style={{ width: `${(w * 100).toFixed(2)}%`, background: c }} />
      ))}
    </div>
  )
}

export default function FaceOffTicker({ face, left, right }: {
  face: FaceOff
  left: SideColour
  right: SideColour
}) {
  const score = (points: number, c: SideColour, name: string) => (
    <div
      className="min-w-[64px] px-3 py-2 rounded-tile text-center"
      style={{ background: c.fill, color: c.on }}
      aria-label={`${name} ${formatPoints(points)}`}
    >
      <span className="font-serif text-[32px] font-semibold leading-none tabular-nums">{formatPoints(points)}</span>
    </div>
  )
  const projected = face.live > 0
    && (face.left.projected !== face.left.points || face.right.projected !== face.right.points)

  return (
    <div className={`p-4 mb-4 ${cardClass()}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="t-label text-ink truncate min-w-0">{face.left.name}</p>
        <p className="t-label text-ink truncate min-w-0 text-right">{face.right.name}</p>
      </div>

      <div className="flex items-center justify-between gap-3 mt-2">
        {score(face.left.points, left, face.left.name)}
        <div className="text-center min-w-0">
          {face.winner ? (
            <p className="t-card text-ink">{face.winner === 'left' ? face.left.name : face.right.name} win</p>
          ) : (
            <p className="t-card text-ink">{formatPoints(face.toWin)} to win</p>
          )}
          <p className="t-cap text-ink/65 mt-0.5">{formatPoints(face.total)} points up for grabs</p>
        </div>
        {score(face.right.points, right, face.right.name)}
      </div>

      {face.ticks.length > 0 && (
        <div className="relative mt-4" aria-hidden="true">
          <div className="flex gap-[3px] items-center">
            {face.ticks.map((t, i) => <Tick key={i} t={t} left={left} right={right} />)}
          </div>
          {/* Halfway — what the left fills towards and the right back to. */}
          <div className="absolute left-1/2 -top-1.5 -bottom-1.5 w-px -translate-x-1/2 bg-ink/65" />
        </div>
      )}

      {projected && (
        <p className="t-cap text-ink/65 mt-3 flex items-center justify-center gap-1.5">
          <LiveDot />
          <span>
            {face.live === 1 ? '1 match' : `${face.live} matches`} in play · as they stand {formatPoints(face.left.projected)}–{formatPoints(face.right.projected)}
          </span>
        </p>
      )}
    </div>
  )
}
