'use client'

/**
 * A Matches session's own view on the leaderboard: its matches down the
 * page in order of play, one row each (Ross, 9 Nov 2026) — the left tag's
 * players on the left, the right tag's on the right, and between them where
 * the match stands: solid in the winner's colour once it is over, softened
 * in the colour of whoever is ahead while it is in play, the brown for all
 * square (lib/faceOff.ts `matchStatus`). The side ahead is washed in its
 * colour. Each row opens its card; a slot with no match yet says so and
 * opens nothing. Never gold (D39).
 */

import Link from 'next/link'
import type { SessionMatchResult } from '@/lib/sessions'
import { matchStatus, softened } from '@/lib/faceOff'
import { sideColours, sideTint, type SideColour } from '@/lib/matchSides'
import { tagOfTeam } from '@/lib/tagBoards'
import type { Membership } from '@/lib/teamSets'
import { cardClass } from '@/app/components/ui'
import { useTripBase } from '@/app/golf/[root]/[tripCode]/TripBase'

type P = { id: string; name: string }
type T = { id: string; name: string; color: string }

export default function SessionMatchList({
  matches, players, teams, memberships, tripCode, slots = 0, tags = [], nameById,
}: {
  matches: SessionMatchResult[]
  players: P[]
  teams: T[]
  memberships: Membership[]
  tripCode: string
  /** How many matches the session holds — a row for each, set or not. */
  slots?: number
  /** The two tags facing off, left first — a match is drawn their way round. */
  tags?: T[]
  /** What the board prints for a player (lib/displayNames.ts). */
  nameById?: Map<string, string>
}) {
  const tripHome = useTripBase(tripCode)
  const nameOf = (id: string) => nameById?.get(id) ?? players.find(p => p.id === id)?.name.split(' ')[0] ?? '—'
  const tagOf = (ids: string[]) => {
    const id = ids.length ? tagOfTeam(ids, memberships) : null
    return id ? teams.find(t => t.id === id) ?? null : null
  }
  const two = tags.length === 2 ? tags : null

  const bySlot = new Map(matches.map(m => [m.slot, m]))
  const rowCount = Math.max(slots, ...matches.map(m => m.slot + 1), 0)
  if (rowCount === 0) {
    return (
      <p className={`p-4 text-ink/65 text-sm text-center ${cardClass('flat')}`}>
        No matches yet — they are set on the tee sheet, or in the order of play.
      </p>
    )
  }

  const names = (ids: string[], align: 'left' | 'right') => ids.length === 0 ? (
    <p className={`text-ink/65 text-[14px] ${align === 'right' ? 'text-right' : ''}`}>To be set</p>
  ) : ids.map(id => (
    <p key={id} className={`font-serif text-[15px] text-ink font-semibold leading-tight truncate ${align === 'right' ? 'text-right' : ''}`}>
      {nameOf(id)}
    </p>
  ))

  return (
    <ul className={`overflow-hidden ${cardClass()}`}>
      {Array.from({ length: rowCount }, (_, slot) => {
        const m = bySlot.get(slot)
        // Drawn the tags' way round: the left tag's side on the left.
        const flip = !!m && !!two && tagOf(m.sideA)?.id !== two[0].id && tagOf(m.sideB)?.id === two[0].id
        const leftIds = m ? (flip ? m.sideB : m.sideA) : []
        const rightIds = m ? (flip ? m.sideA : m.sideB) : []
        const leftTag = two?.[0] ?? (m ? tagOf(leftIds) : null)
        const rightTag = two?.[1] ?? (m ? tagOf(rightIds) : null)
        const colours = sideColours(leftTag?.color, rightTag?.color)
        const status = m ? matchStatus(m) : null
        // The status's side, the tags' way round.
        const tone = !status ? 'none'
          : status.tone === 'a' ? (flip ? 'right' : 'left')
          : status.tone === 'b' ? (flip ? 'left' : 'right')
          : status.tone
        const sideC: SideColour | null = tone === 'left' ? colours.A : tone === 'right' ? colours.B : null
        const pill = sideC
          ? (status!.final ? { background: sideC.fill, color: sideC.on } : { background: softened(sideC.fill) })
          : tone === 'half'
            ? { background: status!.final ? softened('var(--color-bark)') : 'color-mix(in srgb, var(--color-bark) 22%, transparent)' }
            : undefined
        const wash = (side: 'left' | 'right') => (tone === side && sideC ? sideTint(sideC, status!.final ? 20 : 10) : undefined)

        const row = (
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch min-h-[64px]">
            <div className="relative min-w-0 py-3 pl-4 pr-2 flex flex-col justify-center" style={{ background: wash('left') }}>
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: colours.A.fill }} aria-hidden="true" />
              {names(leftIds, 'left')}
            </div>
            <div className="w-[84px] flex flex-col items-center justify-center gap-1 px-1">
              {status && status.tone !== 'none' ? (
                <span className="min-w-[56px] px-2.5 py-1 rounded-full text-center font-serif text-[15px] font-semibold leading-none text-ink"
                  style={pill}>
                  {status.main}
                </span>
              ) : (
                <span className="t-label text-ink/65">vs</span>
              )}
              <span className="t-cap text-ink/65">{status?.sub ?? `Match ${slot + 1}`}</span>
            </div>
            <div className="relative min-w-0 py-3 pr-4 pl-2 flex flex-col justify-center items-end" style={{ background: wash('right') }}>
              <span className="absolute inset-y-0 right-0 w-[3px]" style={{ background: colours.B.fill }} aria-hidden="true" />
              {names(rightIds, 'right')}
            </div>
          </div>
        )
        return (
          <li key={slot} className={slot > 0 ? 'border-t border-line' : ''}>
            {m && m.sideA.length > 0 && m.sideB.length > 0 ? (
              <Link href={`${tripHome}/session/${m.roundId}/match/${m.slot}/card`}
                className="block active:bg-tint"
                aria-label={`Match ${slot + 1}: ${leftIds.map(nameOf).join(' & ')} v ${rightIds.map(nameOf).join(' & ')}, ${status?.main === 'vs' ? 'not started' : status?.main}`}>
                {row}
              </Link>
            ) : row}
          </li>
        )
      })}
    </ul>
  )
}
