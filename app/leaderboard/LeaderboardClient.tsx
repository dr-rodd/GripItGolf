"use client"

import { useState, Fragment } from "react"

// ─── Types ─────────────────────────────────────────────────────

type Course   = { id: string; name: string }
type Round    = { id: string; round_number: number; status?: string; courses: Course | null }
type Player   = { id: string; name: string; role: string; handicap: number; is_composite?: boolean; gender?: string }
type Team     = { id: string; name: string; color: string; players: Player[] }
type Hole     = { id: string; hole_number: number; par: number; stroke_index: number; course_id: string }
type Score    = { player_id: string; hole_id: string; gross_score: number; stableford_points: number; no_return: boolean; round_id: string }
type RoundHcp       = { round_id: string; player_id: string; playing_handicap: number }
type CompositeHole  = { composite_player_id: string; round_id: string; hole_id: string; source_player_id: string }
interface Props {
  rounds: Round[]
  teams: Team[]
  holes: Hole[]
  scores: Score[]
  roundHandicaps: RoundHcp[]
  tees: unknown[]
  compositeHoles: CompositeHole[]
}

// ─── Scorecard styling constants ───────────────────────────────

const SC_SF    = { fontFamily: "Georgia, serif" }
const SC_MUTED = "text-[#7A7060]"
const SC_DARK  = "text-[#3A3A2E]"
const SC_GRID  = "grid grid-cols-[2fr_2fr_3fr_3fr_3fr_2fr] w-full"

// ─── Player helpers ────────────────────────────────────────────

const ROLE_ORDER: Record<string, number> = { dad: 0, mum: 1, son: 2 }
function sortedPlayers(players: Player[]) {
  return [...players].sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3))
}
const displayName = (p: Player) =>
  (p.is_composite ? p.name.replace(/^Composite\s+/i, "") : p.name).split(" ")[0]

// ─── Team scoring ──────────────────────────────────────────────

function teamRoundPts(team: Team, holes: Hole[], scores: Score[], roundId: string): number {
  return holes.reduce((total, hole) => {
    const best = team.players
      .map(p => scores.find(s => s.player_id === p.id && s.hole_id === hole.id && s.round_id === roundId))
      .filter(Boolean)
      .reduce((max, s) => Math.max(max, s!.stableford_points), 0)
    return total + best
  }, 0)
}

// ─── Composite scorecard ───────────────────────────────────────

function CompositeScorecard({ team, round, holes, scores, roundHandicaps, compositeHoles, allTeams }: {
  team: Team; round: Round; holes: Hole[]; scores: Score[]; roundHandicaps: RoundHcp[]
  compositeHoles: CompositeHole[]; allTeams: Team[]
}) {
  const courseId   = round.courses?.id ?? ""
  const courseHoles = holes
    .filter(h => h.course_id === courseId)
    .sort((a, b) => a.hole_number - b.hole_number)

  const players = sortedPlayers(team.players)
  if (players.length === 0) return null

  const sf    = SC_SF
  const muted = SC_MUTED
  const dark  = SC_DARK
  const grid  = SC_GRID

  const scoreSymbol = (gross: number | null, par: number, isNR = false) => {
    if (isNR) return <span className="inline-flex items-center justify-center w-10 h-10 border border-orange-500/60 rounded-sm text-orange-500 text-sm font-semibold">NR</span>
    if (gross === null) return <span className={`${muted} text-xl`} style={sf}>—</span>
    const diff = gross - par
    const n = <span className="text-xl font-semibold leading-none">{gross}</span>
    if (diff <= -2) return (
      <span className="relative inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#C9A84C]">
        <span className="absolute inset-[3px] rounded-full border border-[#C9A84C]" />
        <span className="relative text-base font-semibold leading-none text-[#7B5C1E]">{gross}</span>
      </span>
    )
    if (diff === -1) return <span className="w-10 h-10 rounded-full border border-[#C9A84C] flex items-center justify-center text-[#7B5C1E]">{n}</span>
    if (diff === 0)  return <span className={`${dark} text-xl font-semibold`} style={sf}>{gross}</span>
    if (diff === 1)  return <span className="w-10 h-10 rounded-md border border-[#9B8860] flex items-center justify-center text-[#5A4F3A]">{n}</span>
    return (
      <span className="relative inline-flex items-center justify-center w-10 h-10 rounded-md border border-[#9B8860]">
        <span className="absolute inset-[3px] rounded-sm border border-[#9B8860]" />
        <span className="relative text-base font-semibold leading-none text-[#5A4F3A]">{gross}</span>
      </span>
    )
  }

  const ptsColor = (pts: number | null) =>
    pts === null ? muted :
    pts === 0    ? "text-[#A89880] opacity-50" :
                   "text-[#7B6C3E] font-bold"

  // Build per-player score maps: hole_number → Score
  const playerScoreMaps = players.map(p =>
    new Map(
      scores
        .filter(s => s.player_id === p.id && s.round_id === round.id)
        .flatMap(s => {
          const hole = holes.find(h => h.id === s.hole_id)
          return hole ? [[hole.hole_number, s] as [number, Score]] : []
        })
    )
  )

  // Lookup maps for composite source colours
  const compositeHoleMap = new Map(
    compositeHoles.map(ch => [`${ch.composite_player_id}:${ch.round_id}:${ch.hole_id}`, ch.source_player_id])
  )
  const sourcePlayerColorMap = new Map(
    allTeams.flatMap(t => t.players.map(p => [p.id, t.color] as [string, string]))
  )

  // Build rows
  const rows = courseHoles.map((hole, idx) => {
    const grossScores = players.map((_, pi) => {
      const s = playerScoreMaps[pi].get(hole.hole_number)
      return s ? (s.no_return ? null : s.gross_score) : null
    })
    const isNRScores = players.map((_, pi) => {
      const s = playerScoreMaps[pi].get(hole.hole_number)
      return s?.no_return === true
    })
    const stablefordScores = players.map((_, pi) => {
      const s = playerScoreMaps[pi].get(hole.hole_number)
      return s ? s.stableford_points : null
    })
    const bestPts = players.reduce((max, _, pi) => {
      const s = playerScoreMaps[pi].get(hole.hole_number)
      return s ? Math.max(max, s.stableford_points) : max
    }, 0)
    const hasScores = players.some((_, pi) => playerScoreMaps[pi].has(hole.hole_number))
    const contributors = players.map((_, pi) => {
      const s = playerScoreMaps[pi].get(hole.hole_number)
      return bestPts > 0 && s != null && s.stableford_points === bestPts
    })
    const sourceColors = players.map(p => {
      if (!p.is_composite) return null
      const sourceId = compositeHoleMap.get(`${p.id}:${round.id}:${hole.id}`)
      return sourceId ? (sourcePlayerColorMap.get(sourceId) ?? null) : null
    })
    return { hole, idx, grossScores, stablefordScores, bestPts, hasScores, contributors, sourceColors, isNRScores }
  })

  const front9 = rows.slice(0, 9)
  const back9  = rows.slice(9)

  const front9Par  = front9.reduce((s, r) => s + r.hole.par, 0)
  const back9Par   = back9.reduce((s, r) => s + r.hole.par, 0)
  const front9Pts  = front9.reduce((s, r) => s + r.bestPts, 0)
  const back9Pts   = back9.reduce((s, r) => s + r.bestPts, 0)
  const front9HasScores = front9.some(r => r.hasScores)
  const back9HasScores  = back9.some(r => r.hasScores)

  const front9Gross = players.map((_, pi) => front9.reduce((s, r) => s + (r.grossScores[pi] ?? 0), 0))
  const back9Gross  = players.map((_, pi) => back9.reduce((s, r) => s + (r.grossScores[pi] ?? 0), 0))
  const totalGross  = players.map((_, pi) => front9Gross[pi] + back9Gross[pi])
  const totalPts    = front9Pts + back9Pts

  return (
    <div style={{ background: "#F5F0E8" }}>

      {/* Front 9 */}
      {front9.map(({ hole, idx, grossScores, stablefordScores, bestPts, hasScores, contributors, sourceColors, isNRScores }) => (
        <div key={hole.hole_number} className={`${grid} px-3 py-3 items-center border-b border-[#E2DAC8] ${idx % 2 === 1 ? "bg-[#EEE8D6]" : ""}`}>
          <span className={`text-lg font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
          <span className={`text-lg ${muted}`} style={sf}>{hole.par}</span>
          {grossScores.map((gross, pi) => (
            <span key={pi} className="flex flex-col items-center justify-center -my-3 py-3 gap-0.5">
              <span className="flex items-center gap-0.5">
                <span className="relative inline-flex items-center justify-center">
                  {contributors[pi] && <span className="absolute w-12 h-12 rounded-md bg-[#E8DCBC]/60" />}
                  <span className="relative z-10">{scoreSymbol(gross, hole.par, isNRScores[pi])}</span>
                </span>
                {stablefordScores[pi] !== null && (
                  <sup className={`text-sm leading-none ${muted}`} style={sf}>{stablefordScores[pi]}</sup>
                )}
              </span>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sourceColors[pi] ?? "transparent" }} />
            </span>
          ))}
          <span className={`text-right text-lg ${ptsColor(hasScores ? bestPts : null)}`} style={sf}>{hasScores ? bestPts : "—"}</span>
        </div>
      ))}

      {/* Out subtotal */}
      <div className={`${grid} px-3 py-2 items-center border-b border-[#C9A84C]/20`} style={{ background: "rgba(201,168,76,0.16)" }}>
        <span className="text-sm font-bold tracking-widest uppercase text-[#5C4520]" style={sf}>Out</span>
        <span className="text-lg font-bold text-[#5C4520]" style={sf}>{front9Par}</span>
        {players.map((_, pi) => (
          <span key={pi} className="text-center text-lg font-bold text-[#5C4520]" style={sf}>
            {front9HasScores && front9Gross[pi] > 0 ? front9Gross[pi] : "—"}
          </span>
        ))}
        <span className="text-right text-lg font-bold text-[#7B6C3E]" style={sf}>{front9HasScores ? front9Pts : "—"}</span>
      </div>

      {/* Back 9 */}
      {back9.map(({ hole, idx, grossScores, stablefordScores, bestPts, hasScores, contributors, sourceColors, isNRScores }) => (
        <div key={hole.hole_number} className={`${grid} px-3 py-3 items-center border-b border-[#E2DAC8] ${idx % 2 === 0 ? "bg-[#EEE8D6]" : ""}`}>
          <span className={`text-lg font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
          <span className={`text-lg ${muted}`} style={sf}>{hole.par}</span>
          {grossScores.map((gross, pi) => (
            <span key={pi} className="flex flex-col items-center justify-center -my-3 py-3 gap-0.5">
              <span className="flex items-center gap-0.5">
                <span className="relative inline-flex items-center justify-center">
                  {contributors[pi] && <span className="absolute w-12 h-12 rounded-md bg-[#E8DCBC]/60" />}
                  <span className="relative z-10">{scoreSymbol(gross, hole.par, isNRScores[pi])}</span>
                </span>
                {stablefordScores[pi] !== null && (
                  <sup className={`text-sm leading-none ${muted}`} style={sf}>{stablefordScores[pi]}</sup>
                )}
              </span>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sourceColors[pi] ?? "transparent" }} />
            </span>
          ))}
          <span className={`text-right text-lg ${ptsColor(hasScores ? bestPts : null)}`} style={sf}>{hasScores ? bestPts : "—"}</span>
        </div>
      ))}

      {/* In subtotal */}
      <div className={`${grid} px-3 py-2 items-center border-b border-[#C9A84C]/20`} style={{ background: "rgba(201,168,76,0.16)" }}>
        <span className="text-sm font-bold tracking-widest uppercase text-[#5C4520]" style={sf}>In</span>
        <span className="text-lg font-bold text-[#5C4520]" style={sf}>{back9Par}</span>
        {players.map((_, pi) => (
          <span key={pi} className="text-center text-lg font-bold text-[#5C4520]" style={sf}>
            {back9HasScores && back9Gross[pi] > 0 ? back9Gross[pi] : "—"}
          </span>
        ))}
        <span className="text-right text-lg font-bold text-[#7B6C3E]" style={sf}>{back9HasScores ? back9Pts : "—"}</span>
      </div>

      {/* Tot row */}
      <div className={`${grid} px-3 py-2.5 items-center`} style={{ background: "rgba(201,168,76,0.35)" }}>
        <span className="text-sm font-bold tracking-widest uppercase text-[#4A3810]" style={sf}>Tot</span>
        <span className="text-lg font-bold text-[#4A3810]" style={sf}>{front9Par + back9Par}</span>
        {players.map((_, pi) => (
          <span key={pi} className="text-center text-lg font-bold text-[#4A3810]" style={sf}>
            {totalGross[pi] > 0 ? totalGross[pi] : "—"}
          </span>
        ))}
        <span className="text-right text-2xl font-extrabold text-[#5C4520] font-[family-name:var(--font-playfair)]">{totalPts}</span>
      </div>

    </div>
  )
}

// ─── Scorecard modal ───────────────────────────────────────────

function ScorecardModal({ team, round, holes, scores, roundHandicaps, compositeHoles, allTeams, onClose }: {
  team: Team; round: Round; holes: Hole[]; scores: Score[]; roundHandicaps: RoundHcp[]
  compositeHoles: CompositeHole[]; allTeams: Team[]; onClose: () => void
}) {
  const players = sortedPlayers(team.players)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-[#0a1a0e] rounded-t-2xl flex flex-col max-h-[90vh]"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ① Title + close — always visible, never scrolls */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-3">
          <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
            <p className="font-[family-name:var(--font-playfair)] text-white text-2xl leading-tight truncate">
              {team.name}
            </p>
            <p className="text-[#C9A84C] text-base truncate">
              {round.courses?.name ?? `Round ${round.round_number}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xl flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Parchment card — fills remaining height, clips rounded corners */}
        <div className="flex flex-col flex-1 min-h-0 rounded-t-xl overflow-hidden" style={{ background: "#F5F0E8" }}>

          {/* ② Players row — always visible, never scrolls */}
          <div className="flex-shrink-0 flex items-baseline gap-3 px-3 py-2 border-b border-[#D4CBBA]" style={{ background: "#EAE4D5" }}>
            <span className="text-[10px] tracking-[0.15em] uppercase flex-shrink-0" style={{ ...SC_SF, color: "#7A7060" }}>Players</span>
            <div className="flex-1 min-w-0 flex items-baseline justify-between">
              {players.map((p, i) => {
                const hcp = roundHandicaps.find(rh => rh.player_id === p.id && rh.round_id === round.id)?.playing_handicap
                return (
                  <span key={p.id} className="flex-1 text-center text-sm text-[#2C2C1E]" style={SC_SF}>
                    <span className={`text-[10px] ${SC_MUTED}`}>{i + 1}.</span>
                    {" "}
                    <span className="font-[family-name:var(--font-playfair)] font-semibold">{p.name.split(" ")[0]}</span>
                    {" "}
                    <span className={`text-[10px] ${SC_MUTED}`}>{hcp ?? "—"}</span>
                  </span>
                )
              })}
            </div>
          </div>

          {/* ③ Column headers — always visible, never scrolls */}
          <div className={`flex-shrink-0 ${SC_GRID} px-3 py-1.5 border-b border-[#D4CBBA]`} style={{ background: "#EAE4D5" }}>
            {(["Hole", "Par"] as const).map(h => (
              <span key={h} className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${SC_MUTED}`} style={SC_SF}>{h}</span>
            ))}
            {[1, 2, 3].map(n => (
              <span key={n} className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${SC_MUTED} text-center`} style={SC_SF}>{n}</span>
            ))}
            <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold ${SC_MUTED} text-right`} style={SC_SF}>TOT</span>
          </div>

          {/* Score rows — only this scrolls */}
          <div className="overflow-y-auto flex-1 pb-8">
            <CompositeScorecard
              team={team}
              round={round}
              holes={holes}
              scores={scores}
              roundHandicaps={roundHandicaps}
              compositeHoles={compositeHoles}
              allTeams={allTeams}
            />
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Course tiles ──────────────────────────────────────────────

function CourseTiles({ team, rounds, holes, scores, roundHandicaps, onTileClick }: {
  team: Team; rounds: Round[]; holes: Hole[]; scores: Score[]; roundHandicaps: RoundHcp[]
  onTileClick: (round: Round) => void
}) {
  const roundsByNumber: Record<number, Round> = {}
  rounds.forEach(r => { roundsByNumber[r.round_number] = r })

  return (
    <div className="px-3 pb-4 pt-2 space-y-2 bg-[#070f09]">
      {[1, 2, 3].map(num => {
        const round = roundsByNumber[num]
        if (!round) {
          return (
            <div key={num} className="w-full rounded-sm border border-[#1e3d28] bg-[#0f2418] px-5 py-4 opacity-40">
              <p className="font-[family-name:var(--font-playfair)] text-white/30 text-base">Round {num}</p>
              <p className="text-white/20 text-sm mt-0.5">Not scheduled</p>
            </div>
          )
        }
        const courseHoles = holes.filter(h => h.course_id === round.courses?.id)
        const pts = teamRoundPts(team, courseHoles, scores, round.id)
        const hasScores = pts > 0
        return (
          <button
            key={round.id}
            onClick={() => onTileClick(round)}
            className={`w-full text-left rounded-sm border transition-all duration-200 overflow-hidden active:opacity-75
              ${hasScores
                ? "border-[#C9A84C]/50 shadow-[0_0_16px_rgba(201,168,76,0.10)] bg-[#0f2418]"
                : "border-[#1e3d28] bg-[#0f2418]"
              }`}
          >
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-playfair)] text-white text-base leading-tight">
                  {round.courses?.name ?? `Round ${num}`}
                </p>
                <p className={`text-sm mt-1 ${hasScores ? "text-[#C9A84C]" : "text-white/25"}`}>
                  {hasScores ? "Scores submitted" : "No scores yet"}
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                {hasScores && (
                  <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-xl font-bold">{pts}</span>
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

// ─── Main component ────────────────────────────────────────────

export default function LeaderboardClient({ rounds, teams, holes, scores, roundHandicaps, tees, compositeHoles }: Props) {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ team: Team; round: Round } | null>(null)

  const sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number)
  const roundsByNumber: Record<number, Round> = {}
  sortedRounds.forEach(r => { roundsByNumber[r.round_number] = r })

  const rows = teams.map(team => {
    const roundPts: Record<number, number> = {}
    for (const r of sortedRounds) {
      const courseHoles = holes.filter(h => h.course_id === r.courses?.id)
      roundPts[r.round_number] = teamRoundPts(team, courseHoles, scores, r.id)
    }
    const total = Object.values(roundPts).reduce((s, p) => s + p, 0)
    const roundsWithScores = Object.values(roundPts).filter(p => p > 0).length
    return { team, roundPts, total, roundsWithScores }
  }).sort((a, b) => b.total - a.total)

  const totalRounds = sortedRounds.length

  function toggleTeam(teamId: string) {
    setExpandedTeamId(prev => prev === teamId ? null : teamId)
  }

  return (
    <>
      <div className="border border-[#1e3d28]">
        {/* Sticky column headers */}
        <div className="sticky top-[85px] z-10 grid grid-cols-[20px_1fr_44px_44px_44px_60px] gap-x-2 items-center px-3 py-1 bg-[#0a1a0e] border-b border-[#1e3d28]">
          <span className="text-[10px] tracking-widest uppercase text-white/30">Pos</span>
          <span className="text-[10px] tracking-widest uppercase text-white/30">Team</span>
          {[1, 2, 3].map(n => (
            <span key={n} className="text-xs text-white/30 text-center tabular-nums">{n}</span>
          ))}
          <span className="text-[10px] tracking-widest uppercase text-white/30 text-right">Tot</span>
        </div>

        {/* Team rows */}
        {rows.map(({ team, roundPts, total, roundsWithScores }, i) => {
          const isExpanded = expandedTeamId === team.id
          const isLast     = i === rows.length - 1
          const members    = sortedPlayers(team.players)

          return (
            <Fragment key={team.id}>
              <button
                onClick={() => toggleTeam(team.id)}
                className={`w-full grid grid-cols-[20px_1fr_44px_44px_44px_60px] gap-x-2 items-center px-3 py-1 text-left active:bg-white/5 transition-colors
                  ${!isLast || isExpanded ? "border-b border-[#1e3d28]" : ""}`}
              >
                {/* Pos */}
                <span className="text-white/40 text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>

                {/* Team name + member names (single row) */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                    <span className="font-[family-name:var(--font-playfair)] text-base text-white truncate">
                      {team.name}
                    </span>
                  </div>
                  <p className="text-white/30 text-xs pl-3.5 truncate leading-snug">
                    {members.map(p => displayName(p)).join(", ")}
                  </p>
                </div>

                {/* Per-round points */}
                {[1, 2, 3].map(n => {
                  const pts = roundPts[n] ?? 0
                  return (
                    <span key={n} className={`text-center tabular-nums text-2xl font-semibold ${pts > 0 ? "text-white/70" : "text-white/20"}`}>
                      {pts > 0 ? pts : "—"}
                    </span>
                  )
                })}

                {/* Total */}
                <span className={`text-right tabular-nums font-bold ${total > 0 ? "text-2xl text-[#C9A84C]" : "text-lg text-white/20"}`}>
                  {total > 0 ? total : "—"}
                </span>
              </button>

              {isExpanded && (
                <div className={!isLast ? "border-b border-[#1e3d28]" : ""}>
                  <CourseTiles
                    team={team}
                    rounds={sortedRounds}
                    holes={holes}
                    scores={scores}
                    roundHandicaps={roundHandicaps}
                    onTileClick={round => setModal({ team, round })}
                  />
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      {/* Scorecard modal */}
      {modal && (
        <ScorecardModal
          team={modal.team}
          round={modal.round}
          holes={holes}
          scores={scores}
          roundHandicaps={roundHandicaps}
          compositeHoles={compositeHoles}
          allTeams={teams}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
