'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { describeShortDate } from '@/lib/itinerary'
import { deadlineNote } from '@/lib/bracketSetup'
import {
  currentRound, describeProgress, describeResult, myNextMatch, opponentOf, portalRounds,
} from '@/lib/knockoutPortal'
import type { KnockoutView } from './knockout'
import type { LiveMatch } from './match/matchCards'
import { RESULT_PILL, sideTone, type ResultTone } from '@/lib/resultTone'
import { usePoll } from '@/app/scoring/usePoll'
import { cardClass } from '@/app/components/ui'
import { IconChevronRight } from '@/app/components/icons'

/**
 * A knockout from the player's side (docs/event-use-cases.md, story 2):
 * the hub's next-match card and the Scoring tab's portal of bracket rounds.
 * Both read `readKnockout`'s view through lib/knockoutPortal.ts; a match
 * opens its own page, `/trip/[code]/match/[id]`.
 */

const matchHref = (tripCode: string, id: string) => `/trip/${tripCode}/match/${id}`

/** "Play by Sat 14 Nov" for an open round, or nothing when no date is set. */
function roundDate(deadline: string | null, today: string, finished: boolean): string {
  if (!deadline) return ''
  return deadlineNote(deadline, describeShortDate(deadline) ?? deadline, { today, finished })
}

// ─── The hub ───────────────────────────────────────────────────

/**
 * The bird's-eye card on a match play event's hub: this player's next
 * match — who, which round, by when — opening the match itself, and the
 * draw at a glance under it. A player out of the draw, or a visitor, sees
 * the glance alone.
 */
export function NextMatchCard({ tripCode, view, live = null, today }: {
  tripCode: string
  view: KnockoutView
  /** The next match's card, when it is being played now. */
  live?: LiveMatch | null
  today: string
}) {
  const rounds = portalRounds(view.matches, view.entrantId, view.deadlines)
  if (rounds.length === 0) return null
  const now = currentRound(rounds)
  const progress = describeProgress(rounds)
  const next = myNextMatch(view.matches, view.entrantId)
  const nextRound = next ? rounds.find(r => r.roundNumber === next.roundNumber) : null
  const opponent = next && view.entrantId ? opponentOf(next, view.entrantId) : null
  const glance = [progress, now && now.played < now.total ? now.roundName : null].filter(Boolean).join(' · ')

  return (
    <div className="mt-4">
      {next && (
        <Link href={matchHref(tripCode, next.id)} className={`block px-5 py-4 ${cardClass('raised', true)}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="t-cap text-ink/65">Your next match · {next.roundName}</p>
              <p className="t-card text-ink truncate mt-0.5">
                {opponent ? `v ${view.names[opponent] ?? 'Opponent'}` : 'Opponent to be decided'}
              </p>
              {live ? (
                <p className="flex items-center gap-1.5 t-cap text-accent-deep mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent dot-live flex-shrink-0" aria-hidden="true" />
                  Live
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${RESULT_PILL[myTone(live, view.entrantId)]}`}>
                    {myStanding(live, view.entrantId)}
                  </span>
                </p>
              ) : nextRound?.deadline && (
                <p className={`t-cap mt-0.5 ${nextRound.deadline < today ? 'text-rust-deep' : 'text-ink/65'}`}>
                  {roundDate(nextRound.deadline, today, false)}
                </p>
              )}
            </div>
            <span className="text-ink/50 flex-shrink-0" aria-hidden="true"><IconChevronRight size={20} /></span>
          </div>
        </Link>
      )}
      {glance && <p className="t-cap text-ink/65 text-center mt-3">{glance}</p>}
    </div>
  )
}

// ─── The Scoring tab ───────────────────────────────────────────

/**
 * The bracket's rounds on the Scoring tab, the one being played open. In
 * each, this player's own match sits on top and is the one that opens —
 * active — and the rest are listed, inactive, with their results.
 */
export function KnockoutPortal({ tripCode, view, live = [], today }: {
  tripCode: string
  view: KnockoutView
  /** The matches being played now, off their cards (`readLiveMatches`). */
  live?: LiveMatch[]
  today: string
}) {
  const rounds = portalRounds(view.matches, view.entrantId, view.deadlines)
  const [open, setOpen] = useState<number | null>(() => currentRound(rounds)?.roundNumber ?? null)
  const nameOf = (id: string | null) => (id ? view.names[id] ?? null : null)
  const liveById = new Map(live.map(l => [l.id, l]))

  // Fresh standings while the tab is being read — sooner while a match is
  // on, and never on mount, which has just rendered them.
  const router = useRouter()
  const mounted = useRef(false)
  usePoll(() => {
    if (!mounted.current) { mounted.current = true; return }
    router.refresh()
  }, live.length > 0 ? 30_000 : 90_000)

  if (rounds.length === 0) {
    return (
      <p className="text-ink/65 text-sm text-center leading-snug">
        The bracket has not been drawn yet. The organiser draws it once the field is in.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {live.length > 0 && <LiveBoard tripCode={tripCode} view={view} live={live} />}
      {rounds.map(round => {
        const isOpen = open === round.roundNumber
        const finished = round.total > 0 && round.played === round.total
        const date = roundDate(round.deadline, today, finished)
        return (
          <section key={round.roundNumber} className={cardClass()}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : round.roundNumber)}
              aria-expanded={isOpen}
              className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
            >
              <span className="min-w-0">
                <span className="block t-card text-ink truncate">{round.roundName}</span>
                <span className={`block t-cap mt-0.5 ${date.startsWith('Was due') ? 'text-rust-deep' : 'text-ink/65'}`}>
                  {[date, `${round.played} of ${round.total} played`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span
                className={`text-ink/50 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <IconChevronRight size={20} />
              </span>
            </button>

            {isOpen && (
              <ul className="px-3 pb-3 space-y-2">
                {round.matches.map(m => {
                  const a = nameOf(m.sideA) ?? 'To be decided'
                  const b = nameOf(m.sideB) ?? 'To be decided'
                  const result = describeResult(m, nameOf)
                  const now = liveById.get(m.id)
                  const body = (
                    <>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink truncate">{a} v {b}</span>
                        {now ? (
                          <span className="flex items-center gap-1.5 t-cap text-accent-deep truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent dot-live flex-shrink-0" aria-hidden="true" />
                            Live · {liveLine(now, nameOf)}
                          </span>
                        ) : (
                          <span className="block t-cap text-ink/65 truncate">
                            {result ?? (m.mine ? 'Your match' : 'To play')}
                          </span>
                        )}
                      </span>
                      {m.mine && (
                        <span className="text-ink/50 flex-shrink-0" aria-hidden="true"><IconChevronRight size={20} /></span>
                      )}
                    </>
                  )
                  return (
                    <li key={m.id}>
                      {m.mine ? (
                        <Link
                          href={matchHref(tripCode, m.id)}
                          className={`flex items-center justify-between gap-3 px-4 py-3 ${cardClass('chosen', true)}`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={`flex items-center justify-between gap-3 px-4 py-3 opacity-60 ${cardClass('flat')}`}>
                          {body}
                        </div>
                      )}
                    </li>
                  )
                })}
                {round.matches.length === 0 && (
                  <li className="t-cap text-ink/65 px-2 py-1">No matches to play in this round.</li>
                )}
              </ul>
            )}
          </section>
        )
      })}
      <p className="t-cap text-ink/65 text-center">
        <Link href={`/trip/${tripCode}/matchplay`} className="text-accent-deep hover:text-accent">See the whole bracket →</Link>
      </p>
    </div>
  )
}

// ─── Live ──────────────────────────────────────────────────────

/** Your side of a live match: up and won gold, down and lost brown. */
function myTone(l: LiveMatch, entrantId: string | null): ResultTone {
  const seat = entrantId === l.sideA ? 'A' : entrantId === l.sideB ? 'B' : null
  return seat ? sideTone(seat, l.state) : 'level'
}

/** "2 up thru 7", "1 down thru 12", "All square thru 9" — from your side. */
function myStanding(l: LiveMatch, entrantId: string | null): string {
  const tone = myTone(l, entrantId)
  const thru = `thru ${l.state.played}`
  if (tone === 'won') return `Won ${l.state.result}`
  if (tone === 'lost') return `Lost ${l.state.result}`
  if (tone === 'up') return `${l.state.up} up ${thru}`
  if (tone === 'down') return `${l.state.up} down ${thru}`
  return l.state.played > 0 ? (l.state.extra ? l.state.progress : `All square ${thru}`) : 'Started'
}

/** "Ann 2 up thru 7", "All square thru 9", "Ann won 3&2". */
function liveLine(l: LiveMatch, nameOf: (id: string | null) => string | null): string {
  const leader = nameOf(l.leaderId)
  if (l.state.settled && leader) return `${leader} won ${l.state.result}`
  if (l.state.extra && !l.state.settled) return l.state.progress
  return leader ? `${leader} ${l.state.progress}` : l.state.progress
}

/**
 * The matches being played now, at the top of the Scoring tab — the match
 * play live leaderboard. Each opens its card, read-only to anybody not in
 * it. The standing wears the result colours: gold for whoever is up (and,
 * on your own match, brown when it is you who is down); green says live.
 */
function LiveBoard({ tripCode, view, live }: { tripCode: string; view: KnockoutView; live: LiveMatch[] }) {
  const nameOf = (id: string | null) => (id ? view.names[id] ?? null : null)
  return (
    <section className={cardClass()} aria-label="Live matches">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent dot-live" aria-hidden="true" />
        <span className="t-card text-ink">Live now</span>
        <span className="t-cap text-ink/65 ml-auto">
          {live.length} {live.length === 1 ? 'match' : 'matches'}
        </span>
      </div>
      <ul className="px-3 pb-3 space-y-2">
        {live.map(l => {
          const mine = view.entrantId === l.sideA || view.entrantId === l.sideB
          const seat = !mine ? null : view.entrantId === l.sideA ? 'A' : 'B'
          const tone: ResultTone = l.state.leader === null ? 'level'
            : sideTone(seat ?? l.state.leader, l.state)
          const standing = l.state.leader === null
            ? (l.state.extra ? 'All square · extra holes' : 'All square')
            : l.state.settled ? `${nameOf(l.leaderId) ?? 'Won'} ${l.state.result}`
              : `${nameOf(l.leaderId) ?? ''} ${l.state.up} up`.trim()
          const thru = l.state.settled ? 'Finished' : l.state.played > 0 ? `Thru ${l.state.played}` : 'Started'
          return (
            <li key={l.id}>
              <Link
                href={`${matchHref(tripCode, l.id)}/card`}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${cardClass(mine ? 'chosen' : 'flat', true)}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink truncate">
                    {nameOf(l.sideA) ?? 'A player'} v {nameOf(l.sideB) ?? 'A player'}
                  </span>
                  <span className="block t-cap text-ink/65 truncate">{l.roundName} · {thru}</span>
                </span>
                <span className={`flex-shrink-0 px-2.5 py-1 rounded-full t-cap font-semibold max-w-[45%] truncate ${RESULT_PILL[tone]}`}>
                  {standing}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
