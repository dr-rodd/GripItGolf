"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import LiveScoringFlow from "../LiveScoringFlow"
import LiveLeaderboardPanel from "../LiveLeaderboardPanel"
import type { ActiveLiveRound } from "../ScoringClient"
import BackButton from "@/app/components/BackButton"

// ─── Types ────────────────────────────────────────────────

interface LiveRoundFull extends ActiveLiveRound {
  activated_at: string
  session_finalised_at: string | null
}

interface ScorecardInfo {
  liveRound: LiveRoundFull
  playerNames: string[]
  playerIds: string[]
  holesThrough: number   // max hole_number any group player has scored
  finalised: boolean
}

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

interface Props {
  courseName: string
  courseId: string
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  tees: Tee[]
  roundHandicaps: RoundHandicap[]
}

type View = "dashboard" | "scoring" | "live-board" | "settings"

// ─── Component ────────────────────────────────────────────

export default function CourseDashboardClient({
  courseName, courseId, players, rounds, holes, tees, roundHandicaps,
}: Props) {
  const [view, setView]                       = useState<View>("dashboard")
  const [scoringLiveRound, setScoringLiveRound] = useState<ActiveLiveRound | null>(null)
  const [isResuming, setIsResuming]           = useState(false)
  const [starting, setStarting]               = useState(false)
  const [startError, setStartError]           = useState<string | null>(null)
  const [showLiveLeaderboard, setShowLiveLeaderboard] = useState(false)
  const [scorecards, setScorecards]           = useState<ScorecardInfo[]>([])
  const [loading, setLoading]                 = useState(true)
  const [liveHole, setLiveHole]                           = useState<{ idx: number; total: number } | null>(null)
  const [settingsVoidId, setSettingsVoidId]               = useState<string | null>(null)
  const [playerConfirm, setPlayerConfirm]                 = useState<{ type: "remove" | "unfinalise"; playerId: string; liveRoundId: string; roundId: string; playerName: string } | null>(null)
  const [settingsFinaliseSession, setSettingsFinaliseSession] = useState(false)
  const [settingsUnfinaliseSession, setSettingsUnfinaliseSession] = useState(false)
  const [settingsVoidSession, setSettingsVoidSession]     = useState(false)
  const [settingsWorking, setSettingsWorking]             = useState(false)
  const [settingsError, setSettingsError]                 = useState<string | null>(null)

  const nonComposite = players.filter(p => !p.is_composite)

  // Only pass this course's round to LiveScoringFlow so the "activate" step
  // only shows the one relevant round.
  const courseRoundsForFlow = rounds.filter(r => r.courses?.id === courseId)

  const fetchScorecards = useCallback(async () => {
    const { data: liveRoundsData } = await supabase
      .from("live_rounds")
      .select("id, course_id, round_id, status, session_finalised_at, activated_at, activated_by, rounds(round_number), courses(name)")
      .eq("course_id", courseId)
      .in("status", ["active", "finalised"])

    if (!liveRoundsData || liveRoundsData.length === 0) {
      setScorecards([])
      setLoading(false)
      return
    }

    const liveRoundIds = liveRoundsData.map((lr: any) => lr.id)
    const roundIds     = [...new Set(liveRoundsData.map((lr: any) => lr.round_id as string))]

    const [locksRes, scoresRes] = await Promise.all([
      supabase
        .from("live_player_locks")
        .select("live_round_id, player_id")
        .in("live_round_id", liveRoundIds),
      supabase
        .from("live_scores")
        .select("player_id, round_id, hole_number")
        .in("round_id", roundIds)
        .not("gross_score", "is", null),
    ])

    const locks  = locksRes.data  ?? []
    const scores = scoresRes.data ?? []

    const cards: ScorecardInfo[] = (liveRoundsData as any[]).map(lr => {
      const playerIds = locks
        .filter((l: any) => l.live_round_id === lr.id)
        .map((l: any) => l.player_id as string)

      const playerNames = playerIds
        .map((pid: string) => players.find(p => p.id === pid)?.name)
        .filter((n): n is string => Boolean(n))

      const groupScores = scores.filter(
        (s: any) => playerIds.includes(s.player_id) && s.round_id === lr.round_id
      )
      const holesThrough = groupScores.length > 0
        ? Math.max(...groupScores.map((s: any) => s.hole_number as number))
        : 0

      return { liveRound: lr as LiveRoundFull, playerNames, playerIds, holesThrough, finalised: lr.status === "finalised" }
    })

    setScorecards(cards)
    setLoading(false)
  }, [courseId, players])

  useEffect(() => {
    fetchScorecards()
    const interval = setInterval(fetchScorecards, 15000)
    return () => clearInterval(interval)
  }, [fetchScorecards])

  // Reference live round for the leaderboard panel — prefer active, fall back to any
  const firstLiveRound = (
    (scorecards.find(s => !s.finalised) ?? scorecards[0])?.liveRound ?? null
  ) as ActiveLiveRound | null

  const isSessionFinalised = scorecards.some(s => s.liveRound.session_finalised_at != null)

  // ─── Navigation helpers ───────────────────────────────────

  function goBack() {
    setView("dashboard")
    setShowLiveLeaderboard(false)
    setScoringLiveRound(null)
    setIsResuming(false)
    setLiveHole(null)
    fetchScorecards()
  }

  function openScoring(liveRound: ActiveLiveRound) {
    setScoringLiveRound(liveRound)
    setIsResuming(true)
    setShowLiveLeaderboard(false)
    setView("scoring")
  }

  async function startNewScorecard() {
    const courseRound = rounds.find(r => r.courses?.id === courseId)
    if (!courseRound || isSessionFinalised) return
    setStarting(true)
    setStartError(null)

    // Reuse an existing playerless active round rather than creating a duplicate
    const emptyExisting = scorecards.find(s => !s.finalised && s.playerNames.length === 0)
    if (emptyExisting) {
      setScoringLiveRound(emptyExisting.liveRound as unknown as ActiveLiveRound)
      setIsResuming(false)
      setShowLiveLeaderboard(false)
      setView("scoring")
      setStarting(false)
      return
    }

    const { data, error } = await supabase
      .from("live_rounds")
      .insert({ course_id: courseId, round_id: courseRound.id, status: "active" })
      .select("id, course_id, round_id, activated_by, rounds(round_number), courses(name)")
      .single()
    setStarting(false)
    if (error || !data) {
      setStartError(error?.message ?? "Failed to start scorecard")
      return
    }
    setScoringLiveRound(data as unknown as ActiveLiveRound)
    setIsResuming(false)
    setShowLiveLeaderboard(false)
    setView("scoring")
    fetchScorecards()
  }

  async function voidScorecard(liveRoundId: string) {
    setSettingsWorking(true)
    await Promise.all([
      supabase.from("live_rounds").update({ status: "closed" }).eq("id", liveRoundId),
      supabase.from("live_player_locks").delete().eq("live_round_id", liveRoundId),
    ])
    setSettingsVoidId(null)
    setSettingsWorking(false)
    fetchScorecards()
  }

  async function removePlayerFromScorecard(playerId: string, liveRoundId: string) {
    setSettingsWorking(true)
    await supabase.from("live_player_locks").delete()
      .eq("live_round_id", liveRoundId).eq("player_id", playerId)
    // Close round if now empty
    const { count } = await supabase
      .from("live_player_locks").select("*", { count: "exact", head: true })
      .eq("live_round_id", liveRoundId)
    if (!count || count === 0) {
      await supabase.from("live_rounds").update({ status: "closed" }).eq("id", liveRoundId)
    }
    setPlayerConfirm(null)
    setSettingsWorking(false)
    fetchScorecards()
  }

  async function unfinalisePlayer(playerId: string, liveRoundId: string, roundId: string) {
    setSettingsWorking(true)
    // Remove from finalised round
    await supabase.from("live_player_locks").delete()
      .eq("live_round_id", liveRoundId).eq("player_id", playerId)
    // Clear hole 18 so resume positions there
    await supabase.from("live_scores").delete()
      .eq("player_id", playerId).eq("round_id", roundId).eq("hole_number", 18)
    // Create a new active round for just this player
    const { data: newRound } = await supabase
      .from("live_rounds")
      .insert({ course_id: courseId, round_id: roundId, status: "active" })
      .select("id").single()
    if (newRound) {
      await supabase.from("live_player_locks").insert({ live_round_id: newRound.id, player_id: playerId })
    }
    setPlayerConfirm(null)
    setSettingsWorking(false)
    fetchScorecards()
  }

  async function finaliseSession() {
    setSettingsWorking(true)

    // 1. Void every active scorecard (with or without players)
    const activeScorecards = scorecards.filter(s => !s.finalised)
    if (activeScorecards.length > 0) {
      await Promise.all(activeScorecards.flatMap(s => [
        supabase.from("live_rounds")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("id", s.liveRound.id),
        supabase.from("live_player_locks")
          .delete()
          .eq("live_round_id", s.liveRound.id),
      ]))
    }

    // 2. Stamp session_finalised_at on all finalised rounds so the portal
    //    can show ✓ Completed even if some players were never assigned.
    const finalisedIds = scorecards.filter(s => s.finalised).map(s => s.liveRound.id)
    if (finalisedIds.length > 0) {
      await supabase.from("live_rounds")
        .update({ session_finalised_at: new Date().toISOString() })
        .in("id", finalisedIds)
    }

    setSettingsFinaliseSession(false)
    setSettingsWorking(false)
    fetchScorecards()
  }

  async function unfinaliseSession() {
    setSettingsWorking(true)
    setSettingsError(null)
    try {
      // Revert all finalised rounds to active and clear the session flag
      await supabase
        .from("live_rounds")
        .update({ status: "active", session_finalised_at: null })
        .eq("course_id", courseId)
        .eq("status", "finalised")
      // Also clear flag on any active rounds that may have it set
      await supabase
        .from("live_rounds")
        .update({ session_finalised_at: null })
        .eq("course_id", courseId)
        .not("session_finalised_at", "is", null)
      setSettingsUnfinaliseSession(false)
    } catch (e: any) {
      setSettingsError(e?.message ?? "Unfinalise failed — please try again")
    } finally {
      setSettingsWorking(false)
      fetchScorecards()
    }
  }

  async function voidLiveSession() {
    setSettingsWorking(true)
    setSettingsError(null)
    try {
      const { data: allRounds, error: fetchErr } = await supabase
        .from("live_rounds")
        .select("id, round_id")
        .eq("course_id", courseId)

      if (fetchErr) throw fetchErr

      const lrIds = (allRounds ?? []).map(r => r.id as string)
      const rIds  = [...new Set((allRounds ?? []).map(r => r.round_id as string))]

      if (lrIds.length > 0) {
        // Collect player IDs from locks so we can remove their committed scores
        const { data: lockData } = await supabase
          .from("live_player_locks")
          .select("player_id")
          .in("live_round_id", lrIds)
        const playerIds = [...new Set((lockData ?? []).map((l: any) => l.player_id as string))]

        // Delete committed scores and handicaps from official tables (finalised scorecards)
        if (playerIds.length > 0 && rIds.length > 0) {
          const scoreDeletes = rIds.flatMap(rid => [
            supabase.from("scores").delete().eq("round_id", rid).in("player_id", playerIds),
            supabase.from("round_handicaps").delete().eq("round_id", rid).in("player_id", playerIds),
          ])
          await Promise.all(scoreDeletes)
        }

        // Delete live data
        await Promise.all([
          supabase.from("live_player_locks").delete().in("live_round_id", lrIds),
          rIds.length > 0 ? supabase.from("live_scores").delete().in("round_id", rIds) : Promise.resolve(),
        ])

        const { error: deleteErr } = await supabase
          .from("live_rounds")
          .delete()
          .in("id", lrIds)
        if (deleteErr) throw deleteErr
      }

      setSettingsVoidSession(false)
    } catch (e: any) {
      setSettingsError(e?.message ?? "Void failed — please try again")
    } finally {
      setSettingsWorking(false)
      fetchScorecards()
    }
  }

  // ─── Header ───────────────────────────────────────────────

  const headerLeft = view === "dashboard"
    ? <BackButton href="/scoring" />
    : <BackButton onClick={goBack} />

  const headerRight = view === "scoring"
    ? <div className="w-[80px]" />
    : view === "dashboard"
        ? <button
            onClick={() => setView("settings")}
            aria-label="Settings"
            className="text-white/30 hover:text-white/60 transition-colors w-[80px] flex justify-end"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        : <div className="w-[80px]" />

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">

      {/* Sticky header */}
      <div className="border-b border-[#1e3d28] sticky top-0 z-20 bg-[#0a1a0e]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          {headerLeft}
          <h1 className="font-[family-name:var(--font-playfair)] text-xl text-white tracking-wide">
            {courseName}
          </h1>
          {headerRight}
        </div>
        {view === "scoring" && liveHole && (
          <div className="max-w-lg mx-auto px-4 pb-3">
            <div className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-playfair)] text-white text-3xl leading-none w-8 tabular-nums">
                {liveHole.idx + 1}
              </span>
              <div className="flex-1 flex gap-[2px]">
                {Array.from({ length: liveHole.total }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1 rounded-full transition-colors ${i < liveHole.idx ? "bg-green-500/60" : i === liveHole.idx ? "bg-[#C9A84C]/70" : "bg-white/10"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard / Scorecard banner — shown during score entry */}
        {view === "scoring" && (
          <div className="max-w-lg mx-auto px-4 pb-3">
            {showLiveLeaderboard ? (
              <button
                onClick={() => setShowLiveLeaderboard(false)}
                className="w-full py-2.5 flex items-center justify-center gap-2.5 border border-[#C9A84C]/25 bg-[#C9A84C]/5 hover:bg-[#C9A84C]/10 transition-colors rounded-sm"
              >
                <span className="text-[#C9A84C] text-sm tracking-[0.2em] uppercase">← Scorecard</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLiveLeaderboard(true)}
                className="w-full py-2.5 flex items-center justify-center gap-2.5 border border-green-600/25 bg-green-900/10 hover:bg-green-900/20 transition-colors rounded-sm"
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_3px_rgba(34,197,94,0.5)]" />
                <span className="text-green-400 text-sm tracking-[0.2em] uppercase">Live Leaderboard</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Dashboard ── */}
      {view === "dashboard" && (
        <div className="max-w-lg mx-auto">
          <div className="px-4 py-6 space-y-5">

          {/* Live Leaderboard — top of dashboard */}
          {firstLiveRound && (
            <button
              onClick={() => setView("live-board")}
              className="w-full py-3 flex items-center justify-center gap-2.5 border border-green-600/25 bg-green-900/10 hover:bg-green-900/20 transition-colors rounded-sm"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_3px_rgba(34,197,94,0.5)]" />
              <span className="text-green-400 text-sm tracking-[0.2em] uppercase">Live Leaderboard</span>
            </button>
          )}

          {/* Scorecards */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-white/30 text-xs tracking-[0.2em] uppercase">
                Scorecards
              </p>
              {scorecards.some(s => !s.finalised && s.playerNames.length > 0) && scorecards.some(s => s.finalised) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-amber-600/40 bg-amber-600/10 text-amber-400/80 text-xs tracking-wide font-semibold">
                  Mixed
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-white/20 text-base py-4">Loading…</p>
            ) : scorecards.length === 0 ? (
              <div className="border border-[#1e3d28] rounded-sm px-4 py-5">
                <p className="text-white/25 text-base">No active scorecards</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scorecards
                  .filter(s => s.playerNames.length > 0 || !scorecards.some(o => o.playerNames.length > 0))
                  .map(({ liveRound, playerNames, holesThrough, finalised }) => {
                  const startedAt = new Date(liveRound.activated_at).toLocaleTimeString("en-IE", {
                    hour: "2-digit", minute: "2-digit",
                  })
                  const holeLabel = finalised
                    ? "18 holes · Finalised"
                    : holesThrough === 0
                      ? "Starting"
                      : holesThrough >= 18
                        ? "Through 18"
                        : `Through ${holesThrough}`

                  return (
                    <div key={liveRound.id}>
                      <div
                        onClick={() => !finalised ? openScoring(liveRound) : undefined}
                        className={`w-full text-left border rounded-sm px-4 py-4 transition-colors
                          ${finalised
                            ? "border-[#C9A84C]/30 bg-[#C9A84C]/5"
                            : "border-[#1e3d28] hover:border-green-600/50 bg-[#0f2418] hover:bg-[#0d2015] cursor-pointer"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white text-base font-semibold leading-snug">
                              {playerNames.length > 0 ? playerNames.join(", ") : "No players locked in yet"}
                            </p>
                            <p className={`text-sm mt-1 ${finalised ? "text-[#C9A84C]/60" : "text-white/35"}`}>
                              {holeLabel} · Started {startedAt}
                            </p>
                          </div>
                          {playerNames.length > 0 && (finalised ? (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-sm border border-[#C9A84C]/40 bg-[#C9A84C]/10 text-[#C9A84C] text-sm font-semibold tracking-wide">
                              ✓ Done
                            </span>
                          ) : (
                            <span className="flex-shrink-0 text-[#C9A84C] text-sm tracking-wider uppercase pt-0.5">
                              Score →
                            </span>
                          ))}
                        </div>

                        {/* Hole progress bar — only for active in-progress scorecards */}
                        {!finalised && holesThrough > 0 && holesThrough < 18 && (
                          <div className="mt-3 flex gap-[2px]">
                            {Array.from({ length: 18 }).map((_, i) => (
                              <div
                                key={i}
                                className={`flex-1 h-1 rounded-full ${i < holesThrough ? "bg-green-500/60" : "bg-white/10"}`}
                              />
                            ))}
                          </div>
                        )}
                        {/* Full gold bar for finalised */}
                        {finalised && (
                          <div className="mt-3 flex gap-[2px]">
                            {Array.from({ length: 18 }).map((_, i) => (
                              <div key={i} className="flex-1 h-1 rounded-full bg-[#C9A84C]/40" />
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="space-y-3 pt-1">
            <button
              onClick={startNewScorecard}
              disabled={starting || isSessionFinalised}
              className="w-full py-4 border border-[#C9A84C]/40 text-[#C9A84C] text-base tracking-[0.2em] uppercase hover:bg-[#C9A84C]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-sm"
            >
              {starting ? "Starting…" : isSessionFinalised ? "Session Finalised" : "+ Start New Scorecard"}
            </button>
            {startError && (
              <p className="text-red-400/80 text-sm text-center">{startError}</p>
            )}
          </div>

          </div>
        </div>
      )}

      {/* ── Settings ── */}
      {view === "settings" && (() => {
            // Build list of scorecards that have players (active or finalised)
            const staffedScorecards = scorecards.filter(s => s.playerNames.length > 0)

            // Per-player lists for the Players section
            const activePlayersList = scorecards
              .filter(s => !s.finalised)
              .flatMap(s => s.playerIds.map((id, i) => ({
                id, name: s.playerNames[i] ?? id,
                liveRoundId: s.liveRound.id,
                roundId: s.liveRound.round_id,
              })))
            const finalisedPlayersList = scorecards
              .filter(s => s.finalised)
              .flatMap(s => s.playerIds.map((id, i) => ({
                id, name: s.playerNames[i] ?? id,
                liveRoundId: s.liveRound.id,
                roundId: s.liveRound.round_id,
              })))
            const allPlayersList = [...activePlayersList, ...finalisedPlayersList]

            // Legacy alias for Finalise Session visibility check
            const finalisedPlayers = finalisedPlayersList

            return (
              <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

                {/* ── Void Scorecard ── */}
                <section>
                  <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-3">Void Scorecard</p>
                  {staffedScorecards.length === 0 ? (
                    <p className="text-white/20 text-base border border-[#1e3d28] px-4 py-4 rounded-sm">No scorecards with players</p>
                  ) : (
                    <div className="space-y-2">
                      {staffedScorecards.map(s => {
                        const isConfirming = settingsVoidId === s.liveRound.id
                        return (
                          <div key={s.liveRound.id}>
                            <div
                              className={`border rounded-sm px-4 py-3 flex items-center justify-between gap-3 transition-colors
                                ${isConfirming ? "border-red-800/50 bg-red-950/20" : "border-[#1e3d28] bg-[#0f2418]"}`}
                            >
                              <div className="min-w-0">
                                <p className="text-white/70 text-base truncate">{s.playerNames.join(", ")}</p>
                                <p className="text-white/30 text-sm mt-0.5">
                                  {s.finalised ? "Finalised" : `Through ${s.holesThrough || "0"}`}
                                </p>
                              </div>
                              {!isConfirming ? (
                                <button
                                  onClick={() => setSettingsVoidId(s.liveRound.id)}
                                  className="flex-shrink-0 px-3 py-1.5 text-sm text-red-400/70 border border-red-800/40 hover:border-red-600/60 hover:text-red-300 transition-colors rounded-sm"
                                >
                                  Void
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => setSettingsVoidId(null)}
                                    className="px-3 py-1.5 text-sm text-white/40 border border-white/15 hover:border-white/30 transition-colors rounded-sm"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => voidScorecard(s.liveRound.id)}
                                    disabled={settingsWorking}
                                    className="px-3 py-1.5 text-sm text-red-300 border border-red-700/60 hover:border-red-500/70 disabled:opacity-50 transition-colors rounded-sm"
                                  >
                                    {settingsWorking ? "…" : "Confirm"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                {/* ── Players ── */}
                <section>
                  <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-3">Players</p>
                  {allPlayersList.length === 0 ? (
                    <p className="text-white/20 text-base border border-[#1e3d28] px-4 py-4 rounded-sm">No active or finalised players</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Active players */}
                      {activePlayersList.length > 0 && (
                        <>
                          <p className="text-white/20 text-xs tracking-[0.15em] uppercase pt-1 pb-0.5">Active</p>
                          {activePlayersList.map(({ id, name, liveRoundId, roundId }) => {
                            const isConfirming = playerConfirm?.playerId === id && playerConfirm.type === "remove"
                            return (
                              <div
                                key={id + liveRoundId}
                                className={`border rounded-sm px-4 py-3 flex items-center justify-between gap-3 transition-colors
                                  ${isConfirming ? "border-red-800/50 bg-red-950/20" : "border-[#1e3d28] bg-[#0f2418]"}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-white/70 text-base truncate">{name}</p>
                                  {isConfirming && (
                                    <p className="text-red-400/60 text-sm mt-0.5">Remove from scorecard?</p>
                                  )}
                                </div>
                                {!isConfirming ? (
                                  <button
                                    onClick={() => setPlayerConfirm({ type: "remove", playerId: id, liveRoundId, roundId, playerName: name })}
                                    className="flex-shrink-0 px-3 py-1.5 text-sm text-red-400/60 border border-red-800/40 hover:border-red-600/60 hover:text-red-300 transition-colors rounded-sm"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => setPlayerConfirm(null)}
                                      className="px-3 py-1.5 text-sm text-white/40 border border-white/15 hover:border-white/30 transition-colors rounded-sm"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => removePlayerFromScorecard(id, liveRoundId)}
                                      disabled={settingsWorking}
                                      className="px-3 py-1.5 text-sm text-red-300 border border-red-700/60 hover:border-red-500/70 disabled:opacity-50 transition-colors rounded-sm"
                                    >
                                      {settingsWorking ? "…" : "Confirm"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </>
                      )}
                      {/* Finalised players */}
                      {finalisedPlayersList.length > 0 && (
                        <>
                          <p className="text-white/20 text-xs tracking-[0.15em] uppercase pt-2 pb-0.5">Finalised</p>
                          {finalisedPlayersList.map(({ id, name, liveRoundId, roundId }) => {
                            const isConfirming = playerConfirm?.playerId === id && playerConfirm.type === "unfinalise"
                            return (
                              <div
                                key={id + liveRoundId}
                                className={`border rounded-sm px-4 py-3 flex items-center justify-between gap-3 transition-colors
                                  ${isConfirming ? "border-[#C9A84C]/40 bg-[#C9A84C]/5" : "border-[#1e3d28] bg-[#0f2418]"}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-white/70 text-base truncate">{name}</p>
                                  {isConfirming && (
                                    <p className="text-[#C9A84C]/60 text-sm mt-0.5">Reopens at hole 18. Other players on this card keep finalised state.</p>
                                  )}
                                </div>
                                {!isConfirming ? (
                                  <button
                                    onClick={() => setPlayerConfirm({ type: "unfinalise", playerId: id, liveRoundId, roundId, playerName: name })}
                                    className="flex-shrink-0 px-3 py-1.5 text-sm text-[#C9A84C]/60 border border-[#C9A84C]/25 hover:border-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors rounded-sm"
                                  >
                                    Unfinalise
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => setPlayerConfirm(null)}
                                      className="px-3 py-1.5 text-sm text-white/40 border border-white/15 hover:border-white/30 transition-colors rounded-sm"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => unfinalisePlayer(id, liveRoundId, roundId)}
                                      disabled={settingsWorking}
                                      className="px-3 py-1.5 text-sm text-[#C9A84C] border border-[#C9A84C]/50 hover:border-[#C9A84C]/80 disabled:opacity-50 transition-colors rounded-sm"
                                    >
                                      {settingsWorking ? "…" : "Confirm"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )}
                </section>

                {/* ── Unfinalise Round ── */}
                {isSessionFinalised && (
                  <section>
                    <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-3">Unfinalise Round</p>
                    {!settingsUnfinaliseSession ? (
                      <button
                        onClick={() => setSettingsUnfinaliseSession(true)}
                        className="w-full py-3 border border-[#C9A84C]/30 text-[#C9A84C]/60 text-base tracking-[0.15em] uppercase hover:border-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors rounded-sm"
                      >
                        Unfinalise Round
                      </button>
                    ) : (
                      <div className="border border-[#C9A84C]/30 bg-[#C9A84C]/5 rounded-sm px-4 py-4 space-y-3">
                        <p className="text-white/60 text-base">
                          Reverts all finalised scorecards to active and clears the session finalised flag. New scorecards can be started.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSettingsUnfinaliseSession(false)}
                            className="flex-1 py-2.5 text-sm text-white/40 border border-white/15 hover:border-white/30 transition-colors rounded-sm uppercase tracking-wider"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={unfinaliseSession}
                            disabled={settingsWorking}
                            className="flex-1 py-2.5 text-sm text-[#C9A84C] border border-[#C9A84C]/50 hover:border-[#C9A84C]/80 disabled:opacity-50 transition-colors rounded-sm uppercase tracking-wider"
                          >
                            {settingsWorking ? "…" : "Confirm"}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* ── Finalise Session ── */}
                {finalisedPlayers.length > 0 && !isSessionFinalised && (
                  <section>
                    <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-3">Finalise Session</p>
                    {!settingsFinaliseSession ? (
                      <button
                        onClick={() => setSettingsFinaliseSession(true)}
                        className="w-full py-3 border border-[#C9A84C]/40 text-[#C9A84C]/70 text-base tracking-[0.15em] uppercase hover:border-[#C9A84C]/70 hover:text-[#C9A84C] transition-colors rounded-sm"
                      >
                        Finalise Session
                      </button>
                    ) : (
                      <div className="border border-[#C9A84C]/30 bg-[#C9A84C]/5 rounded-sm px-4 py-4 space-y-3">
                        <p className="text-white/60 text-base">
                          {scorecards.filter(s => !s.finalised && s.playerNames.length > 0).length > 0
                            ? `${scorecards.filter(s => !s.finalised && s.playerNames.length > 0).length} active scorecard(s) will be discarded and those players released. Finalised scores are kept.`
                            : "The session will be marked as complete. Finalised scores are kept."
                          }
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSettingsFinaliseSession(false)}
                            className="flex-1 py-2.5 text-sm text-white/40 border border-white/15 hover:border-white/30 transition-colors rounded-sm uppercase tracking-wider"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={finaliseSession}
                            disabled={settingsWorking}
                            className="flex-1 py-2.5 text-sm text-[#C9A84C] border border-[#C9A84C]/50 hover:border-[#C9A84C]/80 disabled:opacity-50 transition-colors rounded-sm uppercase tracking-wider"
                          >
                            {settingsWorking ? "Finalising…" : "Confirm"}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* ── Void Live Session ── */}
                <section>
                  <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-3">Void Live Session</p>
                  {!settingsVoidSession ? (
                    <button
                      onClick={() => setSettingsVoidSession(true)}
                      className="w-full py-3 border border-red-900/50 text-red-400/60 text-base tracking-[0.15em] uppercase hover:border-red-700/60 hover:text-red-400 transition-colors rounded-sm"
                    >
                      Clear All Live Data
                    </button>
                  ) : (
                    <div className="border border-red-800/50 bg-red-950/20 rounded-sm px-4 py-4 space-y-3">
                      <p className="text-white/60 text-base">This will delete all scorecards, scores, and player locks for {courseName}. This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSettingsVoidSession(false)}
                          className="flex-1 py-2.5 text-sm text-white/40 border border-white/15 hover:border-white/30 transition-colors rounded-sm uppercase tracking-wider"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={voidLiveSession}
                          disabled={settingsWorking}
                          className="flex-1 py-2.5 text-sm text-red-300 border border-red-700/60 hover:border-red-500/70 disabled:opacity-50 transition-colors rounded-sm uppercase tracking-wider"
                        >
                          {settingsWorking ? "Clearing…" : "Void Session"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {settingsError && (
                  <p className="text-red-400 text-sm text-center pt-1">{settingsError}</p>
                )}

              </div>
            )
          })()}

      {/* ── Scoring ── */}
      {view === "scoring" && (
        <LiveScoringFlow
          players={nonComposite}
          rounds={courseRoundsForFlow}
          holes={holes}
          tees={tees}
          roundHandicaps={roundHandicaps}
          activeLiveRound={scoringLiveRound}
          autoResume={isResuming}
          onBack={goBack}
          onLiveRoundChange={r => {
            setScoringLiveRound(r)
            if (r) fetchScorecards()
          }}
          showLeaderboard={showLiveLeaderboard}
          onLeaderboardChange={setShowLiveLeaderboard}
          onHoleChange={(idx, total) => setLiveHole(idx >= 0 ? { idx, total } : null)}
        />
      )}

      {/* ── Live board ── */}
      {view === "live-board" && firstLiveRound && (
        <LiveLeaderboardPanel
          liveRound={firstLiveRound}
          players={nonComposite}
          holes={holes}
          roundHandicaps={roundHandicaps}
          onClose={goBack}
          showBackButton={false}
        />
      )}

    </div>
  )
}
