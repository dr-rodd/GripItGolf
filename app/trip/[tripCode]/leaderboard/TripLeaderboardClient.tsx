'use client'

import { useMemo, useState } from 'react'
import { enabledFormats, type FormatKey, type TripFormats } from '@/lib/formats'
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
  formats: TripFormats
  teamScoring: TeamScoring
  rounds: Round[]
  teams: Team[]
  players: Player[]
  holes: Hole[]
  scores: Score[]
  liveScores: LiveScore[]
  roundHandicaps: RoundHcp[]
}

// A score resolved for one player on one hole of one round, from either
// the committed `scores` table or an in-progress `live_scores` row.
type ResolvedScore = {
  playerId: string
  roundId: string
  holeId: string
  holeNumber: number
  gross: number | null
  points: number
  noReturn: boolean
}

// ─── Scoring helpers ───────────────────────────────────────────

// Canonical rule: FLOOR(PH / 18) + 1 if the hole's stroke index falls
// within the remainder.
function shotsReceived(playingHandicap: number, strokeIndex: number) {
  const whole = Math.floor(playingHandicap / 18)
  const remainder = Math.round(playingHandicap) % 18
  return whole + (strokeIndex <= remainder ? 1 : 0)
}

// Female players use ladies par / stroke index on any course that defines them
function effectivePar(hole: Hole, gender: string) {
  return gender === 'F' && hole.par_ladies != null ? hole.par_ladies : hole.par
}
function effectiveSI(hole: Hole, gender: string) {
  return gender === 'F' && hole.stroke_index_ladies != null ? hole.stroke_index_ladies : hole.stroke_index
}

// ─── Shared UI ─────────────────────────────────────────────────

const CARD = 'border border-white/10 rounded-xl overflow-hidden'

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-white/30 text-sm">{message}</p>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const gold = rank === 1
  return (
    <span
      className={`w-7 flex-shrink-0 font-[family-name:var(--font-playfair)] text-lg leading-none tabular-nums ${
        gold ? 'text-[#C9A84C]' : 'text-white/30'
      }`}
    >
      {rank}
    </span>
  )
}

function LiveDot() {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0 animate-pulse"
      title="Round in progress"
    />
  )
}

// ─── Component ─────────────────────────────────────────────────

export default function TripLeaderboardClient({
  formats, teamScoring, rounds, teams, players, holes, scores, liveScores, roundHandicaps,
}: Props) {
  const tabs = enabledFormats(formats)
  const [active, setActive] = useState<FormatKey>(tabs[0]?.key ?? 'individual_stableford')
  const [roundFilter, setRoundFilter] = useState<string>('all')

  const playerById = useMemo(
    () => new Map(players.map(p => [p.id, p])),
    [players]
  )

  // ── Merge committed + in-progress scores ────────────────────
  // A committed score always wins over a live one for the same hole.

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

    // Live scores need a hole_id, which depends on which course the round used
    const courseByRound = new Map(rounds.map(r => [r.id, r.courses?.id ?? '']))
    const holeByCourseAndNumber = new Map(
      holes.map(h => [`${h.course_id}:${h.hole_number}`, h])
    )

    for (const ls of liveScores) {
      const key = `${ls.player_id}:${ls.round_id}:${ls.hole_number}`
      if (seen.has(key)) continue
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

  // Rounds in play right now (have live scores not yet committed)
  const liveRoundIds = useMemo(
    () => new Set(liveScores.map(ls => ls.round_id)),
    [liveScores]
  )

  const visibleRounds = roundFilter === 'all'
    ? rounds
    : rounds.filter(r => r.id === roundFilter)
  const visibleRoundIds = new Set(visibleRounds.map(r => r.id))

  const inScope = useMemo(
    () => resolved.filter(s => visibleRoundIds.has(s.roundId)),
    [resolved, roundFilter] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const hcpFor = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of roundHandicaps) m.set(`${h.round_id}:${h.player_id}`, h.playing_handicap)
    return m
  }, [roundHandicaps])

  // ── Individual Stableford ───────────────────────────────────

  const stablefordRows = useMemo(() => {
    return players
      .map(p => {
        const mine = inScope.filter(s => s.playerId === p.id)
        const points = mine.reduce((sum, s) => sum + s.points, 0)
        return {
          player: p,
          points,
          holesPlayed: mine.length,
          isLive: mine.some(s => liveRoundIds.has(s.roundId)),
        }
      })
      .filter(r => r.holesPlayed > 0)
      .sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name))
  }, [players, inScope, liveRoundIds])

  // ── Individual Strokeplay ───────────────────────────────────

  const strokeRows = useMemo(() => {
    return players
      .map(p => {
        const mine = inScope.filter(s => s.playerId === p.id && s.gross != null)
        const gross = mine.reduce((sum, s) => sum + (s.gross ?? 0), 0)
        // Nett = gross minus shots received on the holes actually played
        const holeById = new Map(holes.map(h => [h.id, h]))
        const shots = mine.reduce((sum, s) => {
          const hole = holeById.get(s.holeId)
          if (!hole) return sum
          const ph = hcpFor.get(`${s.roundId}:${p.id}`) ?? p.handicap ?? 0
          return sum + shotsReceived(ph, effectiveSI(hole, p.gender))
        }, 0)
        const par = mine.reduce((sum, s) => {
          const hole = holeById.get(s.holeId)
          return sum + (hole ? effectivePar(hole, p.gender) : 0)
        }, 0)
        return {
          player: p,
          gross,
          nett: gross - shots,
          par,
          holesPlayed: mine.length,
          isLive: mine.some(s => liveRoundIds.has(s.roundId)),
        }
      })
      .filter(r => r.holesPlayed > 0)
      .sort((a, b) => a.nett - b.nett || a.gross - b.gross)
  }, [players, inScope, holes, hcpFor, liveRoundIds])

  // ── Individual Matchplay (round robin) ──────────────────────
  // Every player meets every other player in each round. Holes are
  // decided on nett score; the player who wins more holes takes the
  // match (1pt), all square is a half.

  const matchplayRows = useMemo(() => {
    const holeById = new Map(holes.map(h => [h.id, h]))
    const tally = new Map<string, { pts: number; won: number; lost: number; halved: number }>()
    for (const p of players) tally.set(p.id, { pts: 0, won: 0, lost: 0, halved: 0 })

    // Index nett score by player:round:hole
    const nettBy = new Map<string, number>()
    for (const s of inScope) {
      if (s.gross == null) continue
      const hole = holeById.get(s.holeId)
      const player = playerById.get(s.playerId)
      if (!hole || !player) continue
      const ph = hcpFor.get(`${s.roundId}:${s.playerId}`) ?? player.handicap ?? 0
      nettBy.set(
        `${s.playerId}:${s.roundId}:${s.holeNumber}`,
        s.gross - shotsReceived(ph, effectiveSI(hole, player.gender))
      )
    }

    for (const round of visibleRounds) {
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const a = players[i], b = players[j]
          let aUp = 0, bUp = 0, contested = 0

          for (let hole = 1; hole <= 18; hole++) {
            const an = nettBy.get(`${a.id}:${round.id}:${hole}`)
            const bn = nettBy.get(`${b.id}:${round.id}:${hole}`)
            if (an == null || bn == null) continue
            contested++
            if (an < bn) aUp++
            else if (bn < an) bUp++
          }

          if (contested === 0) continue
          const ta = tally.get(a.id)!, tb = tally.get(b.id)!
          if (aUp > bUp)      { ta.pts += 1;   ta.won++;    tb.lost++ }
          else if (bUp > aUp) { tb.pts += 1;   tb.won++;    ta.lost++ }
          else                { ta.pts += 0.5; tb.pts += 0.5; ta.halved++; tb.halved++ }
        }
      }
    }

    return players
      .map(p => ({ player: p, ...tally.get(p.id)! }))
      .filter(r => r.won + r.lost + r.halved > 0)
      .sort((a, b) => b.pts - a.pts || b.won - a.won || a.player.name.localeCompare(b.player.name))
  }, [players, visibleRounds, inScope, holes, hcpFor, playerById])

  // ── Teams ───────────────────────────────────────────────────
  // Points per round come from the trip's chosen mode: hero,
  // better ball, or aggregate.

  const teamRows = useMemo(() => {
    return teams
      .map(team => {
        const members   = players.filter(p => p.team_id === team.id)
        const memberIds = members.map(m => m.id)

        const perRound = visibleRounds.map(round => ({
          round,
          ...teamRoundPoints(memberIds, round.id, inScope, teamScoring),
        }))

        return {
          team,
          members,
          perRound: perRound.filter(r => r.played),
          points: perRound.reduce((sum, r) => sum + r.points, 0),
          isLive: members.some(m =>
            inScope.some(s => s.playerId === m.id && liveRoundIds.has(s.roundId))
          ),
        }
      })
      .filter(r => r.members.length > 0)
      .sort((a, b) => b.points - a.points || a.team.name.localeCompare(b.team.name))
  }, [teams, players, visibleRounds, inScope, liveRoundIds, teamScoring])

  // ── Render ──────────────────────────────────────────────────

  if (tabs.length === 0) {
    return <EmptyState message="No competitions switched on for this trip." />
  }

  const relativeToLevel = (points: number, holesPlayed: number) => {
    const diff = points - holesPlayed * 2
    if (diff === 0) return 'E'
    return diff > 0 ? `+${diff}` : `${diff}`
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Format tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1.5 mb-5 overflow-x-auto -mx-1 px-1 pb-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs tracking-[0.15em] uppercase transition-colors ${
                active === t.key
                  ? 'bg-[#C9A84C] text-[#0a1a0e] font-bold'
                  : 'bg-white/5 border border-white/10 text-white/50 hover:text-white/80'
              }`}
            >
              {t.tabLabel}
            </button>
          ))}
        </div>
      )}

      {/* Round filter */}
      {rounds.length > 1 && (
        <div className="flex gap-1.5 mb-5 overflow-x-auto -mx-1 px-1 pb-1">
          <button
            onClick={() => setRoundFilter('all')}
            className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs transition-colors ${
              roundFilter === 'all'
                ? 'bg-white/15 text-white'
                : 'bg-white/5 text-white/40 hover:text-white/70'
            }`}
          >
            Overall
          </button>
          {rounds.map(r => (
            <button
              key={r.id}
              onClick={() => setRoundFilter(r.id)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                roundFilter === r.id
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-white/40 hover:text-white/70'
              }`}
            >
              R{r.round_number}
              {liveRoundIds.has(r.id) && <LiveDot />}
            </button>
          ))}
        </div>
      )}

      {/* ── Individual Stableford ── */}
      {active === 'individual_stableford' && (
        stablefordRows.length === 0
          ? <EmptyState message="No scores yet. The board fills in as play starts." />
          : (
            <div className={CARD}>
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <span className="w-7 flex-shrink-0" />
                <span className="flex-1 text-white/30 text-[10px] tracking-[0.2em] uppercase">Player</span>
                <span className="w-12 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">Thru</span>
                <span className="w-14 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">Pts</span>
              </div>
              {stablefordRows.map((row, i) => (
                <div
                  key={row.player.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i > 0 ? 'border-t border-white/[0.06]' : ''
                  } ${i === 0 ? 'bg-[#C9A84C]/[0.06]' : ''}`}
                >
                  <RankBadge rank={i + 1} />
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-white text-sm truncate">{row.player.name}</span>
                    {row.isLive && <LiveDot />}
                  </span>
                  <span className="w-12 text-right text-white/35 text-xs tabular-nums">
                    {row.holesPlayed}
                  </span>
                  <span className="w-14 text-right">
                    <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-xl leading-none tabular-nums">
                      {row.points}
                    </span>
                    <span className="block text-white/25 text-[10px] tabular-nums mt-0.5">
                      {relativeToLevel(row.points, row.holesPlayed)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )
      )}

      {/* ── Individual Strokeplay ── */}
      {active === 'individual_strokes' && (
        strokeRows.length === 0
          ? <EmptyState message="No scores yet. The board fills in as play starts." />
          : (
            <div className={CARD}>
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <span className="w-7 flex-shrink-0" />
                <span className="flex-1 text-white/30 text-[10px] tracking-[0.2em] uppercase">Player</span>
                <span className="w-12 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">Thru</span>
                <span className="w-12 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">Gross</span>
                <span className="w-12 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">Nett</span>
              </div>
              {strokeRows.map((row, i) => (
                <div
                  key={row.player.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i > 0 ? 'border-t border-white/[0.06]' : ''
                  } ${i === 0 ? 'bg-[#C9A84C]/[0.06]' : ''}`}
                >
                  <RankBadge rank={i + 1} />
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-white text-sm truncate">{row.player.name}</span>
                    {row.isLive && <LiveDot />}
                  </span>
                  <span className="w-12 text-right text-white/35 text-xs tabular-nums">
                    {row.holesPlayed}
                  </span>
                  <span className="w-12 text-right text-white/60 text-sm tabular-nums">
                    {row.gross}
                  </span>
                  <span className="w-12 text-right font-[family-name:var(--font-playfair)] text-[#C9A84C] text-xl leading-none tabular-nums">
                    {row.nett}
                  </span>
                </div>
              ))}
            </div>
          )
      )}

      {/* ── Individual Matchplay ── */}
      {active === 'individual_matchplay' && (
        matchplayRows.length === 0
          ? <EmptyState message="Matches settle once two players have scored the same holes." />
          : (
            <>
              <p className="text-white/30 text-xs mb-3 leading-relaxed">
                Every player meets every other player each round. Holes are decided on
                nett score — win a match for 1 point, halve it for ½.
              </p>
              <div className={CARD}>
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                  <span className="w-7 flex-shrink-0" />
                  <span className="flex-1 text-white/30 text-[10px] tracking-[0.2em] uppercase">Player</span>
                  <span className="w-20 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">W–H–L</span>
                  <span className="w-12 text-right text-white/30 text-[10px] tracking-[0.2em] uppercase">Pts</span>
                </div>
                {matchplayRows.map((row, i) => (
                  <div
                    key={row.player.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${
                      i > 0 ? 'border-t border-white/[0.06]' : ''
                    } ${i === 0 ? 'bg-[#C9A84C]/[0.06]' : ''}`}
                  >
                    <RankBadge rank={i + 1} />
                    <span className="flex-1 min-w-0 text-white text-sm truncate">
                      {row.player.name}
                    </span>
                    <span className="w-20 text-right text-white/35 text-xs tabular-nums">
                      {row.won}–{row.halved}–{row.lost}
                    </span>
                    <span className="w-12 text-right font-[family-name:var(--font-playfair)] text-[#C9A84C] text-xl leading-none tabular-nums">
                      {row.pts % 1 === 0 ? row.pts : row.pts.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )
      )}

      {/* ── Teams ── */}
      {active === 'teams' && (
        teamRows.length === 0
          ? <EmptyState message="No teams with players yet. Set them up in Trip Setup." />
          : (
            <>
              <p className="text-white/30 text-xs mb-3">
                {describeTeamScoring(teamScoring)}.
              </p>
              <div className="space-y-3">
                {teamRows.map((row, i) => (
                  <div key={row.team.id} className={CARD}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3.5 ${
                        i === 0 ? 'bg-[#C9A84C]/[0.06]' : ''
                      }`}
                    >
                      <RankBadge rank={i + 1} />
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: row.team.color }}
                      />
                      <span className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">
                          {row.team.name}
                        </span>
                        {row.isLive && <LiveDot />}
                      </span>
                      <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-2xl leading-none tabular-nums">
                        {row.points}
                      </span>
                    </div>

                    {/* Per-course contribution */}
                    {row.perRound.length > 0 && (
                      <div className="border-t border-white/[0.06]">
                        {row.perRound.map(r => {
                          const hero = r.heroPlayerId
                            ? playerById.get(r.heroPlayerId)?.name.split(' ')[0]
                            : null
                          return (
                            <div
                              key={r.roundId}
                              className="flex items-center gap-3 px-4 py-2 text-xs"
                            >
                              <span className="text-white/25 w-6 flex-shrink-0 tabular-nums">
                                R{r.round.round_number}
                              </span>
                              <span className="flex-1 min-w-0 text-white/40 truncate">
                                {r.round.courses?.name ?? '—'}
                                {hero && (
                                  <span className="text-[#C9A84C]/70"> · {hero}</span>
                                )}
                              </span>
                              <span className="text-white/60 tabular-nums flex-shrink-0">
                                {r.points}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Squad */}
                    <div className="px-4 py-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/[0.06]">
                      {row.members.map(m => {
                        const pts = inScope
                          .filter(s => s.playerId === m.id)
                          .reduce((sum, s) => sum + s.points, 0)
                        return (
                          <span key={m.id} className="text-white/40 text-xs">
                            {m.name.split(' ')[0]}{' '}
                            <span className="text-white/60 tabular-nums">{pts}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
      )}
    </div>
  )
}
