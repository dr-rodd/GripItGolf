'use client'

import CardStateLine from '@/app/components/CardStateLine'
import type { CardBlocker } from '@/lib/courseCard'
import MatchDetailView from './match/[matchId]/card/MatchDetailView'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { describeShortDate } from '@/lib/itinerary'
import { deadlineNote } from '@/lib/bracketSetup'
import {
  bracketScoreLinks, currentRound, describeProgress, describeResult, myNextMatch, opponentOf, portalRounds,
} from '@/lib/knockoutPortal'
import { mayScoreCard, type MatchCardDetail } from '@/lib/matchCard'
import { useUnlocked } from '@/app/components/useUnlocked'
import type { KnockoutView } from './knockout'
import type { LiveMatch } from './match/matchCards'
import { sideColours, sideTint, type SideColour } from '@/lib/matchSides'
import { usePoll } from '@/app/scoring/usePoll'
import { cardClass } from '@/app/components/ui'
import { IconChevronRight } from '@/app/components/icons'
import { useTripBase } from '@/app/golf/[root]/[tripCode]/TripBase'

/**
 * A knockout from the player's side (docs/event-use-cases.md, story 2):
 * the hub's next-match card and the Scoring tab's portal of bracket rounds.
 * Both read `readKnockout`'s view through lib/knockoutPortal.ts; a match
 * opens its own page, `/trip/[code]/match/[id]`.
 */

const matchHref = (tripHome: string, id: string) => `${tripHome}/match/${id}`

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
  const tripHome = useTripBase(tripCode)
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
        <Link href={matchHref(tripHome, next.id)} className={`block px-5 py-4 ${cardClass('raised', true)}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {/* In play, the live tag takes the "your next match" line. */}
              {live ? (
                <p className="flex items-center gap-1.5 t-cap text-accent-deep">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent dot-live flex-shrink-0" aria-hidden="true" />
                  Live · {next.roundName}
                </p>
              ) : (
                <p className="t-cap text-ink/65">Your next match · {next.roundName}</p>
              )}
              <p className="t-card text-ink truncate mt-0.5">
                {opponent ? `v ${view.names[opponent] ?? 'Opponent'}` : 'Opponent to be decided'}
              </p>
              {live ? (
                <p className="flex items-center t-cap mt-1">
                  <span className="px-2 py-0.5 rounded-full font-semibold text-ink" style={standingStyle(live, view)}>
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
 * What a tap on a match does (Ross, 10 Nov 2026): a phone that may alter
 * its score — `mayScoreCard`, the card's own rule: its players, the
 * organiser with the lock open, or anybody while `score_matches` is on —
 * goes into scoring; every other phone gets the scorecard, sliding open
 * beneath the row. `scoring` is null where nobody scores from here.
 */
export type PortalScoring = {
  pinSet: boolean
  anyoneScores: boolean
  /** Every match with a card, hole by hole — the viewer's. */
  details: Record<string, MatchCardDetail>
  /** Matches already arranged (a course chosen), whose card is ready to score. */
  arranged: string[]
  /** Matches on a course a card cannot start on — "No scorecard" under the row (D69). */
  blocked?: Record<string, CardBlocker>
}

/** Which of a row's two faces this phone gets. */
function useMayScore(tripCode: string, scoring: PortalScoring | null) {
  const [unlocked] = useUnlocked(tripCode)
  const organiser = unlocked || !!!(scoring?.pinSet ?? null)
  return (decided: boolean, inMatch: boolean) =>
    mayScoreCard({ decided, organiser, inMatch, anyoneScores: scoring?.anyoneScores ?? true })
}

/**
 * A match row that slides its scorecard open beneath it — the site's rule
 * for one card to show. `children` is the row's face.
 */
function ViewerRow({ rowClass, detail, colours, children }: {
  rowClass: string
  detail: MatchCardDetail | undefined
  colours: Record<'A' | 'B', SideColour>
  children: React.ReactNode
}) {
  const [isOpen, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  return (
    <>
      <button type="button" className={rowClass} aria-expanded={isOpen}
        onClick={() => { setOpen(o => !o); setOpened(true) }}>
        {children}
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }} aria-hidden={!isOpen}>
        <div className="min-h-0 overflow-hidden">
          {opened && (
            <div className="px-1 pt-2 pb-1">
              <MatchDetailView detail={detail} colours={colours} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * The bracket's rounds on the Scoring tab, the one being played open. In
 * each, a match this phone may score goes into scoring (this player's own
 * on top, chosen); anybody else's slides its scorecard open beneath the
 * row, and a match with nothing on its card yet is listed inactive.
 */
export function KnockoutPortal({ tripCode, view, live = [], today, scoring = null }: {
  tripCode: string
  view: KnockoutView
  /** The matches being played now, off their cards (`readLiveMatches`). */
  live?: LiveMatch[]
  today: string
  scoring?: PortalScoring | null
}) {
  const tripHome = useTripBase(tripCode)
  const mayScore = useMayScore(tripCode, scoring)
  const links = bracketScoreLinks(view, new Set(scoring?.arranged ?? []), tripHome)
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
      {live.length > 0 && <LiveBoard tripCode={tripCode} view={view} live={live} scoring={scoring} />}
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
                  // Scoring for a phone that may alter the score; else the
                  // card to read, where there is one on it.
                  const scoreHref = mayScore(m.winner !== null, m.mine) ? links.hrefs[m.id] ?? null : null
                  const detail = scoring?.details[m.id]
                  const reads = !scoreHref && !!detail
                  const body = (
                    <>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink truncate">
                          <SideNames a={a} b={b} colours={coloursOf(view, m.sideA, m.sideB)} />
                        </span>
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
                        {!result && <CardStateLine blocker={scoring?.blocked?.[m.id] ?? null} />}
                      </span>
                      {(scoreHref || m.mine) && (
                        <span className="text-ink/50 flex-shrink-0" aria-hidden="true"><IconChevronRight size={20} /></span>
                      )}
                    </>
                  )
                  const rowClass = `flex items-center justify-between gap-3 px-4 py-3 w-full text-left ${cardClass(m.mine ? 'chosen' : 'flat', true)}`
                  return (
                    <li key={m.id}>
                      {scoreHref ? (
                        <Link href={scoreHref} className={rowClass}>{body}</Link>
                      ) : reads ? (
                        <ViewerRow rowClass={rowClass} detail={detail} colours={coloursOf(view, m.sideA, m.sideB)}>{body}</ViewerRow>
                      ) : m.mine ? (
                        // Your own, nothing to score or read yet: its page.
                        <Link href={matchHref(tripHome, m.id)} className={rowClass}>{body}</Link>
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
        <Link href={`${tripHome}/matchplay`} className="text-accent-deep hover:text-accent">See the whole bracket →</Link>
      </p>
    </div>
  )
}

// ─── Live ──────────────────────────────────────────────────────

/** The two sides' colours: top red, bottom blue, or their team colours (lib/matchSides.ts). */
function coloursOf(view: KnockoutView, a: string | null, b: string | null): Record<'A' | 'B', SideColour> {
  return sideColours(a ? view.colours?.[a] : null, b ? view.colours?.[b] : null)
}

/** "● Ann v ● Bob" — each name with its side's colour, the same on every phone. */
function SideNames({ a, b, colours }: { a: string; b: string; colours: Record<'A' | 'B', SideColour> }) {
  const dot = (c: SideColour) => (
    <span className="inline-block w-2 h-2 rounded-full ring-1 ring-line-strong mr-1.5 align-middle" style={{ backgroundColor: c.fill }} aria-hidden="true" />
  )
  return <>{dot(colours.A)}{a} v {dot(colours.B)}{b}</>
}

/**
 * A live match's standing, in the colour of whoever is ahead: the side's
 * colour solid once won, washed while up, neutral when all square. Never
 * from the viewer's side — every phone shows the same.
 */
function standingStyle(l: LiveMatch, view: KnockoutView): React.CSSProperties {
  if (l.state.leader === null) return { backgroundColor: 'var(--color-tint)' }
  const c = coloursOf(view, l.sideA, l.sideB)[l.state.leader]
  return l.state.settled ? { backgroundColor: c.fill, color: c.on } : { backgroundColor: sideTint(c, 22) }
}

/** "2 up thru 7", "1 down thru 12", "All square thru 9" — from your side. */
function myStanding(l: LiveMatch, entrantId: string | null): string {
  const seat = entrantId === l.sideA ? 'A' : entrantId === l.sideB ? 'B' : null
  const thru = `thru ${l.state.thru}`
  if (!seat || l.state.leader === null) {
    return l.state.played > 0 ? (l.state.extra ? l.state.progress : `All square ${thru}`) : 'Started'
  }
  const ahead = l.state.leader === seat
  if (l.state.settled) return `${ahead ? 'Won' : 'Lost'} ${l.state.result}`
  return `${l.state.up} ${ahead ? 'up' : 'down'} ${thru}`
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
 * play live leaderboard. A phone that may alter a score goes into scoring
 * (`mayScoreCard`); every other slides the match open beneath its row, hole
 * by hole (Ross, 10 Nov 2026: a viewer never leaves for the card to score). The standing wears the colour of the side ahead — top of the draw
 * red, bottom blue — the same on every phone; green says live.
 */
function LiveBoard({ tripCode, view, live, scoring }: { tripCode: string; view: KnockoutView; live: LiveMatch[]; scoring: PortalScoring | null }) {
  const tripHome = useTripBase(tripCode)
  const mayScore = useMayScore(tripCode, scoring)
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
          const standing = l.state.leader === null
            ? (l.state.extra ? 'All square · extra holes' : 'All square')
            : l.state.settled ? `${nameOf(l.leaderId) ?? 'Won'} ${l.state.result}`
              : `${nameOf(l.leaderId) ?? ''} ${l.state.up} up`.trim()
          const thru = l.state.settled ? 'Finished' : l.state.played > 0 ? `Thru ${l.state.thru}` : 'Started'
          return (
            <li key={l.id}>
              {(() => {
                const inner = (
                  <>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink truncate">
                        <SideNames a={nameOf(l.sideA) ?? 'A player'} b={nameOf(l.sideB) ?? 'A player'} colours={coloursOf(view, l.sideA, l.sideB)} />
                      </span>
                      <span className="block t-cap text-ink/65 truncate">{l.roundName} · {thru}</span>
                    </span>
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full t-cap font-semibold max-w-[45%] truncate text-ink" style={standingStyle(l, view)}>
                      {standing}
                    </span>
                  </>
                )
                const rowClass = `flex items-center justify-between gap-3 px-4 py-3 w-full text-left ${cardClass(mine ? 'chosen' : 'flat', true)}`
                // A phone that may alter the score goes into scoring; every
                // other gets the scorecard, sliding open beneath the row.
                if (mayScore(false, mine)) {
                  return <Link href={`${matchHref(tripHome, l.id)}/card`} className={rowClass}>{inner}</Link>
                }
                return (
                  <ViewerRow rowClass={rowClass} detail={l.detail} colours={coloursOf(view, l.sideA, l.sideB)}>
                    {inner}
                  </ViewerRow>
                )
              })()}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
