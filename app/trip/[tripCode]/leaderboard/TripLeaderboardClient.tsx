'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveCustomPoints } from '@/lib/customPoints'
import type { TeamScoring } from '@/lib/teamScoring'
import {
  type Leaderboard, boardTitle, boardRules, hasMatchplay,
} from '@/lib/leaderboards'
import {
  type BoardRow, type ResolvedScore, type RowContext,
  buildRows, scoresForBoard, boardHandicapFor, effectivePar, effectiveSI,
  orderRowsUndiscarded, teamCardHolePoints,
} from '@/lib/boardRows'
import { type Segment } from '@/lib/tiebreak'
import { buildRowContext, sortRounds } from '@/lib/rowContext'
import { formatHandicap } from '@/lib/handicap'
import { type Membership } from '@/lib/teamSets'
import { roundTone, ROUND_TILE, ROUND_NOTE, ROUND_NOTE_TONE } from '@/lib/roundState'
import { HEADER_H } from '@/app/components/headerMetrics'
import ScoreShape, { NoReturnShape } from '@/app/components/ScoreShape'
import {
  SC_CARD, SC_SF, SC_RULE, SC_BAND, SC_BAND_TOTAL, SC_HEAD, SC_HEAD_TEXT, SC_HEAD_TIGHT, SC_LABEL,
  SC_MUTED, SC_DARK, SC_NUM, scRow, scPoints,
} from '@/app/components/scorecardStyle'

// ─── Types ─────────────────────────────────────────────────────

type Course = { id: string; name: string }
type Round  = {
  id: string; round_number: number; status?: string; courses: Course | null
  /** A casual round — scored as usual, kept off every board and column. */
  casual?: boolean
}
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

/**
 * What a countback settled, in words.
 *
 * This began as a superscript badge on the board itself — a 9 in a green dot
 * beside the total. It read well in isolation and badly in place: the totals
 * column is fourteen pixels wide and pinned, and a mark hanging off the
 * figure pushed the one column on the board that must not move.
 *
 * So the fact moved to where there is room for it — the round tiles that drop
 * out when a row is tapped. That is also where it makes more sense: a
 * countback is a claim about a particular card, and on the tile it sits
 * beside the card it was read off.
 */
function countbackNote(segment: Segment): string {
  return `Back ${segment}`
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
  teamHolePoints = null,
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
  /**
   * The team's own figure on each hole, under the board's format — from
   * `teamCardHolePoints`. Without it a team card sums every member on every
   * hole, which is only what aggregate means: a best-1 better ball read as
   * counting two while the leaderboard counted one. Null on a one-player
   * card, whose own points are already the column.
   */
  teamHolePoints?: Map<number, number> | null
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
        className={`text-[13px] leading-none mt-0.5 tabular-nums ${
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

  /**
   * What the right-hand column holds for these holes: the team's figure under
   * its format where one was handed in, else the players' own points — which
   * on a one-player card is the same column it always was.
   */
  const teamPts = (hs: Hole[]) =>
    teamHolePoints
      ? hs.reduce((s, h) => s + (teamHolePoints.get(h.hole_number) ?? 0), 0)
      : hs.reduce((s, h) => s + players.reduce(
        (t, p) => t + (scoreFor(p.id, h.hole_number)?.points ?? 0), 0), 0)

  const front = nine(1, 9)
  const back  = nine(10, 18)
  const gender = players[0]?.gender ?? 'M'

  /**
   * The stroke index, on a one-player card only.
   *
   * It is the column that answers "why did that six score two points" — where
   * the shots fall is the whole of a Stableford card, and without it the
   * points column has to be taken on trust.
   *
   * Not on a team card, and this is a width judgement rather than a view
   * about who needs it. A team card gives every member a column of their own
   * and they only start scrolling past three; a fourth fixed column takes
   * roughly a sixth of the row from three players who are already down to a
   * score shape and a raised points figure each. On one player the score
   * column is `flex-1` and gives the space up without noticing.
   */
  const showSI = players.length === 1

  // Fixed either side, scrolling in the middle. The widths are the same in
  // both modes so a one-player card and a six-player card line up.
  const HOLE_W = 'w-10 flex-shrink-0'
  const PAR_W  = 'w-9 flex-shrink-0'
  const SI_W   = 'w-8 flex-shrink-0'
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
      <span className={`${PAR_W} ${SC_NUM} font-bold text-ink`} style={SC_SF}>{sumPar(hs, gender)}</span>
      {/* Nine stroke indexes do not add up to anything, so the column holds
          its width and says nothing rather than printing a figure that would
          be read as a total. */}
      {showSI && <span className={SI_W} aria-hidden="true" />}
      <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
        {players.map(p => {
          const gross = sumGross(hs, p.id)
          return (
            <span key={p.id} className={CELL_TOP}>
              <span className={`${SC_NUM} font-bold text-ink`} style={SC_SF}>
                {gross > 0 ? gross : '—'}
              </span>
              {gross > 0 && points(sumPts(hs, p.id))}
            </span>
          )
        })}
      </Strip>
      <span className={`${PTS_W} font-bold text-ink ${total ? 'text-xl' : 'text-base'}`} style={SC_SF}>
        {teamPts(hs)}
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
      <div className="absolute inset-0 bg-ink/50 page-enter" />
      <div
        className={`relative w-full max-w-lg flex flex-col max-h-full overflow-hidden page-enter ${SC_CARD}`}
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
            {showSI && <span className={`${SI_W} ${SC_HEAD_TIGHT}`} style={SC_SF}>SI</span>}
            <Strip scrolls={scrolls} register={register} onScroll={onScroll}>
              {players.map(p => (
                <span key={p.id} className={`${CELL} ${SC_HEAD_TEXT}`} style={SC_SF}>
                  {players.length > 1 ? firstName(p.name).slice(0, 3) : 'Score'}
                </span>
              ))}
            </Strip>
            <span className={`${PTS_W} ${SC_HEAD_TEXT}`} style={SC_SF}>Pts</span>
          </Row>

          {/* Hole rows — the only vertically scrolling part.
              No padding under them: the Total band is the end of the card and
              wants to sit against its edge. The 32px that used to be here
              showed as a strip of white below the darkest band once you
              scrolled to the bottom, which reads as the card having failed to
              finish rather than as breathing room. */}
          <div className="overflow-y-auto flex-1">
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
              const rowPts = teamPts([hole])
              return (
                <Fragment key={hole.id}>
                  <Row className={`py-1.5 ${SC_RULE} ${scRow(hole.hole_number)}`}>
                    <span className={`${HOLE_W} ${SC_NUM} font-semibold ${SC_DARK}`} style={SC_SF}>
                      {hole.hole_number}
                    </span>
                    <span className={`${PAR_W} ${SC_NUM} ${SC_MUTED}`} style={SC_SF}>
                      {effectivePar(hole, gender)}
                    </span>
                    {/* Off the same tee the par came from. A ladies card is
                        ranked in its own order, and taking the par from one
                        set of numbers and the index from the other would put
                        the shots on the wrong holes. */}
                    {showSI && (
                      <span className={`${SI_W} ${SC_NUM} ${SC_MUTED}`} style={SC_SF}>
                        {effectiveSI(hole, gender)}
                      </span>
                    )}
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
                      className={`${PTS_W} ${SC_NUM} ${played ? scPoints(rowPts) : SC_MUTED}`}
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

/**
 * The round tiles that drop out when a row is tapped.
 *
 * Exported for `test:leaderboard`. The board only renders these once a row is
 * expanded, and expansion is client state a static render never reaches — so
 * without this the one card a countback now speaks on could not be checked at
 * all, which is exactly the card that had the bug.
 */
export function CourseTiles({
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

        // **"Scores in" is not said here**, where the round picker in scoring
        // does say it. There the tile is all there is; here the score itself
        // is on the same line, two inches to the right, so the words would be
        // telling you what the number already has. A finished round with
        // nothing else to report says nothing.
        const note = live
          ? heroName ? `In play — carried by ${firstName(heroName)}` : ROUND_NOTE.live
          : hasScores
            ? heroName ? `Carried by ${firstName(heroName)}` : ''
            : ROUND_NOTE.empty

        // A countback that settled something on this round's card — the
        // round's own prize on a board that pays by position, or the whole
        // board's order where this is the round it was read off.
        const settledBy = row.tieBadgeByRound?.[round.id]
          ?? (row.tieBadgeRoundId === round.id ? row.tieBadge : undefined)

        return (
          <button
            key={round.id}
            onClick={() => onTileClick(round)}
            className={`w-full text-left rounded-2xl press ${ROUND_TILE[tone]}`}
          >
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-ink text-base leading-tight truncate">
                  {round.courses?.name ?? `Round ${round.round_number}`}
                </p>
                {/* Two lines before the ellipsis. "In play — carried by
                    Rosaleen" is an ordinary note and it was losing its second
                    half on every phone, so the one thing on this tile with
                    something to say was the one thing being cut off. */}
                {note && (
                  <p className={`t-cap mt-1 leading-snug line-clamp-2 ${ROUND_NOTE_TONE[tone]}`}>
                    {note}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                {hasScores && (
                  <span className={`font-[family-name:var(--font-display)] text-xl font-bold tabular-nums ${
                    live ? 'text-accent-deep' : 'text-ink'
                  }`}>
                    {live && rel !== undefined ? formatRelative(rel) : formatScore(pts)}
                  </span>
                )}
                {/* The countback sits directly over "View", which is the only
                    space on this tile that is always free — the note beside
                    the course name may already be carrying a hero, and the
                    score is a number that must not be crowded. */}
                <span className="flex flex-col items-end leading-tight">
                  {settledBy && (
                    <span
                      className="text-accent-deep text-[13px] font-semibold tabular-nums"
                      title={`Tie broken on the back ${settledBy}`}
                    >
                      {countbackNote(settledBy)}
                    </span>
                  )}
                  <span className="text-ink/65 text-sm">View →</span>
                </span>
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
 * Keeps every row's strip on the same horizontal scroll position.
 *
 * **The board no longer uses this — see `useBoardScroll` below.** The board
 * is one scroller now, because a dozen of them synchronised by hand never
 * quite moved as one table. What is left here is the scorecard sheet, where
 * the same arrangement is fine: it is a modal, its player columns are rarely
 * scrolled, and its rows alternate towards cream, which is what makes the
 * opaque pinned columns the board uses awkward there.
 *
 * Writing scrollLeft fires `scroll` again, so the write has to be told apart
 * from a real one — without that the strips fight each other and judder.
 */
function useSyncedStrips() {
  const strips = useRef<Set<HTMLDivElement>>(new Set())
  /**
   * The offset last written to each strip, so its own echo can be told from
   * a finger on it.
   *
   * This replaced a `syncing` boolean held across a frame, and the boolean
   * was what made the table feel loose. Every event inside that window was
   * dropped — including the real ones, which during a flick arrive every
   * frame — so the followers took a step, ignored the next report, took
   * another, and trailed the row under the thumb by a frame or two the
   * whole way across.
   *
   * A value rather than a window: an event is our own echo when the strip
   * is already sitting exactly where we put it, and that is true no matter
   * when it arrives. Nothing real is ever swallowed.
   *
   * A WeakMap so a strip that unmounts takes its entry with it.
   */
  const applied = useRef(new WeakMap<HTMLDivElement, number>())

  // Always returns a cleanup, never sometimes — React 19 treats a returned
  // function as the detach hook, and a callback that returns one only on
  // some renders leaves stale nodes in the set when the board changes.
  const register = useCallback((el: HTMLDivElement | null) => {
    const set = strips.current
    if (el) set.add(el)
    return () => { if (el) set.delete(el) }
  }, [])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const source = e.currentTarget
    const left = source.scrollLeft

    // Our own echo. Skipping it is safe even in the rare case where a real
    // scroll happens to land on exactly the offset we last wrote: every
    // strip is already there, so there is nothing to propagate.
    if (applied.current.get(source) === left) return

    // Written here rather than deferred to the next frame. `scroll` is
    // already delivered once per frame, so a rAF only bought a frame of lag;
    // setting twelve `scrollLeft`s is a handful of microseconds and lands
    // the followers in the same frame as the row being dragged.
    for (const el of strips.current) {
      if (el === source || el.scrollLeft === left) continue
      // Recorded before the write, not read back after it. Reading
      // `scrollLeft` straight after setting it forces a synchronous layout,
      // and doing that a dozen times per frame is the one thing here that
      // would genuinely cost a flick. Safe because every strip holds the
      // same columns at the same widths, so they clamp identically or not
      // at all.
      applied.current.set(el, left)
      el.scrollLeft = left
    }
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

/**
 * The board's horizontal scroll: one scroller, and the headings kept level.
 *
 * **Why the headings are a second scroller rather than part of the first.**
 * The column headings are `position: sticky` with `top: HEADER_H`, so they
 * hold below the wordmark bar as the page scrolls. Sticky resolves against
 * the nearest scroll container, and an element with `overflow-x: auto` is a
 * scroll container — so a heading row inside the board's scroller would
 * measure that offset from the scroller instead of the viewport and park
 * itself HEADER_H down the card, on top of whoever is leading. That is a bug
 * this app has already shipped once; see docs/design-system.md. `overflow-y:
 * clip` does not get around it either — the element is still a scroll
 * container for x, and that is what sticky binds to.
 *
 * So the headings sit outside, in a scroller of their own, and follow. One
 * follower rather than a dozen, and it is not the one under anybody's thumb:
 * every row of the table is now literally the same element and cannot come
 * apart from itself, which is the whole point of the change.
 *
 * `moreRight` is the other half. The pure-CSS shadow this replaced was
 * painted on the scroller's own background at its right edge — which is
 * exactly where the pinned Total column now sits, and a background paints
 * below content. So the shadow has to be an element, and an element cannot
 * work out on its own whether anything is still hidden. One boolean, flipped
 * at the two extremes: React bails out of the re-render whenever it has not
 * changed, so a flick costs one render at each end and none in between.
 */
function useBoardScroll(scrolls: boolean) {
  const head = useRef<HTMLDivElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)
  /** The offset last written to a scroller, so its echo is not mistaken for a finger. */
  const applied = useRef(new WeakMap<HTMLElement, number>())
  // Starts at whether the board scrolls at all, which is the right answer on
  // every phone and is what the server paints. Measuring only ever corrects
  // it downwards, on a window wide enough to fit the columns — so the shade
  // is never absent for a frame on the screens that need it.
  const [moreRight, setMoreRight] = useState(scrolls)
  // Nothing is hidden to the left until something has been scrolled past it,
  // so this one genuinely does start false — on the server and on a phone
  // alike. Its opposite number cannot, which is why they are seeded
  // differently rather than symmetrically.
  const [moreLeft, setMoreLeft] = useState(false)

  // A pixel of slack: scrollWidth and clientWidth are integers but scrollLeft
  // is fractional on a zoomed or scaled display, so an exact comparison can
  // leave the shadow up by a hair's breadth at the very end of the scroll.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    setMoreLeft(el.scrollLeft > 1)
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const source = e.currentTarget
    const left = source.scrollLeft

    // Our own echo. Safe to skip even if a real scroll lands on exactly the
    // offset we last wrote — both scrollers are already there.
    if (applied.current.get(source) === left) return

    const other = source === body.current ? head.current : body.current
    if (other && other.scrollLeft !== left) {
      // Recorded before the write. Reading `scrollLeft` back would force a
      // synchronous layout inside a scroll handler, and the two scrollers
      // hold the same columns at the same widths, so they clamp alike.
      applied.current.set(other, left)
      other.scrollLeft = left
    }

    measure(source)
  }, [measure])

  // The first answer, and again whenever the window changes shape. On a
  // phone the columns always overflow, but a wide enough window fits six
  // rounds and there is then nothing to cast a shadow about.
  useEffect(() => {
    const el = body.current
    if (!el) return
    measure(el)
    const onResize = () => measure(el)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  return { head, body, onScroll, moreLeft, moreRight }
}

/** Round columns beyond this stop fitting a phone, so they start scrolling. */
const INLINE_ROUNDS = 4

function Board({
  board, rows: allRows, rounds, playerById, onOpenCard,
}: {
  board: Leaderboard
  rows: BoardRow[]
  rounds: Round[]
  playerById: Map<string, Player>
  onOpenCard: (row: BoardRow, round: Round) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /**
   * Whether the board's discard rule is being applied to what you can see.
   *
   * **Off by default, and that is a deliberate choice rather than a lazy
   * one.** A board that drops your worst round is showing a total with a
   * card missing from it, and the missing card is the first thing anybody
   * asks about. So the plain arithmetic — every round counting, the columns
   * adding to the total beside them — is what the board opens on, and the
   * rule is one tap away.
   *
   * Turned on, the dropped round strikes through and the totals fall to the
   * competition's real figures. **The order changes with them**: a board
   * ordered by a total it is not showing reads as broken, so it is sorted by
   * whichever total is on screen. That is `orderRowsUndiscarded` and it is
   * the board's own comparator asking a different column, not a second
   * ordering — see the note on it in lib/boardRows.ts.
   *
   * State lives here rather than in the page because `Board` is keyed by
   * the board's id: switch tab and the toggle resets to off, which is right.
   * A discard rule belongs to one board and so does the answer about it.
   */
  const [discarding, setDiscarding] = useState(false)

  // Only worth a control when the rule actually took something away. A board
  // set to drop the worst of one round drops nothing.
  const discards = allRows.some(r => (r.droppedRounds?.length ?? 0) > 0)
  const applied = discards && discarding

  const rows = useMemo(
    () => (applied ? allRows : orderRowsUndiscarded(board, allRows)),
    [applied, allRows, board],
  )

  // Under the limit nothing scrolls and the columns are just a row; over it,
  // the same markup scrolls and the ends pin themselves.
  const scrolls = rounds.length > INLINE_ROUNDS
  const showRounds = rounds.length > 0

  const { head, body, onScroll, moreLeft, moreRight } = useBoardScroll(scrolls)

  // Narrower once the rounds scroll — every pixel the name gives up is
  // another round column visible before you have to swipe. On a 375px phone
  // that is roughly three and a half columns, and the half is the point: a
  // column cut in two is itself a cue that there is more to the right.
  const NAME_W = scrolls ? 'w-[5.5rem]' : 'flex-1'
  const CELL = `${scrolls ? 'w-8' : 'w-10'} flex-shrink-0 text-center`
  const GAP  = scrolls ? 'gap-1.5' : 'gap-2'

  /**
   * The position column, as wide as the deepest place on this board and no
   * wider.
   *
   * It was a flat `w-5` — two digits' worth — on every board, so a field of
   * eight carried six pixels of nothing between the number and the name for
   * a tenth place that does not exist. The board knows how many rows it has,
   * so it can measure this rather than reserve for the worst case.
   */
  const POS_W = `${rows.length >= 10 ? 'w-5' : 'w-3.5'} flex-shrink-0`

  /**
   * The two pinned ends, and the fiddly bits of this layout. There are three,
   * and every one of them is about the *background* rather than the position.
   *
   * **Horizontally**: `left-0` with the row's own `px-3` pulled into the
   * element — `-ml-3 pl-3` — rather than `left-3` with the padding left
   * outside it. Both hold the column in the right place; only this one paints
   * the twelve pixels beside it. Pinned at `left-3` the background starts
   * where the content does, and the cells sliding underneath show through the
   * gutter between it and the card's edge.
   *
   * **Vertically**: `self-stretch`, and this is the one that shipped wrong.
   * The row is `items-center`, which centres each item and leaves it at its
   * own content height — so a pinned column was as tall as the name inside
   * it, not as tall as the row. On a row carrying a sub-label that was taller
   * than the round cells and covered them; on a row without one it was
   * shorter, and a sliver of each cell showed above and below the name as it
   * scrolled past. Hence *some* rows looking transparent and not others.
   *
   * **And past the row's padding**: `-my-2 py-2` cancels the row's `py-2` so
   * the pinned box fills the row's full height rather than its content box.
   * Without it the shades below — which hang off these elements — would stop
   * short at every row boundary, and a band with a gap every 40 pixels is the
   * striped effect this design has now been through twice.
   *
   * The net position is unchanged on both axes, so these are also correct on
   * a board that never scrolls, where sticky simply never fires.
   *
   * **`pr-2` on the left one** is the only padding here that is not about
   * the background. The live dot sits at the end of the name, and with the
   * column ending flush against it the dot touched the edge the round
   * figures slide under — reading as part of the next column rather than as
   * part of the row. Eight pixels is enough for it to belong to the name.
   * Paid for by the tighter position column beside it, so the pinned end is
   * no wider than it was and no round column moved.
   */
  const pin = (side: 'l' | 'r', padY: string) =>
    `sticky z-10 bg-surface self-stretch flex items-center ${padY} ${
      side === 'l'
        ? `left-0 -ml-3 pl-3 pr-2 gap-1.5 ${scrolls ? 'flex-shrink-0' : 'flex-1 min-w-0'}`
        : 'right-0 -mr-3 pr-3 flex-shrink-0'
    }`

  /**
   * The shade over whatever is hidden behind each pinned column.
   *
   * Absolutely positioned against the pin itself, which is `sticky` and
   * therefore already a positioned ancestor — no `relative` needed, and
   * adding one would be a coin toss anyway, since both are `position`
   * utilities and which wins is decided by their order in the generated
   * stylesheet rather than in the class attribute.
   */
  const shadeL = moreLeft && (
    <span
      aria-hidden="true"
      className="scroll-shade-l absolute left-full top-0 bottom-0 w-4 pointer-events-none"
    />
  )
  const shadeR = moreRight && (
    <span
      aria-hidden="true"
      className="scroll-shade-r absolute right-full top-0 bottom-0 w-4 pointer-events-none"
    />
  )

  // No overflow on this card, deliberately. It would make the card its own
  // scrollport, and the sticky heading row below would then measure its
  // offset from the card's top edge rather than the viewport's — dropping the
  // headings exactly HEADER_H down the card and parking them on top of
  // whoever is leading. The corners round without it.
  return (
    <div className="bg-surface border border-bark/12 rounded-2xl">

      {/* ── The discard switch ──
          Above the headings and inside the card, because it changes what
          every figure below it means and belongs to this table rather than
          to the page. Absent entirely on a board that dropped nothing, which
          is most of them. */}
      {discards && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-bark/12">
          <span className="text-[13px] text-ink/65 leading-snug min-w-0">
            {/* Says what is on screen, not what the board's rule is — the
                rules line above already states the rule, and "Worst round
                dropped · Every round counting" one under the other reads as
                a contradiction rather than as a rule and a view of it. */}
            {discarding
              ? 'Worst round set aside'
              : 'Showing every round'}
          </span>
          <button
            onClick={() => setDiscarding(v => !v)}
            aria-pressed={discarding}
            title={
              discarding
                ? 'Showing the competition total — tap to count every round'
                : 'Tap to drop the worst round, as this board scores it'
            }
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-[13px] tracking-wider uppercase transition-colors duration-150 ${
              discarding
                ? 'bg-accent-deep text-white border-accent-deep font-bold'
                : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
            }`}
          >
            Discard
          </button>
        </div>
      )}

      {/* ── Column headings ──
          Sticky against the viewport, so outside the scroller below and in a
          thin scroller of their own that follows it. See `useBoardScroll`
          for why they cannot simply be the table's first row. */}
      <div
        // Sits directly under the wordmark header, which is 52px tall. A
        // hard 0 here would slide the column headings under the mark.
        style={{ top: HEADER_H }}
        // Above the rows' own pinned columns, which carry z-10 of their own.
        className="sticky z-20 bg-surface border-b border-bark/12 rounded-t-2xl"
      >
        <div
          ref={head}
          onScroll={scrolls ? onScroll : undefined}
          className={scrolls ? 'overflow-x-auto scroll-strip' : ''}
        >
          <div className={`flex items-center ${GAP} px-3 py-1.5 ${scrolls ? 'w-max min-w-full' : ''}`}>
            <span className={pin('l', '-my-1.5 py-1.5')}>
              {/* The position column is not named.
                  "POS" is three letters at 13px with wide tracking, in a
                  column sized for the digits underneath it — so it overran
                  its own width and ran straight into the heading beside it,
                  which read as one word: POSNAME. A heading is worth its
                  space when it says something the column does not, and a
                  column of 1, 2, 3 down the left of a leaderboard does not
                  need telling. The spacer stays so "Name" still sits over
                  the names. */}
              <span className={POS_W} aria-hidden="true" />
              <span className={`text-[13px] tracking-widest uppercase text-ink/65 min-w-0 ${NAME_W}`}>Name</span>
              {shadeL}
            </span>
            {showRounds && rounds.map(r => (
              <span key={r.id} className={`${CELL} text-[13px] text-ink/65 tabular-nums`}>
                {r.round_number}
              </span>
            ))}
            <span className={pin('r', '-my-1.5 py-1.5')}>
              {shadeR}
              <span className="block w-14 text-right text-[13px] tracking-widest uppercase text-ink/65">Tot</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── The table ──
          One scroller for every row, so the rows cannot come apart from each
          other: they are the same element. `container-type` is what lets an
          expanded row size itself to the width you can see rather than to the
          width of all the columns — see `.board-scroll` in globals.css. */}
      <div
        ref={body}
        onScroll={scrolls ? onScroll : undefined}
        className={`board-scroll ${scrolls ? 'overflow-x-auto scroll-strip' : ''}`}
      >
        {rows.map((row, i) => {
          const isExpanded = expandedId === row.id
          const isLast     = i === rows.length - 1
          return (
            <Fragment key={row.id}>
              <button
                onClick={() => setExpandedId(prev => (prev === row.id ? null : row.id))}
                // Pressed reads as opacity rather than as a tint, because the
                // pinned columns are opaque and a background tint on the row
                // would have stopped at them — the middle darkening while the
                // two ends stayed white. Opacity flattens the row first and
                // fades the result, so it lands evenly and nothing shows
                // through the pinned columns while it does.
                className={`flex items-center ${GAP} px-3 py-2 text-left transition-opacity duration-150 active:opacity-70 ${
                  scrolls ? 'w-max min-w-full' : 'w-full'
                } ${!isLast || isExpanded ? 'border-b border-bark/12' : ''}`}
              >
                <span className={pin('l', '-my-2 py-2')}>
                  {/* The place, not the row's index. Two level share one —
                      both are 1st and the next row is 3rd — which is what a
                      board that leaves ties standing is saying. */}
                  <span className={`t-cap text-ink/65 tabular-nums ${POS_W}`}>{row.place}</span>

                  <span className={`block min-w-0 ${NAME_W}`}>
                    <span className="flex items-center gap-1.5">
                      {row.color && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                      )}
                      <span className="t-card text-ink truncate">{row.name}</span>
                      {row.isLive && <LiveDot />}
                    </span>
                    {row.subLabel && (
                      <span className={`block text-ink/65 text-[13px] truncate leading-snug ${row.color ? 'pl-3.5' : ''}`}>
                        {row.subLabel}
                      </span>
                    )}
                  </span>
                  {shadeL}
                </span>

                {showRounds && rounds.map(r => {
                  const played  = row.playedRounds.includes(r.id)
                  // Only while the switch is on. Off, a set-aside round is
                  // an ordinary counting round and looks like one.
                  const dropped = applied && (row.droppedRounds?.includes(r.id) ?? false)
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

                {/* Rows are pre-filtered to those who have played, so the
                    total is always a real number — including a legitimate 0. */}
                {/* The total is the primary datum, so it is plain ink. Emerald
                    on this board means one thing only: still being played. */}
                <span className={pin('r', '-my-2 py-2')}>
                  {shadeR}
                  <span className="block w-14 text-right t-num font-semibold text-xl text-ink">
                    {/* The total the columns beside it add up to, whichever
                        way the switch is set. `totalAll` is only there when
                        something was dropped, so the fallback is exact. */}
                    {formatScore(applied ? row.total : row.totalAll ?? row.total)}
                  </span>
                </span>
              </button>

              {isExpanded && (
                // Inside the scroller, because it belongs under its own row —
                // but pinned and sized to the width you can see, so the tiles
                // do not slide away sideways with the columns. `100cqw` is the
                // scroller's own width, which is why it carries a container
                // type; measuring it in JavaScript would be the same number
                // arriving a frame later and needing a resize listener.
                <div className={`board-wide sticky left-0 ${!isLast ? 'border-b border-bark/12' : ''}`}>
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

      {/* ── The plinth ──
          The table used to just stop. This card carries `rounded-2xl` and
          deliberately no `overflow-hidden` — that would make it its own
          scrollport and drop the sticky headings a header's height down it —
          so the last row's square white fill sat over the rounded corners and
          the card's own bottom border with them. The board ended on a hard
          white edge against cream, with no line at all.

          The hard edge is right: a table of figures should close flat, the
          way the headings open flat. What was missing was the line. So this
          is that line — a touch stronger than the rules between rows, because
          it is closing the table rather than dividing it — and beneath it a
          band that carries the corners the card was always meant to have.

          **It must not read as another player.** A row is 44 pixels and
          white; this is 12 and tinted, which is a base rather than a line of
          the table. It holds nothing and is hidden from a screen reader for
          the same reason. */}
      <div
        className="h-3 rounded-b-2xl border-t border-bark/25 bg-bark/[0.04]"
        aria-hidden="true"
      />
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
 * from that module is imported into this file.
 *
 * It carried an arrow to say it leaves the page while the boards beside it
 * only change what is below. That distinction is real and the arrow was not
 * worth it: it made one chip in a row of chips wider and busier than the
 * rest, and nobody is misled by a tap that opens the draw.
 */
function MatchplayTab({ tripCode }: { tripCode: string }) {
  return (
    <Link
      href={`/trip/${tripCode}/matchplay`}
      className="flex-shrink-0 inline-flex items-center px-4 py-2.5 t-label rounded-xl
        border bg-surface border-bark/12 text-ink/65
        hover:text-ink/80 hover:border-accent/50 active:opacity-75
        transition-colors duration-150"
    >
      Matchplay
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

  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  // ── Everything a board is built from ────────────────────────
  //
  // The merging, the handicap maps and the live sets used to sit here as
  // half a dozen useMemos. They are one call now, shared with the trip hub —
  // which needs the same answer for one line and had a copy of this to get
  // it. Two copies of the rules of the competition is how the hub comes to
  // say a player is third while this screen says fourth.
  //
  // Fetching is still each screen's own: this one is handed its rows as
  // props, the hub queries for them. Only the deciding is shared.
  const rowContext: RowContext = useMemo(() => buildRowContext({
    players, teams, memberships, holes, rounds,
    courseByRound: new Map(rounds.map(r => [r.id, r.courses?.id ?? ''])),
    scores, liveScores, roundHandicaps, tees,
    activeRoundIds, livePlayerIds,
    legacyTeamScoring,
  }), [players, teams, memberships, holes, rounds, scores, liveScores,
       roundHandicaps, tees, activeRoundIds, livePlayerIds, legacyTeamScoring])

  const resolved = rowContext.resolved
  // The same order the board columns them in, on the fuller row this screen
  // carries — a board needs an id and a number, this also needs the course.
  // Casual rounds are left out here for the same reason `buildRows` leaves
  // them out of every total: a round the board is not counting gets no
  // column, rather than a column of blanks under every name.
  const sortedRounds = useMemo(
    () => sortRounds(rounds.filter(r => r.casual !== true)),
    [rounds],
  )

  // A round counts as in play when a scorecard is actually open on it, not
  // merely because someone once entered a score into it.
  /**
   * Somebody is out on the course right now.
   *
   * **A player holding a card, not a session existing.** Tapping Start opens
   * a `live_rounds` row before anybody has been picked for it — the scoring
   * screen even reuses a playerless one rather than making a second — so
   * anyone who opened that screen to look at it and backed out left a session
   * active with nobody on it, and this badge then said the trip was in play
   * until the nightly cleanup closed it.
   *
   * `livePlayerIds` comes off the locks on those sessions, which is the same
   * signal a row's own live dot reads. One answer to "who has a card open",
   * and the board and the rows on it cannot disagree about it.
   */
  const inPlay = livePlayerIds.length > 0

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

  // And on a team card, the team's own figure per hole under the board's
  // format — best 1, best 2, the hero's card — rather than a sum of everyone,
  // which is only what aggregate means. Null everywhere else.
  const cardTeamPoints = useMemo(
    () => (card && activeBoard
      ? teamCardHolePoints(activeBoard, rowContext, card.round.id, card.row.playerIds)
      : null),
    [card, activeBoard, rowContext]
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
  //
  // **The stats had a chip here and no longer do.** They have a tab of their
  // own on the bar at the bottom of every trip screen, so a second way in
  // from this one page was a chip that said what the bar already said — and
  // it was the only thing forcing this strip to exist on a one-board trip.
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
        {!showMatchplay && <EmptyState message="Create a leaderboard in Trip Setup." />}
      </div>
    )
  }

  const currentRows = rowsByBoard.get(activeBoard.id) ?? []

  const emptyMessage =
    activeBoard.audience === 'team'
      ? 'Set teams in Trip Setup'
      : 'No scores yet.'

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

      {/* No legend under the rules line.
          It read "In play — against level · Card in — total", two swatches
          explaining two colours, and it cost a band across the top of the one
          screen in the app that is all table. The board says it without help:
          a live figure is emerald and carries a dot, a finished one is ink,
          and each round cell already names its own state on a long press. A
          key is worth its space when the thing it decodes is arbitrary — a
          colour standing for a state nothing else names. Here it is not. */}

      {currentRows.length === 0
        ? <EmptyState message={emptyMessage} />
        : (
          <Board
            key={activeBoard.id}
            board={activeBoard}
            rows={currentRows}
            rounds={sortedRounds}
            playerById={playerById}
            onOpenCard={(row, round) => setCard({ row, round })}
          />
        )}

      {sortedRounds.length > INLINE_ROUNDS && currentRows.length > 0 && (
        <p className="text-ink/65 text-[13px] mt-3 text-center">
          Swipe to switch round.
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
          teamHolePoints={cardTeamPoints}
          handicapFor={pid =>
            activeBoard ? boardHandicapFor(activeBoard, rowContext, card.round.id, pid) : null}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  )
}
