"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// ─── Types ─────────────────────────────────────────────────────

type ViewMode   = "stableford" | "strokes"
type StrokesView = "gross" | "nett"

type Course  = { id: string; name: string }
type Round   = { id: string; round_number: number; courses: Course | null }
type Team    = { name: string; color: string }
type Player  = { id: string; name: string; role: string; handicap: number; team_id: string | null; is_composite?: boolean; teams: Team | null }
type Hole    = { id: string; hole_number: number; par: number; stroke_index: number; course_id: string }
type RoundHcp = { round_id: string; player_id: string; playing_handicap: number }
type Score   = { player_id: string; hole_id: string; round_id: string; stableford_points: number; gross_score: number; no_return: boolean }

interface Props {
  rounds:        Round[]
  players:       Player[]
  holes:         Hole[]
  scores:        Score[]
  roundHandicaps: RoundHcp[]
}

// ─── Constants ─────────────────────────────────────────────────

const ROLE_FILTERS = [
  { key: "all", label: "All" },
  { key: "dad", label: "Dads" },
  { key: "mum", label: "Mums" },
  { key: "son", label: "Sons" },
] as const

const displayName = (p: Player) => p.is_composite ? p.name.replace(/^Composite\s+/i, "") : p.name

const ROLE_DOT: Record<string, string> = {
  dad: "bg-blue-400",
  mum: "bg-rose-400",
  son: "bg-emerald-400",
}

// ─── Helpers ───────────────────────────────────────────────────

function playerRoundStableford(playerId: string, roundId: string, scores: Score[]) {
  return scores
    .filter(s => s.player_id === playerId && s.round_id === roundId)
    .reduce((sum, s) => sum + s.stableford_points, 0)
}

function shotsReceived(si: number, hcp: number) {
  return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0)
}

function nrGross(hole: Hole, playingHandicap: number): number {
  return hole.par + 2 + shotsReceived(hole.stroke_index, playingHandicap)
}

function playerRoundGross(playerId: string, roundId: string, scores: Score[], holes: Hole[], roundHandicaps: RoundHcp[]) {
  const ph = roundHandicaps.find(h => h.player_id === playerId && h.round_id === roundId)?.playing_handicap ?? 0
  return scores
    .filter(s => s.player_id === playerId && s.round_id === roundId)
    .reduce((sum, s) => {
      if (s.no_return) {
        const hole = holes.find(h => h.id === s.hole_id)
        return sum + (hole ? nrGross(hole, ph) : 0)
      }
      return sum + s.gross_score
    }, 0)
}

function playerRoundHasNR(playerId: string, roundId: string, scores: Score[]) {
  return scores.some(s => s.player_id === playerId && s.round_id === roundId && s.no_return)
}

function playerTotalStableford(playerId: string, scores: Score[]) {
  return scores.filter(s => s.player_id === playerId).reduce((sum, s) => sum + s.stableford_points, 0)
}

function playerTotalGross(playerId: string, scores: Score[], holes: Hole[], roundHandicaps: RoundHcp[]) {
  return scores
    .filter(s => s.player_id === playerId)
    .reduce((sum, s) => {
      if (s.no_return) {
        const hole = holes.find(h => h.id === s.hole_id)
        const ph = roundHandicaps.find(h => h.player_id === playerId && h.round_id === s.round_id)?.playing_handicap ?? 0
        return sum + (hole ? nrGross(hole, ph) : 0)
      }
      return sum + s.gross_score
    }, 0)
}

function playerHasAnyNR(playerId: string, scores: Score[]) {
  return scores.some(s => s.player_id === playerId && s.no_return)
}

function playerRoundNett(playerId: string, roundId: string, courseId: string, scores: Score[], holes: Hole[]) {
  const roundScores = scores.filter(s => s.player_id === playerId && s.round_id === roundId)
  if (roundScores.length === 0) return null
  const pts = roundScores.reduce((sum, s) => sum + (s.no_return ? 0 : s.stableford_points), 0)
  const coursePar = holes.filter(h => h.course_id === courseId).reduce((sum, h) => sum + h.par, 0)
  return coursePar + 36 - pts
}

function playerTotalNett(playerId: string, scores: Score[], holes: Hole[], rounds: Round[]) {
  return rounds.reduce((total, r) => {
    const courseId = r.courses?.id ?? ""
    const roundScores = scores.filter(s => s.player_id === playerId && s.round_id === r.id)
    if (roundScores.length === 0) return total
    const pts = roundScores.reduce((sum, s) => sum + (s.no_return ? 0 : s.stableford_points), 0)
    const coursePar = holes.filter(h => h.course_id === courseId).reduce((sum, h) => sum + h.par, 0)
    return total + coursePar + 36 - pts
  }, 0)
}

function playerBadges(playerId: string, scores: Score[], holes: Hole[]) {
  let birdies = 0, eagles = 0
  for (const s of scores) {
    if (s.player_id !== playerId || s.no_return) continue
    const hole = holes.find(h => h.id === s.hole_id)
    if (!hole) continue
    const diff = s.gross_score - hole.par
    if (diff === -1) birdies++
    else if (diff <= -2) eagles++
  }
  return { birdies, eagles }
}

function statusLabel(status: number): string {
  if (status === 0) return "AS"
  const up = Math.abs(status)
  return status > 0 ? `${up} UP` : `${up} DN`
}

function statusColor(status: number) {
  if (status === 0) return "text-white/40"
  return status > 0 ? "text-[#C9A84C]" : "text-rose-400"
}

// ─── Matchplay ─────────────────────────────────────────────────

function MatchplaySection({ playerA, playerB, rounds, holes, scores, noShots, onToggleNoShots }: {
  playerA: Player; playerB: Player
  rounds: Round[]; holes: Hole[]; scores: Score[]
  noShots: boolean; onToggleNoShots: () => void
}) {
  let runningStatus = 0

  const higherHcpIsA = playerA.handicap >= playerB.handicap

  const roundData = rounds.map(round => {
    const courseHoles = holes
      .filter(h => h.course_id === round.courses?.id)
      .sort((a, b) => a.hole_number - b.hole_number)

    const holeResults = courseHoles.map(hole => {
      const aScore = scores.find(s => s.player_id === playerA.id && s.hole_id === hole.id && s.round_id === round.id)
      const bScore = scores.find(s => s.player_id === playerB.id && s.hole_id === hole.id && s.round_id === round.id)

      let result: "A" | "B" | "H" | null = null
      if (aScore !== undefined && bScore !== undefined) {
        if (noShots) {
          if (aScore.no_return && bScore.no_return) result = "H"
          else if (aScore.no_return)  { runningStatus--; result = "B" }
          else if (bScore.no_return)  { runningStatus++; result = "A" }
          else if (aScore.gross_score < bScore.gross_score) { runningStatus++; result = "A" }
          else if (bScore.gross_score < aScore.gross_score) { runningStatus--; result = "B" }
          else result = "H"
        } else {
          if (aScore.stableford_points > bScore.stableford_points)      { runningStatus++; result = "A" }
          else if (bScore.stableford_points > aScore.stableford_points) { runningStatus--; result = "B" }
          else result = "H"
        }
      }

      const snapshot = runningStatus
      return { hole, aScore, bScore, result, status: snapshot }
    })

    return { round, holeResults }
  })

  const finalStatus  = runningStatus
  const totalHoles   = rounds.reduce((n, r) => n + holes.filter(h => h.course_id === r.courses?.id).length, 0)
  const playedHoles  = scores.filter(s => s.player_id === playerA.id || s.player_id === playerB.id).length > 0
    ? roundData.flatMap(r => r.holeResults).filter(h => h.result !== null).length
    : 0
  const remaining    = totalHoles - playedHoles

  const matchResult = () => {
    if (playedHoles === 0) return null
    if (remaining > 0 && Math.abs(finalStatus) <= remaining) return null
    if (finalStatus === 0) return "Match all square"
    const winner = finalStatus > 0 ? playerA.name.split(" ")[0] : playerB.name.split(" ")[0]
    const up = Math.abs(finalStatus)
    return remaining === 0
      ? `${winner} wins ${up} UP`
      : `${winner} wins ${up}&${remaining}`
  }

  const result = matchResult()

  const noShotsBtn = (
    <button
      onClick={onToggleNoShots}
      className={`px-2 py-0.5 text-xs border rounded-sm transition-colors ${
        noShots
          ? "border-[#C9A84C]/60 bg-[#C9A84C]/10 text-[#C9A84C]"
          : "border-[#1e3d28] text-white/30 hover:text-white/50"
      }`}
    >
      No shots
    </button>
  )

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[#C9A84C] font-medium text-sm">{playerA.name.split(" ")[0]}</span>
          {higherHcpIsA && noShotsBtn}
        </div>
        <span className="text-white/25 text-xs uppercase tracking-widest">vs</span>
        <div className="flex items-center gap-2">
          {!higherHcpIsA && noShotsBtn}
          <span className="text-rose-300 font-medium text-sm">{playerB.name.split(" ")[0]}</span>
        </div>
      </div>

      {result && (
        <div className="border border-[#C9A84C]/40 bg-[#C9A84C]/10 rounded-sm px-5 py-3 text-center">
          <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-xl">{result}</span>
        </div>
      )}

      {roundData.map(({ round, holeResults }) => {
        const played = holeResults.filter(h => h.result !== null)
        if (played.length === 0) return (
          <div key={round.id} className="border border-[#1e3d28] bg-[#0f2418] rounded-sm px-4 py-3">
            <p className="text-white/40 text-sm">{round.courses?.name} — no scores yet</p>
          </div>
        )

        return (
          <div key={round.id} className="border border-[#1e3d28] bg-[#0f2418] rounded-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1e3d28] flex items-center justify-between">
              <span className="font-[family-name:var(--font-playfair)] text-white text-sm">{round.courses?.name}</span>
              <span className="text-white/30 text-xs tracking-widest uppercase">Day {round.round_number}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#1e3d28]">
                    <th className="text-left px-3 py-2 text-white/25 font-normal min-w-[36px]">Hole</th>
                    <th className="text-right px-3 py-2 text-[#C9A84C]/60 font-semibold min-w-[80px]">{playerA.name.split(" ")[0]}</th>
                    <th className="text-center px-2 py-2 text-white/20 font-normal min-w-[40px]"></th>
                    <th className="text-left px-3 py-2 text-rose-300/60 font-semibold min-w-[80px]">{playerB.name.split(" ")[0]}</th>
                    <th className="text-center px-3 py-2 text-white/25 font-normal min-w-[56px]">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {holeResults.map(({ hole, aScore, bScore, result, status }) => {
                    const hasScores = aScore !== undefined && bScore !== undefined
                    const aPts = aScore?.stableford_points ?? null
                    const bPts = bScore?.stableford_points ?? null
                    const aGross = aScore?.gross_score ?? null
                    const bGross = bScore?.gross_score ?? null

                    return (
                      <tr key={hole.id} className={`border-t border-[#1e3d28]/40 ${!hasScores ? "opacity-30" : ""}`}>
                        <td className="px-3 py-1.5 text-white/40">{hole.hole_number}</td>

                        <td className={`text-right px-3 py-1.5 font-medium
                          ${result === "A" ? "text-[#C9A84C] font-bold" : result === "H" ? "text-white/60" : "text-white/35"}`}>
                          {aGross !== null ? (
                            noShots
                              ? aScore?.no_return ? <span className="text-orange-400/70">NR</span> : aGross
                              : <>{aGross}<sup className="text-[9px] opacity-60 ml-0.5">{aPts}</sup></>
                          ) : "—"}
                        </td>

                        <td className="text-center px-2 py-1.5">
                          {result === "A" && <span className="text-[#C9A84C] font-bold">›</span>}
                          {result === "B" && <span className="text-rose-400 font-bold">‹</span>}
                          {result === "H" && <span className="text-white/20">·</span>}
                          {result === null && <span className="text-white/10">–</span>}
                        </td>

                        <td className={`px-3 py-1.5 font-medium
                          ${result === "B" ? "text-rose-300 font-bold" : result === "H" ? "text-white/60" : "text-white/35"}`}>
                          {bGross !== null ? (
                            noShots
                              ? bScore?.no_return ? <span className="text-orange-400/70">NR</span> : bGross
                              : <>{bGross}<sup className="text-[9px] opacity-60 ml-0.5">{bPts}</sup></>
                          ) : "—"}
                        </td>

                        <td className={`text-center px-3 py-1.5 font-semibold ${hasScores ? statusColor(status) : "text-white/10"}`}>
                          {hasScores ? statusLabel(status) : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────

export default function IndividualClient({ rounds, players, holes, scores, roundHandicaps }: Props) {
  const router = useRouter()
  const [filter, setFilter]           = useState<"all" | "dad" | "mum" | "son">("all")
  const [viewMode, setViewMode]       = useState<ViewMode>("stableford")
  const [strokesView, setStrokesView] = useState<StrokesView>("gross")
  const [playerAId, setPlayerAId]     = useState("")
  const [playerBId, setPlayerBId]     = useState("")
  const [noShots, setNoShots]         = useState(false)

  const filteredPlayers = filter === "all" ? players : players.filter(p => p.role === filter)

  const standings = filteredPlayers
    .map(p => {
      const byRound = rounds.map(r => {
        const hasRoundScores = scores.some(s => s.player_id === p.id && s.round_id === r.id)
        if (!hasRoundScores) return { sf: null, gross: null, nett: null, hasNR: false }
        return {
          sf:    playerRoundStableford(p.id, r.id, scores),
          gross: playerRoundGross(p.id, r.id, scores, holes, roundHandicaps),
          nett:  playerRoundNett(p.id, r.id, r.courses?.id ?? "", scores, holes),
          hasNR: playerRoundHasNR(p.id, r.id, scores),
        }
      })
      const hasAny     = scores.some(s => s.player_id === p.id)
      const totalSF    = playerTotalStableford(p.id, scores)
      const totalGross = playerTotalGross(p.id, scores, holes, roundHandicaps)
      const totalNett  = playerTotalNett(p.id, scores, holes, rounds)
      const hasNR      = playerHasAnyNR(p.id, scores)
      const badges     = playerBadges(p.id, scores, holes)
      return { player: p, byRound, hasAny, totalSF, totalGross, totalNett, hasNR, badges }
    })
    .sort((a, b) => {
      if (!a.hasAny && !b.hasAny) return 0
      if (!a.hasAny) return 1
      if (!b.hasAny) return -1
      if (viewMode === "stableford") return b.totalSF - a.totalSF
      if (strokesView === "nett") return a.totalNett - b.totalNett
      return a.totalGross - b.totalGross
    })

  // Assign positions (ties share same position)
  const positions: (number | string)[] = []
  standings.forEach((s, i) => {
    if (!s.hasAny) { positions.push("—"); return }
    if (i === 0) { positions.push(1); return }
    const prev = standings[i - 1]
    const prevPos = positions[i - 1]
    const isTie = viewMode === "stableford"
      ? s.totalSF === prev.totalSF
      : strokesView === "nett"
        ? s.totalNett === prev.totalNett
        : s.totalGross === prev.totalGross
    positions.push(isTie ? prevPos : i + 1)
  })

  function getRoundValue(r: typeof standings[0]["byRound"][0]) {
    if (viewMode === "stableford") return r.sf
    if (strokesView === "nett") return r.nett
    return r.gross
  }

  function getTotValue(s: typeof standings[0]) {
    if (!s.hasAny) return null
    if (viewMode === "stableford") return s.totalSF
    if (strokesView === "nett") return s.totalNett
    return s.totalGross
  }

  function navigate(playerId: string, roundIdx: number) {
    router.push(`/scorecard/${playerId}?from=individual&round=${roundIdx}`)
  }

  const playerA = players.find(p => p.id === playerAId)
  const playerB = players.find(p => p.id === playerBId)

  return (
    <div className="space-y-10">

      {/* ── Individual standings ── */}
      <section>

        {/* Mode toggle */}
        <div className="flex border border-[#1e3d28] overflow-hidden mb-3">
          <button
            onClick={() => setViewMode("stableford")}
            className={`flex-1 py-2.5 text-sm tracking-[0.15em] uppercase transition-colors
              ${viewMode === "stableford" ? "bg-[#1e3d28] text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}
          >
            Stableford
          </button>
          <button
            onClick={() => setViewMode("strokes")}
            className={`flex-1 py-2.5 text-sm tracking-[0.15em] uppercase transition-colors border-l border-[#1e3d28]
              ${viewMode === "strokes" ? "bg-[#1e3d28] text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}
          >
            Strokes
          </button>
        </div>

        {/* Strokes sub-toggle + role filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {viewMode === "strokes" && (
            <div className="flex rounded-full border border-[#1e3d28] overflow-hidden">
              <button
                onClick={() => setStrokesView("gross")}
                className={`px-3 py-1 text-[10px] tracking-[0.1em] uppercase transition-colors
                  ${strokesView === "gross" ? "bg-[#1e3d28] text-white/70" : "text-white/30 hover:text-white/50"}`}
              >
                Gross
              </button>
              <button
                onClick={() => setStrokesView("nett")}
                className={`px-3 py-1 text-[10px] tracking-[0.1em] uppercase transition-colors border-l border-[#1e3d28]
                  ${strokesView === "nett" ? "bg-[#1e3d28] text-white/70" : "text-white/30 hover:text-white/50"}`}
              >
                Nett
              </button>
            </div>
          )}

          <div className="flex gap-1.5">
            {ROLE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as any)}
                className={`px-3 py-1 text-sm tracking-wide border rounded-sm transition-colors
                  ${filter === f.key
                    ? "border-[#C9A84C]/60 bg-[#C9A84C]/10 text-[#C9A84C]"
                    : "border-[#1e3d28] text-white/35 hover:text-white/60"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Card: sticky column header + rows */}
        <div className="border border-[#1e3d28]">

          {/* Sticky column headers — first child so rows cannot scroll under it */}
          <div className="sticky top-0 z-10 grid grid-cols-[20px_1fr_44px_44px_44px_60px] gap-x-2 items-center px-3 py-1 bg-[#0a1a0e] border-b border-[#1e3d28]">
            <span className="text-[10px] tracking-widest uppercase text-white/25">Pos</span>
            <span className="text-[10px] tracking-widest uppercase text-white/25">Player</span>
            {rounds.map(r => (
              <span key={r.id} className="text-xs text-white/25 text-center tabular-nums">{r.round_number}</span>
            ))}
            <span className="text-[10px] tracking-widest uppercase text-[#C9A84C]/50 text-right">
              {viewMode === "stableford" ? "Tot" : strokesView === "nett" ? "Nett" : "Gross"}
            </span>
          </div>

          {/* Rows */}
          {standings.length === 0 ? (
            <p className="px-4 py-8 text-center text-white/20 text-sm">No scores yet</p>
          ) : standings.map(({ player, byRound, hasAny, totalSF, totalGross, totalNett, hasNR, badges }, i) => {
            const totValue = getTotValue({ player, byRound, hasAny, totalSF, totalGross, totalNett, hasNR, badges })
            const emojiStr = "🦅".repeat(badges.eagles) + "🦤".repeat(badges.birdies)
            const canOpen = hasAny

            return (
              <div
                key={player.id}
                onClick={() => canOpen && navigate(player.id, 0)}
                className={`grid grid-cols-[20px_1fr_44px_44px_44px_60px] gap-x-2 items-center px-3 py-1
                  border-b border-[#1e3d28] last:border-b-0
                  ${canOpen ? "cursor-pointer active:bg-white/5 transition-colors" : ""}`}
              >
                {/* Pos */}
                <span className="text-white/40 text-base font-semibold tabular-nums">
                  {positions[i]}
                </span>

                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ROLE_DOT[player.role] ?? "bg-white/30"}`} />
                  <span className="text-base text-white/80 truncate">{displayName(player)}</span>
                  {emojiStr && <span className="text-[0.55em] leading-none flex-shrink-0">{emojiStr}</span>}
                  {player.is_composite && (
                    <span className="text-[9px] font-bold text-[#C9A84C] border border-[#C9A84C]/40 px-0.5 rounded-sm leading-tight flex-shrink-0">C</span>
                  )}
                </div>

                {/* R1, R2, R3 */}
                {byRound.map((r, j) => {
                  const val = getRoundValue(r)
                  const hasRound = r.sf !== null
                  const canOpenRound = hasRound
                  return (
                    <div
                      key={j}
                      onClick={e => {
                        e.stopPropagation()
                        if (canOpenRound) navigate(player.id, j)
                      }}
                      className={`flex items-baseline justify-center gap-0.5 text-2xl font-semibold tabular-nums rounded-sm py-0.5 transition-colors
                        ${canOpenRound ? "cursor-pointer active:bg-white/10" : ""}
                        ${hasRound ? "text-white/70" : "text-white/20 font-normal"}`}
                    >
                      {hasRound ? (
                        <>
                          {val}
                          {r.hasNR && viewMode === "strokes" && strokesView === "gross" && (
                            <span className="text-orange-400/60 text-[8px] leading-none">NR</span>
                          )}
                        </>
                      ) : "—"}
                    </div>
                  )
                })}

                {/* TOT */}
                <span className={`text-right font-[family-name:var(--font-playfair)] tabular-nums
                  ${hasAny ? "text-[#C9A84C] text-2xl font-bold" : "text-white/20 text-sm font-normal"}`}>
                  {hasAny ? totValue : "—"}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Matchplay ── */}
      <section>
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-5">Matchplay</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-sm tracking-[0.2em] uppercase text-white/30 mb-1.5">Player A</label>
            <select
              value={playerAId}
              onChange={e => { setPlayerAId(e.target.value); setNoShots(false) }}
              className="w-full bg-[#0f2418] border border-[#1e3d28] text-white px-4 py-3 rounded-sm appearance-none focus:outline-none focus:border-[#C9A84C] text-sm"
            >
              <option value="">Select player…</option>
              {players.map(p => (
                <option key={p.id} value={p.id} disabled={p.id === playerBId}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm tracking-[0.2em] uppercase text-white/30 mb-1.5">Player B</label>
            <select
              value={playerBId}
              onChange={e => { setPlayerBId(e.target.value); setNoShots(false) }}
              className="w-full bg-[#0f2418] border border-[#1e3d28] text-white px-4 py-3 rounded-sm appearance-none focus:outline-none focus:border-[#C9A84C] text-sm"
            >
              <option value="">Select player…</option>
              {players.map(p => (
                <option key={p.id} value={p.id} disabled={p.id === playerAId}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {playerA && playerB ? (
          <MatchplaySection
            playerA={playerA}
            playerB={playerB}
            rounds={rounds}
            holes={holes}
            scores={scores}
            noShots={noShots}
            onToggleNoShots={() => setNoShots(v => !v)}
          />
        ) : (
          <div className="border border-[#1e3d28] bg-[#0f2418] rounded-sm px-4 py-10 text-center text-white/20 text-sm">
            Select two players to view matchplay
          </div>
        )}
      </section>

    </div>
  )
}
