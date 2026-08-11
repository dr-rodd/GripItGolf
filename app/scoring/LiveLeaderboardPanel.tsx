"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import { supabase } from "@/lib/supabase"
import BackButton from "@/app/components/BackButton"
import ScoreShape from "@/app/components/ScoreShape"
import { scoreTone, TONE_PILL } from "@/lib/leaderboardStyle"
import { shotsReceived } from "@/lib/boardRows"
import { type Countback, countbackOf, compareCountback } from "@/lib/tiebreak"
import { quotaPoints, quotaTarget } from "@/lib/quota"
import { FULL_ALLOWANCE, allowedHandicap } from "@/lib/handicapAllowance"
import { exactCourseHandicap } from "@/lib/courseHandicap"
import { formatHandicap } from "@/lib/handicap"
import { CHROME } from "./scoringHeaderMetrics"
import {
  SC_SF, SC_NUM, SC_RULE, SC_BAND, SC_BAND_TOTAL, SC_HEAD, SC_HEAD_TEXT, SC_LABEL,
  SC_MUTED, SC_DARK, scRow, scPoints, teeDot,
} from "@/app/components/scorecardStyle"

// ─── Types ────────────────────────────────────────────────

export interface LiveRoundRef {
  id: string
  course_id: string
  round_id: string
  rounds: { round_number: number } | null
  courses: { name: string } | null
}

interface Player {
  id: string
  name: string
  gender: string
  /** Handicap index. Needed to rebuild a course handicap under an allowance. */
  handicap?: number
  teams: { name: string; color: string } | null
}

interface Hole {
  course_id: string
  hole_number: number
  par: number
  par_ladies?: number
  stroke_index: number
  stroke_index_ladies?: number
}

interface RoundHandicap {
  round_id: string
  player_id: string
  playing_handicap: number
  /** Written when the session starts, so the card can name the tee mid-round. */
  tee_id?: string | null
}

/** Ratings are optional: the legacy screens pass tees only to name them. */
interface Tee {
  id: string; name: string
  slope?: number; course_rating?: number; par?: number
}

interface LiveScoreRow {
  player_id: string
  hole_number: number
  gross_score: number | null
  stableford_points: number | null
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * What a hole is worth on this board, at the handicap being shown.
 *
 * At the full handicap it is the number written beside the score as the hole
 * was entered, off the same course handicap this panel is displaying. Under a
 * reduction there is no stored answer — the reduction belongs to the board
 * rather than to the card — so it comes from the gross, which is the one
 * figure a reduction never changes.
 */
function pointsFor(
  gross: number | null, stored: number | null,
  hole: Hole, gender: string, hcp: number, allowance: number,
): number | null {
  if (gross == null) return null
  if (allowance === FULL_ALLOWANCE) return stored ?? 0
  return Math.max(0, effectivePar(hole, gender) + 2
    - (gross - shotsReceived(hcp, effectiveSI(hole, gender))))
}

function effectivePar(hole: Hole, gender: string) {
  return gender === "F" && hole.par_ladies ? hole.par_ladies : hole.par
}

function effectiveSI(hole: Hole, gender: string) {
  return gender === "F" && hole.stroke_index_ladies ? hole.stroke_index_ladies : hole.stroke_index
}

function fmtRelative(rel: number): string {
  if (rel > 0) return `+${rel}`
  if (rel === 0) return "E"
  return `${rel}`
}

// ─── Row type ─────────────────────────────────────────────

interface PlayerRow {
  player: Player
  holesCompleted: number
  isFinalised: boolean           // true once all 18 holes scored
  totalStableford: number
  stablefordRelative: number     // totalStableford − holesCompleted×2
  totalGross: number
  grossRelative: number          // totalGross − sum(par for holes played)
  totalNett: number              // nett strokes, capped per hole at par+2
  nettRelative: number           // totalNett − sum(par for holes played)
  totalQuota: number             // quota points earned so far, off the gross
  quotaRelative: number          // totalQuota − (36 − course handicap)
  perHoleStableford: { hole_number: number; pts: number }[]
  /** The closing stretches, for the countback. See lib/tiebreak.ts. */
  countback: Countback
  /** The same stretches in quota points, for the Quota tab's own tie. */
  quotaCountback: Countback
}

// ─── Sort ─────────────────────────────────────────────────

type Mode = "stableford" | "strokes" | "quota"
type StrokesView = "gross" | "nett"
type QuotaView = "pts" | "quota"

function compareRows(a: PlayerRow, b: PlayerRow, mode: Mode, sv: StrokesView): number {
  if (mode === "stableford" || mode === "quota") {
    // Quota sorts the way Stableford does — higher above the level first —
    // reading its own relative and its own closing stretches.
    const rel = mode === "stableford"
      ? (r: PlayerRow) => r.stablefordRelative
      : (r: PlayerRow) => r.quotaRelative
    const diff = rel(b) - rel(a)
    if (diff !== 0) return diff
    // Both finalised: the cards decide it, on the back 9, then 6, 3 and 2.
    //
    // This panel wrote that rule out itself for a long time, and the trip
    // leaderboard broke the same tie alphabetically — so two players level
    // could be ordered one way here, inside the scoring card, and the other
    // way on the board. `lib/tiebreak.ts` is the rule now, and a trip's
    // leaderboard reads it too when it is set to Tiebreak.
    //
    // This panel is not asked which setting the trip runs: it is the card in
    // your hand mid-round, and countback is what the group standing on the
    // eighteenth green means by "who won". What the board does with that
    // afterwards is the board's business.
    if (a.isFinalised && b.isFinalised) {
      return mode === "stableford"
        ? compareCountback(a.countback, b.countback)
        : compareCountback(a.quotaCountback, b.quotaCountback)
    }
    // At least one active: more holes played = higher rank
    return b.holesCompleted - a.holesCompleted
  }

  // Strokes (gross or nett)
  const aScore = sv === "gross" ? a.grossRelative : a.nettRelative
  const bScore = sv === "gross" ? b.grossRelative : b.nettRelative
  const diff = aScore - bScore
  if (diff !== 0) return diff
  // Tied score: active players rank above finalised
  if (a.isFinalised !== b.isFinalised) return a.isFinalised ? 1 : -1
  // Both same status: most holes remaining first (fewest completed first)
  return a.holesCompleted - b.holesCompleted
}

// ─── Inline Scorecard ─────────────────────────────────────

export function InlineScorecard({
  playingHcp, teeName, courseHoles, playerScores, gender,
  allowance = FULL_ALLOWANCE,
}: {
  /** Already reduced to the board's allowance, if it has one. */
  playingHcp: number
  /** The tee they played off, once the session has recorded one. */
  teeName: string | null
  courseHoles: Hole[]
  playerScores: LiveScoreRow[]
  gender: string
  allowance?: number
}) {
  const scoreByHole = new Map(playerScores.map(ls => [ls.hole_number, ls]))
  const grid = 'grid grid-cols-[2fr_2fr_2fr_3fr_2fr] w-full'

  // One shape for every card in the app — see ScoreShape.
  const scoreSymbol = (gross: number | null, ePar: number) =>
    gross === null
      ? <span className={`${SC_MUTED} text-base`} style={SC_SF}>—</span>
      : <ScoreShape gross={gross} par={ePar} size="sm" />

  const rows = courseHoles.map(hole => {
    const ls = scoreByHole.get(hole.hole_number)
    return {
      hole,
      ePar: effectivePar(hole, gender),
      eSI: effectiveSI(hole, gender),
      gross: ls?.gross_score ?? null,
      pts: pointsFor(
        ls?.gross_score ?? null, ls?.stableford_points ?? null,
        hole, gender, playingHcp, allowance),
    }
  })

  const front9 = rows.slice(0, 9)
  const back9  = rows.slice(9)
  const sum = (rs: typeof rows, f: (r: typeof rows[number]) => number) =>
    rs.reduce((s, r) => s + f(r), 0)

  // Plain functions rather than components declared in here: a component
  // created during render is a new type every render, and React rebuilds the
  // whole card each time the fetch ticks.
  const band = (label: string, rs: typeof rows, total = false) => {
    const scored = rs.some(r => r.gross !== null)
    return (
      <div className={`${grid} px-3 py-2 items-center ${total ? SC_BAND_TOTAL : SC_BAND} ${total ? '' : SC_RULE}`}>
        <span className="text-[13px] font-bold tracking-widest uppercase text-ink/80" style={SC_SF}>{label}</span>
        <span className={`${SC_NUM} font-bold text-ink`} style={SC_SF}>{sum(rs, r => r.ePar)}</span>
        <span />
        <span className={`text-center ${SC_NUM} font-bold text-ink`} style={SC_SF}>
          {scored ? sum(rs, r => r.gross ?? 0) : '—'}
        </span>
        <span className={`text-right font-bold text-ink ${total ? 'text-xl' : SC_NUM}`} style={SC_SF}>
          {scored ? sum(rs, r => r.pts ?? 0) : '—'}
        </span>
      </div>
    )
  }

  const holeRow = (r: typeof rows[number]) => (
    <div key={r.hole.hole_number} className={`${grid} px-3 py-1.5 items-center ${SC_RULE} ${scRow(r.hole.hole_number)}`}>
      <span className={`${SC_NUM} font-semibold ${SC_DARK}`} style={SC_SF}>{r.hole.hole_number}</span>
      <span className={`${SC_NUM} ${SC_MUTED}`} style={SC_SF}>{r.ePar}</span>
      <span className={`${SC_NUM} ${SC_MUTED}`} style={SC_SF}>{r.eSI}</span>
      <span className="flex justify-center">{scoreSymbol(r.gross, r.ePar)}</span>
      <span className={`text-right ${SC_NUM} ${scPoints(r.pts)}`} style={SC_SF}>{r.pts ?? '—'}</span>
    </div>
  )

  return (
    <div className="bg-surface">

      {/* Playing handicap and tee.
          No name: the row this card just dropped out of carries it, and
          repeating it here spends the widest line on the card saying
          something the reader tapped on a second ago. */}
      <div className={`flex items-center gap-5 px-3 py-2 ${SC_RULE} ${SC_HEAD}`}>
        <span className="flex items-baseline gap-1.5">
          <span className={SC_LABEL}>PH</span>
          <span className={`${SC_NUM} font-semibold ${SC_DARK}`} style={SC_SF}>{formatHandicap(playingHcp)}</span>
        </span>
        {teeName && (
          <span className="flex items-center gap-1.5">
            <span className={SC_LABEL}>Tee</span>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${teeDot(teeName)}`} />
            <span className={`${SC_NUM} font-semibold ${SC_DARK}`} style={SC_SF}>{teeName}</span>
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className={`${grid} px-3 py-1.5 ${SC_RULE} ${SC_HEAD}`}>
        {(['Hole', 'Par', 'SI', 'Score', 'Pts'] as const).map((h, i) => (
          <span key={h} className={`${SC_HEAD_TEXT} ${i === 3 ? 'text-center' : i === 4 ? 'text-right' : ''}`} style={SC_SF}>{h}</span>
        ))}
      </div>

      {front9.map(holeRow)}
      {band('Out', front9)}
      {back9.map(holeRow)}
      {band('In', back9)}
      {band('Tot', rows, true)}

    </div>
  )
}

// ─── Props ────────────────────────────────────────────────

interface Props {
  liveRound: LiveRoundRef
  players: Player[]
  holes: Hole[]
  roundHandicaps: RoundHandicap[]
  /** Named on each card. Optional so the legacy screens can leave it out. */
  tees?: Tee[]
  /**
   * The handicap allowance this board is being read at, as a percentage.
   *
   * Display only, and driven by the same control as the scorecard beside it —
   * the board and the card have to be answering the same question, or swiping
   * between them is two different rounds.
   */
  allowance?: number
  /**
   * Whether one of this trip's boards scores Quota, which is the only time
   * the Quota tab appears here — a mode nobody is playing is a tab that
   * teaches the wrong game. The legacy screens pass nothing and keep the two
   * tabs they have always had.
   */
  offerQuota?: boolean
  onClose?: () => void
  showBackButton?: boolean
}

// ─── Component ────────────────────────────────────────────

export default function LiveLeaderboardPanel({
  liveRound, players, holes, roundHandicaps, tees = [],
  allowance = FULL_ALLOWANCE, offerQuota = false, onClose, showBackButton = false,
}: Props) {
  const [liveScores, setLiveScores]     = useState<LiveScoreRow[]>([])
  const [validPlayerIds, setValidPlayerIds] = useState<Set<string>>(new Set())
  const [mode, setMode]                 = useState<Mode>("stableford")
  const [strokesView, setStrokesView]   = useState<StrokesView>("nett")
  const [quotaView, setQuotaView]       = useState<QuotaView>("pts")
  const [lastFetch, setLastFetch]       = useState<Date | null>(null)
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null)
  const [finalisedPlayerIds, setFinalisedPlayerIds] = useState<Set<string>>(new Set())

  const courseHoles = holes
    .filter(h => h.course_id === liveRound.course_id)
    .sort((a, b) => a.hole_number - b.hole_number)

  /**
   * The handicap to show for a player, and the tee it came off.
   *
   * The tee recorded against the round is what the course handicap is rebuilt
   * from, because an allowance is a percentage of the real figure rather than
   * of the whole number stored beside it. Where no tee was recorded — a row
   * written before anyone teed off — the stored number is all there is.
   */
  const handicapFor = (player: Player) => {
    const rh = roundHandicaps.find(
      r => r.player_id === player.id && r.round_id === liveRound.round_id)
    const tee = tees.find(t => t.id === rh?.tee_id)
    const rated = tee?.slope != null && tee.course_rating != null && tee.par != null
    const exact = rated && player.handicap != null
      ? exactCourseHandicap(player.handicap,
          { slope: tee!.slope!, course_rating: tee!.course_rating!, par: tee!.par! })
      : rh?.playing_handicap ?? 0
    return { hcp: allowedHandicap(exact, allowance), teeName: tee?.name ?? null }
  }

  const fetchScores = useCallback(async () => {
    const [scoresRes, liveRoundsRes] = await Promise.all([
      supabase
        .from("live_scores")
        .select("player_id, hole_number, gross_score, stableford_points")
        .eq("round_id", liveRound.round_id),
      supabase
        .from("live_rounds")
        .select("id, status")
        .eq("round_id", liveRound.round_id)
        .in("status", ["active", "finalised"]),
    ])

    if (scoresRes.data) setLiveScores(scoresRes.data as LiveScoreRow[])

    const liveRoundsData = (liveRoundsRes.data ?? []) as { id: string; status: string }[]
    const liveRoundIds = liveRoundsData.map(lr => lr.id)
    const finalisedRoundIds = new Set(liveRoundsData.filter(lr => lr.status === "finalised").map(lr => lr.id))

    if (liveRoundIds.length > 0) {
      const { data: locks } = await supabase
        .from("live_player_locks")
        .select("player_id, live_round_id")
        .in("live_round_id", liveRoundIds)
      const allLocks = locks ?? []
      setValidPlayerIds(new Set(allLocks.map(l => l.player_id as string)))
      setFinalisedPlayerIds(new Set(allLocks.filter(l => finalisedRoundIds.has(l.live_round_id as string)).map(l => l.player_id as string)))
    } else {
      setValidPlayerIds(new Set())
      setFinalisedPlayerIds(new Set())
    }

    setLastFetch(new Date())
  }, [liveRound.round_id])

  useEffect(() => {
    fetchScores()
    const interval = setInterval(fetchScores, 15000)

    const channel = supabase
      .channel(`live-lb-${liveRound.round_id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_scores",
        filter: `round_id=eq.${liveRound.round_id}`,
      }, () => fetchScores())
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchScores, liveRound.round_id])

  // ─── Build rows ───────────────────────────────────────────

  const unsortedRows: PlayerRow[] = players
    .filter(player => validPlayerIds.has(player.id))
    .flatMap(player => {
      const playerScores = liveScores.filter(
        ls => ls.player_id === player.id && ls.gross_score !== null
      )
      if (playerScores.length === 0) return []

      // Points as this board reads them: from the gross and the handicap it is
      // showing, so the board and the scorecard beside it never disagree.
      const { hcp } = handicapFor(player)
      const pointsOn = (ls: LiveScoreRow) => {
        const hole = courseHoles.find(h => h.hole_number === ls.hole_number)
        if (!hole) return ls.stableford_points ?? 0
        return pointsFor(ls.gross_score, ls.stableford_points, hole, player.gender, hcp, allowance) ?? 0
      }

      // Quota points come off the gross against par alone — the handicap has
      // already spoken, once, in the target below. lib/quota.ts is the only
      // copy of the table.
      const quotaOn = (ls: LiveScoreRow) => {
        const hole = courseHoles.find(h => h.hole_number === ls.hole_number)
        return hole ? quotaPoints(ls.gross_score, effectivePar(hole, player.gender)) : 0
      }

      const totalStableford = playerScores.reduce((s, ls) => s + pointsOn(ls), 0)
      const totalGross      = playerScores.reduce((s, ls) => s + (ls.gross_score ?? 0), 0)
      const totalQuota      = playerScores.reduce((s, ls) => s + quotaOn(ls), 0)

      let totalParPlayed = 0
      for (const ls of playerScores) {
        const hole = courseHoles.find(h => h.hole_number === ls.hole_number)
        if (!hole || ls.gross_score === null) continue
        totalParPlayed += effectivePar(hole, player.gender)
      }

      const playerCoursePar = courseHoles.reduce((s, h) => s + effectivePar(h, player.gender), 0)
      const totalNett = playerCoursePar + 36 - totalStableford
      const holesCompleted = playerScores.length
      const perHole = playerScores.map(ls => ({
        hole_number: ls.hole_number,
        pts: pointsOn(ls),
      }))

      return [{
        player,
        holesCompleted,
        isFinalised: finalisedPlayerIds.has(player.id),
        totalStableford,
        stablefordRelative: totalStableford - holesCompleted * 2,
        totalGross,
        grossRelative: totalGross - totalParPlayed,
        totalNett,
        nettRelative: holesCompleted * 2 - totalStableford,
        totalQuota,
        quotaRelative: totalQuota - quotaTarget(hcp),
        perHoleStableford: perHole,
        countback: countbackOf(perHole, h => h.hole_number, h => h.pts),
        quotaCountback: countbackOf(playerScores, ls => ls.hole_number, quotaOn),
      }]
    })

  const sortedRows = [...unsortedRows].sort((a, b) => compareRows(a, b, mode, strokesView))

  // Assign positions — shared rank only on a true tie (compareRows === 0)
  const positions: number[] = []
  for (let i = 0; i < sortedRows.length; i++) {
    if (i === 0) {
      positions.push(1)
    } else {
      const tied = compareRows(sortedRows[i - 1], sortedRows[i], mode, strokesView) === 0
      positions.push(tied ? positions[i - 1] : i + 1)
    }
  }

  const roundLabel = `Round ${liveRound.rounds?.round_number ?? "?"} — ${liveRound.courses?.name ?? ""}`

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-4">

      {/* Header — scrolls away */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-accent-deep text-sm tracking-[0.2em] uppercase">{roundLabel}</span>
        </div>
        {showBackButton && onClose && (
          <BackButton onClick={onClose} />
        )}
      </div>

      {/* Mode toggle — the same tab pills the trip leaderboard uses, so the
          two boards read as one system rather than two eras of the app. */}
      <div className="flex gap-1.5">
        {/* Quota only when a board is actually playing it — a mode nobody is
            scored on would teach the wrong game. */}
        {(offerQuota
          ? (["stableford", "strokes", "quota"] as Mode[])
          : (["stableford", "strokes"] as Mode[])
        ).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-4 py-2.5 t-label rounded-xl border transition-colors duration-150 ${
              mode === m
                ? "bg-accent-deep text-white font-bold border-accent-deep"
                : "bg-surface border-bark/12 text-ink/65 hover:text-ink/80"
            }`}
          >
            {m === "stableford" ? "Stableford" : m === "strokes" ? "Strokes" : "Quota"}
          </button>
        ))}
      </div>

      {/* Nett / gross. A second question about the same board, so it is
          quieter than the tabs above rather than a second row of them.

          Sized down deliberately. It inherited `t-cap`, and when captions
          were lifted to 15px this came with them — which left a secondary
          switch set in the same type as the Stableford/Strokes tabs directly
          above it, competing with the thing it is subordinate to. It is at
          the 13px floor now, with the padding pulled in to match.

          The height is not reduced as far as the type: `py-1.5` keeps each
          half around 26px tall, over the 24px minimum a target has to clear.
          It is a thumb on a golf course, not a mouse.

          Quota wears the same pill in the same place: pts is the points
          accumulated so far, quota is the distance to breaking even —
          negative while points are still owed. One control, two boards, so
          the two modes cannot drift apart visually. */}
      {mode !== "stableford" && (
        <div className="flex justify-end -mt-1">
          <div className="inline-flex gap-0.5 p-0.5 rounded-lg bg-bark/[0.06]">
            {(mode === "strokes"
              ? (["nett", "gross"] as const)
              : (["pts", "quota"] as const)
            ).map(sv => {
              const on = mode === "strokes" ? strokesView === sv : quotaView === sv
              return (
                <button
                  key={sv}
                  onClick={() => mode === "strokes"
                    ? setStrokesView(sv as StrokesView)
                    : setQuotaView(sv as QuotaView)}
                  className={`px-2.5 py-1.5 rounded-md text-[13px] uppercase tracking-[0.10em] transition-colors duration-150 ${
                    on ? "bg-surface text-ink font-semibold" : "text-ink/65 hover:text-ink/80"
                  }`}
                >
                  {sv}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {sortedRows.length === 0 ? (
        <div className="bg-surface border border-bark/12 rounded-2xl px-4 py-14 text-center">
          <p className="t-body text-ink/80">No scores yet</p>
          <p className="t-cap text-ink/65 mt-1">Scores appear as holes are completed</p>
        </div>
      ) : (
        // No overflow-hidden: it would make this card its own scrollport and
        // the sticky heading below would measure its offset from the card
        // rather than the viewport. The corners round without it.
        <div className="bg-surface border border-bark/12 rounded-2xl">
          {/* Column headers — sticky below whatever chrome is above them */}
          <div
            style={{ top: CHROME }}
            className="sticky z-10 flex items-center gap-3 px-3 py-1.5 bg-surface border-b border-bark/12 rounded-t-2xl"
          >
            <span className="text-[12px] tracking-widest uppercase text-ink/65 w-6 flex-shrink-0">Pos</span>
            <span className="text-[12px] tracking-widest uppercase text-ink/65 flex-1 min-w-0">Name</span>
            <span className="text-[12px] tracking-widest uppercase text-ink/65 flex-shrink-0 min-w-[3.5rem] text-center">Score</span>
            <span className="text-[12px] tracking-widest uppercase text-ink/65 flex-shrink-0 w-9 text-right">Thru</span>
          </div>

          {sortedRows.map((row, idx) => {
            const { player, holesCompleted, isFinalised,
                    totalStableford, stablefordRelative,
                    totalGross, grossRelative,
                    totalNett, nettRelative,
                    totalQuota, quotaRelative } = row

            const isExpanded = expandedPlayerId === player.id
            const isLast = idx === sortedRows.length - 1

            // ── Col 3: relative score ──────────────────────
            //
            // Under par is the only side that gets colour. Both sides used to
            // be emerald here, so a round four over looked exactly as good as
            // one four under; worse than level is brown now, and more of it
            // than level itself carries. Stableford counts up and strokes
            // count down, so the direction is passed in rather than assumed.
            const lowerIsBetter = mode === "strokes"
            const relativeValue = mode === "stableford" ? stablefordRelative
              : mode === "quota" ? quotaRelative
              : strokesView === "gross" ? grossRelative : nettRelative
            let scoreDisplay = fmtRelative(relativeValue)
            // Quota's pts view: the points accumulated so far, a plain count.
            // The pill's colour still reads off the distance to quota, so the
            // two views of one card never grade it differently.
            if (mode === "quota" && quotaView === "pts") {
              scoreDisplay = `${totalQuota}`
            }
            const scorePillClass = TONE_PILL[scoreTone(relativeValue, lowerIsBetter)]

            // ── Col 3 override for finalised: show absolute total ─
            // Quota is the exception on purpose: a signed card reads as its
            // distance from the player's own number — higher is better —
            // because "38 points" says nothing without knowing the quota.
            if (isFinalised) {
              if (mode === "stableford") {
                scoreDisplay = `${totalStableford}`
              } else if (mode === "quota") {
                scoreDisplay = fmtRelative(quotaRelative)
              } else if (strokesView === "gross") {
                scoreDisplay = `${totalGross}`
              } else {
                scoreDisplay = `${totalNett}`
              }
            }

            // ── Col 4: holes through or F ─────────────────
            const col4 = isFinalised ? "F" : `${holesCompleted}`

            const { hcp: playingHcp, teeName } = handicapFor(player)

            return (
              <Fragment key={player.id}>
                <button
                  onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left active:bg-bark/[0.04] transition-colors ${!isLast || isExpanded ? "border-b border-bark/12" : ""}`}
                >

                  {/* Col 1: position */}
                  <span className="t-cap text-ink/65 tabular-nums w-6 flex-shrink-0">
                    {positions[idx]}
                  </span>

                  {/* Col 2: team dot + name */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {player.teams && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: player.teams.color }}
                      />
                    )}
                    {/* No live dot here: the Thru column already says F or a
                        hole count, and a dot beside it would say it twice. */}
                    <span className="t-card text-ink truncate">{player.name}</span>
                  </div>

                  {/* Col 3: relative score pill */}
                  <span className={`flex-shrink-0 inline-flex items-center justify-center
                    px-2 py-1 rounded-xl text-xl font-semibold tabular-nums min-w-[3.5rem] ${scorePillClass}`}>
                    {scoreDisplay}
                  </span>

                  {/* Col 4: holes or finalised total */}
                  <span className={`flex-shrink-0 w-9 text-right tabular-nums t-data
                    ${isFinalised ? "text-ink/80 font-semibold" : "text-ink/65"}`}>
                    {col4}
                  </span>

                </button>

                {isExpanded && (
                  <div className={!isLast ? "border-b border-bark/12" : ""}>
                    <InlineScorecard
                      playingHcp={playingHcp}
                      teeName={teeName}
                      gender={player.gender}
                      allowance={allowance}
                      courseHoles={courseHoles}
                      playerScores={liveScores.filter(ls => ls.player_id === player.id)}
                    />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Last update */}
      {lastFetch && (
        <div className="text-center text-ink/50 text-xs">
          Updated {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      )}
    </div>
  )
}
