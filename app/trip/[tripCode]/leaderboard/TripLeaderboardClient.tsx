'use client'

import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveCustomPoints } from '@/lib/customPoints'
import type { TeamScoring } from '@/lib/teamScoring'
import {
  type Leaderboard, boardTitle, boardRules, hasMatchplay,
} from '@/lib/leaderboards'
import {
  type BoardRow, type ResolvedScore, type RowContext,
  buildRows, scoresForBoard, boardHandicapFor, effectivePar,
} from '@/lib/boardRows'
import { exactCourseHandicap } from '@/lib/courseHandicap'
import { formatHandicap } from '@/lib/handicap'
import { type Membership } from '@/lib/teamSets'
import { roundTone, ROUND_TILE, ROUND_NOTE, ROUND_NOTE_TONE } from '@/lib/roundState'
import { HEADER_H } from '@/app/components/headerMetrics'
import ScoreShape, { NoReturnShape } from '@/app/components/ScoreShape'
import {
  SC_CARD, SC_SF, SC_RULE, SC_BAND, SC_BAND_TOTAL, SC_HEAD, SC_HEAD_TEXT, SC_HEAD_TIGHT, SC_LABEL,
  SC_MUTED, SC_DARK, scRow, scPoints,
} from '@/app/components/scorecardStyle'

// ─── Types ─────────────────────────────────────────────────────

type Course = { id: string; name: string }
type Round  = { id: string; round_number: number; status?: string; courses: Course | null }
type Team   = { id: string; name: string; color: string; team_set?: string | null }
type Player = { id: string; name: string; handicap: number | null; gender: string }
type Hole   = {
  id: string; hole_number: number; par: number; stroke_index: number; course_id: string
  par_ladies?: number | null; stroke_index_ladies?: number | null
}
type Score      = { player_id: string; hole_id: string; gross_score: number | null; stableford_points: number; no_return: boolean; round_id: string }
type LiveScore  = { player_id: string; round_id: string; hole_number: number; gross_score: number | null; stableford_points: number | null }
type RoundHcp   = {
  round_id: string; player_id: string; playing_handicap: number
  /** The tee it was played off, where the session recorded one. */
  tee_id?: string | null
}
/** Just the ratings — enough to rebuild a course handicap before rounding. */
type TeeRatingRow = { id: string; slope: number; course_rating: number; par: number }

interface Props {
  tripCode: string
  /**
   * Everything this trip is playing for, each board carrying its own complete
   * rules. Old trips arrive here too — the page reads their flags as boards
   * before this component sees them, so there is one shape to render.
   */
  boards: Leaderboard[]
  /** Rounds with a scorecard open right now. */
  activeRoundIds: string[]
  /**
   * Players with a card open right now, from the locks on those rounds.
   *
   * Per player rather than per round: not everybody plays every round, and a
   * card that has been signed is not live just because someone else is still
   * out on the course.
   */
  livePlayerIds: string[]
  /**
   * The old trip-wide team setting, passed only for trips that predate the
   * board list. It carries options the new model does not ask for, so a trip
   * already running one keeps scoring the way it always has.
   */
  legacyTeamScoring: TeamScoring | null
  rounds: Round[]
  /** Every team on the trip, across every sheet. Each board takes its own. */
  teams: Team[]
  /**
   * Who is in which team. Not a field on the player: a trip can run a league
   * between fours and a knockout between pairings, so one person holds two
   * places at once. See lib/teamSets.ts.
   */
  memberships: Membership[]
  players: Player[]
  holes: Hole[]
  scores: Score[]
  liveScores: LiveScore[]
  roundHandicaps: RoundHcp[]
  /** Ratings only. Read by boards playing off a percentage of the handicap. */
  tees?: TeeRatingRow[]
}

// Every scorecard in the app wears the same clothes — see
// app/components/scorecardStyle.ts for why, and for the tokens.

const firstName = (n: string) => n.split(' ')[0]

// ─── Shared bits ───────────────────────────────────────────────

/**
 * Marks a row with a card still open. Green, because gold now means the card
 * is in — the two must not both be gold or the distinction says nothing.
 */
function LiveDot() {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 dot-live"
      title="Card still open"
    />
  )
}

/** Whole numbers stay plain; a shared position shows its half. */
function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * Level is "E", and everything else carries its sign — the way a scoreboard
 * has always read. Used while a round is still being played, when how far
 * ahead of level you are says more than a running total does.
 */
function formatRelative(n: number): string {
  if (n === 0) return 'E'
  return n > 0 ? `+${formatScore(n)}` : formatScore(n)
}

/** Shown while a scorecard is open somewhere on the trip. */
function InPlayBadge() {
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/[0.22]">
      <span className="w-1.5 h-1.5 rounded-full bg-accent dot-live" aria-hidden="true" />
      <span className="t-cap uppercase tracking-[0.12em] text-accent-deep">In play</span>
    </span>
  )
}

/** "10 / 5 / 3 a round" — the top of the table, enough to recognise it by. */
function describeCustomTable(table: number[]): string {
  if (table.length === 0) return 'Points by finishing position'
  const head = table.slice(0, 3).join(' / ')
  return table.length > 3 ? `${head} … a round` : `${head} a round`
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-surface border border-bark/12 rounded-2xl py-14 text-center">
      <p className="t-body text-ink/80 px-6 max-w-[24rem] mx-auto">{message}</p>
    </div>
  )
}

// ─── The scorecard sheet ───────────────────────────────────────

/**
 * One line of a scorecard: fixed left, scrolling middle, fixed right.
 *
 * At module level because it wraps the scrolling strips — declared inside the
 * sheet it would be a new component type every render, React would rebuild
 * the strip, and the scroll position would go with it.
 */
function Row({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center gap-2 px-3 ${className}`}>{children}</div>
}

/**
 * The pop-up card, for one player or for a whole team.
 *
 * A team card is the one that gets unwieldy: every member is a column, and
 * past about four the holes are squeezed into nothing. So the player columns
 * scroll sideways while **Hole / Par and the team's points hold still** — the
 * two things you navigate by — and the member list above scrolls once it is
 * longer than fits.
 *
 * Same trick as the trip board's round columns: one scroller per row, kept in
 * step, so nothing that has to stay put sits inside a scroll container.
 */
export function ScorecardSheet({
  title, subtitle, players, round, holes, resolved, handicapFor, onClose,
}: {
  title: string
  subtitle: string
  players: Player[]
  round: Round
  holes: Hole[]
  resolved: ResolvedScore[]
  /**
   * The handicap the board this card opened from scores each player off.
   *
   * Not the stored snapshot, which is neither reduced by the board's allowance
   * nor necessarily the figure the round was played off. The points below come
   * from this number, so printing anything else invites the reader to check
   * the arithmetic and find it wrong.
   */
  handicapFor: (playerId: string) => number | null
  onClose: () => void
}) {
  const { register, onScroll } = useSyncedStrips()

  const courseHoles = holes
    .filter(h => h.course_id === (round.courses?.id ?? ''))
    .sort((a, b) => a.hole_number - b.hole_number)

  // Past this the player columns stop fitting and start scrolling instead.
  const INLINE_PLAYERS = 3
  const scrolls = players.length > INLINE_PLAYERS

  const scoreFor = (playerId: string, holeNumber: number) =>
    resolved.find(s => s.playerId === playerId && s.roundId === round.id && s.holeNumber === holeNumber)

  // One shape for every card in the app — see ScoreShape.
  const scoreSymbol = (gross: number | null, par: number, isNR: boolean) => {
    if (isNR) return <NoReturnShape size={scrolls ? 'md' : 'lg'} />
    if (gross === null) return <span className={`${SC_MUTED} text-lg`} style={SC_SF}>—</span>
    return <ScoreShape gross={gross} par={par} size={scrolls ? 'md' : 'lg'} />
  }

  /**
   * What this player's own score was worth, set small and raised beside it.
   *
   * A team card shows a column of gross scores per player and one points
   * figure for the team, which says what the hole was worth but not who made
   * it worth that. On a better ball especially, the whole question a team card
   * is read to answer is which of them carried the hole — and the card had no
   * answer on it.
   *
   * Only on a team card. With one player the points column beside it is
   * already their points, and printing the same number twice on one row says
   * nothing the second time.
   *
   * A nought is shown rather than hidden: a hole played for nothing is a fact
   * about who contributed, and the most useful one on the row.
   *
   * 12px is the floor the app sets for anything hand-sized, and this sits on
   * it rather than under it. A figure small enough to be unreadable on a tee
   * box in daylight is not a smaller version of this feature, it is the
   * absence of it — the weight and the opacity are what make it secondary.
   */
  const contributed = players.length > 1
  const points = (pts: number | null | undefined) => {
    if (!contributed || pts == null) return null
    return (
      <span
        className={`text-[12px] leading-none mt-0.5 tabular-nums ${
          pts > 0 ? 'text-ink/80 font-semibold' : 'text-ink/50'
        }`}
        style={SC_SF}
        title={`${pts} ${pts === 1 ? 'point' : 'points'}`}
      >
        {pts}
      </span>
    )
  }

  const nine = (from: number, to: number) => courseHoles.filter(h => h.hole_number >= from && h.hole_number <= to)
  const sumPar = (hs: Hole[], gender: string) => hs.reduce((s, h) => s + effectivePar(h, gender), 0)
  const sumPts = (hs: Hole[], playerId: string) =>
    hs.reduce((s, h) => s + (scoreFor(playerId, h.hole_number)?.points ?? 0), 0)
  const sumGross = (hs: Hole[], playerId: string) =>
    hs.reduce((s, h) => s + (scoreFor(playerId, h.hole_number)?.gross ?? 0), 0)

  const front = nine(1, 9)
  const back  = nine(10, 18)
  const gender = players[0]?.gender ?? 'M'

  // Fixed either side, scrolling in the middle. The widths are the same in
  // both modes so a one-player card and a six-player card line up.
  const HOLE_W = 'w-10 flex-shrink-0'
  const PAR_W  = 'w-9 flex-shrink-0'
  const PTS_W  = 'w-12 flex-shrink-0 text-right'
  const CELL   = `${scrolls ? 'w-11' : 'flex-1'} flex-shrink-0 flex items-center justify-center`
  /**
   * The same cell, top-aligned, for a score with its points raised beside it.
   *
   * A separate constant rather than `${CELL} items-start`: both are
   * `align-items` utilities, and which one wins is decided by their order in
   * the generated stylesheet rather than by their order in the class
   * attribute. That is a coin toss, and it would land differently between a
   * dev build and a production one.
   *
   * With nothing beside the score the two are identical anyway — one child
   * centres and top-aligns the same — so this is safe on every cell.
   */
  const CELL_TOP = `${scrolls ? 'w-11' : 'flex-1'} flex-shrink-0 flex items-start justify-center gap-px`

  const summary = (label: string, hs: Hole[], total = false) => (
    <Row className={`py-2 ${total ? SC_BAND_TOTAL : SC_BAND} ${total ? '' : SC_RULE}`}>
      <span className={`${HOLE_W} text-[13px] font-bold tracking-widest uppercase text-ink/80`} style={SC_SF}>{label}</span>
      <span className={`${PAR_W} text-[15px] font-bold text-ink`} style={SC_SF}>{sumPar(hs, gender)}</span>
      <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
        {players.map(p => {
          const gross = sumGross(hs, p.id)
          return (
            <span key={p.id} className={CELL_TOP}>
              <span className="text-[15px] font-bold text-ink" style={SC_SF}>
                {gross > 0 ? gross : '—'}
              </span>
              {gross > 0 && points(sumPts(hs, p.id))}
            </span>
          )
        })}
      </Strip>
      <span className={`${PTS_W} font-bold text-ink ${total ? 'text-xl' : 'text-base'}`} style={SC_SF}>
        {players.reduce((s, p) => s + sumPts(hs, p.id), 0)}
      </span>
    </Row>
  )

  return (
    // A card on the page, not a takeover of it. It used to be a sheet pinned
    // to the bottom edge, full-bleed and 90vh tall, which reads as leaving the
    // leaderboard rather than looking closer at one row of it — and the board
    // it came from disappeared entirely behind it.
    //
    // Same clothes as the live leaderboard's card, which is the other place in
    // the app that shows a card inside a list: white, hairline border,
    // rounded-2xl. Inset on every side so the board stays visible around it,
    // which is also what makes tapping outside to close an obvious thing to
    // try. See app/components/scorecardStyle.ts.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink/50" />
      <div
        className={`relative w-full max-w-lg flex flex-col max-h-full overflow-hidden ${SC_CARD}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Title — never scrolls */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-3">
          <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
            <p className="font-[family-name:var(--font-display)] text-ink text-2xl leading-tight truncate">
              {title}
            </p>
            <p className="text-ink/65 text-base truncate">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-ink/65 hover:text-ink transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xl flex-shrink-0"
            aria-label="Close scorecard"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 bg-surface">

          {/* Who is on the card, and off what handicap.
              Its own scrolling box once the team is bigger than fits, so a
              six-player team does not push the holes off the screen. */}
          <div className={`flex-shrink-0 px-3 py-2 ${SC_RULE} ${SC_HEAD}`}>
            <div className="flex items-baseline gap-2">
              {/* One player needs no name here — the title directly above is
                  the name. What is not up there is the handicap. A team does
                  need them: the names are what tell the columns apart. */}
              <span className={`${SC_LABEL} flex-shrink-0`}>
                {players.length > 1 ? 'Players' : 'PH'}
              </span>
              <div className={`flex-1 min-w-0 flex flex-wrap gap-x-4 gap-y-1 ${
                players.length > 4 ? 'max-h-[3.25rem] overflow-y-auto' : ''
              }`}>
                {players.map(p => {
                  const hcp = handicapFor(p.id)
                  return (
                    <span key={p.id} className="text-[15px] text-ink whitespace-nowrap" style={SC_SF}>
                      {players.length > 1 && <>{firstName(p.name)}{' '}</>}
                      <span className={players.length > 1 ? SC_MUTED : 'font-semibold'}>{hcp == null ? '—' : formatHandicap(hcp)}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Column headers */}
          <Row className={`flex-shrink-0 py-1.5 ${SC_RULE} ${SC_HEAD}`}>
            <span className={`${HOLE_W} ${SC_HEAD_TIGHT}`} style={SC_SF}>Hole</span>
            <span className={`${PAR_W} ${SC_HEAD_TIGHT}`} style={SC_SF}>Par</span>
            <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
              {players.map(p => (
                <span key={p.id} className={`${CELL} ${SC_HEAD_TEXT}`} style={SC_SF}>
                  {players.length > 1 ? firstName(p.name).slice(0, 3) : 'Score'}
                </span>
              ))}
            </Strip>
            <span className={`${PTS_W} ${SC_HEAD_TEXT}`} style={SC_SF}>Pts</span>
          </Row>

          {/* Hole rows — the only vertically scrolling part */}
          <div className="overflow-y-auto flex-1 pb-8">
            {courseHoles.length === 0 && (
              <p className={`${SC_MUTED} text-sm text-center py-10`} style={SC_SF}>
                No hole data for this course.
              </p>
            )}

            {courseHoles.map(hole => {
              // A hole nobody has reached is blank; a hole played for nothing
              // is a nought. Testing the total alone conflated the two, and
              // a wiped-out hole is exactly the one worth being able to see.
              const played = players.some(p => scoreFor(p.id, hole.hole_number))
              const rowPts = players.reduce(
                (s, p) => s + (scoreFor(p.id, hole.hole_number)?.points ?? 0), 0
              )
              return (
                <Fragment key={hole.id}>
                  <Row className={`py-1.5 ${SC_RULE} ${scRow(hole.hole_number)}`}>
                    <span className={`${HOLE_W} text-[15px] font-semibold ${SC_DARK}`} style={SC_SF}>
                      {hole.hole_number}
                    </span>
                    <span className={`${PAR_W} text-[15px] ${SC_MUTED}`} style={SC_SF}>
                      {effectivePar(hole, gender)}
                    </span>
                    <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
                      {players.map(p => {
                        const sc = scoreFor(p.id, hole.hole_number)
                        return (
                          <span key={p.id} className={CELL_TOP}>
                            {scoreSymbol(
                              sc ? sc.gross : null,
                              effectivePar(hole, p.gender),
                              sc?.noReturn ?? false
                            )}
                            {sc && points(sc.points)}
                          </span>
                        )
                      })}
                    </Strip>
                    <span
                      className={`${PTS_W} text-[15px] ${played ? scPoints(rowPts) : SC_MUTED}`}
                      style={SC_SF}
                    >
                      {played ? rowPts : '—'}
                    </span>
                  </Row>
                  {hole.hole_number === 9 && back.length > 0 && summary('Out', front)}
                </Fragment>
              )
            })}

            {courseHoles.length > 0 && (
              <>
                {back.length > 0 && summary('In', back)}
                {summary('Tot', courseHoles, true)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Course tiles (expanded row) ───────────────────────────────

function CourseTiles({
  row, rounds, playerById, onTileClick,
}: {
  row: BoardRow
  rounds: Round[]
  playerById: Map<string, Player>
  onTileClick: (round: Round) => void
}) {
  return (
    <div className="px-3 pb-4 pt-2 space-y-2 bg-cream">
      {rounds.map(round => {
        const pts = row.perRound[round.id] ?? 0
        const hasScores = row.playedRounds.includes(round.id)
        const live = row.liveRounds?.includes(round.id) ?? false
        const rel  = row.relativeByRound?.[round.id]
        const hero = row.heroByRound?.[round.id]
        const heroName = hero ? playerById.get(hero)?.name : null

        // The same three states the scoring round picker shows, read the
        // same way — see lib/roundState.ts.
        const tone = roundTone(hasScores, live)
        const note = live
          ? heroName ? `In play — carried by ${firstName(heroName)}` : ROUND_NOTE.live
          : hasScores
            ? heroName ? `Carried by ${firstName(heroName)}` : ROUND_NOTE.played
            : ROUND_NOTE.empty

        return (
          <button
            key={round.id}
            onClick={() => onTileClick(round)}
            className={`w-full text-left rounded-2xl transition-colors duration-150 active:opacity-75 ${ROUND_TILE[tone]}`}
          >
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-ink text-base leading-tight truncate">
                  {round.courses?.name ?? `Round ${round.round_number}`}
                </p>
                <p className={`t-cap mt-1 truncate ${ROUND_NOTE_TONE[tone]}`}>{note}</p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                {hasScores && (
                  <span className={`font-[family-name:var(--font-display)] text-xl font-bold tabular-nums ${
                    live ? 'text-accent-deep' : 'text-ink'
                  }`}>
                    {live && rel !== undefined ? formatRelative(rel) : formatScore(pts)}
                  </span>
                )}
                <span className="text-ink/65 text-sm">View →</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── The board ─────────────────────────────────────────────────

/**
 * Keeps every row's round strip on the same horizontal scroll position.
 *
 * The alternative was one scroller around the whole table with the fixed
 * columns `position: sticky` inside it. That reads well until you remember
 * what `overflow-x` does: an element that scrolls on one axis is a scroll
 * container on both, so the column headings' `top: HEADER_H` would have
 * started measuring from the card instead of the viewport — exactly the bug
 * that put them on top of whoever was leading (see docs/design-system.md).
 * Each strip being its own scroller keeps every ancestor of that sticky row
 * unscrolled.
 *
 * Writing scrollLeft fires `scroll` again, so the write is flagged and the
 * echo ignored — without it the strips fight each other and judder.
 */
function useSyncedStrips() {
  const strips = useRef<Set<HTMLDivElement>>(new Set())
  const syncing = useRef(false)

  // Always returns a cleanup, never sometimes — React 19 treats a returned
  // function as the detach hook, and a callback that returns one only on
  // some renders leaves stale nodes in the set when the board changes.
  const register = useCallback((el: HTMLDivElement | null) => {
    const set = strips.current
    if (el) set.add(el)
    return () => { if (el) set.delete(el) }
  }, [])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (syncing.current) return
    syncing.current = true
    const source = e.currentTarget
    const left = source.scrollLeft
    // Applied on the next frame rather than inline: a scroll handler runs
    // very often, and batching the writes into the frame keeps a flick on a
    // phone smooth. The flag is cleared in the same frame, after the writes,
    // so the scroll events they raise are the ones it swallows.
    requestAnimationFrame(() => {
      for (const el of strips.current) {
        if (el !== source && el.scrollLeft !== left) el.scrollLeft = left
      }
      // Released a frame later, not here: the writes above raise scroll
      // events of their own and those arrive after this frame, so clearing
      // the flag now would let the echo back in and the strips would fight.
      requestAnimationFrame(() => { syncing.current = false })
    })
  }, [])

  return { register, onScroll }
}

/**
 * The scrolling middle of a row. Identical in both modes bar its overflow.
 *
 * Declared here rather than inside Board: a component created during render is
 * a new type on every render, so React would tear the div down and build it
 * again — taking the strip's scroll position with it, which is the one piece
 * of state this whole arrangement exists to keep.
 */
function Strip({
  scrolls, register, onScroll, children,
}: {
  scrolls: boolean
  register: (el: HTMLDivElement | null) => () => void
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  children: React.ReactNode
}) {
  return (
    <div
      ref={scrolls ? register : undefined}
      onScroll={scrolls ? onScroll : undefined}
      className={`min-w-0 flex-1 ${scrolls ? 'overflow-x-auto scroll-strip' : ''}`}
    >
      <div className={`flex gap-2 ${scrolls ? 'w-max' : 'justify-end'}`}>{children}</div>
    </div>
  )
}

/** Round columns beyond this stop fitting a phone, so they start scrolling. */
const INLINE_ROUNDS = 4

function Board({
  rows, rounds, playerById, onOpenCard,
}: {
  rows: BoardRow[]
  rounds: Round[]
  playerById: Map<string, Player>
  onOpenCard: (row: BoardRow, round: Round) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { register, onScroll } = useSyncedStrips()

  // Under the limit nothing scrolls and the strip is just a row of columns;
  // over it, the same markup scrolls and the columns either side hold still.
  const scrolls = rounds.length > INLINE_ROUNDS
  const showRounds = rounds.length > 0

  // Narrower once the rounds scroll — every pixel the name gives up is
  // another round column visible before you have to swipe.
  const NAME_W = scrolls ? 'w-[6.5rem]' : 'flex-1'
  const CELL = `${scrolls ? 'w-9' : 'w-10'} flex-shrink-0 text-center`

  // No overflow-hidden on this card, deliberately. It would make the card its
  // own scrollport, and the sticky row below would then measure its offset
  // from the card's top edge rather than the viewport's — dropping the column
  // headings exactly HEADER_H down the card and parking them on top of
  // whoever is leading. The corners round without it.
  return (
    <div className="bg-surface border border-bark/12 rounded-2xl">
      {/* Sticky column headers */}
      <div
        // Sits directly under the wordmark header, which is 52px tall. A
        // hard 0 here would slide the column headings under the mark.
        style={{ top: HEADER_H }}
        className="sticky z-10 flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-bark/12 rounded-t-2xl"
      >
        <span className="text-[12px] tracking-widest uppercase text-ink/65 w-5 flex-shrink-0">Pos</span>
        <span className={`text-[12px] tracking-widest uppercase text-ink/65 min-w-0 ${NAME_W}`}>Name</span>
        {showRounds && (
          <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
            {rounds.map(r => (
              <span key={r.id} className={`${CELL} text-[13px] text-ink/65 tabular-nums`}>
                {r.round_number}
              </span>
            ))}
          </Strip>
        )}
        <span className="text-[12px] tracking-widest uppercase text-ink/65 w-14 flex-shrink-0 text-right">Tot</span>
      </div>

      {rows.map((row, i) => {
        const isExpanded = expandedId === row.id
        const isLast     = i === rows.length - 1
        return (
          <Fragment key={row.id}>
            <button
              onClick={() => setExpandedId(prev => (prev === row.id ? null : row.id))}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left active:bg-bark/[0.04] transition-colors ${
                !isLast || isExpanded ? 'border-b border-bark/12' : ''
              }`}
            >
              <span className="t-cap text-ink/65 tabular-nums w-5 flex-shrink-0">{i + 1}</span>

              <div className={`min-w-0 ${NAME_W}`}>
                <div className="flex items-center gap-1.5">
                  {row.color && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                  )}
                  <span className="t-card text-ink truncate">{row.name}</span>
                  {row.isLive && <LiveDot />}
                </div>
                {row.subLabel && (
                  <p className={`text-ink/65 text-[13px] truncate leading-snug ${row.color ? 'pl-3.5' : ''}`}>
                    {row.subLabel}
                  </p>
                )}
              </div>

              {showRounds && (
                <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
                  {rounds.map(r => {
                    const played  = row.playedRounds.includes(r.id)
                    const dropped = row.droppedRounds?.includes(r.id) ?? false
                    const live    = row.liveRounds?.includes(r.id) ?? false
                    const pts     = row.perRound[r.id] ?? 0
                    const rel     = row.relativeByRound?.[r.id]

                    // In play: how far ahead of level. Finalised: the total.
                    // A dropped round is neither — it is set aside.
                    const showRelative = live && !dropped && rel !== undefined
                    return (
                      <span
                        key={r.id}
                        title={
                          dropped ? 'Set aside — worst round dropped'
                            : live ? 'Card still open — against level so far'
                            : undefined
                        }
                        className={`${CELL} tabular-nums font-semibold ${
                          showRelative ? 'text-lg' : 'text-xl'
                        } ${
                          !played ? 'text-ink/65'
                            : dropped ? 'text-ink/65 line-through decoration-ink/30'
                            : live ? 'text-accent-deep'
                            : 'text-ink'
                        }`}
                      >
                        {!played ? '—' : showRelative ? formatRelative(rel) : formatScore(pts)}
                      </span>
                    )
                  })}
                </Strip>
              )}

              {/* Rows are pre-filtered to those who have played, so the
                  total is always a real number — including a legitimate 0. */}
              {/* The total is the primary datum, so it is plain ink. Emerald
                  on this board means one thing only: still being played. */}
              <span className="w-14 flex-shrink-0 text-right t-num font-semibold text-xl text-ink">
                {formatScore(row.total)}
              </span>
            </button>

            {isExpanded && (
              <div className={!isLast ? 'border-b border-bark/12' : ''}>
                <CourseTiles
                  row={row}
                  rounds={rounds}
                  playerById={playerById}
                  onTileClick={round => onOpenCard(row, round)}
                />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}


/**
 * The draw, as a chip in the same row as the boards.
 *
 * It sits with them because it is one of the things this trip is playing for,
 * and a full-width card of its own above the tabs said otherwise while taking
 * the space the table wanted.
 *
 * Still a link to a separate route rather than an inline component: none of
 * the matchplay display code should load with the leaderboard, and nothing
 * from that module is imported into this file. The arrow is what says it
 * leaves the page — the boards beside it only change what is below.
 */
function MatchplayTab({ tripCode }: { tripCode: string }) {
  return (
    <Link
      href={`/trip/${tripCode}/matchplay`}
      className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 t-label rounded-xl
        border bg-surface border-bark/12 text-ink/65
        hover:text-ink/80 hover:border-accent/50 active:opacity-75
        transition-colors duration-150"
    >
      Matchplay
      {/* It leaves the page, which none of the boards beside it do. */}
      <span aria-hidden="true" className="text-ink/50">→</span>
    </Link>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function TripLeaderboardClient({
  tripCode, boards, activeRoundIds, livePlayerIds, legacyTeamScoring, rounds,
  teams, memberships, players, holes, scores, liveScores, roundHandicaps,
  tees = [],
}: Props) {
  // Matchplay has its own route, so it is a button rather than a tab. Every
  // other board is a table, and its own rules travel with it.
  const tabs = useMemo(() => boards.filter(b => b.competition === 'league'), [boards])
  const [activeId, setActiveId] = useState<string>(tabs[0]?.id ?? '')
  const [card, setCard] = useState<{ row: BoardRow; round: Round } | null>(null)

  // A board can be removed in settings while this page is open
  const activeBoard = tabs.find(b => b.id === activeId) ?? tabs[0] ?? null

  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.round_number - b.round_number),
    [rounds]
  )
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  // ── Merge committed + in-progress scores ────────────────────

  const resolved: ResolvedScore[] = useMemo(() => {
    const holeById = new Map(holes.map(h => [h.id, h]))
    const out: ResolvedScore[] = []
    const seen = new Set<string>()

    for (const s of scores) {
      const hole = holeById.get(s.hole_id)
      if (!hole) continue
      seen.add(`${s.player_id}:${s.round_id}:${hole.hole_number}`)
      out.push({
        playerId: s.player_id,
        roundId: s.round_id,
        holeId: s.hole_id,
        holeNumber: hole.hole_number,
        gross: s.no_return ? null : s.gross_score,
        points: s.stableford_points ?? 0,
        noReturn: s.no_return,
        live: false,
      })
    }

    const courseByRound = new Map(rounds.map(r => [r.id, r.courses?.id ?? '']))
    const holeByCourseAndNumber = new Map(holes.map(h => [`${h.course_id}:${h.hole_number}`, h]))

    for (const ls of liveScores) {
      if (seen.has(`${ls.player_id}:${ls.round_id}:${ls.hole_number}`)) continue
      if (ls.gross_score == null) continue
      const courseId = courseByRound.get(ls.round_id)
      const hole = courseId ? holeByCourseAndNumber.get(`${courseId}:${ls.hole_number}`) : undefined
      if (!hole) continue
      out.push({
        playerId: ls.player_id,
        roundId: ls.round_id,
        holeId: hole.id,
        holeNumber: ls.hole_number,
        gross: ls.gross_score,
        points: ls.stableford_points ?? 0,
        noReturn: false,
        live: true,
      })
    }

    return out
  }, [scores, liveScores, holes, rounds])

  // A round counts as in play when a scorecard is actually open on it, not
  // merely because someone once entered a score into it.
  const openRoundIds = useMemo(() => new Set(activeRoundIds), [activeRoundIds])
  const liveRoundIds = useMemo(
    () => new Set([...liveScores.map(ls => ls.round_id), ...activeRoundIds]),
    [liveScores, activeRoundIds]
  )
  const inPlay = openRoundIds.size > 0
  const livePlayers = useMemo(() => new Set(livePlayerIds), [livePlayerIds])

  const hcpFor = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of roundHandicaps) m.set(`${h.round_id}:${h.player_id}`, h.playing_handicap)
    return m
  }, [roundHandicaps])

  // The same handicaps before they were rounded, rebuilt from the tee each
  // round was played off. A board taking a percentage needs the real figure —
  // 11.63 is stored as 12, and 90% of those two are a shot apart. Only rounds
  // with a tee recorded against them appear; the rest fall back to the stored
  // whole number, which is all that was ever known about them.
  const exactHcpFor = useMemo(() => {
    const teeById = new Map(tees.map(t => [t.id, t]))
    const indexOf = new Map(players.map(p => [p.id, p.handicap]))
    const m = new Map<string, number>()
    for (const h of roundHandicaps) {
      const tee = h.tee_id ? teeById.get(h.tee_id) : undefined
      const index = indexOf.get(h.player_id)
      if (!tee || index == null) continue
      m.set(`${h.round_id}:${h.player_id}`, exactCourseHandicap(index, tee))
    }
    return m
  }, [roundHandicaps, tees, players])

  // ── The rows for every board ────────────────────────────────
  //
  // Each board is scored under its own rules, so two boards on the same trip
  // can genuinely differ — Stableford keeping every card beside Strokes
  // dropping the worst, or two team boards splitting the same cards two ways.

  const rowContext: RowContext = useMemo(() => ({
    players,
    teams,
    memberships,
    holes,
    rounds: sortedRounds,
    resolved,
    hcpFor,
    exactHcpFor,
    liveRoundIds,
    livePlayerIds: livePlayers,
    legacyTeamScoring,
  }), [players, teams, memberships, holes, sortedRounds, resolved, hcpFor, exactHcpFor,
       liveRoundIds, livePlayers, legacyTeamScoring])

  const rowsByBoard = useMemo(
    () => new Map(tabs.map(b => [b.id, buildRows(b, rowContext)])),
    [tabs, rowContext]
  )

  // What the scorecard sheet shows when a row is opened: the same cards the
  // active board is scoring, restated at the allowance that board plays off.
  const cardScores = useMemo(
    () => (activeBoard ? scoresForBoard(activeBoard, rowContext) : resolved),
    [activeBoard, rowContext, resolved]
  )

  // ── Render ──────────────────────────────────────────────────

  const showMatchplay = hasMatchplay(boards)

  /**
   * Everything this trip plays for, on one line: the league boards as tabs,
   * and the draw as a link out at the end of them.
   *
   * Shown whenever there is a choice to make. One board and no draw is not a
   * choice, so it stays as it was — the board's own title says what it is. A
   * draw always counts, even on its own: it is the only way to reach it from
   * here.
   */
  const strip = (tabs.length > 1 || showMatchplay) && (
    <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setActiveId(t.id)}
          className={`flex-shrink-0 px-4 py-2.5 t-label transition-colors duration-150 rounded-xl border ${
            activeBoard?.id === t.id
              ? 'bg-accent-deep text-white font-bold border-accent-deep'
              : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
          }`}
        >
          {boardTitle(t)}
        </button>
      ))}
      {showMatchplay && <MatchplayTab tripCode={tripCode} />}
    </div>
  )

  // Matchplay lives on its own page, so a matchplay-only trip legitimately
  // has no table here — the strip above is what it came for.
  if (!activeBoard) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        {strip}
        {!showMatchplay && <EmptyState message="No competitions switched on for this trip." />}
      </div>
    )
  }

  const currentRows = rowsByBoard.get(activeBoard.id) ?? []

  const emptyMessage =
    activeBoard.audience === 'team'
      ? 'No teams with players yet. Set them up in Trip Setup.'
      : 'No scores yet. The board fills in as play starts.'

  // An individual board added up has a level to be ahead of. A prize table
  // has none — it pays a place — and neither does a team total, where level
  // depends on the format and the size of the team.
  const relativeBoard =
    activeBoard.audience === 'individual' && activeBoard.combine !== 'position'

  // A prize table is worth naming — "10 / 5 / 3 a round" is what an organiser
  // recognises their own competition by, where "points by position" is not.
  const paysByPosition = activeBoard.combine === 'position'
  const rules: string[] = [boardRules(activeBoard)]
  if (paysByPosition) {
    rules.push(describeCustomTable(resolveCustomPoints(
      activeBoard.customPoints ?? [],
      activeBoard.audience === 'team' ? teams.length : players.length,
    )))
  }

  // Team cards show every member side by side; individual tabs show one column
  const cardPlayers = card
    ? card.row.playerIds.map(id => playerById.get(id)).filter(Boolean) as Player[]
    : []

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {strip}

      {/* Title card — only worth the space once there is more than one board */}
      {tabs.length > 1 ? (
        <div className="bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-ink text-base leading-tight">
              {boardTitle(activeBoard)}
            </p>
            {inPlay && <InPlayBadge />}
          </div>
          {rules.length > 0 && (
            <p className="text-ink/65 text-[13px] mt-1 leading-snug">
              {rules.join(' · ')}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-ink/65 text-[13px] leading-relaxed min-w-0">
            {rules.join(' · ')}
          </p>
          {inPlay && <InPlayBadge />}
        </div>
      )}

      {/* What the two colours mean. Only worth saying while something is
          actually in play — otherwise every round is gold and there is no
          distinction to explain. */}
      {inPlay && currentRows.length > 0 && (
        <div className="flex items-center gap-4 mb-2 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="text-ink/65 text-[12px] tracking-wider uppercase">
              {relativeBoard ? 'In play — against level' : 'In play'}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {/* Ink, not emerald. Both swatches were emerald after the gold
                was swept out, so the legend drew two identical dots and
                claimed they told two states apart. A finished round is the
                plain ink the column actually prints it in. */}
            <span className="w-1.5 h-1.5 rounded-full bg-ink/80" aria-hidden="true" />
            <span className="text-ink/65 text-[12px] tracking-wider uppercase">
              Card in — {activeBoard.scoring === 'strokes' ? 'nett total' : 'total'}
            </span>
          </span>
        </div>
      )}

      {currentRows.length === 0
        ? <EmptyState message={emptyMessage} />
        : (
          <Board
            key={activeBoard.id}
            rows={currentRows}
            rounds={sortedRounds}
            playerById={playerById}
            onOpenCard={(row, round) => setCard({ row, round })}
          />
        )}

      {sortedRounds.length > INLINE_ROUNDS && currentRows.length > 0 && (
        <p className="text-ink/65 text-[13px] mt-3 text-center">
          Swipe the rounds sideways, or tap a row to see them all.
        </p>
      )}

      {card && cardPlayers.length > 0 && (
        <ScorecardSheet
          title={card.row.name}
          subtitle={card.round.courses?.name ?? `Round ${card.round.round_number}`}
          players={cardPlayers}
          round={card.round}
          holes={holes}
          // The board's own reading of the cards, not the raw one. A board
          // totalling 33 whose scorecard adds up to 36 is a bug report, and
          // the difference between them is the allowance it is played off.
          resolved={cardScores}
          handicapFor={pid =>
            activeBoard ? boardHandicapFor(activeBoard, rowContext, card.round.id, pid) : null}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  )
}
