"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import { supabase } from "@/lib/supabase"
import BackButton from "@/app/components/BackButton"

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
}

interface LiveScoreRow {
  player_id: string
  hole_number: number
  gross_score: number | null
  stableford_points: number | null
}

// ─── Helpers ──────────────────────────────────────────────

const ST_PATRICKS_COURSE_ID = "11111111-0000-0000-0000-000000000003"

function effectivePar(hole: Hole, gender: string, courseId: string) {
  return gender === "F" && courseId === ST_PATRICKS_COURSE_ID && hole.par_ladies
    ? hole.par_ladies
    : hole.par
}

function effectiveSI(hole: Hole, gender: string, courseId: string) {
  return gender === "F" && courseId === ST_PATRICKS_COURSE_ID && hole.stroke_index_ladies
    ? hole.stroke_index_ladies
    : hole.stroke_index
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
  perHoleStableford: { hole_number: number; pts: number }[]
}

// ─── Sort ─────────────────────────────────────────────────

type Mode = "stableford" | "strokes"
type StrokesView = "gross" | "nett"

function compareRows(a: PlayerRow, b: PlayerRow, mode: Mode, sv: StrokesView): number {
  if (mode === "stableford") {
    const diff = b.stablefordRelative - a.stablefordRelative
    if (diff !== 0) return diff
    // Both finalised: break by back 9, back 6, back 3, back 2
    if (a.isFinalised && b.isFinalised) {
      for (const from of [10, 13, 16, 17]) {
        const aBack = a.perHoleStableford.filter(s => s.hole_number >= from).reduce((sum, s) => sum + s.pts, 0)
        const bBack = b.perHoleStableford.filter(s => s.hole_number >= from).reduce((sum, s) => sum + s.pts, 0)
        if (bBack !== aBack) return bBack - aBack
      }
      return 0 // true tie
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
  player, playingHcp, courseHoles, playerScores, courseId,
}: {
  player: Player
  playingHcp: number
  courseHoles: Hole[]
  playerScores: LiveScoreRow[]
  courseId: string
}) {
  const sf    = { fontFamily: "Georgia, serif" }
  const muted = "text-[#7A7060]"
  const dark  = "text-[#3A3A2E]"
  const grid  = "grid grid-cols-[2fr_2fr_2fr_3fr_2fr] w-full"

  const scoreByHole = new Map(playerScores.map(ls => [ls.hole_number, ls]))

  const scoreSymbol = (gross: number | null, ePar: number) => {
    if (gross === null) return <span className={`${muted} text-sm`} style={sf}>—</span>
    const diff = gross - ePar
    const n = <span className="text-sm font-semibold leading-none">{gross}</span>
    if (diff <= -2) return (
      <span className="relative inline-flex items-center justify-center w-6 h-6 rounded-full border border-[#C9A84C]">
        <span className="absolute inset-[2px] rounded-full border border-[#C9A84C]" />
        <span className="relative text-[10px] font-semibold leading-none text-[#7B5C1E]">{gross}</span>
      </span>
    )
    if (diff === -1) return <span className="w-6 h-6 rounded-full border border-[#C9A84C] flex items-center justify-center text-[#7B5C1E]">{n}</span>
    if (diff === 0)  return <span className={`${dark} text-sm font-semibold`} style={sf}>{gross}</span>
    if (diff === 1)  return <span className="w-6 h-6 rounded-md border border-[#9B8860] flex items-center justify-center text-[#5A4F3A]">{n}</span>
    return (
      <span className="relative inline-flex items-center justify-center w-6 h-6 rounded-md border border-[#9B8860]">
        <span className="absolute inset-[2px] rounded-sm border border-[#9B8860]" />
        <span className="relative text-[10px] font-semibold leading-none text-[#5A4F3A]">{gross}</span>
      </span>
    )
  }

  const ptsColor = (pts: number | null) =>
    pts === null ? muted :
    pts === 0    ? "text-[#A89880] opacity-50" :
                   "text-[#7B6C3E] font-bold"

  // Build rows
  const rows = courseHoles.map((hole, idx) => {
    const ls     = scoreByHole.get(hole.hole_number)
    const ePar   = effectivePar(hole, player.gender, courseId)
    const eSI    = effectiveSI(hole, player.gender, courseId)
    const gross  = ls?.gross_score ?? null
    const pts    = ls?.stableford_points ?? null
    return { hole, idx, ePar, eSI, gross, pts }
  })

  // Front 9 subtotals
  const front9 = rows.slice(0, 9)
  const front9Par   = front9.reduce((s, r) => s + r.ePar, 0)
  const front9Gross = front9.reduce((s, r) => s + (r.gross ?? 0), 0)
  const front9Pts   = front9.reduce((s, r) => s + (r.pts ?? 0), 0)
  const front9HasScores = front9.some(r => r.gross !== null)

  // Back 9 subtotals
  const back9 = rows.slice(9)
  const back9Par   = back9.reduce((s, r) => s + r.ePar, 0)
  const back9Gross = back9.reduce((s, r) => s + (r.gross ?? 0), 0)
  const back9Pts   = back9.reduce((s, r) => s + (r.pts ?? 0), 0)
  const back9HasScores = back9.some(r => r.gross !== null)

  const totalPar   = front9Par + back9Par
  const totalGross = front9Gross + back9Gross
  const totalPts   = front9Pts + back9Pts

  return (
    <div style={{ background: "#F5F0E8" }}>

      {/* Player details */}
      <div className="flex items-end gap-4 px-3 py-2 border-b border-[#D4CBBA]" style={{ background: "#EAE4D5" }}>
        <div className="flex flex-col flex-1 min-w-0">
          <span className={`text-[10px] tracking-[0.15em] uppercase ${muted}`} style={sf}>Player</span>
          <span className="font-[family-name:var(--font-playfair)] text-lg text-[#2C2C1E] font-semibold leading-tight truncate">{player.name}</span>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={`text-[10px] tracking-[0.15em] uppercase ${muted}`} style={sf}>PH</span>
          <span className={`text-sm font-semibold ${dark}`} style={sf}>{playingHcp}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className={`${grid} px-3 py-1.5 border-b border-[#D4CBBA]`} style={{ background: "#EAE4D5" }}>
        {(["Hole", "Par", "SI", "Score", "Pts"] as const).map((h, i) => (
          <span key={h} className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${muted} ${i === 3 ? "text-center" : i === 4 ? "text-right" : ""}`} style={sf}>{h}</span>
        ))}
      </div>

      {/* Front 9 */}
      {front9.map(({ hole, idx, ePar, eSI, gross, pts }) => (
        <div key={hole.hole_number} className={`${grid} px-3 py-1.5 items-center border-b border-[#E2DAC8] ${idx % 2 === 1 ? "bg-[#EEE8D6]" : ""}`}>
          <span className={`text-sm font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
          <span className={`text-sm ${muted}`} style={sf}>{ePar}</span>
          <span className={`text-sm ${muted}`} style={sf}>{eSI}</span>
          <span className="flex justify-center">{scoreSymbol(gross, ePar)}</span>
          <span className={`text-right text-sm ${ptsColor(pts)}`} style={sf}>{pts ?? "—"}</span>
        </div>
      ))}

      {/* Out subtotal */}
      <div className={`${grid} px-3 py-2 items-center border-b border-[#C9A84C]/20`} style={{ background: "rgba(201,168,76,0.16)" }}>
        <span className="text-xs font-bold tracking-widest uppercase text-[#5C4520]" style={sf}>Out</span>
        <span className={`text-sm font-bold text-[#5C4520]`} style={sf}>{front9Par}</span>
        <span />
        <span className="text-center text-sm font-bold text-[#5C4520]" style={sf}>{front9HasScores ? front9Gross : "—"}</span>
        <span className={`text-right text-sm font-bold text-[#7B6C3E]`} style={sf}>{front9HasScores ? front9Pts : "—"}</span>
      </div>

      {/* Back 9 */}
      {back9.map(({ hole, idx, ePar, eSI, gross, pts }) => (
        <div key={hole.hole_number} className={`${grid} px-3 py-1.5 items-center border-b border-[#E2DAC8] ${idx % 2 === 0 ? "bg-[#EEE8D6]" : ""}`}>
          <span className={`text-sm font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
          <span className={`text-sm ${muted}`} style={sf}>{ePar}</span>
          <span className={`text-sm ${muted}`} style={sf}>{eSI}</span>
          <span className="flex justify-center">{scoreSymbol(gross, ePar)}</span>
          <span className={`text-right text-sm ${ptsColor(pts)}`} style={sf}>{pts ?? "—"}</span>
        </div>
      ))}

      {/* In subtotal */}
      <div className={`${grid} px-3 py-2 items-center border-b border-[#C9A84C]/20`} style={{ background: "rgba(201,168,76,0.16)" }}>
        <span className="text-xs font-bold tracking-widest uppercase text-[#5C4520]" style={sf}>In</span>
        <span className={`text-sm font-bold text-[#5C4520]`} style={sf}>{back9Par}</span>
        <span />
        <span className="text-center text-sm font-bold text-[#5C4520]" style={sf}>{back9HasScores ? back9Gross : "—"}</span>
        <span className={`text-right text-sm font-bold text-[#7B6C3E]`} style={sf}>{back9HasScores ? back9Pts : "—"}</span>
      </div>

      {/* Tot row */}
      <div className={`${grid} px-3 py-2.5 items-center`} style={{ background: "rgba(201,168,76,0.35)" }}>
        <span className="text-xs font-bold tracking-widest uppercase text-[#4A3810]" style={sf}>Tot</span>
        <span className={`text-sm font-bold text-[#4A3810]`} style={sf}>{totalPar}</span>
        <span />
        <span className="text-center text-sm font-bold text-[#4A3810]" style={sf}>{totalGross || "—"}</span>
        <span className="text-right text-base font-extrabold text-[#5C4520] font-[family-name:var(--font-playfair)]">{totalPts}</span>
      </div>

    </div>
  )
}

// ─── Props ────────────────────────────────────────────────

interface Props {
  liveRound: LiveRoundRef
  players: Player[]
  holes: Hole[]
  roundHandicaps: RoundHandicap[]
  onClose?: () => void
  showBackButton?: boolean
}

// ─── Component ────────────────────────────────────────────

export default function LiveLeaderboardPanel({
  liveRound, players, holes, roundHandicaps, onClose, showBackButton = false,
}: Props) {
  const [liveScores, setLiveScores]     = useState<LiveScoreRow[]>([])
  const [validPlayerIds, setValidPlayerIds] = useState<Set<string>>(new Set())
  const [mode, setMode]                 = useState<Mode>("stableford")
  const [strokesView, setStrokesView]   = useState<StrokesView>("nett")
  const [lastFetch, setLastFetch]       = useState<Date | null>(null)
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null)
  const [finalisedPlayerIds, setFinalisedPlayerIds] = useState<Set<string>>(new Set())

  const courseHoles = holes
    .filter(h => h.course_id === liveRound.course_id)
    .sort((a, b) => a.hole_number - b.hole_number)

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

      const totalStableford = playerScores.reduce((s, ls) => s + (ls.stableford_points ?? 0), 0)
      const totalGross      = playerScores.reduce((s, ls) => s + (ls.gross_score ?? 0), 0)

      let totalParPlayed = 0
      for (const ls of playerScores) {
        const hole = courseHoles.find(h => h.hole_number === ls.hole_number)
        if (!hole || ls.gross_score === null) continue
        totalParPlayed += effectivePar(hole, player.gender, liveRound.course_id)
      }

      const playerCoursePar = courseHoles.reduce((s, h) => s + effectivePar(h, player.gender, liveRound.course_id), 0)
      const totalNett = playerCoursePar + 36 - totalStableford
      const holesCompleted = playerScores.length

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
        perHoleStableford: playerScores.map(ls => ({
          hole_number: ls.hole_number,
          pts: ls.stableford_points ?? 0,
        })),
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
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-400 text-sm tracking-[0.2em] uppercase">{roundLabel}</span>
        </div>
        {showBackButton && onClose && (
          <BackButton onClick={onClose} />
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex border border-[#1e3d28]">
        {(["stableford", "strokes"] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-sm tracking-[0.15em] uppercase transition-colors
              ${mode === m ? "bg-[#1e3d28] text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}
          >
            {m === "stableford" ? "Stableford" : "Strokes"}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      {mode === "strokes" && (
        <div className="flex justify-end -mb-2">
          <div className="flex rounded-full border border-[#1e3d28] overflow-hidden">
            {(["nett", "gross"] as StrokesView[]).map(sv => (
              <button
                key={sv}
                onClick={() => setStrokesView(sv)}
                className={`px-3 py-1 text-[10px] tracking-[0.12em] uppercase transition-colors
                  ${strokesView === sv ? "bg-[#1e3d28] text-white/70" : "text-white/30 hover:text-white/50"}`}
              >
                {sv}
              </button>
            ))}
          </div>
        </div>
      )}
      {sortedRows.length === 0 ? (
        <div className="border border-[#1e3d28] px-4 py-10 text-center">
          <div className="text-white/20 text-sm">No scores yet</div>
          <div className="text-white/10 text-xs mt-1">Scores appear as holes are completed</div>
        </div>
      ) : (
        <div className="border border-[#1e3d28]">
          {/* Column headers — sticky below main nav */}
          <div className="sticky top-[77px] z-10 flex items-center gap-3 px-4 py-2 bg-[#0a1a0e] border-b border-[#1e3d28]">
            <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 w-6 flex-shrink-0">Pos</span>
            <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 flex-1 min-w-0">Player</span>
            <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 flex-shrink-0 min-w-[3.5rem] text-center">Score</span>
            <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 flex-shrink-0 w-9 text-right">Thru</span>
          </div>

          {sortedRows.map((row, idx) => {
            const { player, holesCompleted, isFinalised,
                    totalStableford, stablefordRelative,
                    totalGross, grossRelative,
                    totalNett, nettRelative } = row

            const isExpanded = expandedPlayerId === player.id
            const isLast = idx === sortedRows.length - 1

            // ── Col 3: relative score ──────────────────────
            let relativeValue: number
            let scoreDisplay: string
            let scorePillClass: string

            if (mode === "stableford") {
              relativeValue = stablefordRelative
              scoreDisplay  = fmtRelative(relativeValue)
              scorePillClass = relativeValue > 0
                ? "bg-[#C9A84C]/15 text-[#C9A84C]"
                : relativeValue < 0
                  ? "bg-green-900/25 text-green-400"
                  : "bg-white/5 text-white/45"
            } else {
              relativeValue  = strokesView === "gross" ? grossRelative : nettRelative
              scoreDisplay   = fmtRelative(relativeValue)
              scorePillClass = relativeValue < 0
                ? "bg-[#C9A84C]/15 text-[#C9A84C]"
                : relativeValue > 0
                  ? "bg-green-900/25 text-green-400"
                  : "bg-white/5 text-white/45"
            }

            // ── Col 3 override for finalised: show absolute total ─
            if (isFinalised) {
              if (mode === "stableford") {
                scoreDisplay = `${totalStableford}`
              } else if (strokesView === "gross") {
                scoreDisplay = `${totalGross}`
              } else {
                scoreDisplay = `${totalNett}`
              }
            }

            // ── Col 4: holes through or F ─────────────────
            const col4 = isFinalised ? "F" : `${holesCompleted}`

            const playingHcp = roundHandicaps.find(
              rh => rh.player_id === player.id && rh.round_id === liveRound.round_id
            )?.playing_handicap ?? 0

            return (
              <Fragment key={player.id}>
                <button
                  onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5 transition-colors ${!isLast || isExpanded ? "border-b border-[#1e3d28]" : ""}`}
                >

                  {/* Col 1: position */}
                  <span className="text-white/40 text-base font-semibold w-6 flex-shrink-0 tabular-nums">
                    {positions[idx]}
                  </span>

                  {/* Col 2: team dot + name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {player.teams && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: player.teams.color }}
                      />
                    )}
                    <span className="text-base text-white/80 truncate">{player.name}</span>
                  </div>

                  {/* Col 3: relative score pill */}
                  <span className={`flex-shrink-0 inline-flex items-center justify-center
                    px-2 py-0.5 rounded-sm text-lg font-bold tabular-nums min-w-[3.5rem] ${scorePillClass}`}>
                    {scoreDisplay}
                  </span>

                  {/* Col 4: holes or finalised total */}
                  <span className={`flex-shrink-0 w-9 text-right tabular-nums text-base
                    ${isFinalised ? "text-white/60 font-semibold" : "text-white/30"}`}>
                    {col4}
                  </span>

                </button>

                {isExpanded && (
                  <div className={!isLast ? "border-b border-[#1e3d28]" : ""}>
                    <InlineScorecard
                      player={player}
                      playingHcp={playingHcp}
                      courseHoles={courseHoles}
                      playerScores={liveScores.filter(ls => ls.player_id === player.id)}
                      courseId={liveRound.course_id}
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
        <div className="text-center text-white/20 text-xs">
          Updated {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      )}
    </div>
  )
}
