"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import BackButton from "@/app/components/BackButton"

// ─── Types ────────────────────────────────────────────────

interface Player {
  id: string
  name: string
  role: string
  handicap: number
  gender: string
  is_composite: boolean
  teams: { name: string; color: string } | null
}

interface Round {
  id: string
  round_number: number
  status: string
  courses: { id: string; name: string } | null
}

interface Hole {
  id: string
  hole_number: number
  par: number
  stroke_index: number
  course_id: string
  par_ladies?: number
  stroke_index_ladies?: number
  yardage_black?: number
  yardage_blue?: number
  yardage_white?: number
  yardage_red?: number
  yardage_sandstone?: number
  yardage_slate?: number
  yardage_granite?: number
  yardage_claret?: number
}

interface Tee {
  id: string
  course_id: string
  name: string
  gender: string
  par: number
  course_rating: number
  slope: number
}

interface RoundHandicap {
  round_id: string
  player_id: string
  playing_handicap: number
}

interface Props {
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  tees: Tee[]
  roundHandicaps: RoundHandicap[]
}

// ─── Helpers ──────────────────────────────────────────────

const ST_PATRICKS_COURSE_ID = "11111111-0000-0000-0000-000000000003"

function calcPlayingHandicap(hcpIndex: number, slope: number, courseRating: number, par: number) {
  return Math.round(hcpIndex * (slope / 113) + (courseRating - par))
}

function shotsReceived(si: number, playingHcp: number) {
  return Math.floor(playingHcp / 18) + (si <= playingHcp % 18 ? 1 : 0)
}

function calcStableford(gross: number, par: number, si: number, playingHcp: number) {
  return Math.max(0, par + 2 - (gross - shotsReceived(si, playingHcp)))
}
function nrGross(par: number, si: number, playingHcp: number) {
  return par + 2 + shotsReceived(si, playingHcp)
}

function effectivePar(hole: Hole, gender: string, courseId: string) {
  if (gender === "F" && courseId === ST_PATRICKS_COURSE_ID && hole.par_ladies) {
    return hole.par_ladies
  }
  return hole.par
}

function effectiveSI(hole: Hole, gender: string, courseId: string) {
  if (gender === "F" && courseId === ST_PATRICKS_COURSE_ID && hole.stroke_index_ladies) {
    return hole.stroke_index_ladies
  }
  return hole.stroke_index
}

function yardageForTee(hole: Hole, teeName: string): number | null {
  const key = `yardage_${teeName.toLowerCase()}` as keyof Hole
  return (hole[key] as number | undefined) ?? null
}

const TEE_STYLES: Record<string, { dot: string; active: string }> = {
  Black:     { dot: "bg-zinc-300",  active: "border-zinc-300 text-zinc-200" },
  Blue:      { dot: "bg-blue-400",  active: "border-blue-400 text-blue-300" },
  White:     { dot: "bg-white",     active: "border-white text-white" },
  Red:       { dot: "bg-red-500",   active: "border-red-400 text-red-300" },
  Yellow:    { dot: "bg-yellow-400",active: "border-yellow-400 text-yellow-300" },
  Sandstone: { dot: "bg-amber-300", active: "border-amber-300 text-amber-200" },
  Slate:     { dot: "bg-slate-400", active: "border-slate-400 text-slate-300" },
  Granite:   { dot: "bg-stone-400", active: "border-stone-400 text-stone-300" },
  Claret:    { dot: "bg-rose-800",  active: "border-rose-700 text-rose-300" },
}

// ─── HoleScore per player ─────────────────────────────────

interface HoleScore {
  gross: number | null
  fairway: "left" | "fairway" | "right" | null
  putts: number | null
  stableford: number | null
}

// ─── PlayerSetup: info needed per player in live round ────

interface PlayerSetup {
  player: Player
  tee: Tee
  playingHcp: number
}

// ─── Main component ───────────────────────────────────────

type Tab = "entry" | "leaderboard"
type EntryStep = "mode" | "setup" | "holes" | "confirm" | "committed"
type EntryMode = "solo" | "group"

export default function LiveClient({ players, rounds, holes, tees, roundHandicaps }: Props) {
  const [tab, setTab] = useState<Tab>("entry")
  const realPlayers = players.filter(p => !p.is_composite)

  return (
    <div className="flex flex-col min-h-[calc(100dvh-57px)]">
      {/* Tab bar */}
      <div className="border-b border-[#1e3d28] bg-[#0a1a0e]">
        <div className="max-w-lg mx-auto flex">
          {(["entry", "leaderboard"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm tracking-[0.2em] uppercase transition-colors
                ${tab === t
                  ? "text-[#C9A84C] border-b-2 border-[#C9A84C]"
                  : "text-white/40 hover:text-white/70"}`}
            >
              {t === "entry" ? "Score Entry" : "Live Leaderboard"}
            </button>
          ))}
        </div>
      </div>

      {tab === "entry" ? (
        <EntryFlow
          players={realPlayers}
          rounds={rounds}
          holes={holes}
          tees={tees}
          roundHandicaps={roundHandicaps}
        />
      ) : (
        <LiveLeaderboard
          players={realPlayers}
          rounds={rounds}
          holes={holes}
          roundHandicaps={roundHandicaps}
        />
      )}
    </div>
  )
}

// ─── Entry flow ───────────────────────────────────────────

function EntryFlow({ players, rounds, holes, tees, roundHandicaps }: {
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  tees: Tee[]
  roundHandicaps: RoundHandicap[]
}) {
  const [step, setStep] = useState<EntryStep>("mode")
  const [mode, setMode] = useState<EntryMode>("solo")

  // Setup state
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [selectedTeeId, setSelectedTeeId] = useState<string>("")

  // Hole-by-hole state: holeIdx → playerId → HoleScore
  const [scores, setScores] = useState<Record<number, Record<string, HoleScore>>>({})
  const [holeIdx, setHoleIdx] = useState(0) // 0-17
  const [saving, setSaving] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const availableRounds = rounds.filter(r => r.status === "upcoming" || r.status === "active")

  // Derived
  const selectedTee = tees.find(t => t.id === selectedTeeId) ?? null
  const setupPlayers = selectedPlayerIds
    .map(id => players.find(p => p.id === id)!)
    .filter(Boolean)

  // Round's course holes
  const courseHoles = selectedRound
    ? holes.filter(h => h.course_id === selectedRound.courses?.id).sort((a, b) => a.hole_number - b.hole_number)
    : []

  // Player setups (player + tee + playing handicap)
  const playerSetups: PlayerSetup[] = setupPlayers.map(player => {
    // Try existing round_handicap first
    const existingHcp = selectedRound
      ? roundHandicaps.find(rh => rh.round_id === selectedRound.id && rh.player_id === player.id)
      : null
    const playingHcp = existingHcp
      ? existingHcp.playing_handicap
      : selectedTee
        ? calcPlayingHandicap(player.handicap, selectedTee.slope, selectedTee.course_rating, selectedTee.par)
        : Math.round(player.handicap)
    return { player, tee: selectedTee!, playingHcp }
  })

  function resetFlow() {
    setStep("mode")
    setSelectedRound(null)
    setSelectedPlayerIds([])
    setSelectedTeeId("")
    setScores({})
    setHoleIdx(0)
    setSaving(false)
    setCommitError(null)
  }

  function handleModeSelect(m: EntryMode) {
    setMode(m)
    if (availableRounds.length === 1) setSelectedRound(availableRounds[0])
    setStep("setup")
  }

  function handleSetupStart() {
    setScores({})
    setHoleIdx(0)
    setStep("holes")
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  function handleHoleSubmit(hIdx: number, holeScores: Record<string, HoleScore>) {
    setScores(prev => ({ ...prev, [hIdx]: holeScores }))
    if (hIdx < courseHoles.length - 1) {
      setHoleIdx(hIdx + 1)
      window.scrollTo({ top: 0, behavior: "instant" })
    } else {
      setStep("confirm")
      window.scrollTo({ top: 0, behavior: "instant" })
    }
  }

  function handleHoleBack(hIdx: number) {
    if (hIdx === 0) {
      setStep("setup")
    } else {
      setHoleIdx(hIdx - 1)
    }
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  async function handleCommit() {
    if (!selectedRound || courseHoles.length === 0) return
    setSaving(true)
    setCommitError(null)

    try {
      // 1. Upsert round_handicaps for each player
      await Promise.all(
        playerSetups.map(({ player, playingHcp }) =>
          supabase.from("round_handicaps").upsert(
            { round_id: selectedRound.id, player_id: player.id, playing_handicap: playingHcp },
            { onConflict: "round_id,player_id" }
          )
        )
      )

      // 2. Upsert scores — every hole for every player; missing/blank → NR
      const courseId = selectedRound.courses?.id ?? ""
      const scoreRows: any[] = []
      for (const [hIdx, hole] of courseHoles.entries()) {
        for (const { player, playingHcp } of playerSetups) {
          const hs = scores[hIdx]?.[player.id]
          const noReturn = hs?.gross == null
          const p = effectivePar(hole, player.gender, courseId)
          const si = effectiveSI(hole, player.gender, courseId)
          scoreRows.push({
            player_id: player.id,
            hole_id: hole.id,
            round_id: selectedRound.id,
            gross_score: noReturn ? nrGross(p, si, playingHcp) : hs!.gross!,
            no_return: noReturn,
          })
        }
      }

      if (scoreRows.length > 0) {
        const { error } = await supabase.from("scores").upsert(scoreRows, {
          onConflict: "player_id,hole_id,round_id",
        })
        if (error) throw error
      }

      // 3. Mark live_scores as committed
      await supabase
        .from("live_scores")
        .update({ committed: true })
        .in("player_id", setupPlayers.map(p => p.id))
        .eq("round_id", selectedRound.id)

      setStep("committed")
    } catch (e: any) {
      setCommitError(e?.message ?? "Failed to commit scores")
    } finally {
      setSaving(false)
    }
  }

  // ─── Mode selection ──────────────────────────────────────

  if (step === "mode") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 py-12">
        <div className="text-center mb-4">
          <p className="text-white/40 text-sm tracking-[0.2em] uppercase mb-2">Entry Mode</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-white">How are you playing?</h2>
        </div>
        <button
          onClick={() => handleModeSelect("solo")}
          className="w-full max-w-xs py-5 border border-[#C9A84C]/50 text-[#C9A84C] tracking-[0.2em] uppercase text-base hover:bg-[#C9A84C]/10 transition-colors"
        >
          Solo
          <div className="text-xs text-white/40 normal-case tracking-normal mt-1">Enter your own round</div>
        </button>
        <button
          onClick={() => handleModeSelect("group")}
          className="w-full max-w-xs py-5 border border-white/20 text-white/60 tracking-[0.2em] uppercase text-base hover:border-white/40 hover:text-white/80 transition-colors"
        >
          Group
          <div className="text-xs text-white/40 normal-case tracking-normal mt-1">Enter 2–4 players together</div>
        </button>
      </div>
    )
  }

  // ─── Setup ───────────────────────────────────────────────

  if (step === "setup") {
    const courseTees = selectedRound
      ? tees.filter(t => t.course_id === selectedRound.courses?.id)
      : []

    const canStart = selectedRound !== null &&
      selectedPlayerIds.length >= 1 &&
      selectedTeeId !== ""

    return (
      <div className="max-w-lg mx-auto w-full px-4 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => setStep("mode")} />
          <span className="text-white/20 text-sm">|</span>
          <span className="text-white/40 text-sm tracking-[0.2em] uppercase">
            {mode === "solo" ? "Solo Entry" : "Group Entry"}
          </span>
        </div>

        {/* Round selection (if multiple available) */}
        {availableRounds.length > 1 && (
          <div>
            <label className="block text-white/50 text-sm tracking-[0.15em] uppercase mb-2">Round</label>
            <div className="flex flex-col gap-2">
              {availableRounds.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRound(r); setSelectedTeeId("") }}
                  className={`w-full text-left px-4 py-3 border text-base transition-colors
                    ${selectedRound?.id === r.id
                      ? "border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10"
                      : "border-white/20 text-white/60 hover:border-white/40"}`}
                >
                  Round {r.round_number} — {r.courses?.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedRound && (
          <>
            {/* Tee selection */}
            <div>
              <label className="block text-white/50 text-sm tracking-[0.15em] uppercase mb-2">Tee</label>
              <div className="flex flex-wrap gap-2">
                {courseTees.map(t => {
                  const style = TEE_STYLES[t.name] ?? { dot: "bg-white/40", active: "border-white/40 text-white/60" }
                  const isActive = selectedTeeId === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTeeId(t.id)}
                      className={`flex items-center gap-2 px-3 py-2 border text-sm tracking-wider uppercase transition-colors
                        ${isActive ? style.active + " bg-white/5" : "border-white/20 text-white/50 hover:border-white/40"}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Player selection */}
            <div>
              <label className="block text-white/50 text-sm tracking-[0.15em] uppercase mb-2">
                {mode === "solo" ? "Player" : "Players (2–4)"}
              </label>
              <div className="flex flex-col gap-2">
                {players.map(p => {
                  const isSelected = selectedPlayerIds.includes(p.id)
                  const canToggle = !isSelected || selectedPlayerIds.length > 1
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (mode === "solo") {
                          setSelectedPlayerIds([p.id])
                        } else {
                          if (isSelected) {
                            if (canToggle) setSelectedPlayerIds(prev => prev.filter(id => id !== p.id))
                          } else if (selectedPlayerIds.length < 4) {
                            setSelectedPlayerIds(prev => [...prev, p.id])
                          }
                        }
                      }}
                      className={`flex items-center justify-between px-4 py-3 border text-base transition-colors
                        ${isSelected
                          ? "border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10"
                          : "border-white/20 text-white/60 hover:border-white/40"}`}
                    >
                      <div className="flex items-center gap-2">
                        {p.teams && (
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.teams.color }} />
                        )}
                        <span>{p.name}</span>
                      </div>
                      <span className="text-sm opacity-50">HCP {p.handicap}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <button
          onClick={handleSetupStart}
          disabled={!canStart}
          className={`w-full py-4 text-base tracking-[0.2em] uppercase transition-colors mt-2
            ${canStart
              ? "bg-[#C9A84C] text-black hover:bg-[#d4b05a]"
              : "bg-white/10 text-white/30 cursor-not-allowed"}`}
        >
          Start Round →
        </button>

      </div>
    )
  }

  // ─── Hole by hole ─────────────────────────────────────────

  if (step === "holes" && courseHoles.length > 0) {
    const hole = courseHoles[holeIdx]
    const existingScores = scores[holeIdx] ?? {}

    return (
      <HoleCard
        hole={hole}
        holeIdx={holeIdx}
        totalHoles={courseHoles.length}
        playerSetups={playerSetups}
        courseId={selectedRound?.courses?.id ?? ""}
        teeName={selectedTee?.name ?? ""}
        existingScores={existingScores}
        roundId={selectedRound?.id ?? ""}
        onSubmit={(hs) => handleHoleSubmit(holeIdx, hs)}
        onBack={() => handleHoleBack(holeIdx)}
      />
    )
  }

  // ─── Confirm commit ───────────────────────────────────────

  if (step === "confirm") {
    const totalPts = playerSetups.map(({ player, playingHcp }) => {
      let pts = 0
      for (const [hIdxStr, holeScores] of Object.entries(scores)) {
        const hIdx = Number(hIdxStr)
        const hole = courseHoles[hIdx]
        if (!hole) continue
        const hs = holeScores[player.id]
        if (hs?.gross !== null && hs?.gross !== undefined) {
          pts += calcStableford(
            hs.gross,
            effectivePar(hole, player.gender, selectedRound?.courses?.id ?? ""),
            effectiveSI(hole, player.gender, selectedRound?.courses?.id ?? ""),
            playingHcp
          )
        }
      }
      return { player, pts }
    })

    return (
      <div className="max-w-lg mx-auto w-full px-4 py-8 flex flex-col gap-6">
        <div className="text-center">
          <div className="text-[#C9A84C] text-sm tracking-[0.2em] uppercase mb-2">Round Complete</div>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-white mb-1">
            Commit to Leaderboard?
          </h2>
          <p className="text-white/40 text-base">
            This will save scores as official. You can still edit them later via Score Entry.
          </p>
        </div>

        {/* Summary */}
        <div className="border border-[#1e3d28] divide-y divide-[#1e3d28]">
          {totalPts.map(({ player, pts }) => (
            <div key={player.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {player.teams && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: player.teams.color }} />
                )}
                <span className="text-base text-white/80">{player.name}</span>
              </div>
              <div className="text-right">
                <span className="text-[#C9A84C] font-bold text-xl">{pts}</span>
                <span className="text-white/40 text-sm ml-1">pts</span>
              </div>
            </div>
          ))}
          <div className="px-4 py-2 text-sm text-white/30">
            {Object.keys(scores).length} of {courseHoles.length} holes entered
          </div>
        </div>

        {commitError && (
          <div className="text-red-400 text-base text-center">{commitError}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { setStep("holes"); setHoleIdx(courseHoles.length - 1) }}
            className="flex-1 py-4 border border-white/20 text-white/60 text-base tracking-[0.15em] uppercase hover:border-white/40 transition-colors"
          >
            ← Review
          </button>
          <button
            onClick={handleCommit}
            disabled={saving}
            className="flex-[2] py-4 bg-[#C9A84C] text-black text-base tracking-[0.2em] uppercase font-bold hover:bg-[#d4b05a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Commit Scores"}
          </button>
        </div>

        <button
          onClick={resetFlow}
          className="text-center text-white/30 text-sm tracking-widest uppercase hover:text-white/50 transition-colors"
        >
          Discard & Start Over
        </button>
      </div>
    )
  }

  // ─── Committed ────────────────────────────────────────────

  if (step === "committed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C] text-3xl">
          ✓
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-white mb-2">Scores Committed</h2>
          <p className="text-white/40 text-base">Scores have been saved to the official leaderboard.</p>
        </div>
        <button
          onClick={resetFlow}
          className="mt-4 px-8 py-3 border border-[#C9A84C]/50 text-[#C9A84C] text-sm tracking-[0.2em] uppercase hover:bg-[#C9A84C]/10 transition-colors"
        >
          New Round
        </button>
      </div>
    )
  }

  return null
}

// ─── HoleCard ────────────────────────────────────────────

interface HoleCardProps {
  hole: Hole
  holeIdx: number
  totalHoles: number
  playerSetups: PlayerSetup[]
  courseId: string
  teeName: string
  existingScores: Record<string, HoleScore>
  roundId: string
  onSubmit: (scores: Record<string, HoleScore>) => void
  onBack: () => void
}

function HoleCard({
  hole, holeIdx, totalHoles, playerSetups, courseId, teeName,
  existingScores, roundId, onSubmit, onBack
}: HoleCardProps) {
  const [holeScores, setHoleScores] = useState<Record<string, HoleScore>>(() => {
    const init: Record<string, HoleScore> = {}
    for (const { player } of playerSetups) {
      init[player.id] = existingScores[player.id] ?? { gross: null, fairway: null, putts: null, stableford: null }
    }
    return init
  })
  const [saving, setSaving] = useState(false)

  // Reset when hole changes
  useEffect(() => {
    const init: Record<string, HoleScore> = {}
    for (const { player } of playerSetups) {
      init[player.id] = existingScores[player.id] ?? { gross: null, fairway: null, putts: null, stableford: null }
    }
    setHoleScores(init)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeIdx])

  const par = effectivePar(hole, playerSetups[0]?.player.gender ?? "M", courseId)
  const yardage = yardageForTee(hole, teeName)
  const allHaveGross = playerSetups.every(({ player }) => holeScores[player.id]?.gross !== null)

  function setPlayerScore(playerId: string, update: Partial<HoleScore>) {
    setHoleScores(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], ...update }
    }))
  }

  async function handleNext() {
    setSaving(true)
    // Save to live_scores
    try {
      const rows = playerSetups
        .map(({ player, playingHcp }) => {
          const hs = holeScores[player.id]
          if (hs.gross === null) return null
          const p = effectivePar(hole, player.gender, courseId)
          const si = effectiveSI(hole, player.gender, courseId)
          const stableford = calcStableford(hs.gross, p, si, playingHcp)
          return {
            player_id: player.id,
            round_id: roundId,
            hole_number: hole.hole_number,
            gross_score: hs.gross,
            stableford_points: stableford,
            fairway_hit: hs.fairway ?? null,
            putts: hs.putts ?? null,
            committed: false,
          }
        })
        .filter(Boolean)

      if (rows.length > 0) {
        await supabase.from("live_scores").upsert(rows as any, {
          onConflict: "player_id,round_id,hole_number",
        })
      }
    } catch {
      // Non-blocking: proceed even if live_scores save fails
    }
    setSaving(false)

    // Update stableford in local state
    const updated: Record<string, HoleScore> = {}
    for (const { player, playingHcp } of playerSetups) {
      const hs = holeScores[player.id]
      const p = effectivePar(hole, player.gender, courseId)
      const si = effectiveSI(hole, player.gender, courseId)
      const stableford = hs.gross !== null ? calcStableford(hs.gross, p, si, playingHcp) : null
      updated[player.id] = { ...hs, stableford }
    }
    onSubmit(updated)
  }

  return (
    <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-5">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <div className="flex items-center gap-1">
          {Array.from({ length: totalHoles }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i < holeIdx ? "w-3 bg-[#C9A84C]" :
                i === holeIdx ? "w-4 bg-[#C9A84C]" :
                "w-2 bg-white/15"
              }`}
            />
          ))}
        </div>
        <span className="text-white/40 text-sm">{holeIdx + 1}/{totalHoles}</span>
      </div>

      {/* Hole info */}
      <div className="border border-[#1e3d28] px-5 py-4 flex items-center justify-between bg-[#0d2015]">
        <div>
          <div className="text-white/40 text-xs tracking-[0.2em] uppercase">Hole</div>
          <div className="font-[family-name:var(--font-playfair)] text-4xl text-white leading-none">
            {hole.hole_number}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/40 text-xs tracking-[0.2em] uppercase">Par</div>
          <div className="text-2xl font-bold text-[#C9A84C]">{par}</div>
        </div>
        <div className="text-center">
          <div className="text-white/40 text-xs tracking-[0.2em] uppercase">SI</div>
          <div className="text-2xl font-bold text-white/70">{effectiveSI(hole, playerSetups[0]?.player.gender ?? "M", courseId)}</div>
        </div>
        {yardage !== null && (
          <div className="text-center">
            <div className="text-white/40 text-xs tracking-[0.2em] uppercase">Yds</div>
            <div className="text-xl font-semibold text-white/60">{yardage}</div>
          </div>
        )}
      </div>

      {/* Player score sections */}
      <div className="flex flex-col gap-4">
        {playerSetups.map(({ player, playingHcp }) => {
          const hs = holeScores[player.id]
          const p = effectivePar(hole, player.gender, courseId)
          const si = effectiveSI(hole, player.gender, courseId)
          const shots = shotsReceived(si, playingHcp)
          const stableford = hs.gross !== null ? calcStableford(hs.gross, p, si, playingHcp) : null
          const showFairway = (p === 4 || p === 5)

          return (
            <div key={player.id} className="border border-[#1e3d28] bg-[#0d2015] px-4 py-4">
              {/* Player name + HCP dots */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {player.teams && (
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: player.teams.color }} />
                  )}
                  <span className="text-base text-white/80">{player.name}</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-white/30">
                  <span>{shots > 0 ? `+${shots}` : "0"} shots</span>
                  {stableford !== null && (
                    <span className={`ml-2 font-bold ${stableford >= 3 ? "text-[#C9A84C]" : stableford === 0 ? "text-red-400/70" : "text-white/60"}`}>
                      {stableford} pts
                    </span>
                  )}
                </div>
              </div>

              {/* Gross score */}
              <div className="flex items-center justify-center gap-6 mb-4">
                <button
                  onClick={() => setPlayerScore(player.id, { gross: Math.max(1, (hs.gross ?? p) - 1) })}
                  className="w-12 h-12 rounded-full border border-white/20 text-white/60 text-2xl hover:border-white/50 hover:text-white transition-colors active:bg-white/10"
                >
                  −
                </button>
                <div className="text-center min-w-[3rem]">
                  <div className="text-5xl font-bold text-white leading-none">
                    {hs.gross ?? "—"}
                  </div>
                  {hs.gross !== null && (
                    <div className={`text-sm mt-1 ${hs.gross - p <= -2 ? "text-[#C9A84C]" : hs.gross - p === -1 ? "text-emerald-400" : hs.gross - p === 0 ? "text-white/40" : hs.gross - p === 1 ? "text-orange-400/70" : "text-red-400/70"}`}>
                      {hs.gross - p <= -2 ? "Eagle" : hs.gross - p === -1 ? "Birdie" : hs.gross - p === 0 ? "Par" : hs.gross - p === 1 ? "Bogey" : `+${hs.gross - p}`}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setPlayerScore(player.id, { gross: (hs.gross ?? p) + 1 })}
                  className="w-12 h-12 rounded-full border border-white/20 text-white/60 text-2xl hover:border-white/50 hover:text-white transition-colors active:bg-white/10"
                >
                  +
                </button>
              </div>

              {/* Fairway (par 4+5 only) */}
              {showFairway && (
                <div className="mb-3">
                  <div className="text-white/30 text-xs tracking-[0.15em] uppercase mb-2">Fairway</div>
                  <div className="flex gap-2">
                    {(["left", "fairway", "right"] as const).map(fw => (
                      <button
                        key={fw}
                        onClick={() => setPlayerScore(player.id, { fairway: hs.fairway === fw ? null : fw })}
                        className={`flex-1 py-2 text-sm tracking-wider uppercase border transition-colors
                          ${hs.fairway === fw
                            ? "border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10"
                            : "border-white/15 text-white/40 hover:border-white/30"}`}
                      >
                        {fw === "fairway" ? "FW" : fw === "left" ? "← L" : "R →"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Putts */}
              <div>
                <div className="text-white/30 text-xs tracking-[0.15em] uppercase mb-2">Putts</div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPlayerScore(player.id, { putts: Math.max(0, (hs.putts ?? 2) - 1) })}
                    className="w-8 h-8 rounded-full border border-white/15 text-white/50 hover:border-white/30 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold text-white/70 min-w-[1.5rem] text-center">
                    {hs.putts ?? "—"}
                  </span>
                  <button
                    onClick={() => setPlayerScore(player.id, { putts: (hs.putts ?? 1) + 1 })}
                    className="w-8 h-8 rounded-full border border-white/15 text-white/50 hover:border-white/30 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Next button */}
      <button
        onClick={handleNext}
        disabled={!allHaveGross || saving}
        className={`w-full py-4 text-base tracking-[0.2em] uppercase font-semibold transition-colors
          ${allHaveGross && !saving
            ? "bg-[#C9A84C] text-black hover:bg-[#d4b05a]"
            : "bg-white/10 text-white/30 cursor-not-allowed"}`}
      >
        {saving ? "Saving…" : holeIdx < totalHoles - 1 ? `Next Hole (${holeIdx + 2}) →` : "Finish Round →"}
      </button>
    </div>
  )
}

// ─── Live Leaderboard ─────────────────────────────────────

interface LiveLeaderboardProps {
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  roundHandicaps: RoundHandicap[]
}

interface LiveScoreRow {
  player_id: string
  round_id: string
  hole_number: number
  gross_score: number | null
  stableford_points: number | null
  committed: boolean
}

function LiveLeaderboard({ players, rounds, holes, roundHandicaps }: LiveLeaderboardProps) {
  const [liveScores, setLiveScores] = useState<LiveScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const activeRounds = rounds.filter(r => r.status === "active")

  const fetchScores = useCallback(async () => {
    if (activeRounds.length === 0) { setLoading(false); return }
    const roundIds = activeRounds.map(r => r.id)
    const { data } = await supabase
      .from("live_scores")
      .select("player_id, round_id, hole_number, gross_score, stableford_points, committed")
      .in("round_id", roundIds)
    if (data) setLiveScores(data as LiveScoreRow[])
    setLastFetch(new Date())
    setLoading(false)
  }, [activeRounds.map(r => r.id).join(",")])

  useEffect(() => {
    fetchScores()
    const interval = setInterval(fetchScores, 15000)
    return () => clearInterval(interval)
  }, [fetchScores])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/30 text-base tracking-widest uppercase">Loading…</div>
      </div>
    )
  }

  if (activeRounds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <div className="text-white/20 text-base">No active rounds</div>
          <div className="text-white/10 text-sm mt-1">Live leaderboard shows in-progress rounds</div>
        </div>
      </div>
    )
  }

  // Build leaderboard per round
  return (
    <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 text-sm tracking-[0.2em] uppercase">Live — In Progress</span>
        </div>
        {lastFetch && (
          <span className="text-white/20 text-sm">
            Updated {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>

      {activeRounds.map(round => {
        const courseId = round.courses?.id ?? ""
        const courseHoles = holes
          .filter(h => h.course_id === courseId)
          .sort((a, b) => a.hole_number - b.hole_number)

        // Per-player stats
        const playerStats = players
          .map(player => {
            const playerScores = liveScores.filter(
              ls => ls.player_id === player.id && ls.round_id === round.id
            )
            const holesCompleted = playerScores.filter(ls => ls.gross_score !== null).length
            const totalPts = playerScores.reduce((sum, ls) => sum + (ls.stableford_points ?? 0), 0)
            const totalGross = playerScores.reduce((sum, ls) => sum + (ls.gross_score ?? 0), 0)
            return { player, holesCompleted, totalPts, totalGross }
          })
          .filter(({ holesCompleted }) => holesCompleted > 0)
          .sort((a, b) => b.totalPts - a.totalPts || b.holesCompleted - a.holesCompleted)

        if (playerStats.length === 0) {
          return (
            <div key={round.id} className="border border-[#1e3d28] px-4 py-6 text-center">
              <div className="text-white/30 text-sm mb-1">Round {round.round_number} — {round.courses?.name}</div>
              <div className="text-white/20 text-base">No scores entered yet</div>
            </div>
          )
        }

        return (
          <div key={round.id} className="border border-[#1e3d28]">
            <div className="px-4 py-3 border-b border-[#1e3d28] bg-[#0d2015]">
              <span className="text-white/50 text-sm tracking-[0.15em] uppercase">
                Round {round.round_number} — {round.courses?.name}
              </span>
            </div>

            <div className="divide-y divide-[#1e3d28]">
              {playerStats.map(({ player, holesCompleted, totalPts }, idx) => (
                <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-white/40 text-lg font-semibold w-6 text-center">{idx + 1}</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {player.teams && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: player.teams.color }} />
                    )}
                    <span className="text-base text-white/80 truncate">{player.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[#C9A84C] font-bold text-xl">{totalPts}</div>
                    <div className="text-white/30 text-xs">{holesCompleted}/18</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <button
        onClick={fetchScores}
        className="text-center text-white/20 text-sm tracking-widest uppercase hover:text-white/40 transition-colors"
      >
        Refresh
      </button>
    </div>
  )
}
