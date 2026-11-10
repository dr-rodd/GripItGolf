'use client'

/**
 * A Matches session's own view on the leaderboard: its matches down the
 * page in order of play, one row each (Ross, 9 Nov 2026) — the left tag's
 * players on the left, the right tag's on the right, and between them where
 * the match stands: solid in the winner's colour once it is over, softened
 * in the colour of whoever is ahead while it is in play, the brown for all
 * square (lib/faceOff.ts `matchStatus`). The side ahead is washed in its
 * colour. A slot with no match yet says so and opens nothing. Never gold
 * (D39).
 *
 * **The leaderboard is a viewer** (Ross, 10 Nov 2026): there a row slides
 * its match open beneath it, hole by hole — the strip of marks and the
 * scores — the site's rule for one card to show; it never leaves for the
 * card to score. The Scoring tab's list (`toScore`) goes into scoring for a
 * phone that may alter the match's score (`mayScoreCard`: its players, the
 * organiser with the lock open, or anybody while `score_session_matches` is
 * on) — every other phone gets the same scorecard slider as the leaderboard.
 */

import { useState } from 'react'
import Link from 'next/link'
import type { SessionMatchResult } from '@/lib/sessions'
import MatchDetailView from '@/app/golf/[root]/[tripCode]/match/[matchId]/card/MatchDetailView'
import { matchStatus, softened } from '@/lib/faceOff'
import { sideColours, sideTint, type SideColour } from '@/lib/matchSides'
import { tagOfTeam } from '@/lib/tagBoards'
import type { Membership } from '@/lib/teamSets'
import { mayScoreCard } from '@/lib/matchCard'
import { isLocked } from '@/lib/passcode'
import { useUnlocked } from '@/app/components/useUnlocked'
import { cardClass } from '@/app/components/ui'
import { useTripBase } from '@/app/golf/[root]/[tripCode]/TripBase'

type P = { id: string; name: string }
type T = { id: string; name: string; color: string }

export default function SessionMatchList({
  matches, players, teams, memberships, tripCode, slots = 0, tags = [], nameById, toScore = false, scoring = null,
}: {
  /**
   * The Scoring tab's list: a match opens its card to score, for a phone
   * that may (`scoring`). Elsewhere — the leaderboard — it opens the match
   * hole by hole, its scorecard (Ross, 10 Nov 2026: "rather than reverting
   * to the scoring screen").
   */
  toScore?: boolean
  /** The Scoring tab's rule for who scores: this phone's player, the PIN, the permission. */
  scoring?: { me: string | null; passcodeHash: string | null; anyoneScores: boolean } | null
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
  const [unlocked] = useUnlocked(tripCode)
  const organiser = unlocked || !isLocked(scoring?.passcodeHash ?? null)
  // The one match open beneath its row, and every one opened so far — kept
  // drawn so closing slides as opening does.
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())
  const toggle = (slot: number) => {
    setOpenSlot(o => (o === slot ? null : slot))
    setOpened(prev => (prev.has(slot) ? prev : new Set([...prev, slot])))
  }
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
        const set = !!m && m.sideA.length > 0 && m.sideB.length > 0
        const label = `Match ${slot + 1}: ${leftIds.map(nameOf).join(' & ')} v ${rightIds.map(nameOf).join(' & ')}, ${status?.main === 'vs' ? 'not started' : status?.main}`
        const isOpen = openSlot === slot
        // Into scoring for a phone that may alter the score; else the card.
        const goesToScore = toScore && !!m && mayScoreCard({
          decided: !!m.result,
          organiser,
          inMatch: !!scoring?.me && (m.sideA.includes(scoring.me) || m.sideB.includes(scoring.me)),
          anyoneScores: scoring?.anyoneScores ?? true,
        })
        // The card's own sides are A and B as stored; their colours follow
        // the tags' way round the row is drawn.
        const cardColours = flip ? { A: colours.B, B: colours.A } : colours
        return (
          <li key={slot} className={slot > 0 ? 'border-t border-line' : ''}>
            {!set ? row : goesToScore ? (
              <Link href={`${tripHome}/session/${m!.roundId}/match/${m!.slot}/card`}
                className="block active:bg-tint" aria-label={label}>
                {row}
              </Link>
            ) : (
              <>
                <button type="button" onClick={() => toggle(slot)} aria-expanded={isOpen} aria-label={label}
                  className="block w-full text-left active:bg-tint">
                  {row}
                </button>
                {/* The match hole by hole, sliding open beneath its row. */}
                <div className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }} aria-hidden={!isOpen}>
                  <div className="min-h-0 overflow-hidden">
                    {opened.has(slot) && (
                      <div className="px-3 pb-3 pt-2 border-t border-line bg-tint">
                        <MatchDetailView detail={m!.detail} colours={cardColours} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
