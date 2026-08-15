"use client"

import React, { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { mergeSaved, anyScored, type Fairway } from "@/lib/liveScores"
import { FULL_ALLOWANCE, allowedHandicap } from "@/lib/handicapAllowance"
import { type QuotaScale } from "@/lib/quota"
import { exactCourseHandicap, courseHandicap, teesForPlayer, type TeeRating } from "@/lib/courseHandicap"
import { shotsReceived, formatHandicap } from "@/lib/handicap"
import { voidScorecard as voidScorecardData } from "@/lib/scorecardVoid"
import { why } from "@/lib/writeFailure"
import { CHROME } from "./scoringHeaderMetrics"
import type { ActiveLiveRound } from "./ScoringClient"
import LiveLeaderboardPanel from "./LiveLeaderboardPanel"
import BackButton from "@/app/components/BackButton"
import CardCheck from "./CardCheck"
import ScoreShape, { NoReturnShape } from "@/app/components/ScoreShape"
import {
  SC_RULE, SC_BAND, SC_BAND_TOTAL, SC_HEAD, SC_HEAD_TEXT, SC_LABEL, SC_STICKY,
  scRow, teeDot,
} from "@/app/components/scorecardStyle"

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
interface RoundHandicap {
  round_id: string; player_id: string; playing_handicap: number
  /** The tee the session recorded. Absent on rows written before one was picked. */
  tee_id?: string | null
}
/**
 * One hole for one player.
 *
 * Mirrors `HoleScore` in lib/liveScores.ts, which `mergeSaved` works in — the
 * two are one type in two places and must move together.
 */
interface HoleScore {
  gross: number | null
  isNR: boolean
  stableford: number | null
  /** Null until asked, and null is not zero. Cleared by a no return. */
  putts: number | null
  fairway: Fairway | null
}
/**
 * A hole nobody has said anything about yet.
 *
 * One constant rather than the six copies of `{ gross: null, isNR: false,
 * stableford: null }` that used to be dotted through this file — a field
 * added to `HoleScore` reached the type and not the defaults, so a fresh
 * hole was a different shape from a scored one.
 *
 * Shared safely because nothing mutates a `HoleScore` in place: every write
 * spreads into a new object. Checked before this was made a constant.
 */
const EMPTY_HOLE: HoleScore = {
  gross: null, isNR: false, stableford: null, putts: null, fairway: null,
}
/**
 * A player on this card, and the three handicaps they have.
 *
 * `exactHcp` is the WHS course handicap off the tee they are playing, before
 * anything rounds it. It is the figure every other number here comes from,
 * and it is the one an allowance is taken off — a percentage of a rounded
 * handicap is not a percentage of the real one, and the gap is a shot.
 *
 * `playingHcp` is that figure as a whole number, and is the only one ever
 * written down: to `round_handicaps`, and into every stableford value saved
 * beside a score. It stays whole because the Postgres trigger reads it and
 * disagrees with itself about fractions — see lib/courseHandicap.ts.
 *
 * `displayHcp` is the exact figure cut to whatever allowance the card is
 * currently showing, rounded once. It never leaves the screen.
 *
 * The last two are separate fields rather than one value that changes,
 * because a card being read at 85% is still a card played off the full
 * figure: a board on a different allowance has to be able to work its own
 * number out from what was stored, and it cannot if the stored one was
 * already reduced.
 */
interface PlayerSetup {
  player: Player
  tee: Tee
  exactHcp: number
  playingHcp: number
  displayHcp: number
}

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
  /**
   * The handicap allowance the card is being read at, as a percentage.
   *
   * Display only. The control that changes it lives in the shell's header —
   * it is the one thing on this screen you change about the card rather than
   * about a score — and nothing this component writes moves when it does.
   */
  allowance?: number
  /**
   * Whether the trip runs a Quota board — the live panel beside the card
   * only offers the Quota tab when someone is actually being scored on it.
   */
  /**
   * The scale this trip's Quota board plays, or nothing where it runs none.
   * Passed straight through — whether the Quota tab appears and what it
   * counts are the same answer. See LiveLeaderboardPanel.
   */
  quotaScale?: QuotaScale | null
  /** Every allowance the trip's boards play off, for the player picker. */
  allowances?: number[]
  /**
   * Whether each player's tile asks for putts and a fairway.
   *
   * The trip's own setting. Off is the scorecard exactly as it was before
   * stats existed — no extra row, no extra height, nothing to skip past.
   */
  trackStats?: boolean
  /**
   * The trip this session belongs to, for the card check — it scopes the
   * re-score of already-committed cards. The legacy /scoring route has no
   * trip and leaves it unset.
   */
  tripCode?: string
  /**
   * The course card was corrected against a photo of the real one. The
   * corrected rows come up so every screen already holding `holes`/`tees`
   * swaps to the new numbers without a reload.
   */
  onCourseDataUpdated?: (holes: Hole[], tees: Tee[]) => void
}

type LiveStep = "activate" | "setup" | "holes" | "summary" | "committed" | "resuming"

// ─── Constants ────────────────────────────────────────────

/**
 * The tee markers, in the colours they actually are on the course.
 *
 * These are data, not brand: a blue tee is blue. They keep their own hues
 * where everything else moved to the palette — but on a white card the pale
 * ones would otherwise vanish, so every swatch carries a hairline ring and
 * the selected state is set in ink rather than in a tint of its own colour.
 */
/**
 * The border a selected tee button wears. The swatch itself comes from
 * `teeDot` in components/scorecardStyle.ts — one copy, shared with every
 * scorecard, so the tee you pick and the tee your card names look the same.
 */
const TEE_ACTIVE: Record<string, string> = {
  Black:     "border-zinc-700 text-ink",
  Blue:      "border-blue-500 text-ink",
  White:     "border-bark/40 text-ink",
  Red:       "border-red-500 text-ink",
  Yellow:    "border-yellow-500 text-ink",
  Sandstone: "border-amber-400 text-ink",
  Slate:     "border-slate-500 text-ink",
  Granite:   "border-stone-500 text-ink",
  Claret:    "border-rose-800 text-ink",
}

// ─── Helpers ──────────────────────────────────────────────

function calcStableford(gross: number, par: number, si: number, hcp: number) {
  return Math.max(0, par + 2 - (gross - shotsReceived(hcp, si)))
}
/**
 * The gross a no return is stored as: net double bogey off the FULL handicap.
 *
 * Every caller passes `playingHcp`, never `displayHcp`, and that is not an
 * oversight. A no return is a fact about the hole, not about the competition
 * reading it — so what gets written must not move when the allowance control
 * is tapped, or the same picked-up ball would be a different gross depending
 * on which board happened to be showing when the card was signed.
 *
 * It stays consistent under a reduction for free: the stored gross is net
 * double bogey at the full handicap, and a reduced handicap gives at most the
 * same number of shots, so the hole still scores zero on every board.
 */
function nrGross(par: number, si: number, hcp: number) {
  return par + 2 + shotsReceived(hcp, si)
}
function effectivePar(hole: Hole, gender: string) {
  return gender === "F" && hole.par_ladies ? hole.par_ladies : hole.par
}
function effectiveSI(hole: Hole, gender: string) {
  return gender === "F" && hole.stroke_index_ladies ? hole.stroke_index_ladies : hole.stroke_index
}
/**
 * The course handicap this card is scored off, unrounded.
 *
 * **The tee wins whenever there is one.** `round_handicaps` gets a row for
 * every player of every round long before anyone tees off — at trip creation,
 * at finalise, and again whenever a handicap is edited — and every one of
 * those writes stores the player's *index*, because no tee has been chosen
 * yet and there is nothing else to store. `players.handicap` is an index; a
 * course handicap needs a slope and a rating, and until the scorer picks a
 * tee nobody knows which.
 *
 * Preferring that stored figure is what made the player picker and the score
 * card disagree: the picker worked the handicap out from the tee just chosen
 * and showed it, while the card read the placeholder underneath — and
 * `lockPlayers` then wrote the placeholder straight back over the real answer.
 *
 * So the stored row is a fallback, for the one case where the tee is genuinely
 * unknown: a resumed session whose `round_handicaps` row predates tees being
 * recorded against it. There the whole number is all there is, and a whole
 * number is what comes back.
 */
export function resolveCourseHandicap(
  existingHcp: RoundHandicap | undefined,
  player: Pick<Player, 'id' | 'handicap'>,
  // Only the ratings matter here, so a bare set of them is enough — which is
  // also what lets this be driven without inventing a whole tee row.
  tee: TeeRating | undefined,
  context = 'unknown',
): number {
  if (tee) return exactCourseHandicap(player.handicap, tee)
  if (existingHcp?.playing_handicap !== undefined) return existingHcp.playing_handicap
  console.warn(`[handicap-fallback] no tee and no round_handicap for player ${player.id}. context=${context}`)
  return player.handicap
}
function yardageForTee(hole: Hole, teeName: string): number | null {
  const key = `yardage_${teeName.toLowerCase()}` as keyof Hole
  return (hole[key] as number | undefined) ?? null
}
function scoreToPar(gross: number, par: number): { label: string; color: string } {
  const d = gross - par
  if (d <= -3) return { label: "Albatross", color: "text-accent-deep" }
  if (d === -2) return { label: "Eagle",    color: "text-accent-deep" }
  if (d === -1) return { label: "Birdie",   color: "text-emerald-400" }
  if (d === 0)  return { label: "Par",      color: "text-ink/65" }
  if (d === 1)  return { label: "Bogey",    color: "text-rust-deep/80" }
  return { label: `+${d}`, color: "text-rust" }
}

/**
 * Each player's running Stableford total, at the handicap being shown.
 *
 * Worked out from the gross rather than read off the points cached on the
 * card. Those were computed at the full course handicap and written to
 * `live_scores` as such — correctly, because that is what is stored — so
 * trusting them here would leave the running total sitting still while the
 * allowance control changed every other number on the screen.
 *
 * The card is keyed by position on the course and the holes are in that same
 * order, which is what the index lookup relies on. Exported so that stays
 * pinned: every card in play runs through this, whether or not the trip has
 * ever heard of an allowance.
 */
export function runningStablefordTotals(
  card: Record<number, Record<string, HoleScore>>,
  courseHoles: { par: number; stroke_index: number; par_ladies?: number; stroke_index_ladies?: number }[],
  setups: { id: string; gender: string; displayHcp: number }[],
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const { id, gender, displayHcp } of setups) {
    let total = 0
    for (const [idx, byPlayer] of Object.entries(card)) {
      const hs = byPlayer[id]
      // A no return is worth nothing, and so is a hole not played yet
      if (!hs || hs.isNR || hs.gross == null) continue
      const hole = courseHoles[Number(idx)]
      if (!hole) continue
      total += calcStableford(
        hs.gross,
        effectivePar(hole as Hole, gender),
        effectiveSI(hole as Hole, gender),
        displayHcp,
      )
    }
    totals[id] = total
  }
  return totals
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

    // TODO(error-handling): check error, revert optimistic UI, toast on failure
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
  allowance = FULL_ALLOWANCE,
  quotaScale = null,
  allowances = [FULL_ALLOWANCE],
  trackStats = false,
  tripCode,
  onCourseDataUpdated,
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
  // Set when a resume cannot read the card. Never falls through to a blank
  // one: blank is indistinguishable from "nothing played yet", and the next
  // commit would write that over the real round.
  const [resumeError, setResumeError] = useState<string | null>(null)

  // Edit mode (within summary)
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Record<number, HoleScore>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Player locking
  const [lockedPlayerIds, setLockedPlayerIds] = useState<string[]>([])

  // Round handicaps — starts from page-load prop, replaced by doResume() fresh fetch
  const [effectiveRoundHandicaps, setEffectiveRoundHandicaps] = useState<RoundHandicap[]>(roundHandicaps)

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

  // TODO(arch): roundHandicaps is a page-load prop — stale if organiser edits mid-session.
  // Current fix: doResume() re-fetches. Bigger fix would be to always fetch fresh in this computation.
  // Revisit during multi-tenant rework.
  const playerSetups: PlayerSetup[] = selectedPlayerIds
    .filter(id => playerTeeIds[id])
    .map(id => {
      const player = players.find(p => p.id === id)!
      const tee = tees.find(t => t.id === playerTeeIds[id])!
      const existingHcp = effectiveRoundHandicaps.find(rh => rh.round_id === roundId && rh.player_id === id)
      const exactHcp = resolveCourseHandicap(existingHcp, player, tee, `round=${roundId}`)
      return {
        player, tee, exactHcp,
        playingHcp: Math.round(exactHcp),
        displayHcp: allowedHandicap(exactHcp, allowance),
      }
    })

  // A user-added course has no holes until its first scorecard photo is
  // confirmed — and scoring writes rows keyed by hole id, so without a card
  // there is nothing to score against. The card check on this screen is the
  // way in, not a nicety.
  const canStart = selectedPlayerIds.length >= 1 &&
    selectedPlayerIds.every(id => !!playerTeeIds[id]) &&
    courseHoles.length > 0

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

      // Fresh-fetch round_handicaps so we don't use a stale prop value if the
      // organiser corrected a handicap after this page loaded.
      const { data: freshHcps } = await supabase
        .from("round_handicaps")
        .select("round_id, player_id, playing_handicap, tee_id")
        .eq("round_id", rId)
        .in("player_id", lockedIds)

      // No `no_return` here: that column is on `scores`, not on
      // `live_scores`. Asking for it made the whole select fail, the error was
      // swallowed by a `?? []`, and the card came back empty — so every
      // resume dropped you on hole 1 with nothing, and committing from there
      // wrote the rest of the round off as no returns. An NR in live play is
      // already stored as its max-gross equivalent, so nothing is lost by not
      // asking for a flag that was never written.
      //
      // `fairway_hit` and `putts` are a different case and are asked for: both
      // have been columns on this table since migration 003. Leaving them out
      // would open the card with every stat blank and the next hole submitted
      // would write that blank over what was really entered — the same shape
      // of loss as above, one column along.
      const { data: existingScores, error: scoresError } = await supabase
        .from("live_scores")
        .select("player_id, hole_number, gross_score, stableford_points, fairway_hit, putts")
        .in("player_id", lockedIds)
        .eq("round_id", rId)

      // A card that cannot be read must not open as a blank one. Blank is
      // indistinguishable from "nothing played yet", and the next commit
      // would write that over the real round.
      if (scoresError) {
        console.error("Resume failed to read live_scores:", scoresError)
        setResumeError(
          "Could not load already submitted scores. Check your connection and try again — " +
          "nothing has been lost, but do not re-enter them until they appear."
        )
        return
      }

      // The tee the session actually recorded, which is now what the handicap
      // is worked out from rather than merely what names the yardage column.
      // Guessing the first gender-matching tee was harmless while the stored
      // whole number was the handicap; it is not harmless now, because a
      // different tee is a different slope and rating and therefore a
      // different number of shots. The guess stays as the fallback for rows
      // written before a tee was ever put against them.
      const courseTees = tees.filter(t => t.course_id === cId)
      const teeMap: Record<string, string> = {}
      for (const pid of lockedIds) {
        const player = players.find(p => p.id === pid)
        if (!player) continue
        const recordedId = (freshHcps ?? []).find(h => h.player_id === pid)?.tee_id
        const tee = courseTees.find(t => t.id === recordedId)
          ?? teesForPlayer(courseTees, player.gender)[0]
        if (tee) teeMap[pid] = tee.id
      }

      // Rebuild the card from what was saved. `live_scores` carries no NR
      // flag — an NR is written as its max-gross equivalent while playing —
      // so everything read back is a gross score.
      const scoreState = mergeSaved({}, existingScores ?? [], cHoles.map(h => h.hole_number))

      // Find first hole where not all players have a score yet
      let resumeIdx = 0
      for (let i = 0; i < cHoles.length; i++) {
        const hScores = scoreState[i] ?? {}
        const allDone = lockedIds.every(pid => hScores[pid]?.gross !== null && hScores[pid] !== undefined)
        if (!allDone) { resumeIdx = i; break }
        resumeIdx = i + 1
      }

      setEffectiveRoundHandicaps(freshHcps ?? [])
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

    // The handicap and the tee, written at the start rather than only at
    // commit. Both are decided on the setup step and neither changes during
    // the round, and the live leaderboard's card needs them WHILE the round
    // is being played — waiting until the card is signed is too late for the
    // one screen that exists to be read mid-round. Finalising a trip already
    // wrote a placeholder handicap row with no tee against it; this is the
    // real answer arriving over it.
    // TODO(error-handling): check error, surface a failure
    await supabase.from("round_handicaps").upsert(
      playerSetups.map(({ player, playingHcp, tee }) => ({
        round_id: liveRound.round_id,
        player_id: player.id,
        playing_handicap: playingHcp,
        tee_id: tee?.id ?? null,
      })),
      { onConflict: "round_id,player_id" },
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
    setError(null)
    // "Scores will not be saved" is what the confirmation promises, and every
    // hole was written to `live_scores` as it was entered — so discarding has
    // to erase them. Releasing the players alone left the part-played round on
    // the leaderboard, where nothing afterwards would ever take it off.
    const failure = await voidScorecardData(liveRound.id, liveRound.round_id)
    setSaving(false)
    if (failure) {
      setError(`Could not discard this scorecard${why(failure)}`)
      setCloseConfirm(false)
      return
    }
    setCloseConfirm(false)
    resetFlow()
    onBack()
  }

  // ─── Commit ───────────────────────────────────────────────

  // ─── Edit mode helpers ────────────────────────────────────

  function setDraftHole(idx: number, update: Partial<HoleScore>) {
    setEditDraft(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] ?? EMPTY_HOLE), ...update },
    }))
  }

  function enterEditMode(playerId: string) {
    const draft: Record<number, HoleScore> = {}
    for (let i = 0; i < courseHoles.length; i++) {
      draft[i] = scores[i]?.[playerId] ?? EMPTY_HOLE
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
      const hs = editDraft[i] ?? EMPTY_HOLE
      const p  = effectivePar(hole, setup.player.gender)
      const si = effectiveSI(hole, setup.player.gender)
      const stableford = hs.isNR ? 0 : hs.gross !== null ? calcStableford(hs.gross, p, si, setup.playingHcp) : null
      newPlayerScores[i] = { ...hs, stableford }

      if (hs.gross !== null || hs.isNR) {
        const gross = hs.isNR ? nrGross(p, si, setup.playingHcp) : hs.gross!
        upsertRows.push({
          player_id: playerId, round_id: roundId, hole_number: hole.hole_number,
          gross_score: gross,
          stableford_points: hs.isNR ? 0 : calcStableford(gross, p, si, setup.playingHcp),
          // Written explicitly rather than left out. Omitting them would in
          // fact preserve what is stored — PostgREST only SETs the columns it
          // is given — but that is a rule about the client library standing
          // between an edit and somebody's putt count. The draft carries the
          // real values (it is seeded from the card), so saying them is both
          // honest and what keeps a hole edited to a no return from keeping
          // the stats it had before.
          // The fairway is kept on a no return — the tee shot happened and
          // its miss should count — while the putt count goes with the hole.
          fairway_hit: p < 4 ? null : (hs.fairway ?? null),
          putts:       hs.isNR ? null : (hs.putts ?? null),
          committed: false,
        })
      } else {
        deleteHoleNums.push(hole.hole_number)
      }
    }

    // TODO(error-handling): check error, revert optimistic UI, toast on failure
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
      // TODO(error-handling): check error, revert optimistic UI, toast on failure
      await Promise.all(
        playerSetups.map(({ player, playingHcp, tee }) =>
          supabase.from("round_handicaps").upsert(
            { round_id: roundId, player_id: player.id, playing_handicap: playingHcp, tee_id: tee?.id ?? null },
            { onConflict: "round_id,player_id" }
          )
        )
      )

      // 2. Reconcile the card with what was actually saved while it was
      //    played. `live_scores` is the record; this component's state is a
      //    view of it, and a view can be incomplete — a resume that failed, a
      //    reload, a second device. Committing from memory alone is what
      //    turned holes 4–18 into no returns after a bad resume.
      const { data: savedRows, error: savedErr } = await supabase
        .from("live_scores")
        .select("player_id, hole_number, gross_score, stableford_points, fairway_hit, putts")
        .in("player_id", playerSetups.map(ps => ps.player.id))
        .eq("round_id", roundId)
      if (savedErr) throw savedErr

      const finalCard = mergeSaved(
        scores, savedRows ?? [], courseHoles.map(h => h.hole_number))

      // An entirely blank card is never what anyone meant: it would write
      // eighteen no returns per player over whatever was already there.
      if (!anyScored(finalCard)) {
        throw new Error(
          "There are no scores on this card to submit. If scores were entered earlier, " +
          "go back and reopen it rather than submitting an empty card."
        )
      }

      // 3. Upsert scores — every hole for every player. A hole with nothing
      //    anywhere is a genuine no return; one that is merely absent from
      //    this device is not, which is what step 2 is for.
      //
      //    No delete-then-insert here any more. Every hole of the course is
      //    written below, so the delete removed nothing the upsert would not
      //    have replaced — but it opened a window where a failure between the
      //    two left the round with no scores at all.
      const scoreRows: any[] = []
      for (const [hIdx, hole] of courseHoles.entries()) {
        for (const setup of playerSetups) {
          const hs = finalCard[hIdx]?.[setup.player.id]
          // Unchanged from before: an explicit pick-up is a no return, and so
          // is a hole nothing anywhere has a score for. What changed is that
          // `finalCard` has already been reconciled with what was saved, so
          // "absent" now means genuinely absent rather than merely not on
          // this device.
          const noReturn = hs?.isNR === true || hs?.gross == null
          const p = effectivePar(hole, setup.player.gender)
          const si = effectiveSI(hole, setup.player.gender)
          const gross = noReturn ? nrGross(p, si, setup.playingHcp) : hs!.gross!

          // Copied across rather than translated: migration 028 gave `scores`
          // the same two columns under the same names, so the card carries its
          // stats over the commit unchanged. Null on a no return and on a par
          // 3, matching what was written live.
          //
          // More putts than shots is a mis-tap, not a hole, and it is dropped
          // here. The database deliberately does not refuse it — a commit that
          // fails on the eighteenth green is the worse failure — so this is
          // where the impossible card is caught rather than at the write.
          const putts = noReturn || hs?.putts == null || hs.putts > gross
            ? null
            : hs.putts

          scoreRows.push({
            player_id: setup.player.id, hole_id: hole.id, round_id: roundId,
            gross_score: gross,
            no_return: noReturn,
            // A recorded fairway survives an explicit no return; a hole
            // that is simply absent has nothing recorded and stays null.
            fairway_hit: p < 4 ? null : (hs?.fairway ?? null),
            putts,
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
      const { error: markErr } = await supabase.from("live_scores")
        .update({ committed: true })
        .in("player_id", playerSetups.map(p => p.player.id))
        .eq("round_id", roundId)

      // 6. Finalise the live round and return to the course portal
      // Note: player locks are intentionally kept so the live leaderboard
      // continues to display finalised players. Locks are only removed on discard.
      const { error: closeErr } = await supabase
        .from("live_rounds")
        .update({ status: "finalised", closed_at: new Date().toISOString() })
        .eq("id", liveRound.id)

      // These two used to go unchecked, and a failure here is not cosmetic:
      // the scores above are already in, so walking away leaves a card that
      // reads "in play" everywhere — the hub, the round tile, the board's
      // badge — with nothing wrong on the leaderboard to hint at why. Say so
      // and stay put instead: every write in this function is an upsert, so
      // pressing Commit again finishes the job.
      if (markErr || closeErr) {
        throw new Error(
          "The scores are saved, but the card could not be closed — " +
          "check the connection and press Commit again."
        )
      }
      onBack()
    } catch (e: any) {
      setError(e?.message ?? "Could not save the scores — try again")
    } finally {
      setSaving(false)
    }
  }

  // ─── Close confirm overlay ────────────────────────────────

  if (closeConfirm) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 py-12">
        <div className="text-center">
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-ink mb-2">Discard Scorecard?</h2>
          <p className="text-ink/65 text-base">This will void this scorecard and release all players. Every score already entered will be deleted, and be removed from the leaderboard.</p>
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <button onClick={() => setCloseConfirm(false)} className="flex-1 py-3 border border-bark/12 text-ink/80 text-base uppercase tracking-wider hover:border-bark/25 transition-colors">
            Cancel
          </button>
          <button onClick={handleCloseRound} disabled={saving} className="flex-1 py-3 bg-rust border border-rust text-white text-base uppercase tracking-wider hover:bg-rust-deep disabled:opacity-50 transition-colors">
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
        tees={tees}
        allowance={allowance}
        quotaScale={quotaScale}
        onClose={() => onLeaderboardChange(false)}
      />
    )
  }

  // ─── Resuming step ────────────────────────────────────────

  if (step === "resuming") {
    if (resumeError) {
      return (
        <div className="max-w-lg mx-auto w-full px-4 py-10 flex flex-col gap-4">
          <div className="bg-surface border border-rust/40 rounded-2xl px-5 py-6">
            <p className="t-card text-rust-deep mb-2">Scorecard could not be loaded</p>
            <p className="t-body text-ink/80 leading-relaxed">{resumeError}</p>
          </div>
          <button
            onClick={() => { setResumeError(null); setStep("resuming") }}
            className="w-full py-4 bg-accent-deep text-white rounded-xl text-base tracking-[0.2em] uppercase font-bold hover:bg-accent transition-colors"
          >
            Try again
          </button>
          <button
            onClick={onBack}
            className="w-full py-3.5 border border-bark/25 text-ink/80 rounded-xl text-base tracking-wider uppercase hover:border-bark/40 transition-colors"
          >
            Back
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-57px)]">
        <p className="text-ink/50 text-base tracking-wide">Loading scorecard…</p>
      </div>
    )
  }

  // ─── Activate step ────────────────────────────────────────

  if (step === "activate") {
    return (
      <div className="max-w-lg mx-auto w-full px-4 py-8 flex flex-col gap-6">
        <div className="text-center">
          <p className="text-ink/50 text-sm tracking-[0.2em] uppercase mb-2">No live round active</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-ink">Start Live Round</h2>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-ink/65 text-sm tracking-[0.15em] uppercase">Select Round</label>
          {availableRounds.length === 0 ? (
            <p className="text-ink/50 text-base">No rounds available. Rounds must be upcoming or active.</p>
          ) : (
            availableRounds.map(r => (
              <button
                key={r.id}
                onClick={() => setActivatingRoundId(r.id)}
                className={`w-full text-left px-4 py-3 border text-base transition-colors
                  ${activatingRoundId === r.id
                    ? "border-accent text-accent-deep bg-accent/15"
                    : "border-bark/12 text-ink/80 hover:border-bark/25"}`}
              >
                Round {r.round_number} — {r.courses?.name}
                <span className={`ml-2 text-sm ${r.status === "active" ? "text-accent-deep" : "text-ink/50"}`}>
                  [{r.status}]
                </span>
              </button>
            ))
          )}
        </div>

        {error && <p className="text-rust-deep text-base">{error}</p>}

        <button
          onClick={handleActivate}
          disabled={!activatingRoundId || saving || availableRounds.length === 0}
          className={`w-full py-4 text-base tracking-[0.2em] uppercase transition-colors
            ${activatingRoundId && !saving
              ? "bg-accent-deep text-ink hover:bg-accent"
              : "bg-bark/[0.06] text-ink/50 cursor-not-allowed"}`}
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
        // Deselecting the last player is allowed. Refusing it meant a player
        // who could not be given a tee — a course with none at all — was
        // stuck on a screen with a disabled Start button and no way back
        // except reloading the page.
        setSelectedPlayerIds(prev => prev.filter(id => id !== pid))
        setPlayerTeeIds(prev => { const n = { ...prev }; delete n[pid]; return n })
      } else if (selectedPlayerIds.length < 4) {
        setSelectedPlayerIds(prev => [...prev, pid])
        // Auto-select tee when there is exactly one option for this player's gender
        const player = players.find(p => p.id === pid)
        if (player) {
          const genderTees = teesForPlayer(courseTees, player.gender)
          if (genderTees.length === 1) {
            setPlayerTeeIds(prev => ({ ...prev, [pid]: genderTees[0].id }))
          }
        }
      }
    }

    function setTeeForPlayer(pid: string, tid: string) {
      setPlayerTeeIds(prev => ({ ...prev, [pid]: tid }))
    }

    return (
      <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-5">
        {/* The card check lives on this screen because this is the last
            moment before the numbers matter: a wrong index caught here is a
            thirty-second fix, and caught on the 14th green it is last trip's
            headache all over again. */}
        {courseId && onCourseDataUpdated && (
          <CardCheck
            courseId={courseId}
            tripCode={tripCode}
            onApplied={(newHoles, newTees) =>
              onCourseDataUpdated(newHoles as unknown as Hole[], newTees as unknown as Tee[])
            }
          />
        )}

        {/* A course added to the platform arrives without a card — pars and
            indices only ever come from a scorecard. Until one is
            photographed and confirmed above, there is nothing to score. */}
        {courseHoles.length === 0 && (
          <p className="text-rust-deep text-sm leading-snug">
            This course has no scorecard recorded yet. Photograph the printed
            card above to set it up — scoring opens the moment it is saved.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <label className="text-ink/65 text-sm tracking-[0.15em] uppercase">
            Select Players (1–4)
          </label>

          {players.filter(p => !lockedPlayerIds.includes(p.id)).map(player => {
            const isSelected = selectedPlayerIds.includes(player.id)
            const playerCourseTees = teesForPlayer(courseTees, player.gender)
            const selectedTeeId = playerTeeIds[player.id] ?? ""
            const selectedTee = tees.find(t => t.id === selectedTeeId)
            // The same figure the card will use, off the same tee, through
            // the same function. These two screens used to work it out two
            // different ways and disagree by several shots.
            const exactHcp = selectedTee
              ? exactCourseHandicap(player.handicap, selectedTee)
              : null
            const playingHcp = selectedTee ? courseHandicap(player.handicap, selectedTee) : null

            return (
              <div key={player.id}>
                {/* Player toggle */}
                <button
                  onClick={() => togglePlayer(player.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 border text-base transition-colors
                    ${isSelected
                      ? "border-accent text-accent-deep bg-accent/10"
                      : "border-bark/12 text-ink/80 hover:border-bark/25"}`}
                >
                  <div className="flex items-center gap-2">
                    {player.teams && (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: player.teams.color }} />
                    )}
                    <span>{player.name}</span>
                  </div>
                  <span className="text-sm opacity-50">HCP {formatHandicap(player.handicap)}</span>
                </button>

                {/* Tee selector — only for selected players */}
                {isSelected && (
                  <div className="bg-surface border-x border-b border-accent/20 px-4 py-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {playerCourseTees.length === 0 ? (
                        <span className="text-ink/50 text-sm">No tees for this course</span>
                      ) : (
                        playerCourseTees.map(tee => {
                          const style = { dot: teeDot(tee.name), active: TEE_ACTIVE[tee.name] ?? "border-bark/25 text-ink/80" }
                          const isActive = selectedTeeId === tee.id
                          return (
                            <button
                              key={tee.id}
                              onClick={() => setTeeForPlayer(player.id, tee.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 border text-sm tracking-wider uppercase transition-colors
                                ${isActive ? style.active + " bg-bark/[0.04]" : "border-bark/12 text-ink/65 hover:border-bark/25"}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                              {tee.name}
                            </button>
                          )
                        })
                      )}
                    </div>
                    {/* The playing handicap, and what it becomes on every
                        allowance the trip's boards are played off. There is
                        room to the right of one number for the two or three
                        that actually matter, and knowing them before the
                        round starts is worth more than finding out at the
                        prize-giving. */}
                    {playingHcp !== null && exactHcp !== null && (
                      <p className="text-ink/65 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span>
                          Playing HC: <span className="text-accent-deep font-semibold">{formatHandicap(playingHcp)}</span>
                        </span>
                        {allowances
                          .filter(pct => pct !== FULL_ALLOWANCE)
                          .map(pct => (
                            <span key={pct} className="text-ink/50 tabular-nums">
                              {pct}%: <span className="text-ink/80 font-semibold">
                                {formatHandicap(allowedHandicap(exactHcp, pct))}
                              </span>
                            </span>
                          ))}
                      </p>
                    )}
                    {/* Said whether or not there is anything to pick. With no
                        tees at all the Start button is disabled either way, so
                        suppressing the reason left a dead control and no
                        explanation for it. */}
                    {!selectedTeeId && (
                      <p className="text-rust-deep/60 text-sm">
                        {playerCourseTees.length > 0
                          ? "Select a tee to continue"
                          : "This course has no tees yet — add one in Trip Setup to start the round"}
                      </p>
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
            ${canStart ? "bg-accent-deep text-ink hover:bg-accent" : "bg-bark/[0.06] text-ink/50 cursor-not-allowed"}`}
        >
          Start Round →
        </button>

        <button onClick={() => setCloseConfirm(true)} className="text-center text-ink/50 text-sm tracking-widest uppercase hover:text-rust transition-colors">
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
    const runningTotals = runningStablefordTotals(
      scores, courseHoles,
      playerSetups.map(({ player, displayHcp }) => ({
        id: player.id, gender: player.gender, displayHcp,
      })),
    )

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
          const p = effectivePar(hole, player.gender)
          const si = effectiveSI(hole, player.gender)
          const gross = hs.isNR ? nrGross(p, si, playingHcp) : hs.gross!
          return {
            player_id: player.id, round_id: roundId, hole_number: hole.hole_number,
            gross_score: gross,
            stableford_points: hs.isNR ? 0 : calcStableford(gross, p, si, playingHcp),
            // A no return clears the putt count — the ball was picked up, so
            // there is none — but the fairway answer stands: the tee shot
            // happened, and losing two balls right is exactly the miss that
            // should count against the driving figures.
            //
            // A par 3 is forced null rather than trusted. The control is not
            // shown on one, but a course's par can be corrected after a card
            // was signed, and a stored fairway on a hole with no fairway would
            // then sit in the denominator for ever.
            //
            // Both keys are always present, never conditionally omitted:
            // PostgREST refuses a bulk upsert whose objects do not all carry
            // the same keys, so one player having answered and another not
            // would fail the whole hole for everyone on the card.
            fairway_hit: p < 4 ? null : (hs.fairway ?? null),
            putts:       hs.isNR ? null : (hs.putts ?? null),
            committed: false,
          }
        }).filter(Boolean)
      if (rows.length > 0) {
        // TODO(error-handling): check error, revert optimistic UI, toast on failure
        supabase.from("live_scores").upsert(rows as any, { onConflict: "player_id,round_id,hole_number" })
          .then(() => {}) // fire and forget
      }

      const updated: Record<string, HoleScore> = {}
      for (const { player, playingHcp } of playerSetups) {
        const hs = holeScores[player.id]
        const p = effectivePar(hole, player.gender)
        const si = effectiveSI(hole, player.gender)
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

    // `clip`, not `hidden`, on the swipe box below.
    //
    // `overflow-x: hidden` beside an `overflow-y: visible` does not leave the
    // other axis visible: the spec computes it to `auto`, which makes that div
    // a scrollport. The live board's column headings are sticky against
    // whatever chrome is above them, and once this box was the nearest
    // scrollport they measured that offset from here rather than from the
    // window — so they were pushed the height of the header down the card and
    // came to rest below the first player instead of above them.
    //
    // `clip` cuts the sideways overflow the swipe needs cut without
    // establishing a scrollport, so the headings resolve against the window
    // again and land where the header ends.
    return (
      <div
        className="overflow-x-clip"
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
              trackStats={trackStats}
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
                tees={tees}
                // The board beside the card answers the same question the
                // card does. Swiping between two different handicaps would
                // read as two different rounds.
                allowance={allowance}
                quotaScale={quotaScale}
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
      // Display only — `saveEditDraft` writes from the full handicap.
      const { player, displayHcp: playingHcp } = editSetup

      return (
        <div className="flex flex-col" style={{ minHeight: `calc(100dvh - ${CHROME})` }}>

          {/* Sub-header */}
          <div
            className="sticky z-10 bg-cream border-b border-bark/12 px-4 py-3 flex items-center justify-between"
            style={{ top: CHROME }}
          >
            <BackButton onClick={() => setEditingPlayerId(null)} />
            {/* The handicap every points figure below is worked out from, so
                it is on the screen where those figures are being changed. It
                follows the allowance control in the header above — the same
                card read at 85% gives different points for the same gross,
                and editing against a number you cannot see is guesswork. */}
            <div className="flex items-baseline gap-2 min-w-0">
              {player.teams && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 self-center"
                  style={{ backgroundColor: player.teams.color }}
                />
              )}
              <span className="text-ink/80 text-base font-semibold truncate">{player.name}</span>
              <span className="flex-shrink-0 flex items-baseline gap-1.5">
                <span className={SC_LABEL}>PH</span>
                <span className="text-ink text-[15px] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-serif)' }}>
                  {formatHandicap(playingHcp)}
                </span>
                {allowance !== FULL_ALLOWANCE && (
                  <span className={SC_LABEL}>{allowance}%</span>
                )}
              </span>
            </div>
            <div className="w-[60px] flex-shrink-0" />
          </div>

          {/* Scrollable holes */}
          <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-28 space-y-2">
            {courseHoles.map((hole, idx) => {
              const hs = editDraft[idx] ?? EMPTY_HOLE
              const ePar = effectivePar(hole, player.gender)
              const eSI  = effectiveSI(hole, player.gender)
              const netParGross = ePar + shotsReceived(playingHcp, eSI)
              const pts = hs.isNR ? 0 : hs.gross !== null
                ? calcStableford(hs.gross, ePar, eSI, playingHcp)
                : null
              const { label, color } = hs.isNR
                ? { label: "NR", color: "text-rust-deep/70" }
                : hs.gross !== null ? scoreToPar(hs.gross, ePar)
                : { label: "", color: "" }

              const ptsBadge =
                hs.isNR      ? "border-rust/40 bg-rust/[0.12] text-rust-deep/80" :
                pts === null  ? "border-bark/12 text-ink/50" :
                pts >= 3      ? "border-accent bg-accent-deep/15 text-accent-deep" :
                pts === 2     ? "border-bark/12 bg-bark/[0.04] text-ink" :
                pts === 1     ? "border-bark/12 bg-transparent text-ink/65" :
                                "border-rust/40 bg-rust/10 text-rust"

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
              // A no return clears the stats with the score, the same as on
              // the live tile: the ball was picked up, so there is no putt
              // count to keep. `saveEditDraft` writes the nulls through.
              const toggleNR = () => setDraftHole(idx,
                hs.isNR
                  ? { isNR: false, gross: null }
                  // The fairway survives the NR on purpose: the tee shot
                  // happened, and two lost balls right is exactly the miss
                  // worth counting. Only the putt count goes — a hole never
                  // finished has none.
                  : { isNR: true, gross: null, putts: null }
              )

              return (
                <div key={hole.id} className={`bg-surface border rounded-xl ${hs.isNR ? "border-rust/40" : "border-bark/12"}`}>
                  {/* Hole info row */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="flex items-baseline gap-3">
                      <span className="font-[family-name:var(--font-playfair)] text-2xl text-ink leading-none w-6">{hole.hole_number}</span>
                      <span className="text-ink/65 text-base">Par <span className="text-ink font-semibold">{ePar}</span></span>
                      <span className="text-ink/50 text-sm">SI {eSI}</span>
                    </div>
                    <button
                      onClick={toggleNR}
                      className={`text-sm tracking-widest uppercase border rounded-xl px-2.5 py-1 transition-colors
                        ${hs.isNR
                          ? "border-rust/50 text-rust-deep bg-rust/10"
                          : "border-bark/12 text-ink/50 hover:border-rust/40 hover:text-rust-deep/60"}`}
                    >
                      NR
                    </button>
                  </div>

                  {/* Score stepper row */}
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <button
                      onClick={() => stepScore(-1)} disabled={hs.isNR}
                      className="flex-1 h-16 rounded-xl border border-bark/12 text-ink/80 text-4xl leading-none
                        hover:border-accent hover:text-accent-deep active:scale-95 transition-all
                        flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
                    >−</button>
                    {hs.isNR ? (
                      <span className="font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center text-ink/50 w-20 h-16">—</span>
                    ) : (
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={hs.gross === null ? "" : String(hs.gross)}
                        onChange={onInput}
                        className={`font-[family-name:var(--font-playfair)] text-4xl text-center bg-transparent
                          outline-none text-ink caret-accent border rounded-xl transition-colors p-0 w-20 h-16
                          ${hs.gross === null ? "border-accent/50" : "border-accent/15"}`}
                        style={{ lineHeight: "4rem" }}
                      />
                    )}
                    <button
                      onClick={() => stepScore(1)} disabled={hs.isNR}
                      className="flex-1 h-16 rounded-xl border border-bark/12 text-ink/80 text-4xl leading-none
                        hover:border-accent hover:text-accent-deep active:scale-95 transition-all
                        flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
                    >+</button>
                    <div className={`flex-shrink-0 flex items-baseline gap-1 px-2.5 py-1.5 rounded-xl border ${ptsBadge}`}>
                      <span className="text-lg font-bold leading-none font-[family-name:var(--font-playfair)]">{pts ?? "·"}</span>
                      <span className="text-[10px] opacity-60">pts</span>
                    </div>
                    {label && label !== "NR" && (
                      <span className={`text-sm flex-shrink-0 ${color}`}>{label}</span>
                    )}
                  </div>

                  {/* The same row the live card asks with, gated the same
                      way. This is what makes a mis-tapped putt count
                      fixable after the hole instead of permanent — the
                      draft already carried the values; only the controls
                      were missing. */}
                  {trackStats && (hs.gross !== null || hs.isNR) && (
                    <StatsRow
                      effectivePar={ePar}
                      gross={hs.gross}
                      putts={hs.putts}
                      fairway={hs.fairway}
                      ariaName={`hole ${hole.hole_number}`}
                      onPutts={v => setDraftHole(idx, { putts: v })}
                      onFairway={v => setDraftHole(idx, { fairway: v })}
                      nr={hs.isNR}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Sticky save */}
          <div className="sticky bottom-0 bg-cream border-t border-bark/12 px-4 py-4 max-w-lg mx-auto w-full">
            <button
              onClick={saveEditDraft}
              disabled={editSaving}
              className="w-full py-4 bg-accent-deep text-ink text-base tracking-[0.2em] uppercase font-bold
                hover:bg-accent disabled:opacity-50 transition-colors rounded-xl"
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
            {playerSetups.map(({ player, displayHcp }) => {
              const isSel = player.id === selectedId
              return (
                <button
                  key={player.id}
                  onClick={() => setSelectedSummaryPlayerId(player.id)}
                  className={`flex-shrink-0 flex flex-col items-start px-3.5 py-2.5 rounded-xl border transition-colors min-w-[100px]
                    ${isSel
                      ? "border-accent bg-accent/10"
                      : "border-bark/12 bg-surface hover:border-bark/12"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {player.teams && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: player.teams.color }} />
                    )}
                    <span className={`text-base font-medium leading-tight ${isSel ? "text-ink" : "text-ink/65"}`}>
                      {player.name.split(" ")[0]}
                    </span>
                  </div>
                  <span className={`text-sm ${isSel ? "text-accent-deep" : "text-ink/50"}`}>HC {formatHandicap(displayHcp)}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Paper scorecard */}
        {selectedSetup && (() => {
          // The card is *read* at whatever allowance the header is showing;
          // `handleCommit` writes from the full handicap regardless, and the
          // gross columns below never move whichever is on screen.
          const { player, displayHcp: playingHcp, tee } = selectedSetup

          const currentRound = rounds.find(r => r.id === liveRound?.round_id)
          const courseNameLabel = currentRound?.courses?.name ?? ""
          const ROUND_DATES: Record<number, string> = { 1: "Thu 16 Apr", 2: "Fri 17 Apr", 3: "Sat 18 Apr" }
          const dateLabel = ROUND_DATES[currentRound?.round_number ?? 0] ?? ""

          let totalPts = 0, totalGross = 0, totalYards = 0, totalPar = 0
          let front9Pts = 0, front9Gross = 0, front9Yards = 0, front9Par = 0
          let hasAnyScore = false

          const rows = courseHoles.map((hole, idx) => {
            const hs      = scores[idx]?.[player.id]
            const ePar    = effectivePar(hole, player.gender)
            const eSI     = effectiveSI(hole, player.gender)
            const isNR      = hs?.isNR === true
            const gross     = isNR ? null : (hs?.gross ?? null)  // null for NR display
            const grossFull = hs?.gross ?? null                   // NR max gross for subtotals
            // Recomputed rather than read off the card's cached points: those
            // were worked out at the full handicap, which is what is stored
            // and is not necessarily what is being shown.
            const pts       = isNR ? 0 : gross !== null
              ? calcStableford(gross, ePar, eSI, playingHcp)
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
          // One shape for every card in the app — see ScoreShape.
          const scoreSymbol = (gross: number | null, ePar: number, isNR: boolean) => {
            if (isNR) return <NoReturnShape size="md" />
            if (gross === null) return <span className="text-ink/65 text-base">—</span>
            return <ScoreShape gross={gross} par={ePar} size="md" />
          }

          const ptsColor = (pts: number | null) =>
            pts === null ? "text-ink/65" :
            pts === 0    ? "text-ink/65 opacity-50" :
                           "text-ink/65 font-bold"

          // fr columns fill full card width; Score gets extra space for symbol
          const grid  = "grid grid-cols-[2fr_3fr_2fr_2fr_3fr_2fr] w-full"
          const sf    = { fontFamily: "var(--font-serif)" }
          const muted = "text-ink/65"
          const dark  = "text-ink"

          return (
            <div className="rounded-2xl border border-bark/12 bg-surface relative">

              {/* Course banner — scrolls with page, does not stick */}
              <div className={`rounded-t-2xl px-4 py-3 ${SC_RULE} ${SC_BAND}`}>
                <p className="text-ink text-base font-semibold" style={sf}>{courseNameLabel}</p>
              </div>

              {/* Sticky: player details row + column header row.
                  `SC_STICKY` is what stops eighteen holes scrolling visibly
                  through them — the bands themselves are a 5% tint, and a tint
                  pinned over moving content shows all of it. */}
              <div className={`sticky z-10 ${SC_STICKY}`} style={{ top: CHROME }}>

                {/* Tee and playing handicap.
                    The name is here only when nothing else is showing it —
                    with two or more players the selector tiles above are the
                    name, and printing it again spends the widest line on the
                    card repeating the thing that was just tapped. */}
                <div className={`flex items-center gap-5 px-4 py-2.5 ${SC_RULE} ${SC_HEAD}`}>
                  {playerSetups.length < 2 && (
                    <span className="flex-1 min-w-0 t-card text-ink truncate">{player.name}</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className={SC_LABEL}>Tee</span>
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${teeDot(tee.name)}`} />
                    <span className={`text-[15px] font-semibold ${dark}`} style={sf}>{tee.name}</span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className={SC_LABEL}>PH</span>
                    <span className={`text-[15px] font-semibold ${dark}`} style={sf}>{formatHandicap(playingHcp)}</span>
                    {/* Which allowance this figure is. The header's control
                        says the same thing, but a signed card is read on its
                        own and a bare "PH 15" off a handicap of 18 invites
                        exactly one question. */}
                    {allowance !== FULL_ALLOWANCE && (
                      <span className={SC_LABEL}>{allowance}%</span>
                    )}
                  </span>
                </div>

                {/* Column headers */}
                <div className={`${grid} px-3 py-2 ${SC_RULE} ${SC_HEAD}`}>
                  {(["Hole","Yds","Par","SI","Score","Pts"] as const).map((h, i) => (
                    <span key={h} className={`${SC_HEAD_TEXT} ${i === 4 ? "text-center" : i === 5 ? "text-right" : ""}`} style={sf}>{h}</span>
                  ))}
                </div>
              </div>

              {/* Front 9 */}
              {rows.slice(0, 9).map(({ hole, isNR, gross, pts, ePar, eSI, yardage }) => (
                <div key={hole.id} className={`${grid} px-3 py-2 items-center ${SC_RULE} ${scRow(hole.hole_number)}`}>
                  <span className={`text-base font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
                  <span className={`text-base ${muted}`} style={sf}>{yardage ?? "—"}</span>
                  <span className={`text-base ${dark}`} style={sf}>{ePar}</span>
                  <span className={`text-base ${muted}`} style={sf}>{eSI}</span>
                  <span className="flex items-center justify-center">{scoreSymbol(gross, ePar, isNR)}</span>
                  <span className={`text-right text-lg ${ptsColor(pts)}`} style={sf}>{pts ?? "—"}</span>
                </div>
              ))}

              {/* Out subtotal — gold fill, bolder text */}
              <div className={`${grid} px-3 py-2.5 items-center ${SC_RULE} ${SC_BAND}`}>
                <span className="text-sm font-bold tracking-widest uppercase text-ink/80" style={sf}>Out</span>
                <span className={`text-sm ${muted}`} style={sf}>{front9Yards > 0 ? front9Yards : "—"}</span>
                <span className={`text-sm font-bold ${dark}`} style={sf}>{front9Par}</span>
                <span />
                <span className={`text-center text-xl font-bold ${dark}`} style={sf}>{front9Gross > 0 ? front9Gross : "—"}</span>
                <span className={`text-right text-lg font-bold text-ink/65`} style={sf}>{front9Pts}</span>
              </div>

              {/* Back 9 — pos = idx+1; bg when idx is even (pos is odd) */}
              {rows.slice(9).map(({ hole, isNR, gross, pts, ePar, eSI, yardage }) => (
                <div key={hole.id} className={`${grid} px-3 py-2 items-center ${SC_RULE} ${scRow(hole.hole_number)}`}>
                  <span className={`text-base font-semibold ${dark}`} style={sf}>{hole.hole_number}</span>
                  <span className={`text-base ${muted}`} style={sf}>{yardage ?? "—"}</span>
                  <span className={`text-base ${dark}`} style={sf}>{ePar}</span>
                  <span className={`text-base ${muted}`} style={sf}>{eSI}</span>
                  <span className="flex items-center justify-center">{scoreSymbol(gross, ePar, isNR)}</span>
                  <span className={`text-right text-lg ${ptsColor(pts)}`} style={sf}>{pts ?? "—"}</span>
                </div>
              ))}

              {/* In subtotal — gold fill, bolder text */}
              <div className={`${grid} px-3 py-2.5 items-center ${SC_RULE} ${SC_BAND}`}>
                <span className="text-sm font-bold tracking-widest uppercase text-ink/80" style={sf}>In</span>
                <span className={`text-sm ${muted}`} style={sf}>{back9Yards > 0 ? back9Yards : "—"}</span>
                <span className={`text-sm font-bold ${dark}`} style={sf}>{back9Par}</span>
                <span />
                <span className={`text-center text-xl font-bold ${dark}`} style={sf}>{back9Gross > 0 ? back9Gross : "—"}</span>
                <span className={`text-right text-lg font-bold text-ink/65`} style={sf}>{back9Pts}</span>
              </div>

              {/* Total — deepest gold, heaviest weight */}
              <div className={`${grid} px-3 py-3 items-center rounded-b-2xl ${SC_BAND_TOTAL}`}>
                <span className="text-[13px] font-bold tracking-widest uppercase text-ink/80" style={sf}>Tot</span>
                <span className={`text-sm font-semibold ${muted}`} style={sf}>{totalYards > 0 ? totalYards : "—"}</span>
                <span className={`text-sm font-bold ${dark}`} style={sf}>{totalPar}</span>
                <span />
                <span className={`text-center text-xl font-extrabold ${dark}`} style={sf}>{hasAnyScore && totalGross > 0 ? totalGross : "—"}</span>
                <span className="text-right text-xl font-extrabold text-ink/80 font-[family-name:var(--font-playfair)]">{totalPts}</span>
              </div>

            </div>
          )
        })()}

        {error && <p className="text-rust-deep text-base text-center">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => enterEditMode(selectedId)}
            className="flex-1 py-4 border border-bark/12 text-ink/80 text-base tracking-[0.15em] uppercase hover:border-bark/25 transition-colors rounded-xl"
          >
            Edit Scorecard
          </button>
          <button
            onClick={handleCommit}
            disabled={saving}
            className="flex-[2] py-4 bg-accent-deep text-ink text-base tracking-[0.2em] uppercase font-bold hover:bg-accent disabled:opacity-50 transition-colors rounded-xl"
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
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent-deep text-3xl">✓</div>
        <div>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-ink mb-2">Scores Committed</h2>
          <p className="text-ink/65 text-base">Saved to the official leaderboard.</p>
        </div>
        <button
          onClick={() => { setSelectedPlayerIds([]); setPlayerTeeIds({}); setScores({}); setHoleIdx(0); setStep("setup") }}
          className="mt-4 px-8 py-3 border border-accent/50 text-accent-deep text-sm tracking-[0.2em] uppercase hover:bg-accent/10 transition-colors"
        >
          Score Another Player
        </button>
        <button onClick={() => setCloseConfirm(true)} className="text-ink/50 text-sm tracking-widest uppercase hover:text-rust transition-colors">
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
  existingScores, runningTotals, onSubmit, onBack, showLeaderboard, trackStats,
}: {
  hole: Hole
  playerSetups: PlayerSetup[]; courseId: string
  existingScores: Record<string, HoleScore>
  runningTotals: Record<string, number>
  onSubmit: (scores: Record<string, HoleScore>) => void
  onBack: () => void
  showLeaderboard: boolean
  trackStats: boolean
}) {
  const [holeScores, setHoleScores] = useState<Record<string, HoleScore>>(() => {
    const init: Record<string, HoleScore> = {}
    for (const { player } of playerSetups) {
      init[player.id] = existingScores[player.id] ?? EMPTY_HOLE
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
    // The card starts at the top of the screen and the Next button follows it
    // down the page, 16px below the last tile. Nothing here is stretched to
    // the height of the window and nothing is pinned to the bottom of it.
    //
    // Both of those were tried and both were wrong. The nav bar below used to
    // be `fixed bottom-0` — but this card renders inside the swipe track,
    // which carries `transform: translateX(...)`, and a transform makes an
    // element the containing block for any `fixed` descendant. So the bar was
    // never fixed to the window at all: it was pinned to the bottom of the
    // track, which is as tall as the taller of its two panels. On a one-player
    // card that put it 118px below the fold — the Next button was not on the
    // screen. Stretching the card to `100dvh` and pushing it down with
    // `justify-end` was an attempt to reach that button, and it only added
    // 165px of bare cream between the header and the card.
    //
    // In flow, both problems are the same problem and it does not exist: the
    // card sits under the header, the button sits under the card, and on a
    // four-player card the whole thing simply scrolls, ending at the button
    // you were scrolling towards anyway.
    <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-4">

      {/* One tile per player */}
      <div className="flex flex-col gap-3">
        {playerSetups.map(({ player, displayHcp, tee }) => {
          const hs   = holeScores[player.id] ?? EMPTY_HOLE
          const ePar = effectivePar(hole, player.gender)
          const eSI  = effectiveSI(hole, player.gender)
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
              // The allowance the card is being read at. What this tile
              // writes on submit is computed from the full handicap in
              // handleHoleSubmit, which does not see this number.
              playingHcp={displayHcp}
              runningTotal={runningTotals[player.id] ?? 0}
              yardage={yardageForTee(hole, tee.name)}
              trackStats={trackStats}
              putts={hs.putts}
              fairway={hs.fairway}
              onChange={v  => set(player.id, { gross: v, isNR: false })}
              onPutts={v   => set(player.id, { putts: v })}
              onFairway={v => set(player.id, { fairway: v })}
              // A no return clears the putt count with the score — the ball
              // was picked up, so there is none to keep — but the fairway
              // answer stands: the tee shot happened, and two lost balls
              // right is exactly the miss worth counting.
              onToggleNR={() => set(player.id, hs.isNR
                ? { isNR: false, gross: null }
                : { isNR: true, gross: null, putts: null })}
            />
          )
        })}
      </div>

      {/* Nav bar — the last row of the card, hidden when the board is showing.
          Not `fixed`: see the note on the container above. */}
      <div className={`flex gap-3${showLeaderboard ? " hidden" : ""}`}>
        <button
          onClick={onBack}
          className="flex-1 py-4 border border-bark/12 text-ink/65 text-2xl
            hover:border-bark/25 hover:text-ink/80 active:bg-bark/[0.04] transition-colors rounded-xl"
          aria-label="Previous hole"
        >
          ←
        </button>
        <button
          onClick={() => onSubmit(holeScores)}
          disabled={!allHaveGross}
          className="flex-[2] py-4 bg-accent-deep text-ink text-2xl font-bold
            hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed
            active:scale-[0.98] transition-all rounded-xl"
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
  trackStats, putts, fairway,
  onChange, onToggleNR, onPutts, onFairway,
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
  trackStats: boolean
  putts: number | null
  fairway: Fairway | null
  onChange: (v: number | null) => void
  onToggleNR: () => void
  onPutts: (v: number | null) => void
  onFairway: (v: Fairway | null) => void
}) {
  const netParGross = effectivePar + shotsReceived(playingHcp, effectiveSI)
  const hasScore    = score !== null

  const pts = isNR ? 0 : hasScore ? calcStableford(score, effectivePar, effectiveSI, playingHcp) : null
  const { label, color } = isNR
    ? { label: "No Return", color: "text-rust-deep/70" }
    : hasScore ? scoreToPar(score, effectivePar)
    : { label: "", color: "" }

  const ptsBadge =
    isNR         ? "border-rust/40 bg-rust/[0.12] text-rust-deep/80" :
    pts === null ? "border-bark/12 text-ink/50" :
    pts >= 3     ? "border-accent bg-accent-deep/15 text-accent-deep" :
    pts === 2    ? "border-bark/12 bg-bark/[0.04] text-ink" :
    pts === 1    ? "border-bark/12 bg-transparent text-ink/65" :
                   "border-rust/40 bg-rust/10 text-rust"

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

  // ── The stats row ──
  //
  // It appears once there is a score on the hole and never before: asking how
  // many putts went into a number nobody has typed yet is a control with
  // nothing to be about, and hiding it until then is what keeps the tile
  // exactly as tall as it is today while somebody is still deciding. It then
  // sequences the way the hole did — score, tee shot, putts, next.
  //
  // Shown on a no return too, with the putts half gone: the tee shot
  // happened — two lost balls right is exactly the miss worth recording —
  // but a hole never finished has no putt count. It never gates the Next
  // button, which reads `allHaveGross` and knows nothing about any of this.
  const showStats = trackStats && (hasScore || isNR)

  return (
    <div className={`bg-surface border rounded-xl transition-colors
      ${isNR ? "border-rust/40" : "border-bark/12"}`}>

      {/* Player name header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.06]">
        {teamColor && (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
        )}
        <span className="text-ink/80 text-base font-semibold flex-1">{playerName}</span>
        <span className="text-accent-deep text-base font-bold">{runningTotal} pts</span>
        <span className="text-ink/50 text-sm">HC {formatHandicap(playingHcp)}</span>
      </div>

      {/* ══ MOBILE LAYOUT (hidden at sm+) ══ */}
      <div className="sm:hidden">

        {/* Row 1: hole info + NR toggle */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-ink/65 text-base">
              Par <span className="text-ink font-semibold">{effectivePar}</span>
            </span>
            <span className="text-ink/50 text-base">SI {effectiveSI}</span>
            {yardage && <span className="text-ink/50 text-sm">{yardage} yds</span>}
          </div>
          <button
            onClick={onToggleNR}
            className={`text-sm tracking-widest uppercase border rounded-xl px-3 py-1.5 transition-colors
              ${isNR
                ? "border-rust/50 text-rust-deep bg-rust/10"
                : "border-bark/12 text-ink/50 hover:border-rust/40 hover:text-rust-deep/60"}`}
          >
            NR
          </button>
        </div>

        {/* Row 2: score stepper */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <button
            onClick={() => handleStep(-1)}
            disabled={isNR}
            className="flex-1 h-16 rounded-xl border border-bark/12 text-ink/80 text-4xl leading-none
              hover:border-accent hover:text-accent-deep active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            −
          </button>
          {isNR ? (
            <span className="font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center
              text-ink/50 w-20 h-16">
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
                outline-none text-ink caret-accent border rounded-xl transition-colors p-0 w-20 h-16
                ${score === null ? "border-accent/50" : "border-accent/15"}`}
              style={{ lineHeight: "4rem" }}
            />
          )}
          <button
            onClick={() => handleStep(1)}
            disabled={isNR}
            className="flex-1 h-16 rounded-xl border border-bark/12 text-ink/80 text-4xl leading-none
              hover:border-accent hover:text-accent-deep active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>

        {/* Row 3: score label + pts badge */}
        <div className="flex items-center justify-between px-4 pb-4">
          <span className={`text-base font-semibold ${color || "text-ink/50"}`}>
            {label || "—"}
          </span>
          <div className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl border ${ptsBadge}`}>
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
          <span className="text-ink/65 text-sm">Par {effectivePar} · SI {effectiveSI}</span>
          {yardage && <span className="text-ink/65 text-sm">{yardage} yds</span>}
          {label && <span className={`text-sm font-semibold mt-0.5 ${color}`}>{label}</span>}
        </div>

        {/* Score stepper + NR */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <button
            onClick={() => handleStep(-1)}
            disabled={isNR}
            className="w-14 h-14 rounded-full border border-bark/12 text-ink/80 text-4xl leading-none
              hover:border-accent hover:text-accent-deep active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            −
          </button>
          {isNR ? (
            <span className="font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center
              text-ink/50 w-14 h-14">
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
                outline-none text-ink caret-accent border rounded-xl transition-colors p-0 w-14 h-14
                ${score === null ? "border-accent/50" : "border-accent/15"}`}
              style={{ lineHeight: "3.5rem" }}
            />
          )}
          <button
            onClick={() => handleStep(1)}
            disabled={isNR}
            className="w-14 h-14 rounded-full border border-bark/12 text-ink/80 text-4xl leading-none
              hover:border-accent hover:text-accent-deep active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
          >
            +
          </button>
          <button
            onClick={onToggleNR}
            className={`text-sm tracking-widest uppercase border rounded-xl px-2 py-1.5 flex-shrink-0 transition-colors
              ${isNR
                ? "border-rust/50 text-rust-deep bg-rust/10"
                : "border-bark/12 text-ink/50 hover:border-rust/40 hover:text-rust-deep/60"}`}
          >
            NR
          </button>
        </div>

        {/* Pts badge */}
        <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0
          ${isNR ? "bg-rust/15 text-rust-deep/70"
            : pts === null ? "bg-transparent text-ink/50"
            : pts >= 3 ? "bg-accent-deep text-ink"
            : pts === 2 ? "bg-bark/[0.06] text-ink"
            : pts === 1 ? "bg-bark/[0.04] text-ink/65"
            : "bg-rust/15 text-rust"}`}>
          <span className="text-lg font-bold leading-none">{pts ?? "·"}</span>
          <span className="text-[10px] opacity-60 leading-none mt-0.5">{pts !== null || isNR ? "pts" : ""}</span>
        </div>

      </div>

      {/* Below both layouts, and deliberately not inside either. The two
          above are a phone column and a desktop row saying the same thing
          twice; this is a row on both, so writing it once is the whole
          reason it sits out here. */}
      {showStats && (
        <StatsRow
          effectivePar={effectivePar}
          gross={score}
          putts={putts}
          fairway={fairway}
          ariaName={playerName}
          onPutts={onPutts}
          onFairway={onFairway}
          nr={isNR}
        />
      )}
    </div>
  )
}

// ─── StatsRow ─────────────────────────────────────────────
//
// The fairway chips and the putts counter, as one component — because two
// screens ask the questions now. The live tile asks as the hole is played;
// the Edit Scorecard screen asks again afterwards, which is how a mis-tapped
// putt count stops being permanent. One implementation, so the two cannot
// drift apart in what they accept.
//
// The caller decides *whether* to ask — this row renders whenever it is
// rendered. Both callers gate the same way: a score on the hole, no NR, and
// the trip tracking stats at all.

function StatsRow({
  effectivePar, gross, putts, fairway, ariaName, onPutts, onFairway, nr = false,
}: {
  effectivePar: number
  gross: number | null
  putts: number | null
  fairway: Fairway | null
  /** Who or what the controls belong to, for a screen reader: a player's
      name on the live card, the hole on the edit screen. */
  ariaName: string
  onPutts: (v: number | null) => void
  onFairway: (v: Fairway | null) => void
  /**
   * A no return. The fairway question still stands — the tee shot happened,
   * and two lost balls right is exactly the miss worth recording — but the
   * putts control goes: a hole that was never finished has no putt count,
   * and the stats treat it as an assumed two that putting never counts.
   */
  nr?: boolean
}) {
  // A par 3 has no fairway to find, which is not the same as missing one.
  const showFairway = effectivePar >= 4
  // Never more putts than shots — you cannot two-putt a hole-in-one — and
  // never more than seven, which is two more than anybody admits to.
  const maxPutts = Math.min(7, gross ?? 7)

  // Tinted when chosen, bordered when not. Solid emerald would put three of
  // these on every tile, and emerald is an accent.
  const chipClass = (on: boolean) =>
    "h-12 t-cap px-1 flex items-center justify-center rounded-xl border " +
    "transition-colors duration-150 touch-manipulation " +
    (on
      ? "border-accent bg-accent/[0.12] text-accent-deep font-semibold"
      : "border-bark/12 text-ink/65 hover:border-bark/25 active:bg-bark/[0.04]")

  const stepClass =
    "w-11 h-12 rounded-xl border border-bark/12 text-ink/80 text-2xl leading-none " +
    "flex items-center justify-center touch-manipulation transition-colors duration-150 " +
    "hover:border-accent hover:text-accent-deep active:scale-95 " +
    "disabled:opacity-20 disabled:cursor-not-allowed"

  // One row, not two. Two put 129px on every tile that had a score on it,
  // which on a fourball is most of a screen of extra scrolling on a card
  // that already scrolls; this is 73px. Measured, not guessed.
  return (
    <div className="px-4 pb-3 pt-3 border-t border-bark/[0.08] flex items-center gap-2">

      {showFairway ? (
        // The middle column is wider because its word is longer. Three equal
        // columns clipped "Fairway" on a 360px phone, which is a live size.
        <div
          className="flex-1 grid gap-1.5 min-w-0"
          style={{ gridTemplateColumns: "1fr 1.35fr 1fr" }}
          role="group"
          aria-label={`Tee shot, ${ariaName}`}
        >
          {([["left", "Left"], ["fairway", "Fairway"], ["right", "Right"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={fairway === v}
              // Tapped again, it clears. A three-way control with no fourth
              // button cannot otherwise be un-set, and a mis-tap on a phone
              // in the rain is the common case rather than the odd one.
              onClick={() => onFairway(fairway === v ? null : v)}
              className={chipClass(fairway === v)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        // A par 3 keeps the space rather than closing it, so the putts
        // control stays in the same place on every hole of the round. It
        // says nothing: "no fairway on a par 3" is a sentence explaining
        // something the golfer holding the phone already knows.
        <span className="flex-1" />
      )}

      {nr ? null : (
      <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label={`Putts, ${ariaName}`}>
        <button
          type="button"
          aria-label="Fewer putts"
          // Down from nothing lands on 1, up from nothing lands on 2 — the
          // two commonest answers, one tap each, and neither is pre-filled.
          // A default of 2 would be indistinguishable from a real 2 and the
          // putting average would quietly become the average of the default.
          //
          // Below zero clears rather than sticking at zero: it is the only
          // way back out, and zero is a real answer that has to be reachable
          // for the hole holed from off the green.
          onClick={() => onPutts(putts == null ? 1 : putts <= 0 ? null : putts - 1)}
          className={stepClass}
        >
          −
        </button>
        {/* Numeral over its unit, the same shape as the points badge two rows
            up. That badge is why this is not a bare number beside a plus and
            a minus: there is already a −/+ stepper on this tile for the
            score, and two unlabelled ones would be a mis-entry waiting. */}
        {/* Not `aria-hidden`: stacked, it already reads as "2 putts", which
            is the whole value and its unit in the order somebody says them. */}
        <span className="flex flex-col items-center justify-center w-9" role="status">
          <span className={`t-data t-num leading-none ${putts == null ? "text-ink/50" : "text-ink"}`}>
            {putts ?? "—"}
          </span>
          <span className="text-[10px] text-ink/50 leading-none mt-0.5">putts</span>
        </span>
        <button
          type="button"
          aria-label="More putts"
          disabled={putts != null && putts >= maxPutts}
          onClick={() => onPutts(putts == null ? 2 : Math.min(maxPutts, putts + 1))}
          className={stepClass}
        >
          +
        </button>
      </div>
      )}
    </div>
  )
}
