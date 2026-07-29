'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { leaderboardTabs, matchplayOn, type BoardKey, type TripFormats } from '@/lib/formats'
import {
  resolveCustomPoints, awardRound, totalAfterDiscard, discardedIndices,
} from '@/lib/customPoints'
import { describeTeamScoring, teamRoundPoints, type TeamScoring } from '@/lib/teamScoring'

// ─── Types ─────────────────────────────────────────────────────

type Course = { id: string; name: string }
type Round  = { id: string; round_number: number; status?: string; courses: Course | null }
type Team   = { id: string; name: string; color: string }
type Player = { id: string; name: string; handicap: number | null; gender: string; team_id: string | null }
type Hole   = {
  id: string; hole_number: number; par: number; stroke_index: number; course_id: string
  par_ladies?: number | null; stroke_index_ladies?: number | null
}
type Score      = { player_id: string; hole_id: string; gross_score: number | null; stableford_points: number; no_return: boolean; round_id: string }
type LiveScore  = { player_id: string; round_id: string; hole_number: number; gross_score: number | null; stableford_points: number | null }
type RoundHcp   = { round_id: string; player_id: string; playing_handicap: number }

interface Props {
  tripCode: string
  formats: TripFormats
  /** Rounds with a scorecard open right now. */
  activeRoundIds: string[]
  teamScoring: TeamScoring
  rounds: Round[]
  teams: Team[]
  players: Player[]
  holes: Hole[]
  scores: Score[]
  liveScores: LiveScore[]
  roundHandicaps: RoundHcp[]
}

/** A score resolved from either the committed or the in-progress table. */
type ResolvedScore = {
  playerId: string
  roundId: string
  holeId: string
  holeNumber: number
  gross: number | null
  points: number
  noReturn: boolean
}

/** One line on the board — a player or a team, depending on the tab. */
type BoardRow = {
  id: string
  name: string
  subLabel: string
  color?: string
  perRound: Record<string, number>
  /**
   * Rounds this row actually took part in. A zero in `perRound` is a real
   * score for these and a blank for any other round — losing every match
   * is not the same as not turning up.
   */
  playedRounds: string[]
  /** Rounds set aside by the discard rule — shown struck through. */
  droppedRounds?: string[]
  total: number
  isLive: boolean
  /** Whose card the scorecard sheet shows when this row is opened. */
  playerIds: string[]
  /** Hero mode: who carried the team, per round. */
  heroByRound?: Record<string, string | null>
}

// ─── Donegal Masters scorecard styling ─────────────────────────

const SC_SF    = { fontFamily: 'Georgia, serif' }
const SC_MUTED = 'text-[#7A7060]'
const SC_DARK  = 'text-[#3A3A2E]'

// ─── Scoring helpers ───────────────────────────────────────────

function shotsReceived(playingHandicap: number, strokeIndex: number) {
  const whole = Math.floor(playingHandicap / 18)
  const remainder = Math.round(playingHandicap) % 18
  return whole + (strokeIndex <= remainder ? 1 : 0)
}

function effectivePar(hole: Hole, gender: string) {
  return gender === 'F' && hole.par_ladies != null ? hole.par_ladies : hole.par
}
function effectiveSI(hole: Hole, gender: string) {
  return gender === 'F' && hole.stroke_index_ladies != null ? hole.stroke_index_ladies : hole.stroke_index
}

const firstName = (n: string) => n.split(' ')[0]

// ─── Shared bits ───────────────────────────────────────────────

function LiveDot() {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0 animate-pulse"
      title="Round in progress"
    />
  )
}

/** Whole numbers stay plain; a shared position shows its half. */
function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Shown while a scorecard is open somewhere on the trip. */
function InPlayBadge() {
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10">
      <span
        className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
        style={{ boxShadow: '0 0 6px rgba(52,211,153,0.9)' }}
      />
      <span className="text-emerald-300 text-[10px] tracking-[0.15em] uppercase">In play</span>
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
    <div className="border border-[#1e3d28] py-16 text-center">
      <p className="text-white/30 text-sm px-6">{message}</p>
    </div>
  )
}

// ─── Parchment scorecard sheet ─────────────────────────────────

function ScorecardSheet({
  title, subtitle, players, round, holes, resolved, roundHandicaps, onClose,
}: {
  title: string
  subtitle: string
  players: Player[]
  round: Round
  holes: Hole[]
  resolved: ResolvedScore[]
  roundHandicaps: RoundHcp[]
  onClose: () => void
}) {
  const courseHoles = holes
    .filter(h => h.course_id === (round.courses?.id ?? ''))
    .sort((a, b) => a.hole_number - b.hole_number)

  // gridTemplateColumns is inline because the player count varies
  const gridCols = {
    display: 'grid',
    gridTemplateColumns: `2fr 2fr ${players.map(() => '3fr').join(' ')} 2fr`,
    width: '100%',
  } as const

  const scoreFor = (playerId: string, holeNumber: number) =>
    resolved.find(s => s.playerId === playerId && s.roundId === round.id && s.holeNumber === holeNumber)

  // Ink-style symbols: rings for under par, rounded squares for over
  const scoreSymbol = (gross: number | null, par: number, isNR: boolean) => {
    if (isNR) {
      return (
        <span className="inline-flex items-center justify-center w-9 h-9 border border-orange-500/60 rounded-sm text-orange-500 text-xs font-semibold">
          NR
        </span>
      )
    }
    if (gross === null) return <span className={`${SC_MUTED} text-lg`} style={SC_SF}>—</span>
    const diff = gross - par
    if (diff <= -2) return (
      <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-[#C9A84C]">
        <span className="absolute inset-[3px] rounded-full border border-[#C9A84C]" />
        <span className="relative text-sm font-semibold leading-none text-[#7B5C1E]">{gross}</span>
      </span>
    )
    if (diff === -1) return (
      <span className="inline-flex w-9 h-9 rounded-full border border-[#C9A84C] items-center justify-center text-[#7B5C1E] text-lg font-semibold leading-none">
        {gross}
      </span>
    )
    if (diff === 0) return <span className={`${SC_DARK} text-lg font-semibold`} style={SC_SF}>{gross}</span>
    if (diff === 1) return (
      <span className="inline-flex w-9 h-9 rounded-md border border-[#9B8860] items-center justify-center text-[#5A4F3A] text-lg font-semibold leading-none">
        {gross}
      </span>
    )
    return (
      <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-[#9B8860]">
        <span className="absolute inset-[3px] rounded-sm border border-[#9B8860]" />
        <span className="relative text-sm font-semibold leading-none text-[#5A4F3A]">{gross}</span>
      </span>
    )
  }

  const nine = (from: number, to: number) => courseHoles.filter(h => h.hole_number >= from && h.hole_number <= to)
  const sumPar = (hs: Hole[], gender: string) => hs.reduce((s, h) => s + effectivePar(h, gender), 0)
  const sumPts = (hs: Hole[], playerId: string) =>
    hs.reduce((s, h) => s + (scoreFor(playerId, h.hole_number)?.points ?? 0), 0)
  const sumGross = (hs: Hole[], playerId: string) =>
    hs.reduce((s, h) => {
      const sc = scoreFor(playerId, h.hole_number)
      return s + (sc?.gross ?? 0)
    }, 0)

  const front = nine(1, 9)
  const back  = nine(10, 18)

  const SummaryRow = ({ label, hs }: { label: string; hs: Hole[] }) => (
    <div
      style={{ ...gridCols, background: 'rgba(201,168,76,0.18)' }}
      className="px-3 py-2 items-center border-y border-[#D4CBBA]"
    >
      <span className="text-xs font-bold tracking-widest uppercase text-[#4A3810]" style={SC_SF}>{label}</span>
      <span className="text-base font-bold text-[#4A3810]" style={SC_SF}>
        {sumPar(hs, players[0]?.gender ?? 'M')}
      </span>
      {players.map(p => (
        <span key={p.id} className="text-center text-base font-bold text-[#4A3810]" style={SC_SF}>
          {sumGross(hs, p.id) > 0 ? sumGross(hs, p.id) : '—'}
        </span>
      ))}
      <span className="text-right text-lg font-bold text-[#5C4520] font-[family-name:var(--font-playfair)]">
        {players.reduce((s, p) => s + sumPts(hs, p.id), 0)}
      </span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-[#0a1a0e] rounded-t-2xl flex flex-col max-h-[90vh]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title — never scrolls */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-3">
          <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
            <p className="font-[family-name:var(--font-playfair)] text-white text-2xl leading-tight truncate">
              {title}
            </p>
            <p className="text-[#C9A84C] text-base truncate">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xl flex-shrink-0"
            aria-label="Close scorecard"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 rounded-t-xl overflow-hidden" style={{ background: '#F5F0E8' }}>

          {/* Players + their playing handicaps */}
          <div
            className="flex-shrink-0 flex items-baseline gap-3 px-3 py-2 border-b border-[#D4CBBA]"
            style={{ background: '#EAE4D5' }}
          >
            <span className="text-[10px] tracking-[0.15em] uppercase flex-shrink-0" style={{ ...SC_SF, color: '#7A7060' }}>
              {players.length > 1 ? 'Players' : 'Player'}
            </span>
            <div className="flex-1 min-w-0 flex items-baseline justify-between">
              {players.map(p => {
                const hcp = roundHandicaps.find(rh => rh.player_id === p.id && rh.round_id === round.id)?.playing_handicap
                return (
                  <span key={p.id} className="flex-1 text-center text-sm text-[#2C2C1E]" style={SC_SF}>
                    <span className="font-[family-name:var(--font-playfair)] font-semibold">{firstName(p.name)}</span>
                    {' '}
                    <span className={`text-[10px] ${SC_MUTED}`}>{hcp ?? '—'}</span>
                  </span>
                )
              })}
            </div>
          </div>

          {/* Column headers */}
          <div
            style={{ ...gridCols, background: '#EAE4D5' }}
            className="flex-shrink-0 px-3 py-1.5 border-b border-[#D4CBBA]"
          >
            {(['Hole', 'Par'] as const).map(h => (
              <span key={h} className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${SC_MUTED}`} style={SC_SF}>
                {h}
              </span>
            ))}
            {players.map((p, i) => (
              <span key={p.id} className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${SC_MUTED} text-center`} style={SC_SF}>
                {players.length > 1 ? i + 1 : 'Score'}
              </span>
            ))}
            <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${SC_MUTED} text-right`} style={SC_SF}>
              Pts
            </span>
          </div>

          {/* Hole rows — the only scrolling part */}
          <div className="overflow-y-auto flex-1 pb-8">
            {courseHoles.length === 0 && (
              <p className={`${SC_MUTED} text-sm text-center py-10`} style={SC_SF}>
                No hole data for this course.
              </p>
            )}

            {courseHoles.map(hole => {
              const isNine = hole.hole_number === 9
              const rowPts = players.reduce(
                (s, p) => s + (scoreFor(p.id, hole.hole_number)?.points ?? 0), 0
              )
              return (
                <Fragment key={hole.id}>
                  <div
                    style={gridCols}
                    className="px-3 py-1.5 items-center border-b border-[#E3DCCC]"
                  >
                    <span className={`text-base font-semibold ${SC_DARK}`} style={SC_SF}>
                      {hole.hole_number}
                    </span>
                    <span className={`text-base ${SC_MUTED}`} style={SC_SF}>
                      {effectivePar(hole, players[0]?.gender ?? 'M')}
                    </span>
                    {players.map(p => {
                      const sc = scoreFor(p.id, hole.hole_number)
                      return (
                        <span key={p.id} className="flex items-center justify-center">
                          {scoreSymbol(
                            sc ? sc.gross : null,
                            effectivePar(hole, p.gender),
                            sc?.noReturn ?? false
                          )}
                        </span>
                      )
                    })}
                    <span
                      className={`text-right text-base ${rowPts > 0 ? 'text-[#7B6C3E] font-bold' : `${SC_MUTED} opacity-60`}`}
                      style={SC_SF}
                    >
                      {rowPts > 0 ? rowPts : '—'}
                    </span>
                  </div>
                  {isNine && back.length > 0 && <SummaryRow label="Out" hs={front} />}
                </Fragment>
              )
            })}

            {courseHoles.length > 0 && (
              <>
                {back.length > 0 && <SummaryRow label="In" hs={back} />}
                <div
                  style={{ ...gridCols, background: 'rgba(201,168,76,0.35)' }}
                  className="px-3 py-2.5 items-center"
                >
                  <span className="text-sm font-bold tracking-widest uppercase text-[#4A3810]" style={SC_SF}>Tot</span>
                  <span className="text-lg font-bold text-[#4A3810]" style={SC_SF}>
                    {sumPar(courseHoles, players[0]?.gender ?? 'M')}
                  </span>
                  {players.map(p => (
                    <span key={p.id} className="text-center text-lg font-bold text-[#4A3810]" style={SC_SF}>
                      {sumGross(courseHoles, p.id) > 0 ? sumGross(courseHoles, p.id) : '—'}
                    </span>
                  ))}
                  <span className="text-right text-2xl font-extrabold text-[#5C4520] font-[family-name:var(--font-playfair)]">
                    {players.reduce((s, p) => s + sumPts(courseHoles, p.id), 0)}
                  </span>
                </div>
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
    <div className="px-3 pb-4 pt-2 space-y-2 bg-[#070f09]">
      {rounds.map(round => {
        const pts = row.perRound[round.id] ?? 0
        const hasScores = row.playedRounds.includes(round.id)
        const hero = row.heroByRound?.[round.id]
        const heroName = hero ? playerById.get(hero)?.name : null
        return (
          <button
            key={round.id}
            onClick={() => onTileClick(round)}
            className={`w-full text-left rounded-sm border transition-all duration-200 overflow-hidden active:opacity-75 ${
              hasScores
                ? 'border-[#C9A84C]/50 shadow-[0_0_16px_rgba(201,168,76,0.10)] bg-[#0f2418]'
                : 'border-[#1e3d28] bg-[#0f2418]'
            }`}
          >
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-playfair)] text-white text-base leading-tight truncate">
                  {round.courses?.name ?? `Round ${round.round_number}`}
                </p>
                <p className={`text-sm mt-1 truncate ${hasScores ? 'text-[#C9A84C]' : 'text-white/25'}`}>
                  {hasScores
                    ? heroName ? `Carried by ${firstName(heroName)}` : 'Scores submitted'
                    : 'No scores yet'}
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                {hasScores && (
                  <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-xl font-bold tabular-nums">
                    {pts}
                  </span>
                )}
                <span className="text-white/30 text-sm">View →</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── The board ─────────────────────────────────────────────────

function Board({
  rows, rounds, showRoundColumns, playerById, onOpenCard,
}: {
  rows: BoardRow[]
  rounds: Round[]
  showRoundColumns: boolean
  playerById: Map<string, Player>
  onOpenCard: (row: BoardRow, round: Round) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: showRoundColumns
      ? `20px 1fr ${rounds.map(() => '40px').join(' ')} 56px`
      : '20px 1fr 56px',
    columnGap: '0.5rem',
    alignItems: 'center',
  } as const

  return (
    <div className="border border-[#1e3d28]">
      {/* Sticky column headers */}
      <div
        style={gridStyle}
        className="sticky top-[85px] z-10 px-3 py-1 bg-[#0a1a0e] border-b border-[#1e3d28]"
      >
        <span className="text-[10px] tracking-widest uppercase text-white/30">Pos</span>
        <span className="text-[10px] tracking-widest uppercase text-white/30">Name</span>
        {showRoundColumns && rounds.map(r => (
          <span key={r.id} className="text-xs text-white/30 text-center tabular-nums">
            {r.round_number}
          </span>
        ))}
        <span className="text-[10px] tracking-widest uppercase text-white/30 text-right">Tot</span>
      </div>

      {rows.map((row, i) => {
        const isExpanded = expandedId === row.id
        const isLast     = i === rows.length - 1
        return (
          <Fragment key={row.id}>
            <button
              onClick={() => setExpandedId(prev => (prev === row.id ? null : row.id))}
              style={gridStyle}
              className={`w-full px-3 py-1 text-left active:bg-white/5 transition-colors ${
                !isLast || isExpanded ? 'border-b border-[#1e3d28]' : ''
              }`}
            >
              <span className="text-white/40 text-sm font-semibold tabular-nums">{i + 1}</span>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {row.color && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                  )}
                  <span className="font-[family-name:var(--font-playfair)] text-base text-white truncate">
                    {row.name}
                  </span>
                  {row.isLive && <LiveDot />}
                </div>
                {row.subLabel && (
                  <p className={`text-white/30 text-xs truncate leading-snug ${row.color ? 'pl-3.5' : ''}`}>
                    {row.subLabel}
                  </p>
                )}
              </div>

              {showRoundColumns && rounds.map(r => {
                const played  = row.playedRounds.includes(r.id)
                const dropped = row.droppedRounds?.includes(r.id) ?? false
                const pts = row.perRound[r.id] ?? 0
                return (
                  <span
                    key={r.id}
                    title={dropped ? 'Set aside — worst round dropped' : undefined}
                    className={`text-center tabular-nums text-2xl font-semibold ${
                      !played ? 'text-white/20'
                        : dropped ? 'text-white/25 line-through decoration-white/30'
                        : 'text-white/70'
                    }`}
                  >
                    {played ? formatScore(pts) : '—'}
                  </span>
                )
              })}

              {/* Rows are pre-filtered to those who have played, so the
                  total is always a real number — including a legitimate 0. */}
              <span className="text-right tabular-nums font-bold text-2xl text-[#C9A84C]">
                {formatScore(row.total)}
              </span>
            </button>

            {isExpanded && (
              <div className={!isLast ? 'border-b border-[#1e3d28]' : ''}>
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
 * Entry point to the matchplay draw.
 *
 * Deliberately a link to a separate route, not an inline component: none of
 * the matchplay display code should load with the leaderboard. Nothing from
 * the matchplay module is imported into this file.
 */
function MatchplayButton({ tripCode, enabled }: { tripCode: string; enabled: boolean }) {
  const base =
    'w-full flex items-center justify-between px-5 py-4 rounded-sm border transition-colors mb-4'

  if (!enabled) {
    return (
      <div
        className={`${base} border-[#1e3d28] bg-[#0f2418] opacity-50 cursor-not-allowed`}
        aria-disabled="true"
      >
        <span className="min-w-0">
          <span className="block font-[family-name:var(--font-playfair)] text-white/40 text-base leading-tight">
            Matchplay
          </span>
          <span className="block text-white/25 text-xs mt-0.5">
            Switch it on in Trip Setup to use it
          </span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" className="text-white/20 flex-shrink-0 ml-4" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
    )
  }

  return (
    <Link
      href={`/trip/${tripCode}/matchplay`}
      className={`${base} border-[#C9A84C]/50 bg-[#0f2418] shadow-[0_0_16px_rgba(201,168,76,0.10)] hover:border-[#C9A84C] active:opacity-75`}
    >
      <span className="min-w-0">
        <span className="block font-[family-name:var(--font-playfair)] text-white text-base leading-tight">
          Matchplay
        </span>
        <span className="block text-[#C9A84C] text-xs mt-0.5">View the knockout draw</span>
      </span>
      <span className="text-white/30 text-sm flex-shrink-0 ml-4">View →</span>
    </Link>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function TripLeaderboardClient({
  tripCode, formats, activeRoundIds, teamScoring, rounds, teams, players,
  holes, scores, liveScores, roundHandicaps,
}: Props) {
  // Matchplay has its own route, so it is a button rather than a tab
  const tabs = leaderboardTabs(formats)
  const [active, setActive] = useState<BoardKey>(tabs[0]?.key ?? 'stableford')
  const [card, setCard] = useState<{ row: BoardRow; round: Round } | null>(null)

  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.round_number - b.round_number),
    [rounds]
  )
  // Per-round columns stop fitting a phone beyond four rounds; the
  // accordion still shows every round as a tile.
  const showRoundColumns = sortedRounds.length > 0 && sortedRounds.length <= 4

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

  const discard = formats.league.discardWorst
  const customTable = useMemo(
    () => resolveCustomPoints(formats.league.customPoints, players.length),
    [formats.league.customPoints, players.length]
  )

  const hcpFor = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of roundHandicaps) m.set(`${h.round_id}:${h.player_id}`, h.playing_handicap)
    return m
  }, [roundHandicaps])

  const isLiveFor = (playerIds: string[]) =>
    resolved.some(s => playerIds.includes(s.playerId) && liveRoundIds.has(s.roundId))

  // ── Individual Stableford ───────────────────────────────────

  const stablefordRows: BoardRow[] = useMemo(() => {
    return players
      .map(p => {
        const perRound: Record<string, number> = {}
        const playedRounds: string[] = []
        let holesPlayed = 0
        for (const r of sortedRounds) {
          const mine = resolved.filter(s => s.playerId === p.id && s.roundId === r.id)
          perRound[r.id] = mine.reduce((sum, s) => sum + s.points, 0)
          holesPlayed += mine.length
          if (mine.length > 0) playedRounds.push(r.id)
        }
        // Worst rounds are set aside before totalling, if the trip says so
        const played = playedRounds.map(id => perRound[id])
        const total = totalAfterDiscard(played, discard)
        const dropped = new Set(
          discardedIndices(played, discard).map(i => playedRounds[i])
        )
        // Display against the 2pts-a-hole baseline, as on the DM board
        const diff = total - holesPlayed * 2
        const row: BoardRow = {
          id: p.id,
          name: p.name,
          subLabel: `${holesPlayed} hole${holesPlayed === 1 ? '' : 's'} · ${
            diff === 0 ? 'level' : diff > 0 ? `+${diff}` : diff
          }`,
          perRound,
          playedRounds,
          droppedRounds: [...dropped],
          total,
          isLive: isLiveFor([p.id]),
          playerIds: [p.id],
        }
        return { row, holesPlayed }
      })
      .filter(r => r.holesPlayed > 0)
      .map(r => r.row)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [players, sortedRounds, resolved, discard]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Individual Strokeplay ───────────────────────────────────
  // Lower is better, so the board shows nett as the headline and the
  // total column carries it. Rows are sorted ascending.

  const strokeRows: BoardRow[] = useMemo(() => {
    const holeById = new Map(holes.map(h => [h.id, h]))
    return players
      .map(p => {
        const perRound: Record<string, number> = {}
        const playedRounds: string[] = []
        let gross = 0, nett = 0, holesPlayed = 0
        for (const r of sortedRounds) {
          const mine = resolved.filter(s => s.playerId === p.id && s.roundId === r.id && s.gross != null)
          const g = mine.reduce((sum, s) => sum + (s.gross ?? 0), 0)
          const shots = mine.reduce((sum, s) => {
            const hole = holeById.get(s.holeId)
            if (!hole) return sum
            const ph = hcpFor.get(`${r.id}:${p.id}`) ?? p.handicap ?? 0
            return sum + shotsReceived(ph, effectiveSI(hole, p.gender))
          }, 0)
          perRound[r.id] = g - shots
          gross += g
          holesPlayed += mine.length
          if (mine.length > 0) playedRounds.push(r.id)
        }
        // Low scores win here, so the worst round is the highest one
        const playedNett = playedRounds.map(id => perRound[id])
        nett = totalAfterDiscard(playedNett, discard, { lowerWins: true })
        const dropped = new Set(
          discardedIndices(playedNett, discard, { lowerWins: true }).map(i => playedRounds[i])
        )
        const row: BoardRow = {
          id: p.id,
          name: p.name,
          subLabel: `${holesPlayed} hole${holesPlayed === 1 ? '' : 's'} · ${gross} gross`,
          perRound,
          playedRounds,
          droppedRounds: [...dropped],
          total: nett,
          isLive: isLiveFor([p.id]),
          playerIds: [p.id],
        }
        return { row, holesPlayed }
      })
      .filter(r => r.holesPlayed > 0)
      .map(r => r.row)
      .sort((a, b) => a.total - b.total)
  }, [players, sortedRounds, resolved, holes, hcpFor, discard]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Custom points ───────────────────────────────────────────
  // Each round is scored on its own Stableford result, positions are paid
  // from the trip's table, and the board is the sum across rounds.

  const customRows: BoardRow[] = useMemo(() => {
    const perRound = new Map<string, Map<string, number>>()
    for (const r of sortedRounds) {
      const standings = players
        .map(p => {
          const mine = resolved.filter(s => s.playerId === p.id && s.roundId === r.id)
          return mine.length > 0
            ? { playerId: p.id, score: mine.reduce((sum, s) => sum + s.points, 0) }
            : null
        })
        .filter(Boolean) as { playerId: string; score: number }[]
      perRound.set(r.id, awardRound(standings, customTable))
    }

    return players
      .map(p => {
        const byRound: Record<string, number> = {}
        const playedRounds: string[] = []
        for (const r of sortedRounds) {
          const awarded = perRound.get(r.id)?.get(p.id)
          if (awarded === undefined) continue
          byRound[r.id] = awarded
          playedRounds.push(r.id)
        }
        const played = playedRounds.map(id => byRound[id])
        const total = totalAfterDiscard(played, discard)
        const dropped = new Set(discardedIndices(played, discard).map(i => playedRounds[i]))

        const row: BoardRow = {
          id: p.id,
          name: p.name,
          subLabel: playedRounds.length > 0
            ? `${playedRounds.length} round${playedRounds.length === 1 ? '' : 's'}`
            : '',
          perRound: byRound,
          playedRounds,
          droppedRounds: [...dropped],
          total,
          isLive: isLiveFor([p.id]),
          playerIds: [p.id],
        }
        return { row, played: playedRounds.length }
      })
      .filter(r => r.played > 0)
      .map(r => r.row)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [players, sortedRounds, resolved, customTable, discard]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Teams ───────────────────────────────────────────────────

  const teamRows: BoardRow[] = useMemo(() => {
    return teams
      .map(team => {
        const members   = players.filter(p => p.team_id === team.id)
        const memberIds = members.map(m => m.id)
        const perRound: Record<string, number> = {}
        const heroByRound: Record<string, string | null> = {}
        const playedRounds: string[] = []
        let total = 0

        for (const r of sortedRounds) {
          const res = teamRoundPoints(memberIds, r.id, resolved, teamScoring)
          perRound[r.id] = res.points
          heroByRound[r.id] = res.heroPlayerId
          total += res.points
          if (res.played) playedRounds.push(r.id)
        }

        const row: BoardRow = {
          id: team.id,
          name: team.name,
          color: team.color,
          subLabel: members.map(m => firstName(m.name)).join(', '),
          perRound,
          playedRounds,
          total,
          isLive: isLiveFor(memberIds),
          playerIds: memberIds,
          heroByRound,
        }
        return { row, size: members.length }
      })
      .filter(r => r.size > 0)
      .map(r => r.row)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [teams, players, sortedRounds, resolved, teamScoring]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────

  const showMatchplay = matchplayOn(formats)

  // Matchplay lives on its own page, so a matchplay-only trip legitimately
  // has no tabs here — show the button rather than an empty board.
  if (tabs.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <MatchplayButton tripCode={tripCode} enabled={showMatchplay} />
        {!showMatchplay && <EmptyState message="No competitions switched on for this trip." />}
      </div>
    )
  }

  const currentRows =
    active === 'stableford' ? stablefordRows :
    active === 'strokes'    ? strokeRows :
    active === 'custom'     ? customRows :
                              teamRows

  const emptyMessage =
    active === 'teams'
      ? 'No teams with players yet. Set them up in Trip Setup.'
      : 'No scores yet. The board fills in as play starts.'

  // What this board is and how it is being scored. Shown whenever more than
  // one competition is running, so a glance tells you which you are looking at.
  const boardTitle =
    active === 'stableford' ? 'Stableford' :
    active === 'strokes'    ? 'Strokeplay' :
    active === 'custom'     ? 'Custom points' :
                              'Team Play'

  const boardRules: string[] = (() => {
    const out: string[] = []
    if (active === 'stableford') out.push('Total points, highest wins')
    if (active === 'strokes')    out.push('Nett totals, lowest wins')
    if (active === 'custom')     out.push(describeCustomTable(customTable))
    if (active === 'teams')      out.push(describeTeamScoring(teamScoring))
    if (active !== 'teams' && discard > 0) {
      out.push(`worst ${discard === 1 ? 'round' : `${discard} rounds`} dropped`)
    }
    return out
  })()

  // Team cards show every member side by side; individual tabs show one column
  const cardPlayers = card
    ? card.row.playerIds.map(id => playerById.get(id)).filter(Boolean) as Player[]
    : []

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      <MatchplayButton tripCode={tripCode} enabled={showMatchplay} />

      {/* Format tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex-shrink-0 px-4 py-2.5 text-xs tracking-[0.15em] uppercase transition-colors rounded-sm border ${
                active === t.key
                  ? 'bg-[#C9A84C] text-[#0a1a0e] font-bold border-[#C9A84C]'
                  : 'bg-[#0f2418] border-[#1e3d28] text-white/50 hover:text-white/80'
              }`}
            >
              {t.tabLabel}
            </button>
          ))}
        </div>
      )}

      {/* Title card — only worth the space once there is more than one board */}
      {tabs.length > 1 ? (
        <div className="border border-[#1e3d28] rounded-sm px-4 py-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-[family-name:var(--font-playfair)] text-white text-base leading-tight">
              {boardTitle}
            </p>
            {inPlay && <InPlayBadge />}
          </div>
          {boardRules.length > 0 && (
            <p className="text-white/35 text-xs mt-1 leading-snug">
              {boardRules.join(' · ')}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-white/30 text-xs leading-relaxed min-w-0">
            {boardRules.join(' · ')}
          </p>
          {inPlay && <InPlayBadge />}
        </div>
      )}

      {currentRows.length === 0
        ? <EmptyState message={emptyMessage} />
        : (
          <Board
            key={active}
            rows={currentRows}
            rounds={sortedRounds}
            showRoundColumns={showRoundColumns}
            playerById={playerById}
            onOpenCard={(row, round) => setCard({ row, round })}
          />
        )}

      {!showRoundColumns && sortedRounds.length > 4 && (
        <p className="text-white/25 text-xs mt-3 text-center">
          Tap a row to see every round.
        </p>
      )}

      {card && cardPlayers.length > 0 && (
        <ScorecardSheet
          title={card.row.name}
          subtitle={card.round.courses?.name ?? `Round ${card.round.round_number}`}
          players={cardPlayers}
          round={card.round}
          holes={holes}
          resolved={resolved}
          roundHandicaps={roundHandicaps}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  )
}
