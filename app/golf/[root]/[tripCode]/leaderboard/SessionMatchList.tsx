'use client'

/**
 * A Matches session's own view on the leaderboard: its matches, each side
 * by its tag (or its players), "vs", and the result or the live standing in
 * the side colours (lib/matchSides.ts) — never gold (D39). Each match opens
 * its card. Words from lib/sessions.ts `matchLine`.
 */

import Link from 'next/link'
import { type SessionMatchResult, matchLine } from '@/lib/sessions'
import { sideColours } from '@/lib/matchSides'
import { tagOfTeam } from '@/lib/tagBoards'
import type { Membership } from '@/lib/teamSets'
import { cardClass, LiveDot } from '@/app/components/ui'
import { useTripBase } from '@/app/golf/[root]/[tripCode]/TripBase'

type P = { id: string; name: string }
type T = { id: string; name: string; color: string }

export default function SessionMatchList({ matches, players, teams, memberships, tripCode }: {
  matches: SessionMatchResult[]
  players: P[]
  teams: T[]
  memberships: Membership[]
  tripCode: string
}) {
  const tripHome = useTripBase(tripCode)
  const nameOf = (id: string) => players.find(p => p.id === id)?.name.split(' ')[0] ?? '—'
  const sideOf = (ids: string[]) => {
    const tagId = ids.length ? tagOfTeam(ids, memberships) : null
    const tag = tagId ? teams.find(t => t.id === tagId) ?? null : null
    return { tag, players: ids.map(nameOf).join(' & ') || 'To be set' }
  }
  if (matches.length === 0) {
    return (
      <p className={`p-4 text-ink/65 text-sm text-center ${cardClass('flat')}`}>
        No matches yet — they are set on the tee sheet, or in the order of play.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {[...matches].sort((a, b) => a.slot - b.slot).map(m => {
        const a = sideOf(m.sideA), b = sideOf(m.sideB)
        const colours = sideColours(a.tag?.color, b.tag?.color)
        const winner = m.result === 'a' ? colours.A : m.result === 'b' ? colours.B : null
        const line = matchLine(m, { a: a.tag?.name ?? a.players, b: b.tag?.name ?? b.players })
        return (
          <li key={m.id}>
            <Link href={`${tripHome}/session/${m.roundId}/match/${m.slot}/card`} className={`block p-4 ${cardClass('raised', true)}`}>
              <p className="t-cap text-ink/65">Match {m.slot + 1}</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-1">
                <p className="font-serif text-[15px] text-ink font-semibold leading-tight">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: colours.A.fill }} aria-hidden="true" />
                  {a.players}
                </p>
                <p className="t-label text-ink/65">vs</p>
                <p className="font-serif text-[15px] text-ink font-semibold leading-tight text-right">
                  {b.players}
                  <span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle" style={{ background: colours.B.fill }} aria-hidden="true" />
                </p>
              </div>
              <p className="t-label mt-2 flex items-center gap-1.5">
                {m.live && !m.result && <LiveDot />}
                {winner
                  ? <span className="px-2 py-0.5 rounded-full" style={{ background: winner.fill, color: winner.on }}>{line}</span>
                  : <span className={m.live ? 'text-accent-deep' : 'text-ink/65'}>{line}</span>}
              </p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
