'use client'

import { ordinal, type CardHole, type CardSideKey, type CardSideView, type HoleOutcome } from '@/lib/matchCard'
import type { SideColour } from '@/lib/matchSides'

/**
 * The match hole by hole — the one copy of the table, drawn by the card's
 * Scorecard panel while the match is going (Ross, 26 Oct 2026: anybody may
 * look, to see how the players are playing and how it has gone so far) and
 * by the end-of-match sheet once it is finalised.
 *
 * A row a hole that has a score on it: par, each player's gross (NR for a
 * pick-up), the winner's figure filled in their side colour, a dot in the
 * winner's colour — the brown for a half, nothing while the hole is still
 * being played — and where the match stood after it. Gross totals at the
 * foot, over the holes each player has scored.
 */
export function MatchScoresTable({ a, b, colours, holes, outcomes, scores, finishedOnly = false }: {
  a: CardSideView
  b: CardSideView
  colours: Record<CardSideKey, SideColour>
  holes: CardHole[]
  outcomes: HoleOutcome[]
  scores: Record<string, Record<number, number | null>>
  /** Only the holes with a result — the finished card. */
  finishedOnly?: boolean
}) {
  const players = [...a.players.map(p => ({ ...p, side: 'A' as const })), ...b.players.map(p => ({ ...p, side: 'B' as const }))]
  const many = players.length > 2
  const scored = (n: number) => players.some(p => scores[p.id]?.[n] !== undefined)
  const rows = holes
    .map(h => ({ h, o: outcomes.find(o => o.holeNumber === h.holeNumber) }))
    .filter(({ h, o }) => (o?.winner ?? null) !== null || (!finishedOnly && scored(h.holeNumber)))

  // Where the match stood after each hole: holes up, A's way positive.
  let margin = 0
  const standing = new Map<number, number>()
  for (const { h, o } of rows) {
    if (o?.winner === 'A') margin++
    else if (o?.winner === 'B') margin--
    if (o?.winner) standing.set(h.holeNumber, margin)
  }

  const scoreOf = (pid: string, n: number) => {
    const g = scores[pid]?.[n]
    return g === null ? 'NR' : g === undefined ? '–' : String(g)
  }
  const fillOf = (o: HoleOutcome) => o.winner === 'A' ? colours.A.fill
    : o.winner === 'B' ? colours.B.fill : 'color-mix(in srgb, var(--color-bark) 45%, transparent)'
  const holeName = (n: number) => n > 18 ? ordinal(n) : String(n)
  const totalOf = (pid: string) => rows.reduce((t, { h }) => {
    const g = scores[pid]?.[h.holeNumber]
    return typeof g === 'number' ? t + g : t
  }, 0)

  if (rows.length === 0) {
    return <p className="text-ink/65 text-sm text-center mt-6">Nothing scored yet — the card fills in as the holes are played.</p>
  }

  return (
    <table className="w-full text-center border-separate border-spacing-y-1" aria-label="Scores hole by hole">
      <thead>
        <tr className="t-eyebrow text-ink/65">
          <th className="font-normal text-left pl-2 w-11">Hole</th>
          <th className="font-normal w-9">Par</th>
          {players.map(p => (
            <th key={p.id} className="font-normal px-1">
              <span className="block h-1 rounded-full mb-1" style={{ backgroundColor: colours[p.side].fill }} aria-hidden="true" />
              <span className={`block truncate normal-case tracking-normal t-cap font-semibold text-ink ${many ? 'max-w-[16vw]' : ''}`}>{p.name}</span>
            </th>
          ))}
          <th className="w-6"><span className="sr-only">Won by</span></th>
          <th className="font-normal w-12 pr-2">Thru</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ h, o }) => {
          const after = standing.get(h.holeNumber)
          const leader: CardSideKey | null = after === undefined || after === 0 ? null : after > 0 ? 'A' : 'B'
          return (
            <tr key={h.holeNumber} className="bg-surface">
              <td className="text-left pl-2 py-1.5 rounded-l-lg t-label text-ink">{holeName(h.holeNumber)}</td>
              <td className="t-cap text-ink/65">{h.par}</td>
              {players.map(p => {
                const won = o?.winner === p.side
                return (
                  <td key={p.id} className="px-1">
                    <span
                      className={`inline-flex items-center justify-center min-w-9 h-8 px-1.5 rounded-lg font-serif text-lg tabular-nums ${won ? 'font-semibold' : 'text-ink/80'}`}
                      style={won ? { backgroundColor: colours[p.side].fill, color: colours[p.side].on } : undefined}
                    >
                      {o?.conceded && o.winner !== p.side ? '–' : scoreOf(p.id, h.holeNumber)}
                    </span>
                  </td>
                )
              })}
              <td>
                {o?.winner && (
                  <span
                    className="inline-block w-3 h-3 rounded-full align-middle"
                    style={{ backgroundColor: fillOf(o) }}
                    aria-label={o.winner === 'halved' ? 'Halved' : `${o.winner === 'A' ? a.name : b.name} won it`}
                  />
                )}
              </td>
              <td className="rounded-r-lg pr-2 t-cap font-semibold" style={leader ? { color: colours[leader].fill } : undefined}>
                {after === undefined ? '' : after === 0 ? <span className="text-ink/65 font-normal">AS</span> : `${Math.abs(after)} up`}
              </td>
            </tr>
          )
        })}
        <tr>
          <td className="text-left pl-2 pt-2 t-label text-ink">Total</td>
          <td />
          {players.map(p => (
            <td key={p.id} className="pt-2 font-serif text-lg text-ink tabular-nums">{totalOf(p.id)}</td>
          ))}
          <td />
          <td />
        </tr>
      </tbody>
    </table>
  )
}
