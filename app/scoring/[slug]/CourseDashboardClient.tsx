"use client"

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import LiveScoringFlow from "../LiveScoringFlow"
import LiveLeaderboardPanel from "../LiveLeaderboardPanel"
import type { ActiveLiveRound } from "../ScoringClient"
import BackButton from "@/app/components/BackButton"
import { CHROME_VAR, LEGACY_CHROME } from "../scoringHeaderMetrics"
import { FULL_ALLOWANCE, hasReduction } from "@/lib/handicapAllowance"
import {
  voidScorecard as voidScorecardData,
  removePlayerFromScorecard as removePlayerData,
} from "@/lib/scorecardVoid"
import { why } from "@/lib/writeFailure"

// ─── Types ────────────────────────────────────────────────

interface LiveRoundFull extends ActiveLiveRound {
  activated_at: string
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
interface RoundHandicap {
  round_id: string; player_id: string; playing_handicap: number
  /** Written when a session starts, so a card can name the tee mid-round. */
  tee_id?: string | null
}

interface Props {
  courseName: string
  courseId: string
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  tees: Tee[]
  roundHandicaps: RoundHandicap[]
  backHref?: string
  /**
   * Score this round specifically. A course can be played more than once in a
   * trip, so filtering by course alone would offer both and let someone score
   * against the wrong one. The trip route already knows which was asked for.
   */
  roundId?: string
  /**
   * How much sticky chrome is already pinned above this screen, in px.
   *
   * A trip route puts the site-wide TripHeader above this component, and both
   * are sticky. Left at 0 this header pinned to the very top of the viewport —
   * the same place TripHeader was already sitting — and, being the lower of
   * the two z-indexes, slid underneath it: the course name disappeared behind
   * the site header the moment the page was scrolled. The legacy
   * /scoring/[slug] route has nothing above it and leaves this at 0.
   */
  stickyTop?: number
  /**
   * Every handicap allowance this trip's leaderboards play off, highest first.
   *
   * One scorecard can be feeding a four-ball at 85% and a singles board at
   * 95%, so the handicap beside a player's name is not one number and the
   * scorer has to be able to see each of them. A single step means nothing is
   * reduced and no control appears at all. The legacy /scoring route knows
   * nothing about a trip's boards and leaves this alone.
   */
  allowances?: number[]
  /** Which of them the card opens on — the primary board's. */
  allowanceStart?: number
  /**
   * Room to leave at the bottom for anything fixed over this screen.
   *
   * The trip route puts the tab bar there. The legacy /scoring/[slug] route
   * has nothing below it and leaves this at 0 — a bare `0` rather than a
   * length, which is a valid `padding-bottom` and keeps that screen exactly
   * where it was.
   */
  bottomInset?: string
}

type View = "dashboard" | "scoring" | "live-board" | "settings"

// ─── Component ────────────────────────────────────────────

export default function CourseDashboardClient({
  courseName, courseId, players, rounds, holes, tees, roundHandicaps,
  backHref = "/scoring", roundId, stickyTop = 0,
  allowances = [FULL_ALLOWANCE], allowanceStart = 0, bottomInset = "0",
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
  const [settingsVoidSession, setSettingsVoidSession]     = useState(false)
  const [settingsWorking, setSettingsWorking]             = useState(false)
  const [settingsError, setSettingsError]                 = useState<string | null>(null)

  // Which handicap the card is currently showing. Display only: what gets
  // written stays at the full course handicap whatever this says, and every
  // board applies its own percentage when it reads the cards back.
  const [allowanceIdx, setAllowanceIdx] = useState(allowanceStart)
  const allowance = allowances[allowanceIdx] ?? FULL_ALLOWANCE
  const cycleAllowance = () => setAllowanceIdx(i => (i + 1) % allowances.length)

  // ─── How far down the chrome reaches ──────────────────────
  //
  // The header below is not one fixed height: during score entry it grows a
  // hole-progress row and a Live Leaderboard banner, so it is 77px on this
  // dashboard and around 185px mid-round. Everything that pins itself below
  // the header — the summary's sub-headers, the live board's column headings —
  // needs the real number for the view being shown, and see
  // ../scoringHeaderMetrics for why a constant could never be right.
  //
  // Measured rather than derived: the header's contents are ordinary flow
  // content, and a course name long enough to wrap changes its height too.
  const headerRef = useRef<HTMLDivElement>(null)
  const [chrome, setChrome] = useState(stickyTop + LEGACY_CHROME)

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setChrome(stickyTop + el.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [stickyTop])

  const nonComposite = players.filter(p => !p.is_composite)

  // Only pass the relevant round to LiveScoringFlow so the "activate" step
  // offers exactly one choice. When the caller names a round we use it; the
  // legacy per-course route falls back to matching on the course.
  const courseRoundsForFlow = roundId
    ? rounds.filter(r => r.id === roundId)
    : rounds.filter(r => r.courses?.id === courseId)

  const fetchScorecards = useCallback(async () => {
    // Scoped to the round when one is named: a course played twice in a trip
    // has two sets of scorecards, and they must not appear together.
    let query = supabase
      .from("live_rounds")
      .select("id, course_id, round_id, status, activated_at, activated_by, rounds(round_number), courses(name)")
      .in("status", ["active", "finalised"])
    query = roundId ? query.eq("round_id", roundId) : query.eq("course_id", courseId)
    const { data: liveRoundsData } = await query

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
  }, [courseId, roundId, players])

  useEffect(() => {
    fetchScorecards()
    const interval = setInterval(fetchScorecards, 15000)
    return () => clearInterval(interval)
  }, [fetchScorecards])

  // Reference live round for the leaderboard panel — prefer active, fall back to any
  const firstLiveRound = (
    (scorecards.find(s => !s.finalised) ?? scorecards[0])?.liveRound ?? null
  ) as ActiveLiveRound | null

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
    const courseRound = roundId
      ? rounds.find(r => r.id === roundId)
      : rounds.find(r => r.courses?.id === courseId)
    if (!courseRound) return
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

  async function voidScorecard(liveRoundId: string, voidRoundId: string) {
    setSettingsWorking(true)
    setSettingsError(null)
    // Erases the scores as well as releasing the players. Releasing them alone
    // is what "void" used to mean, and the round it was meant to undo carried
    // on standing on the leaderboard.
    const failure = await voidScorecardData(liveRoundId, voidRoundId)
    if (failure) setSettingsError(`Could not void that scorecard${why(failure)}`)
    else setSettingsVoidId(null)
    setSettingsWorking(false)
    fetchScorecards()
  }

  async function removePlayerFromScorecard(playerId: string, liveRoundId: string, playerRoundId: string) {
    setSettingsWorking(true)
    setSettingsError(null)
    // Their round goes with them, for the same reason a voided card's does.
    // Unfinalising is the opposite operation and keeps the scores.
    const failure = await removePlayerData(liveRoundId, playerRoundId, playerId)
    if (failure) {
      setSettingsError(`Could not remove that player${why(failure)}`)
      setSettingsWorking(false)
      fetchScorecards()
      return
    }
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
    ? <BackButton href={backHref} />
    : <BackButton onClick={goBack} />

  // Only the dashboard and score entry have anything to put on the right. The
  // other views reserved an 80px spacer there anyway, which cost the course
  // name a quarter of the row: "Doonbeg Greg Norman Course" wrapped to two
  // lines with 80px of the header sitting empty beside it. Nothing is centred
  // against that slot — the title is left-aligned beside the back button — so
  // reserving it bought nothing, and no view without a control needs it.
  //
  // Score entry puts the handicap allowance there, opposite the back button
  // and wearing the same box: it is the one thing on that screen you change
  // about the card rather than about a score. It only exists when the trip
  // actually reduces a handicap somewhere.
  const allowanceButton = hasReduction(allowances) ? (
    <button
      type="button"
      onClick={cycleAllowance}
      aria-label={`Showing ${allowance}% of course handicap. Tap for the next allowance.`}
      className={`inline-flex items-center justify-center flex-shrink-0 h-11 min-w-11 px-3
        rounded-xl border tabular-nums text-base font-semibold
        transition-colors duration-150
        ${allowance === FULL_ALLOWANCE
          ? "border-bark/12 bg-surface text-ink/80 hover:border-bark/25"
          : "border-accent/50 bg-accent/[0.10] text-accent-deep hover:bg-accent/15"}`}
    >
      {allowance}%
    </button>
  ) : null

  const headerRight = view === "scoring" || view === "live-board"
    ? allowanceButton
    : view === "dashboard"
    ? <button
            onClick={() => setView("settings")}
            aria-label="Settings"
            // A 44px square: the icon is 20px, but this is tapped with a thumb
            // on a tee box. Wide enough to hit, no wider than it has to be.
            className="text-ink/50 hover:text-ink/80 transition-colors w-11 h-11 flex-shrink-0 flex items-center justify-end"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
    : null

  // ─── Render ───────────────────────────────────────────────

  return (
    // The measured bottom edge of the header goes out as a custom property so
    // that everything below — the sticky rows in LiveScoringFlow, the live
    // board's column headings, the score-entry card's height — can pin itself
    // to the real one for the view on screen.
    <div
      className="bg-cream text-ink"
      style={{
        [CHROME_VAR]: `${chrome}px`,
        // A full `100dvh` here, with a 52px site header already above it, made
        // every scoring screen 52px taller than the window — enough scroll to
        // pull the score-entry card up off the Next button it is meant to sit
        // against, and reveal a band of bare cream underneath. It reaches to
        // the bottom of the window, not to a window's worth below the header.
        minHeight: `calc(100dvh - ${stickyTop}px)`,
        // The tab bar is fixed, so it sits over whatever is under it. This is
        // the room left for it — inside the height above rather than added to
        // it, so nothing grows taller than the window and the Next button
        // comes to rest just clear of the bar rather than beneath it.
        paddingBottom: bottomInset,
      } as React.CSSProperties}
    >

      {/* Sticky header.
          `top` is whatever is already pinned above this screen rather than 0:
          on a trip route that is the site-wide TripHeader, and sticking at 0
          put this header in the same place, underneath it, hiding the course
          name entirely once the page was scrolled.

          The title takes `flex-1 min-w-0` so it claims the width genuinely
          left over rather than being sized by flex-shrink arithmetic against
          a reserved slot on the right. `min-w-0` is what lets it shrink below
          its own text's natural width at all — without it a long course name
          pushes the header wider than the screen instead of wrapping. `ml-3`
          is the breathing room from the back button, which the title was
          otherwise butting straight up against. */}
      <div
        ref={headerRef}
        className="border-b border-bark/12 sticky z-20 bg-cream"
        style={{ top: stickyTop }}
      >
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center">
          {headerLeft}
          <h1 className="flex-1 min-w-0 ml-3 font-[family-name:var(--font-playfair)] text-2xl text-ink tracking-wide">
            {courseName}
          </h1>
          {headerRight}
        </div>
        {view === "scoring" && liveHole && (
          <div className="max-w-lg mx-auto px-4 pb-3">
            <div className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-playfair)] text-ink text-3xl leading-none w-8 tabular-nums">
                {liveHole.idx + 1}
              </span>
              <div className="flex-1 flex gap-[2px]">
                {Array.from({ length: liveHole.total }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1 rounded-full transition-colors ${i < liveHole.idx ? "bg-accent/60" : i === liveHole.idx ? "bg-accent/70" : "bg-bark/[0.06]"}`}
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
                className="w-full py-2.5 flex items-center justify-center gap-2.5 border border-accent/25 bg-accent/[0.07] hover:bg-accent/10 transition-colors rounded-xl"
              >
                <span className="text-accent-deep text-sm tracking-[0.2em] uppercase">← Scorecard</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLiveLeaderboard(true)}
                className="w-full py-2.5 flex items-center justify-center gap-2.5 border border-accent/25 bg-accent/[0.08] hover:bg-accent/15 transition-colors rounded-xl"
              >
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-accent-deep text-sm tracking-[0.2em] uppercase">Live Leaderboard</span>
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
              className="w-full py-3 flex items-center justify-center gap-2.5 border border-accent/25 bg-accent/[0.08] hover:bg-accent/15 transition-colors rounded-xl"
            >
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-accent-deep text-sm tracking-[0.2em] uppercase">Live Leaderboard</span>
            </button>
          )}

          {/* Scorecards */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-ink/50 text-xs tracking-[0.2em] uppercase">
                Scorecards
              </p>
              {scorecards.some(s => !s.finalised && s.playerNames.length > 0) && scorecards.some(s => s.finalised) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl border border-bark/25 bg-bark/[0.08] text-ink/80 text-xs tracking-wide font-semibold">
                  Mixed
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-ink/50 text-base py-4">Loading…</p>
            ) : scorecards.length === 0 ? (
              <div className="border border-bark/12 rounded-xl px-4 py-5">
                <p className="text-ink/50 text-base">No active scorecards</p>
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
                        className={`w-full text-left border rounded-xl px-4 py-4 transition-colors
                          ${finalised
                            ? "border-accent/30 bg-accent/[0.07]"
                            : "border-bark/12 hover:border-accent/50 bg-surface hover:bg-surface cursor-pointer"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-ink text-base font-semibold leading-snug">
                              {playerNames.length > 0 ? playerNames.join(", ") : "No players locked in yet"}
                            </p>
                            <p className={`text-sm mt-1 ${finalised ? "text-accent-deep/60" : "text-ink/65"}`}>
                              {holeLabel} · Started {startedAt}
                            </p>
                          </div>
                          {playerNames.length > 0 && (finalised ? (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-accent/40 bg-accent/10 text-accent-deep text-sm font-semibold tracking-wide">
                              ✓ Done
                            </span>
                          ) : (
                            <span className="flex-shrink-0 text-accent-deep text-sm tracking-wider uppercase pt-0.5">
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
                                className={`flex-1 h-1 rounded-full ${i < holesThrough ? "bg-accent/60" : "bg-bark/[0.06]"}`}
                              />
                            ))}
                          </div>
                        )}
                        {/* Full gold bar for finalised */}
                        {finalised && (
                          <div className="mt-3 flex gap-[2px]">
                            {Array.from({ length: 18 }).map((_, i) => (
                              <div key={i} className="flex-1 h-1 rounded-full bg-accent/40" />
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
              disabled={starting}
              className="w-full py-4 border border-accent/40 text-accent-deep text-base tracking-[0.2em] uppercase hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-xl"
            >
              {starting ? "Starting…" : "+ Start New Scorecard"}
            </button>
            {startError && (
              <p className="text-rust-deep/80 text-sm text-center">{startError}</p>
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

            return (
              <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

                {/* ── Void Scorecard ── */}
                <section>
                  <p className="text-ink/50 text-xs tracking-[0.2em] uppercase mb-3">Void Scorecard</p>
                  {staffedScorecards.length === 0 ? (
                    <p className="text-ink/50 text-base border border-bark/12 px-4 py-4 rounded-xl">No scorecards with players</p>
                  ) : (
                    <div className="space-y-2">
                      {staffedScorecards.map(s => {
                        const isConfirming = settingsVoidId === s.liveRound.id
                        return (
                          <div key={s.liveRound.id}>
                            <div
                              className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-colors
                                ${isConfirming ? "border-rust/40 bg-rust/[0.08]" : "border-bark/12 bg-surface"}`}
                            >
                              <div className="min-w-0">
                                <p className="text-ink/80 text-base truncate">{s.playerNames.join(", ")}</p>
                                <p className="text-ink/50 text-sm mt-0.5">
                                  {s.finalised ? "Finalised" : `Through ${s.holesThrough || "0"}`}
                                </p>
                                {/* Voiding erases the round, so it says so
                                    before the second tap rather than after —
                                    a finalised card's scores are already on
                                    the leaderboard being read. */}
                                {isConfirming && (
                                  <p className="text-rust text-sm mt-1 leading-snug">
                                    {s.finalised
                                      ? "Deletes this card's scores and takes the round off the leaderboard. It cannot be undone."
                                      : "Deletes the holes already entered on this card. It cannot be undone."}
                                  </p>
                                )}
                              </div>
                              {!isConfirming ? (
                                <button
                                  onClick={() => setSettingsVoidId(s.liveRound.id)}
                                  className="flex-shrink-0 px-3 py-1.5 text-sm text-rust border border-rust/40 hover:border-rust/60 hover:text-rust-deep transition-colors rounded-xl"
                                >
                                  Void
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => setSettingsVoidId(null)}
                                    className="px-3 py-1.5 text-sm text-ink/65 border border-bark/12 hover:border-bark/25 transition-colors rounded-xl"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => voidScorecard(s.liveRound.id, s.liveRound.round_id)}
                                    disabled={settingsWorking}
                                    className="px-3 py-1.5 text-sm text-rust-deep border border-rust/40 hover:border-rust/70 disabled:opacity-50 transition-colors rounded-xl"
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
                  <p className="text-ink/50 text-xs tracking-[0.2em] uppercase mb-3">Players</p>
                  {allPlayersList.length === 0 ? (
                    <p className="text-ink/50 text-base border border-bark/12 px-4 py-4 rounded-xl">No active or finalised players</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Active players */}
                      {activePlayersList.length > 0 && (
                        <>
                          <p className="text-ink/50 text-xs tracking-[0.15em] uppercase pt-1 pb-0.5">Active</p>
                          {activePlayersList.map(({ id, name, liveRoundId, roundId }) => {
                            const isConfirming = playerConfirm?.playerId === id && playerConfirm.type === "remove"
                            return (
                              <div
                                key={id + liveRoundId}
                                className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-colors
                                  ${isConfirming ? "border-rust/40 bg-rust/[0.08]" : "border-bark/12 bg-surface"}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-ink/80 text-base truncate">{name}</p>
                                  {isConfirming && (
                                    <p className="text-rust text-sm mt-0.5">Remove from scorecard?</p>
                                  )}
                                </div>
                                {!isConfirming ? (
                                  <button
                                    onClick={() => setPlayerConfirm({ type: "remove", playerId: id, liveRoundId, roundId, playerName: name })}
                                    className="flex-shrink-0 px-3 py-1.5 text-sm text-rust border border-rust/40 hover:border-rust/60 hover:text-rust-deep transition-colors rounded-xl"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => setPlayerConfirm(null)}
                                      className="px-3 py-1.5 text-sm text-ink/65 border border-bark/12 hover:border-bark/25 transition-colors rounded-xl"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => removePlayerFromScorecard(id, liveRoundId, roundId)}
                                      disabled={settingsWorking}
                                      className="px-3 py-1.5 text-sm text-rust-deep border border-rust/40 hover:border-rust/70 disabled:opacity-50 transition-colors rounded-xl"
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
                          <p className="text-ink/50 text-xs tracking-[0.15em] uppercase pt-2 pb-0.5">Finalised</p>
                          {finalisedPlayersList.map(({ id, name, liveRoundId, roundId }) => {
                            const isConfirming = playerConfirm?.playerId === id && playerConfirm.type === "unfinalise"
                            return (
                              <div
                                key={id + liveRoundId}
                                className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-colors
                                  ${isConfirming ? "border-accent/40 bg-accent/[0.07]" : "border-bark/12 bg-surface"}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-ink/80 text-base truncate">{name}</p>
                                  {isConfirming && (
                                    <p className="text-accent-deep/60 text-sm mt-0.5">Reopens at hole 18. Other players on this card keep finalised state.</p>
                                  )}
                                </div>
                                {!isConfirming ? (
                                  <button
                                    onClick={() => setPlayerConfirm({ type: "unfinalise", playerId: id, liveRoundId, roundId, playerName: name })}
                                    className="flex-shrink-0 px-3 py-1.5 text-sm text-accent-deep/60 border border-accent/25 hover:border-accent/50 hover:text-accent-deep transition-colors rounded-xl"
                                  >
                                    Unfinalise
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => setPlayerConfirm(null)}
                                      className="px-3 py-1.5 text-sm text-ink/65 border border-bark/12 hover:border-bark/25 transition-colors rounded-xl"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => unfinalisePlayer(id, liveRoundId, roundId)}
                                      disabled={settingsWorking}
                                      className="px-3 py-1.5 text-sm text-accent-deep border border-accent/50 hover:border-accent/80 disabled:opacity-50 transition-colors rounded-xl"
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

                {/* ── Void Live Session ── */}
                <section>
                  <p className="text-ink/50 text-xs tracking-[0.2em] uppercase mb-3">Void Live Session</p>
                  {!settingsVoidSession ? (
                    <button
                      onClick={() => setSettingsVoidSession(true)}
                      className="w-full py-3 border border-rust/40 text-rust text-base tracking-[0.15em] uppercase hover:border-rust/40 hover:text-rust-deep transition-colors rounded-xl"
                    >
                      Clear All Live Data
                    </button>
                  ) : (
                    <div className="border border-rust/40 bg-rust/[0.08] rounded-xl px-4 py-4 space-y-3">
                      <p className="text-ink/80 text-base">This will delete all scorecards, scores, and player locks for {courseName}. This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSettingsVoidSession(false)}
                          className="flex-1 py-2.5 text-sm text-ink/65 border border-bark/12 hover:border-bark/25 transition-colors rounded-xl uppercase tracking-wider"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={voidLiveSession}
                          disabled={settingsWorking}
                          className="flex-1 py-2.5 text-sm text-rust-deep border border-rust/40 hover:border-rust/70 disabled:opacity-50 transition-colors rounded-xl uppercase tracking-wider"
                        >
                          {settingsWorking ? "Clearing…" : "Void Session"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {settingsError && (
                  <p className="text-rust-deep text-sm text-center pt-1">{settingsError}</p>
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
          allowance={allowance}
          allowances={allowances}
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
          tees={tees}
          allowance={allowance}
          onClose={goBack}
          showBackButton={false}
        />
      )}

    </div>
  )
}
