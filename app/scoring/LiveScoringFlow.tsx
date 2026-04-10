"use client"

import React, { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import type { ActiveLiveRound } from "./ScoringClient"
import LiveLeaderboardPanel from "./LiveLeaderboardPanel"
import BackButton from "@/app/components/BackButton"

// ─── Types ────────────────────────────────────────────────

interface Player {
  id: string; name: string; role: string; handicap: number
  gender: string; is_composite: boolean
  teams: { name: string; color: string } | null
}
interface Round {
  id: string; round_number: number; status: string
  courses: { id: string; name: string } | null
}
interface Hole {
  id: string; hole_number: number; par: number; stroke_index: number; course_id: string
  par_ladies?: number; stroke_index_ladies?: number
  yardage_black?: number; yardage_blue?: number; yardage_white?: number; yardage_red?: number
  yardage_sandstone?: number; yardage_slate?: number; yardage_granite?: number; yardage_claret?: number
}
interface Tee {
  id: string; course_id: string; name: string; gender: string
  par: number; course_rating: number; slope: number
}
interface RoundHandicap { round_id: string; player_id: string; playing_handicap: number }
interface HoleScore {
  gross: number | null
  isNR: boolean
  stableford: number | null
}
interface PlayerSetup { player: Player; tee: Tee; playingHcp: number }

interface Props {
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  tees: Tee[]
  roundHandicaps: RoundHandicap[]
  activeLiveRound: ActiveLiveRound | null
  onBack: () => void
  onLiveRoundChange: (r: ActiveLiveRound | null) => void
  showLeaderboard: boolean
  onLeaderboardChange: (v: boolean) => void
  /** When true and activeLiveRound is set, skip mode/setup and resume at the
   *  first unsubmitted hole using the players already locked in the round. */
  autoResume?: boolean
  /** Called whenever the active hole changes (step=holes). Receives (-1, 0)
   *  when not in the holes step so the parent can clear any hole display. */
  onHoleChange?: (holeIdx: number, totalHoles: number) => void
}

type LiveStep = "activate" | "setup" | "holes" | "summary" | "committed" | "resuming"

// ─── Constants ────────────────────────────────────────────

const ST_PATRICKS_COURSE_ID = "11111111-0000-0000-0000-000000000003"

const TEE_STYLES: Record<string, { dot: string; active: string }> = {
  Black:     { dot: "bg-zinc-300",   active: "border-zinc-300 text-zinc-200" },
  Blue:      { dot: "bg-blue-400",   active: "border-blue-400 text-blue-300" },
  White:     { dot: "bg-white",      active: "border-white text-white" },
  Red:       { dot: "bg-red-500",    active: "border-red-400 text-red-300" },
  Yellow:    { dot: "bg-yellow-400", active: "border-yellow-400 text-yellow-300" },
  Sandstone: { dot: "bg-amber-300",  active: "border-amber-300 text-amber-200" },
  Slate:     { dot: "bg-slate-400",  active: "border-slate-400 text-slate-300" },
  Granite:   { dot: "bg-stone-400",  active: "border-stone-400 text-stone-300" },
  Claret:    { dot: "bg-rose-800",   active: "border-rose-700 text-rose-300" },
}

// ─── Helpers ──────────────────────────────────────────────

function calcPlayingHandicap(hcpIndex: number, slope: number, courseRating: number, par: number) {
  return Math.round(hcpIndex * (slope / 113) + (courseRating - par))
}
function shotsReceived(si: number, hcp: number) {
  return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0)
}
function calcStableford(gross: number, par: number, si: number, hcp: number) {
  return Math.max(0, par + 2 - (gross - shotsReceived(si, hcp)))
}
function nrGross(par: number, si: number, hcp: number) {
  return par + 2 + shotsReceived(si, hcp)
}
function effectivePar(hole: Hole, gender: string, courseId: string) {
  return gender === "F" && courseId === ST_PATRICKS_COURSE_ID && hole.par_ladies
    ? hole.par_ladies : hole.par
}
function effectiveSI(hole: Hole, gender: string, courseId: string) {
  return gender === "F" && courseId === ST_PATRICKS_COURSE_ID && hole.stroke_index_ladies
    ? hole.stroke_index_ladies : hole.stroke_index
}
function yardageForTee(hole: Hole, teeName: string): number | null {
  const key = `yardage_${teeName.toLowerCase()}` as keyof Hole
  return (hole[key] as number | undefined) ?? null
}
function scoreToPar(gross: number, par: number): { label: string; color: string } {
  const d = gross - par
  if (d <= -3) return { label: "Albatross", color: "text-[#C9A84C]" }
  if (d === -2) return { label: "Eagle",    color: "text-[#C9A84C]" }
  if (d === -1) return { label: "Birdie",   color: "text-emerald-400" }
  if (d === 0)  return { label: "Par",      color: "text-white/50" }
  if (d === 1)  return { label: "Bogey",    color: "text-orange-400/80" }
  return { label: `+${d}`, color: "text-red-400/70" }
}

// ─── Composite generation ─────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Divide holeIds into equal contiguous blocks, one per source player.
 *  Sources are shuffled independently on each call so two composites
 *  in the same class will likely receive different allocations. */
function allocateHolesToSources(holeIds: string[], sourceIds: string[]): Map<string, string> {
  const m = new Map<string, string>()
  const shuffled = shuffle(sourceIds)
  const n = shuffled.length
  const blockSize = Math.floor(holeIds.length / n)
  shuffled.forEach((sourceId, i) => {
    const start = i * blockSize
    const end = i === n - 1 ? holeIds.length : start + blockSize
    holeIds.slice(start, end).forEach(h => m.set(h, sourceId))
  })
  return m
}

/** Called after the last real player of a role finalises their live scorecard.
 *  Queries committed scores, checks all real players in that role have 18,
 *  then generates an independent composite card for each composite player. */
async function generateCompositeScores(
  finalisedRole: string,
  roundId: string,
  allPlayers: Player[],
  courseHoles: Hole[],
) {
  const realSameRole = allPlayers.filter(p => !p.is_composite && p.role === finalisedRole)
  const compositeSameRole = allPlayers.filter(p => p.is_composite && p.role === finalisedRole)
  if (!compositeSameRole.length) return

  // All real players of this role must have 18 committed scores
  const { data: existingScores } = await supabase
    .from("scores")
    .select("player_id, hole_id, gross_score, stableford_points, no_return")
    .eq("round_id", roundId)
    .in("player_id", realSameRole.map(p => p.id))
  if (!existingScores) return

  const counts = new Map<string, number>()
  for (const s of existingScores) counts.set(s.player_id, (counts.get(s.player_id) ?? 0) + 1)
  if (!realSameRole.every(p => (counts.get(p.id) ?? 0) >= 18)) return

  const holeIds = courseHoles.map(h => h.id)
  const sourceIds = realSameRole.map(p => p.id)

  for (const compositePlayer of compositeSameRole) {
    // Each composite gets its own independent random block allocation
    const allocation = allocateHolesToSources(holeIds, sourceIds)

    const compositeHoleRows = holeIds.map(holeId => {
      const sourceId = allocation.get(holeId)!
      const sourcePlayer = realSameRole.find(p => p.id === sourceId)!
      return {
        composite_player_id: compositePlayer.id,
        round_id: roundId,
        hole_id: holeId,
        source_player_id: sourceId,
        source_player_name: sourcePlayer.name,
      }
    })

    const compositeScoreRows = holeIds.map(holeId => {
      const sourceId = allocation.get(holeId)!
      const s = existingScores.find(sc => sc.player_id === sourceId && sc.hole_id === holeId)
      const hole = courseHoles.find(h => h.id === holeId)!
      return {
        round_id: roundId,
        player_id: compositePlayer.id,
        hole_id: holeId,
        gross_score: s?.gross_score ?? (hole.par + 2),
        stableford_points: s?.stableford_points ?? 0,
        no_return: s?.no_return ?? false,
      }
    })

    await supabase.from("composite_holes").upsert(compositeHoleRows, {
      onConflict: "composite_player_id,round_id,hole_id",
    })
    await supabase.from("scores").upsert(compositeScoreRows, {
      onConflict: "round_id,player_id,hole_id",
    })
    await supabase.from("round_handicaps").upsert(
      { round_id: roundId, player_id: compositePlayer.id, playing_handicap: 0 },
      { onConflict: "round_id,player_id" },
    )
  }
}

// ─── Main component ───────────────────────────────────────

export default function LiveScoringFlow({
  players, rounds, holes, tees, roundHandicaps,
  activeLiveRound, onBack, onLiveRoundChange,
  showLeaderboard, onLeaderboardChange,
  autoResume = false,
  onHoleChange,
}: Props) {
  const [liveRound, setLiveRound] = useState<ActiveLiveRound | null>(activeLiveRound)
  const [step, setStep] = useState<LiveStep>(
    activeLiveRound ? (autoResume ? "resuming" : "setup") : "activate"
  )

  // Setup state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [playerTeeIds, setPlayerTeeIds] = useState<Record<string, string>>({})

  // Scoring state
  const [scores, setScores] = useState<Record<number, Record<string, HoleScore>>>({})
  const [holeIdx, setHoleIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [selectedSummaryPlayerId, setSelectedSummaryPlayerId] = useState("")

  // Edit mode (within summary)
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Record<number, HoleScore>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Player locking
  const [lockedPlayerIds, setLockedPlayerIds] = useState<string[]>([])

  // Swipe gesture tracking
  const touchStartX = useRef<number | null>(null)

  // Activate step state
  const [activatingRoundId, setActivatingRoundId] = useState("")

  const availableRounds = rounds.filter(r => r.status === "upcoming" || r.status === "active")

  // Holes for the live round's course
  const courseId = liveRound?.course_id ?? ""
  const roundId = liveRound?.round_id ?? ""
  const courseHoles = courseId
    ? holes.filter(h => h.course_id === courseId).sort((a, b) => a.hole_number - b.hole_number)
    : []

  // Notify parent of hole progress so it can render the progress bar in its header
  useEffect(() => {
    if (step === "holes" && courseHoles.length > 0) {
      onHoleChange?.(holeIdx, courseHoles.length)
    } else {
      onHoleChange?.(-1, 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, holeIdx, courseHoles.length])

  // Player setups — only for players that have a tee selected
  const playerSetups: PlayerSetup[] = selectedPlayerIds
    .filter(id => playerTeeIds[id])
    .map(id => {
      const player = players.find(p => p.id === id)!
      const tee = tees.find(t => t.id === playerTeeIds[id])!
      const existingHcp = roundHandicaps.find(rh => rh.round_id === roundId && rh.player_id === id)
      const playingHcp = existingHcp?.playing_handicap
        ?? calcPlayingHandicap(player.handicap, tee.slope, tee.course_rating, tee.par)
      return { player, tee, playingHcp }
    })

  const canStart = selectedPlayerIds.length >= 1 &&
    selectedPlayerIds.every(id => !!playerTeeIds[id])

  // Fetch players locked in other scorecards for this round (active OR finalised)
  // so they are hidden from the player picker. Finalised players must not be
  // selectable until manually unfinalised via the dashboard settings tab.
  useEffect(() => {
    if (step !== "setup" || !liveRound) return
    supabase
      .from("live_rounds")
      .select("id")
      .eq("round_id", liveRound.round_id)
      .in("status", ["active", "finalised"])
      .neq("id", liveRound.id)
      .then(async ({ data: otherRounds }) => {
        const ids = (otherRounds ?? []).map((r: any) => r.id as string)
        if (ids.length === 0) { setLockedPlayerIds([]); return }
        const { data: locks } = await supabase
          .from("live_player_locks")
          .select("player_id")
          .in("live_round_id", ids)
        setLockedPlayerIds(locks?.map(r => r.player_id as string) ?? [])
      })
  }, [step, liveRound?.id])

  // Auto-resume: fetch locked players + existing scores and jump to the right hole
  useEffect(() => {
    if (step !== "resuming" || !liveRound) return

    const cId  = liveRound.course_id
    const rId  = liveRound.round_id
    const cHoles = holes
      .filter(h => h.course_id === cId)
      .sort((a, b) => a.hole_number - b.hole_number)

    async function doResume() {
      const { data: locks } = await supabase
        .from("live_player_locks")
        .select("player_id")
        .eq("live_round_id", liveRound!.id)

      const lockedIds = locks?.map(l => l.player_id as string) ?? []

      if (lockedIds.length === 0) {
        // No players locked yet — fall back to normal flow
        setStep("setup")
        return
      }

      const { data: existingScores } = await supabase
        .from("live_scores")
        .select("player_id, hole_number, gross_score, stableford_points, no_return")
        .in("player_id", lockedIds)
        .eq("round_id", rId)

      // Pick tees: first gender-matching tee for the course (playing_handicap
      // already stored in round_handicaps so tee choice only affects yardage display)
      const courseTees = tees.filter(t => t.course_id === cId)
      const teeMap: Record<string, string> = {}
      for (const pid of lockedIds) {
        const player = players.find(p => p.id === pid)
        if (!player) continue
        const tee = courseTees.find(t => t.gender === player.gender) ?? courseTees[0]
        if (tee) teeMap[pid] = tee.id
      }

      // Rebuild scores state from live_scores
      const scoreState: Record<number, Record<string, HoleScore>> = {}
      for (const row of (existingScores ?? [])) {
        if (row.gross_score === null) continue
        const idx = cHoles.findIndex(h => h.hole_number === row.hole_number)
        if (idx === -1) continue
        if (!scoreState[idx]) scoreState[idx] = {}
        scoreState[idx][row.player_id] = {
          gross: row.gross_score,
          isNR: row.no_return === true,
          stableford: row.stableford_points,
        }
      }

      // Find first hole where not all players have a score yet
      let resumeIdx = 0
      for (let i = 0; i < cHoles.length; i++) {
        const hScores = scoreState[i] ?? {}
        const allDone = lockedIds.every(pid => hScores[pid]?.gross !== null && hScores[pid] !== undefined)
        if (!allDone) { resumeIdx = i; break }
        resumeIdx = i + 1
      }

      setLockedPlayerIds(lockedIds)
      setSelectedPlayerIds(lockedIds)
      setPlayerTeeIds(teeMap)
      setScores(scoreState)

      if (resumeIdx >= cHoles.length) {
        setHoleIdx(cHoles.length - 1)
        setSelectedSummaryPlayerId(lockedIds[0] ?? "")
        setStep("summary")
      } else {
        setHoleIdx(resumeIdx)
        setStep("holes")
        window.scrollTo({ top: 0, behavior: "instant" })
      }
    }

    doResume()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, liveRound?.id])

  async function lockPlayers() {
    if (!liveRound || playerSetups.length === 0) return
    await supabase
      .from("live_player_locks")
      .upsert(
        playerSetups.map(({ player }) => ({ live_round_id: liveRound.id, player_id: player.id })),
        { onConflict: "live_round_id,player_id" }
      )
  }

  function syncLiveRound(r: ActiveLiveRound | null) {
    setLiveRound(r)
    onLiveRoundChange(r)
  }

  function resetFlow() {
    syncLiveRound(null)
    setStep("activate")
    setSelectedPlayerIds([])
    setPlayerTeeIds({})
    setScores({})
    setHoleIdx(0)
    setActivatingRoundId("")
  }

  // ─── Activate ─────────────────────────────────────────────

  async function handleActivate() {
    if (!activatingRoundId) return
    setSaving(true)
    setError(null)
    const round = rounds.find(r => r.id === activatingRoundId)
    if (!round?.courses) { setError("Round has no course"); setSaving(false); return }

    const { data, error: err } = await supabase
      .from("live_rounds")
      .insert({
        course_id: round.courses.id,
        round_id: activatingRoundId,
        status: "active",
      })
      .select("id, course_id, round_id, activated_by, rounds(round_number), courses(name)")
      .single()

    if (err) { setError(err.message); setSaving(false); return }

    syncLiveRound(data as unknown as ActiveLiveRound)
    setSaving(false)
    setStep("setup")
  }

  // ─── Close round ─────────────────────────────────────────

  async function handleCloseRound() {
    if (!liveRound) return
    setSaving(true)
    await Promise.all([
      supabase
        .from("live_rounds")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", liveRound.id),
      supabase
        .from("live_player_locks")
        .delete()
        .eq("live_round_id", liveRound.id),
    ])
    setSaving(false)
    setCloseConfirm(false)
    resetFlow()
    onBack()
  }

  // ─── Commit ───────────────────────────────────────────────

  // ─── Edit mode helpers ────────────────────────────────────

  function setDraftHole(idx: number, update: Partial<HoleScore>) {
    setEditDraft(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] ?? { gross: null, isNR: false, stableford: null }), ...update },
    }))
  }

  function enterEditMode(playerId: string) {
    const draft: Record<number, HoleScore> = {}
    for (let i = 0; i < courseHoles.length; i++) {
      draft[i] = scores[i]?.[playerId] ?? { gross: null, isNR: false, stableford: null }
    }
    setEditDraft(draft)
    setEditingPlayerId(playerId)
  }

  async function saveEditDraft() {
    const playerId = editingPlayerId
    if (!playerId || !roundId) return
    const setup = playerSetups.find(ps => ps.player.id === playerId)
    if (!setup) { setEditingPlayerId(null); return }
    setEditSaving(true)

    const upsertRows: any[] = []
    const deleteHoleNums: number[] = []
    const newPlayerScores: Record<number, HoleScore> = {}

    for (let i = 0; i < courseHoles.length; i++) {
      const hole = courseHoles[i]
      const hs = editDraft[i] ?? { gross: null, isNR: false, stableford: null }
      const p  = effectivePar(hole, setup.player.gender, courseId)
      const si = effectiveSI(hole, setup.player.gender, courseId)
      const stableford = hs.isNR ? 0 : hs.gross !== null ? calcStableford(hs.gross, p, si, setup.playingHcp) : null
      newPlayerScores[i] = { ...hs, stableford }

      if (hs.gross !== null || hs.isNR) {
        const gross = hs.isNR ? nrGross(p, si, setup.playingHcp) : hs.gross!
        upsertRows.push({
          player_id: playerId, round_id: roundId, hole_number: hole.hole_number,
          gross_score: gross,
          stableford_points: hs.isNR ? 0 : calcStableford(gross, p, si, setup.playingHcp),
          committed: false,
        })
      } else {
        deleteHoleNums.push(hole.hole_number)
      }
    }

    await Promise.all([
      upsertRows.length > 0
        ? supabase.from("live_scores").upsert(upsertRows, { onConflict: "player_id,round_id,hole_number" })
        : Promise.resolve(),
      deleteHoleNums.length > 0
        ? supabase.from("live_scores").delete()
            .eq("player_id", playerId).eq("round_id", roundId).in("hole_number", deleteHoleNums)
        : Promise.resolve(),
    ])

    setScores(prev => {
      const next = { ...prev }
      for (let i = 0; i < courseHoles.length; i++) {
        next[i] = { ...next[i], [playerId]: newPlayerScores[i] }
      }
      return next
    })

    setEditSaving(false)
    setEditingPlayerId(null)
  }

  async function handleCommit() {
    if (!roundId || courseHoles.length === 0 || !liveRound) return
    setSaving(true)
    setError(null)
    try {
      // 1. Upsert round_handicaps
      await Promise.all(
        playerSetups.map(({ player, playingHcp }) =>
          supabase.from("round_handicaps").upsert(
            { round_id: roundId, player_id: player.id, playing_handicap: playingHcp },
            { onConflict: "round_id,player_id" }
          )
        )
      )

      // 2. Delete existing scores for these players then insert fresh
      await Promise.all(
        playerSetups.map(({ player }) =>
          supabase.from("scores").delete()
            .eq("player_id", player.id).eq("round_id", roundId)
        )
      )

      // 3. Upsert scores — every hole for every player; missing/blank → NR
      const scoreRows: any[] = []
      for (const [hIdx, hole] of courseHoles.entries()) {
        for (const setup of playerSetups) {
          const hs = scores[hIdx]?.[setup.player.id]
          const noReturn = hs?.isNR === true || hs?.gross == null
          const p = effectivePar(hole, setup.player.gender, courseId)
          const si = effectiveSI(hole, setup.player.gender, courseId)
          scoreRows.push({
            player_id: setup.player.id, hole_id: hole.id, round_id: roundId,
            gross_score: noReturn ? nrGross(p, si, setup.playingHcp) : hs!.gross!,
            no_return: noReturn,
          })
        }
      }
      if (scoreRows.length > 0) {
        const { error: scoreErr } = await supabase.from("scores")
          .upsert(scoreRows, { onConflict: "player_id,hole_id,round_id" })
        if (scoreErr) throw scoreErr
      }

      // 4. Generate composite scores for each role completed by this finalisation
      const roles = [...new Set(playerSetups.map(s => s.player.role))]
      roles.forEach(role => {
        generateCompositeScores(role, roundId, players, courseHoles).catch(() => {})
      })

      // 5. Mark live_scores committed
      await supabase.from("live_scores")
        .update({ committed: true })
        .in("player_id", playerSetups.map(p => p.player.id))
        .eq("round_id", roundId)

      // 6. Finalise the live round and return to the course portal
      // Note: player locks are intentionally kept so the live leaderboard
      // continues to display finalised players. Locks are only removed on discard.
      await supabase
        .from("live_rounds")
        .update({ status: "finalised", closed_at: new Date().toISOString() })
        .eq("id", liveRound.id)
      onBack()
    } catch (e: any) {
      setError(e?.message ?? "Failed to commit scores")
    } finally {
      setSaving(false)
    }
  }

  // ─── Close confirm overlay ────────────────────────────────

  if (closeConfirm) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 py-12">
        <div className="text-center">
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-2">Discard Scorecard?</h2>
          <p className="text-white/40 text-base">This voids the scorecard and releases all players. Scores will not be saved.</p>
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <button onClick={() => setCloseConfirm(false)} className="flex-1 py-3 border border-white/20 text-white/60 text-base uppercase tracking-wider hover:border-white/40 transition-colors">
            Cancel
          </button>
          <button onClick={handleCloseRound} disabled={saving} className="flex-1 py-3 bg-red-900/60 border border-red-700/50 text-red-300 text-base uppercase tracking-wider hover:bg-red-900/80 disabled:opacity-50 transition-colors">
            {saving ? "Voiding…" : "Discard"}
          </button>
        </div>
      </div>
    )
  }

  // ─── Leaderboard panel (non-holes steps) ─────────────────

  if (showLeaderboard && liveRound && step !== "holes") {
    return (
      <LiveLeaderboardPanel
        liveRound={liveRound}
        players={players}
        holes={holes}
        roundHandicaps={roundHandicaps}
        onClose={() => onLeaderboardChange(false)}
      />
    )
  }

  // ─── Resuming step ────────────────────────────────────────

  if (step === "resuming") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-57px)]">
        <p className="text-white/30 text-base tracking-wide">Loading scorecard…</p>
      </div>
    )
  }

  // ─── Activate step ────────────────────────────────────────

  if (step === "activate") {
    return (
      <div className="max-w-lg mx-auto w-full px-4 py-8 flex flex-col gap-6">
        <div className="text-center">
          <p className="text-white/30 text-sm tracking-[0.2em] uppercase mb-2">No live round active</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-white">Start Live Round</h2>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-white/50 text-sm tracking-[0.15em] uppercase">Select Round</label>
          {availableRounds.length === 0 ? (
            <p className="text-white/30 text-base">No rounds available. Rounds must be upcoming or active.</p>
          ) : (
            availableRounds.map(r => (
              <button
                key={r.id}
                onClick={() => setActivatingRoundId(r.id)}
                className={`w-full text-left px-4 py-3 border text-base transition-colors
                  ${activatingRoundId === r.id
                    ? "border-green-500 text-green-400 bg-green-900/20"
                    : "border-white/20 text-white/60 hover:border-white/40"}`}
              >
                Round {r.round_number} — {r.courses?.name}
                <span className={`ml-2 text-sm ${r.status === "active" ? "text-green-400" : "text-white/30"}`}>
                  [{r.status}]
                </span>
              </button>
            ))
          )}
        </div>

        {error && <p className="text-red-400 text-base">{error}</p>}

        <button
          onClick={handleActivate}
          disabled={!activatingRoundId || saving || availableRounds.length === 0}
          className={`w-full py-4 text-base tracking-[0.2em] uppercase transition-colors
            ${activatingRoundId && !saving
              ? "bg-green-700 text-white hover:bg-green-600"
              : "bg-white/10 text-white/30 cursor-not-allowed"}`}
        >
          {saving ? "Activating…" : "Activate Live Round →"}
        </button>
      </div>
    )
  }

  // ─── Setup step ───────────────────────────────────────────

  if (step === "setup") {
    const courseTees = tees.filter(t => t.course_id === courseId)

    function togglePlayer(pid: string) {
      const isSelected = selectedPlayerIds.includes(pid)
      if (isSelected) {
        if (selectedPlayerIds.length > 1) {
          setSelectedPlayerIds(prev => prev.filter(id => id !== pid))
          setPlayerTeeIds(prev => { const n = { ...prev }; delete n[pid]; return n })
        }
      } else if (selectedPlayerIds.length < 4) {
        setSelectedPlayerIds(prev => [...prev, pid])
      }
    }

    function setTeeForPlayer(pid: string, tid: string) {
      setPlayerTeeIds(prev => ({ ...prev, [pid]: tid }))
    }

    return (
      <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <label className="text-white/50 text-sm tracking-[0.15em] uppercase">
            Select Players (1–4)
          </label>

          {players.filter(p => !lockedPlayerIds.includes(p.id)).map(player => {
            const isSelected = selectedPlayerIds.includes(player.id)
            const playerCourseTees = courseTees.filter(t => t.gender === player.gender)
            const selectedTeeId = playerTeeIds[player.id] ?? ""
            const selectedTee = tees.find(t => t.id === selectedTeeId)
            const playingHcp = selectedTee
              ? calcPlayingHandicap(player.handicap, selectedTee.slope, selectedTee.course_rating, selectedTee.par)
              : null

            return (
              <div key={player.id}>
                {/* Player toggle */}
                <button
                  onClick={() => togglePlayer(player.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 border text-base transition-colors
                    ${isSelected
                      ? "border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10"
                      : "border-white/20 text-white/60 hover:border-white/40"}`}
                >
                  <div className="flex items-center gap-2">
                    {player.teams && (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: player.teams.color }} />
                    )}
                    <span>{player.name}</span>
                  </div>
                  <span className="text-sm opacity-50">HCP {player.handicap}</span>
                </button>

                {/* Tee selector — only for selected players */}
                {isSelected && (
                  <div className="bg-[#0d1f14] border-x border-b border-[#C9A84C]/20 px-4 py-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {playerCourseTees.length === 0 ? (
                        <span className="text-white/30 text-sm">No tees for this course</span>
                      ) : (
                        playerCourseTees.map(tee => {
                          const style = TEE_STYLES[tee.name] ?? { dot: "bg-white/40", active: "border-white/40 text-white/60" }
                          const isActive = selectedTeeId === tee.id
                          return (
                            <button
                              key={tee.id}
                              onClick={() => setTeeForPlayer(player.id, tee.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 border text-sm tracking-wider uppercase transition-colors
                                ${isActive ? style.active + " bg-white/5" : "border-white/20 text-white/40 hover:border-white/40"}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                              {tee.name}
                            </button>
                          )
                        })
                      )}
                    </div>
                    {playingHcp !== null && (
                      <p className="text-white/40 text-sm">
                        Playing HC: <span className="text-[#C9A84C] font-semibold">{playingHcp}</span>
                      </p>
                    )}
                    {!selectedTeeId && playerCourseTees.length > 0 && (
                      <p className="text-orange-400/60 text-sm">Select a tee to continue</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={async () => {
            setScores({}); setHoleIdx(0)
            await lockPlayers()
            setStep("holes")
            window.scrollTo({ top: 0, behavior: "instant" })
          }}
          disabled={!canStart}
          className={`w-full py-4 text-base tracking-[0.2em] uppercase transition-colors
            ${canStart ? "bg-[#C9A84C] text-black hover:bg-[#d4b05a]" : "bg-white/10 text-white/30 cursor-not-allowed"}`}
        >
          Start Round →
        </button>

        <button onClick={() => setCloseConfirm(true)} className="text-center text-white/20 text-sm tracking-widest uppercase hover:text-red-400/60 transition-colors">
          Close Live Round
        </button>
      </div>
    )
  }

  // ─── Hole by hole ─────────────────────────────────────────

  if (step === "holes" && courseHoles.length > 0) {
    const hole = courseHoles[holeIdx]
    const existingHoleScores = scores[holeIdx] ?? {}

    // Running stableford total per player across all submitted holes
    const runningTotals: Record<string, number> = {}
    for (const { player } of playerSetups) {
      let total = 0
      for (const hScores of Object.values(scores)) {
        const hs = hScores[player.id]
        if (!hs) continue
        if (hs.stableford != null) total += hs.stableford
        // isNR contributes 0 — no addition needed
      }
      runningTotals[player.id] = total
    }

    function handleHoleBack() {
      if (holeIdx === 0) { setStep("setup"); return }
      setHoleIdx(holeIdx - 1)
      window.scrollTo({ top: 0, behavior: "instant" })
    }

    async function handleHoleSubmit(holeScores: Record<string, HoleScore>) {
      // Save to live_scores (non-blocking)
      const rows = playerSetups
        .map(({ player, playingHcp }) => {
          const hs = holeScores[player.id]
          if (!hs?.gross && !hs?.isNR) return null
          const p = effectivePar(hole, player.gender, courseId)
          const si = effectiveSI(hole, player.gender, courseId)
          const gross = hs.isNR ? nrGross(p, si, playingHcp) : hs.gross!
          return {
            player_id: player.id, round_id: roundId, hole_number: hole.hole_number,
            gross_score: gross,
            stableford_points: hs.isNR ? 0 : calcStableford(gross, p, si, playingHcp),
            committed: false,
          }
        }).filter(Boolean)
      if (rows.length > 0) {
        supabase.from("live_scores").upsert(rows as any, { onConflict: "player_id,round_id,hole_number" })
          .then(() => {}) // fire and forget
      }

      const updated: Record<string, HoleScore> = {}
      for (const { player, playingHcp } of playerSetups) {
        const hs = holeScores[player.id]
        const p = effectivePar(hole, player.gender, courseId)
        const si = effectiveSI(hole, player.gender, courseId)
        updated[player.id] = {
          ...hs,
          stableford: hs?.isNR ? 0 : hs?.gross != null ? calcStableford(hs.gross, p, si, playingHcp) : null,
        }
      }
      setScores(prev => ({ ...prev, [holeIdx]: updated }))

      if (holeIdx < courseHoles.length - 1) {
        setHoleIdx(holeIdx + 1)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else {
        setSelectedSummaryPlayerId(playerSetups[0]?.player.id ?? "")
        setStep("summary")
        window.scrollTo({ top: 0, behavior: "instant" })
      }
    }

    return (
      <div
        className="overflow-x-hidden"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return
          const delta = e.changedTouches[0].clientX - touchStartX.current
          touchStartX.current = null
          if (delta < -60 && !showLeaderboard) { onLeaderboardChange(true); return }
          if (delta > 60 && showLeaderboard) { onLeaderboardChange(false); return }
        }}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ width: "200%", transform: showLeaderboard ? "translateX(-50%)" : "translateX(0)" }}
        >
          {/* Left panel: hole score entry */}
          <div style={{ width: "50%" }}>
            <HoleCard
              key={hole.id}
              hole={hole}
              playerSetups={playerSetups}
              courseId={courseId}
              existingScores={existingHoleScores}
              runningTotals={runningTotals}
              onSubmit={handleHoleSubmit}
              onBack={handleHoleBack}
              showLeaderboard={showLeaderboard}
            />
          </div>
          {/* Right panel: live leaderboard */}
          <div style={{ width: "50%" }}>
            {liveRound && (
              <LiveLeaderboardPanel
                liveRound={liveRound}
                players={players}
                holes={holes}
                roundHandicaps={roundHandicaps}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Summary ──────────────────────────────────────────────

  if (step === "summary") {
    const selectedId = selectedSummaryPlayerId || playerSetups[0]?.player.id || ""
    const selectedSetup = playerSetups.find(ps => ps.player.id === selectedId) ?? playerSetups[0]

    // ── Edit mode ──
    if (editingPlayerId) {
      const editSetup = playerSetups.find(ps => ps.player.id === editingPlayerId)
      if (!editSetup) { setEditingPlayerId(null); return null }
      const { player, playingHcp } = editSetup

      return (
        <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 77px)" }}>

          {/* Sub-header */}
          <div className="sticky top-[77px] z-10 bg-[#0a1a0e] border-b border-[#1e3d28] px-4 py-3 flex items-center justify-between">
            <BackButton onClick={() => setEditingPlayerId(null)} />
            <div className="flex items-center gap-2">
              {player.teams && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: player.teams.color }} />
              )}
              <span className="text-white/80 text-base font-semibold">{player.name}</span>
            </div>
            <div className="w-[60px]" />
          </div>

          {/* Scrollable holes */}
          <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-28 space-y-2">
            {courseHoles.map((hole, idx) => {
              const hs = editDraft[idx] ?? { gross: null, isNR: false, stableford: null }
              const ePar = effectivePar(hole, player.gender, courseId)
              const eSI  = effectiveSI(hole, player.gender, courseId)
              const netParGross = ePar + shotsReceived(eSI, playingHcp)
              const pts = hs.isNR ? 0 : hs.gross !== null
                ? calcStableford(hs.gross, ePar, eSI, playingHcp)
                : null
              const { label, color } = hs.isNR
                ? { label: "NR", color: "text-orange-400/70" }
                : hs.gross !== null ? scoreToPar(hs.gross, ePar)
                : { label: "", color: "" }

              const ptsBadge =
                hs.isNR      ? "border-orange-900/50 bg-orange-900/30 text-orange-400/80" :
                pts === null  ? "border-white/10 text-white/15" :
                pts >= 3      ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]" :
                pts === 2     ? "border-white/20 bg-white/5 text-white" :
                pts === 1     ? "border-white/10 bg-transparent text-white/40" :
                                "border-red-900/40 bg-red-900/20 text-red-400/70"

              const stepScore = (delta: number) => {
                if (hs.isNR) return
                const cur = hs.gross === null ? netParGross : hs.gross
                setDraftHole(idx, { gross: Math.max(1, Math.min(12, cur + delta)), isNR: false })
              }
              const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
                const v = e.target.value
                if (v === "") { setDraftHole(idx, { gross: null }); return }
                const n = parseInt(v, 10)
                if (!isNaN(n) && n >= 1 && n <= 12) setDraftHole(idx, { gross: n, isNR: false })
              }
              const toggleNR = () => setDraftHole(idx,
                hs.isNR ? { isNR: false, gross: null } : { isNR: true, gross: null }
              )

              return (
                <div key={hole.id} className={`bg-[#0f2418] border rounded-sm ${hs.isNR ? "border-orange-900/50" : "border-[#1e3d28]"}`}>
                  {/* Hole info row */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="flex items-baseline gap-3">
                      <span className="font-[family-name:var(--font-playfair)] text-2xl text-white leading-none w-6">{hole.hole_number}</span>
                      <span className="text-white/45 text-base">Par <span className="text-white font-semibold">{ePar}</span></span>
                      <span className="text-white/25 text-sm">SI {eSI}</span>
                    </div>
                    <button
                      onClick={toggleNR}
                      className={`text-sm tracking-widest uppercase border rounded-sm px-2.5 py-1 transition-colors
                        ${hs.isNR
                          ? "border-orange-400/60 text-orange-400 bg-orange-900/20"
                          : "border-white/15 text-white/30 hover:border-orange-400/40 hover:text-orange-400/60"}`}
                    >
                      NR
                    </button>
                  </div>

                  {/* Score stepper row */}
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <button
                      onClick={() => stepScore(-1)} disabled={hs.isNR}
                      className="flex-1 h-16 rounded-sm border border-[#1e3d28] text-white/60 text-4xl leading-none
                        hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
                        flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
                    >−</button>
                    {hs.isNR ? (
                      <span className="font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center text-white/20 w-20 h-16">—</span>
                    ) : (
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={hs.gross === null ? "" : String(hs.gross)}
                        onChange={onInput}
                        className={`font-[family-name:var(--font-playfair)] text-4xl text-center bg-transparent
                          outline-none text-white caret-[#C9A84C] border rounded-sm transition-colors p-0 w-20 h-16
                          ${hs.gross === null ? "border-[#C9A84C]/50" : "border-[#C9A84C]/15"}`}
                        style={{ lineHeight: "4rem" }}
                      />
                    )}
                    <button
                      onClick={() => stepScore(1)} disabled={hs.isNR}
                      className="flex-1 h-16 rounded-sm border border-[#1e3d28] text-white/60 text-4xl leading-none
                        hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
                        flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
                    >+</button>
                    <div className={`flex-shrink-0 flex items-baseline gap-1 px-2.5 py-1.5 rounded-sm border ${ptsBadge}`}>
                      <span className="text-lg font-bold leading-none font-[family-name:var(--font-playfair)]">{pts ?? "·"}</span>
                      <span className="text-[10px] opacity-60">pts</span>
                    </div>
                    {label && label !== "NR" && (
                      <span className={`text-sm flex-shrink-0 ${color}`}>{label}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sticky save */}
          <div className="sticky bottom-0 bg-[#0a1a0e] border-t border-[#1e3d28] px-4 py-4 max-w-lg mx-auto w-full">
            <button
              onClick={saveEditDraft}
              disabled={editSaving}
              className="w-full py-4 bg-[#C9A84C] text-black text-base tracking-[0.2em] uppercase font-bold
                hover:bg-[#d4b05a] disabled:opacity-50 transition-colors rounded-sm"
            >
              {editSaving ? "Saving…" : "Confirm"}
            </button>
          </div>

        </div>
      )
    }

    return (
      <div className="max-w-lg mx-auto w-full px-4 pt-5 pb-8 flex flex-col gap-4">

        {/* Player selector tiles — 2+ players only */}
        {playerSetups.length >= 2 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4">
            {playerSetups.map(({ player, playingHcp }) => {
              const isSel = player.id === selectedId
              return (
                <button
                  key={player.id}
                  onClick={() => setSelectedSummaryPlayerId(player.id)}
                  className={`flex-shrink-0 flex flex-col items-start px-3.5 py-2.5 rounded-sm border transition-colors min-w-[100px]
                    ${isSel
                      ? "border-[#C9A84C] bg-[#C9A84C]/10"
                      : "border-[#1e3d28] bg-[#0f2418] hover:border-white/20"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {player.teams && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: player.teams.color }} />
                    )}
                    <span className={`text-base font-medium leading-tight ${isSel ? "text-white" : "text-white/55"}`}>
                      {player.name.split(" ")[0]}
                    </span>
                  </div>
                  <span className={`text-sm ${isSel ? "text-[#C9A84C]" : "text-white/25"}`}>HC {playingHcp}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Paper scorecard */}
        {selectedSetup && (() => {
          const { player, playingHcp, tee } = selectedSetup

          const currentRound = rounds.find(r => r.id === liveRound?.round_id)
          const courseNameLabel = currentRound?.courses?.name ?? ""
          const ROUND_DATES: Record<number, string> = { 1: "Thu 16 Apr", 2: "Fri 17 Apr", 3: "Sat 18 Apr" }
          const dateLabel = ROUND_DATES[currentRound?.round_number ?? 0] ?? ""

          let totalPts = 0, totalGross = 0, totalYards = 0, totalPar = 0
          let front9Pts = 0, front9Gross = 0, front9Yards = 0, front9Par = 0
          let hasAnyScore = false

          const rows = courseHoles.map((hole, idx) => {
            const hs      = scores[idx]?.[player.id]
            const ePar    = effectivePar(hole, player.gender, courseId)
            const eSI     = effectiveSI(hole, player.gender, courseId)
            const isNR      = hs?.isNR === true
            const gross     = isNR ? null : (hs?.gross ?? null)  // null for NR display
            const grossFull = hs?.gross ?? null                   // NR max gross for subtotals
            const pts       = isNR ? 0 : gross !== null
              ? (hs?.stableford ?? calcStableford(gross, ePar, eSI, playingHcp))
              : null
            const yardage = yardageForTee(hole, tee.name)

            if (pts !== null) { totalPts += pts; hasAnyScore = true }
            if (grossFull !== null) totalGross += grossFull
            if (yardage) totalYards += yardage
            totalPar += ePar
            if (idx < 9) {
              if (pts !== null) front9Pts += pts
              if (grossFull !== null) front9Gross += grossFull
              if (yardage) front9Yards += yardage
              front9Par += ePar
            }
            return { hole, idx, isNR, gross, pts, ePar, eSI, yardage }
          })

          const back9Pts   = totalPts   - front9Pts
          const back9Gross = totalGross - front9Gross
          const back9Yards = totalYards - front9Yards
          const back9Par   = totalPar   - front9Par

          // Score symbol — tight fit, number fills most of symbol, uniform row height
          const scoreSymbol = (gross: number | null, ePar: number, isNR: boolean) => {
            if (isNR) return <span className="inline-flex items-center justify-center w-7 h-7 border border-orange-500/60 rounded-sm text-orange-500 text-xs font-semibold" style={{ fontFamily: "Georgia, serif" }}>NR</span>
            if (gross === null) return <span className="text-[#A89880] text-base">—</span>
            const diff = gross - ePar
            const n = <span className="text-base font-semibold leading-none">{gross}</span>
            if (diff <= -2) return (
              <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#C9A84C]">
                <span className="absolute inset-[2px] rounded-full border border-[#C9A84C]" />
                <span className="relative text-[10px] font-semibold leading-none text-[#7B5C1E]">{gross}</span>
              </span>
            )
            if (diff === -1) return <span className="w-7 h-7 rounded-full border border-[#C9A84C] flex items-center justify-center text-[#7B5C1E]">{n}</span>
            if (diff === 0)  return <span className="text-[#3A3A2E] text-sm font-semibold" style={{ fontFamily: "Georgia, serif" }}>{gross}</span>
            if (diff === 1)  return <span className="w-7 h-7 rounded-md border border-[#9B8860] flex items-center justify-center text-[#5A4F3A]">{n}</span>
            return (
              <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#9B8860]">
                <span className="absolute inset-[2px] rounded-sm border border-[#9B8860]" />
                <span className="relative text-[10px] font-semibold leading-none text-[#5A4F3A]">{gross}</span>
              </span>
            )
          }

          const ptsColor = (pts: number | null) =>
            pts === null ? "text-[#A89880]" :
            pts === 0    ? "text-[#A89880] opacity-50" :
                           "text-[#7B6C3E] font-bold"

          // fr columns fill full card width; Score gets extra space for symbol
          const grid  = "grid grid-cols-[2fr_3fr_2fr_2fr_3fr_2fr] w-full"
          const sf    = { fontFamily: "Georgia, serif" }
          const muted = "text-[#7A7060]"
          const dark  = "text-[#3A3A2E]"

          return (
            <div className="rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.22)] relative" style={{ background: "#F5F0E8" }}>

              {/* Course banner — scrolls with page, does not stick */}
              <div className="rounded-t-xl px-4 py-3 border-b border-[#2a5540]" style={{ background: "#1C3E2A" }}>
                <p className="text-white text-base font-semibold" style={sf}>{courseNameLabel}</p>
              </div>

              {/* Sticky: player details row + column header row */}
              <div className="sticky top-[77px] z-10">

                {/* Player details row */}
                <div className="flex items-end gap-4 px-4 py-2.5 border-b border-[#D4CBBA]" style={{ background: "#EAE4D5" }}>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className={`text-[10px] tracking-[0.15em] uppercase ${muted}`} style={sf}>Player</span>
                    <span className="font-[family-name:var(--font-playfair)] text-xl text-[#2C2C1E] font-semibold leading-tight truncate">{player.name}</span>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className={`text-[10px] tracking-[0.15em] uppercase ${muted}`} style={sf}>Tee</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${TEE_STYLES[tee.name]?.dot ?? "bg-white/40"}`} />
                      <span className={`text-base font-semibold ${dark}`} style={sf}>{tee.name}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className={`text-[10px] tracking-[0.15em] uppercase ${muted}`} style={sf}>PH</span>
                    <span className={`text-base font-semibold ${dark}`} style={sf}>{playingHcp}</span>
                  </div>
                </div>

                {/* Column headers */}
                <div className={`${grid} px-3 py-2 border-b border-[#D4CBBA]`} style={{ background: "#EAE4D5" }}>
                  {(["Hole","Yds","Par","SI","Score","Pts"] as const).map((h, i) => (
                    <span key={h} className={`text-[11px] tracking-[0.15em] uppercase font-semibold ${muted} ${i === 4 ? "text-center" : i === 5 ? "text-right" : ""}`} style={sf}>{h}</span>
                  ))}
                </div>
              </div>

              {/* Front 9 */}
              {rows.slice(0, 9).map(({ hole, idx, isNR, gross, pts, ePar, eSI, yardage }) => (
                <div key={hole.id} className={`${grid} px-3 py-2 items-center border-b border-[#E2DAC8] ${idx % 2 === 1 ? "bg-[#EEE8D6]" : ""}`}>
                  <span className={`text-base font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
                  <span className={`text-base ${muted}`} style={sf}>{yardage ?? "—"}</span>
                  <span className={`text-base ${dark}`} style={sf}>{ePar}</span>
                  <span className={`text-base ${muted}`} style={sf}>{eSI}</span>
                  <span className="flex items-center justify-center">{scoreSymbol(gross, ePar, isNR)}</span>
                  <span className={`text-right text-lg ${ptsColor(pts)}`} style={sf}>{pts ?? "—"}</span>
                </div>
              ))}

              {/* Out subtotal — gold fill, bolder text */}
              <div className={`${grid} px-3 py-2.5 items-center border-b border-[#C9A84C]/20`} style={{ background: "rgba(201,168,76,0.16)" }}>
                <span className="text-sm font-bold tracking-widest uppercase text-[#5C4520]" style={sf}>Out</span>
                <span className={`text-sm ${muted}`} style={sf}>{front9Yards > 0 ? front9Yards : "—"}</span>
                <span className={`text-sm font-bold ${dark}`} style={sf}>{front9Par}</span>
                <span />
                <span className={`text-center text-xl font-bold ${dark}`} style={sf}>{front9Gross > 0 ? front9Gross : "—"}</span>
                <span className={`text-right text-lg font-bold text-[#7B6C3E]`} style={sf}>{front9Pts}</span>
              </div>

              {/* Back 9 — pos = idx+1; bg when idx is even (pos is odd) */}
              {rows.slice(9).map(({ hole, idx, isNR, gross, pts, ePar, eSI, yardage }) => (
                <div key={hole.id} className={`${grid} px-3 py-2 items-center border-b border-[#E2DAC8] ${idx % 2 === 0 ? "bg-[#EEE8D6]" : ""}`}>
                  <span className={`text-base font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
                  <span className={`text-base ${muted}`} style={sf}>{yardage ?? "—"}</span>
                  <span className={`text-base ${dark}`} style={sf}>{ePar}</span>
                  <span className={`text-base ${muted}`} style={sf}>{eSI}</span>
                  <span className="flex items-center justify-center">{scoreSymbol(gross, ePar, isNR)}</span>
                  <span className={`text-right text-lg ${ptsColor(pts)}`} style={sf}>{pts ?? "—"}</span>
                </div>
              ))}

              {/* In subtotal — gold fill, bolder text */}
              <div className={`${grid} px-3 py-2.5 items-center border-b border-[#C9A84C]/20`} style={{ background: "rgba(201,168,76,0.16)" }}>
                <span className="text-sm font-bold tracking-widest uppercase text-[#5C4520]" style={sf}>In</span>
                <span className={`text-sm ${muted}`} style={sf}>{back9Yards > 0 ? back9Yards : "—"}</span>
                <span className={`text-sm font-bold ${dark}`} style={sf}>{back9Par}</span>
                <span />
                <span className={`text-center text-xl font-bold ${dark}`} style={sf}>{back9Gross > 0 ? back9Gross : "—"}</span>
                <span className={`text-right text-lg font-bold text-[#7B6C3E]`} style={sf}>{back9Pts}</span>
              </div>

              {/* Total — deepest gold, heaviest weight */}
              <div className={`${grid} px-3 py-3 items-center border-t border-[#C9A84C]/35 rounded-b-xl`} style={{ background: "rgba(201,168,76,0.35)" }}>
                <span className="text-sm font-bold tracking-widest uppercase text-[#4A3810]" style={sf}>Tot</span>
                <span className={`text-sm font-semibold ${muted}`} style={sf}>{totalYards > 0 ? totalYards : "—"}</span>
                <span className={`text-sm font-bold ${dark}`} style={sf}>{totalPar}</span>
                <span />
                <span className={`text-center text-xl font-extrabold ${dark}`} style={sf}>{hasAnyScore && totalGross > 0 ? totalGross : "—"}</span>
                <span className="text-right text-xl font-extrabold text-[#5C4520] font-[family-name:var(--font-playfair)]">{totalPts}</span>
              </div>

            </div>
          )
        })()}

        {error && <p className="text-red-400 text-base text-center">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => enterEditMode(selectedId)}
            className="flex-1 py-4 border border-white/20 text-white/60 text-base tracking-[0.15em] uppercase hover:border-white/40 transition-colors rounded-sm"
          >
            Edit Scorecard
          </button>
          <button
            onClick={handleCommit}
            disabled={saving}
            className="flex-[2] py-4 bg-[#C9A84C] text-black text-base tracking-[0.2em] uppercase font-bold hover:bg-[#d4b05a] disabled:opacity-50 transition-colors rounded-sm"
          >
            {saving ? "Saving…" : "Commit All"}
          </button>
        </div>

      </div>
    )
  }

  // ─── Committed ────────────────────────────────────────────

  if (step === "committed") {
    return (
      <div className="flex flex-col items-center justify-center px-6 gap-6 text-center min-h-[calc(100dvh-113px)]">
        <div className="w-16 h-16 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C] text-3xl">✓</div>
        <div>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-white mb-2">Scores Committed</h2>
          <p className="text-white/40 text-base">Saved to the official leaderboard.</p>
        </div>
        <button
          onClick={() => { setSelectedPlayerIds([]); setPlayerTeeIds({}); setScores({}); setHoleIdx(0); setStep("setup") }}
          className="mt-4 px-8 py-3 border border-[#C9A84C]/50 text-[#C9A84C] text-sm tracking-[0.2em] uppercase hover:bg-[#C9A84C]/10 transition-colors"
        >
          Score Another Player
        </button>
        <button onClick={() => setCloseConfirm(true)} className="text-white/20 text-sm tracking-widest uppercase hover:text-red-400/60 transition-colors">
          Close Live Round
        </button>
      </div>
    )
  }

  return null
}

// ─── HoleCard ─────────────────────────────────────────────

function HoleCard({
  hole, playerSetups, courseId,
  existingScores, runningTotals, onSubmit, onBack, showLeaderboard,
}: {
  hole: Hole
  playerSetups: PlayerSetup[]; courseId: string
  existingScores: Record<string, HoleScore>
  runningTotals: Record<string, number>
  onSubmit: (scores: Record<string, HoleScore>) => void
  onBack: () => void
  showLeaderboard: boolean
}) {
  const [holeScores, setHoleScores] = useState<Record<string, HoleScore>>(() => {
    const init: Record<string, HoleScore> = {}
    for (const { player } of playerSetups) {
      init[player.id] = existingScores[player.id] ?? { gross: null, isNR: false, stableford: null }
    }
    return init
  })

  const allHaveGross = playerSetups.every(({ player }) => {
    const hs = holeScores[player.id]
    return hs?.gross !== null || hs?.isNR === true
  })

  function set(pid: string, update: Partial<HoleScore>) {
    setHoleScores(prev => ({ ...prev, [pid]: { ...prev[pid], ...update } }))
  }

  return (
    <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-4">

      {/* One tile per player */}
      <div className="flex flex-col gap-3">
        {playerSetups.map(({ player, playingHcp, tee }) => {
          const hs   = holeScores[player.id] ?? { gross: null, isNR: false, stableford: null }
          const ePar = effectivePar(hole, player.gender, courseId)
          const eSI  = effectiveSI(hole, player.gender, courseId)
          return (
            <LivePlayerTile
              key={player.id}
              hole={hole}
              effectivePar={ePar}
              effectiveSI={eSI}
              playerName={player.name}
              teamColor={player.teams?.color}
              score={hs.gross}
              isNR={hs.isNR}
              playingHcp={playingHcp}
              runningTotal={runningTotals[player.id] ?? 0}
              yardage={yardageForTee(hole, tee.name)}
              onChange={v  => set(player.id, { gross: v, isNR: false })}
              onToggleNR={() => set(player.id, hs.isNR ? { isNR: false, gross: null } : { isNR: true, gross: null })}
            />
          )
        })}
      </div>

      {/* Nav bar — fixed to viewport bottom, hidden when leaderboard is active */}
      <div className={`fixed bottom-0 left-0 z-50 w-screen px-4 bg-[#0a1a0e] border-t border-[#1e3d28] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex gap-3${showLeaderboard ? " hidden" : ""}`}>
        <button
          onClick={onBack}
          className="flex-1 py-4 border border-white/20 text-white/50 text-2xl
            hover:border-white/40 hover:text-white/70 active:bg-white/5 transition-colors rounded-sm"
          aria-label="Previous hole"
        >
          ←
        </button>
        <button
          onClick={() => onSubmit(holeScores)}
          disabled={!allHaveGross}
          className="flex-[2] py-4 bg-[#C9A84C] text-black text-2xl font-bold
            hover:bg-[#d4b05a] disabled:opacity-30 disabled:cursor-not-allowed
            active:scale-[0.98] transition-all rounded-sm"
          aria-label="Next hole"
        >
          →
        </button>
      </div>

    </div>
  )
}

// ─── LivePlayerTile ───────────────────────────────────────
// Visual clone of ScoreEntryForm's HoleCard tile, adapted for the live
// scoring context: accepts pre-computed effectivePar / effectiveSI and
// renders a player name header above the hole info row.

function LivePlayerTile({
  hole, effectivePar, effectiveSI, playerName, teamColor,
  score, isNR, playingHcp, yardage, runningTotal,
  onChange, onToggleNR,
}: {
  hole: Hole
  effectivePar: number
  effectiveSI: number
  playerName: string
  teamColor?: string
  score: number | null
  isNR: boolean
  playingHcp: number
  yardage?: number | null
  runningTotal: number
  onChange: (v: number | null) => void
  onToggleNR: () => void
}) {
  const netParGross = effectivePar + shotsReceived(effectiveSI, playingHcp)
  const hasScore    = score !== null

  const pts = isNR ? 0 : hasScore ? calcStableford(score, effectivePar, effectiveSI, playingHcp) : null
  const { label, color } = isNR
    ? { label: "No Return", color: "text-orange-400/70" }
    : hasScore ? scoreToPar(score, effectivePar)
    : { label: "", color: "" }

  const ptsBadge =
    isNR         ? "border-orange-900/50 bg-orange-900/30 text-orange-400/80" :
    pts === null ? "border-white/10 text-white/15" :
    pts >= 3     ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]" :
    pts === 2    ? "border-white/20 bg-white/5 text-white" :
    pts === 1    ? "border-white/10 bg-transparent text-white/40" :
                   "border-red-900/40 bg-red-900/20 text-red-400/70"

  function handleStep(delta: number) {
    if (isNR) return
    if (score === null) onChange(netParGross)
    else onChange(Math.max(1, Math.min(12, score + delta)))
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (v === "") { onChange(null); return }
    const n = parseInt(v, 10)
    if (!isNaN(n) && n >= 1 && n <= 12) onChange(n)
  }

  return (
    <div className={`bg-[#0f2418] border rounded-sm transition-colors
      ${isNR ? "border-orange-900/50" : "border-[#1e3d28]"}`}>

      {/* Player name header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.06]">
        {teamColor && (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
        )}
        <span className="text-white/70 text-base font-semibold flex-1">{playerName}</span>
        <span className="text-[#C9A84C] text-base font-bold">{runningTotal} pts</span>
        <span className="text-white/20 text-sm">HC {playingHcp}</span>
      </div>

      {/* ══ MOBILE LAYOUT (hidden at sm+) ══ */}
      <div className="sm:hidden">

        {/* Row 1: hole info + NR toggle */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-white/50 text-base">
              Par <span className="text-white font-semibold">{effectivePar}</span>
            </span>
            <span className="text-white/30 text-base">SI {effectiveSI}</span>
            {yardage && <span className="text-white/25 text-sm">{yardage} yds</span>}
          </div>
          <button
            onClick={onToggleNR}
            className={`text-sm tracking-widest uppercase border rounded-sm px-3 py-1.5 transition-colors
              ${isNR
                ? "border-orange-400/60 text-orange-400 bg-orange-900/20"
                : "border-white/15 text-white/30 hover:border-orange-400/40 hover:text-orange-400/60"}`}
          >
            NR
          </button>
        </div>

        {/* Row 2: score stepper */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <button
            onClick={() => handleStep(-1)}
            disabled={isNR}
            className="flex-1 h-16 rounded-sm border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            −
          </button>
          {isNR ? (
            <span className="font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center
              text-white/20 w-20 h-16">
              —
            </span>
          ) : (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={score === null ? "" : String(score)}
              onChange={handleInputChange}
              className={`font-[family-name:var(--font-playfair)] text-4xl text-center bg-transparent
                outline-none text-white caret-[#C9A84C] border rounded-sm transition-colors p-0 w-20 h-16
                ${score === null ? "border-[#C9A84C]/50" : "border-[#C9A84C]/15"}`}
              style={{ lineHeight: "4rem" }}
            />
          )}
          <button
            onClick={() => handleStep(1)}
            disabled={isNR}
            className="flex-1 h-16 rounded-sm border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>

        {/* Row 3: score label + pts badge */}
        <div className="flex items-center justify-between px-4 pb-4">
          <span className={`text-base font-semibold ${color || "text-white/15"}`}>
            {label || "—"}
          </span>
          <div className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-sm border ${ptsBadge}`}>
            <span className="text-2xl font-bold leading-none font-[family-name:var(--font-playfair)]">
              {pts ?? "·"}
            </span>
            <span className="text-[10px] opacity-60 leading-none">pts</span>
          </div>
        </div>

      </div>

      {/* ══ DESKTOP LAYOUT (hidden below sm) ══ */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-4">

        {/* Hole info */}
        <div className="flex flex-col gap-0.5 w-20 flex-shrink-0">
          <span className="text-white/50 text-sm">Par {effectivePar} · SI {effectiveSI}</span>
          {yardage && <span className="text-white/40 text-sm">{yardage} yds</span>}
          {label && <span className={`text-sm font-semibold mt-0.5 ${color}`}>{label}</span>}
        </div>

        {/* Score stepper + NR */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <button
            onClick={() => handleStep(-1)}
            disabled={isNR}
            className="w-14 h-14 rounded-full border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            −
          </button>
          {isNR ? (
            <span className="font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center
              text-white/20 w-14 h-14">
              —
            </span>
          ) : (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={score === null ? "" : String(score)}
              onChange={handleInputChange}
              className={`font-[family-name:var(--font-playfair)] text-4xl text-center bg-transparent
                outline-none text-white caret-[#C9A84C] border rounded-sm transition-colors p-0 w-14 h-14
                ${score === null ? "border-[#C9A84C]/50" : "border-[#C9A84C]/15"}`}
              style={{ lineHeight: "3.5rem" }}
            />
          )}
          <button
            onClick={() => handleStep(1)}
            disabled={isNR}
            className="w-14 h-14 rounded-full border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            +
          </button>
          <button
            onClick={onToggleNR}
            className={`text-sm tracking-widest uppercase border rounded-sm px-2 py-1.5 flex-shrink-0 transition-colors
              ${isNR
                ? "border-orange-400/60 text-orange-400 bg-orange-900/20"
                : "border-white/15 text-white/30 hover:border-orange-400/40 hover:text-orange-400/60"}`}
          >
            NR
          </button>
        </div>

        {/* Pts badge */}
        <div className={`w-9 h-9 rounded-sm flex flex-col items-center justify-center flex-shrink-0
          ${isNR ? "bg-orange-900/40 text-orange-400/70"
            : pts === null ? "bg-transparent text-white/15"
            : pts >= 3 ? "bg-[#C9A84C] text-black"
            : pts === 2 ? "bg-white/10 text-white"
            : pts === 1 ? "bg-white/5 text-white/50"
            : "bg-red-900/30 text-red-400/70"}`}>
          <span className="text-lg font-bold leading-none">{pts ?? "·"}</span>
          <span className="text-[10px] opacity-60 leading-none mt-0.5">{pts !== null || isNR ? "pts" : ""}</span>
        </div>

      </div>
    </div>
  )
}
