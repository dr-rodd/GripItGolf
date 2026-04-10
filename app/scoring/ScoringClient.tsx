"use client"

import { useState } from "react"
import Link from "next/link"
import ScoreEntryForm from "@/app/score-entry/ScoreEntryForm"
import LiveScoringFlow from "./LiveScoringFlow"
import LiveLeaderboardPanel from "./LiveLeaderboardPanel"
import BackButton from "@/app/components/BackButton"

// ─── Types (mirrors server data shapes) ──────────────────

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
  id: string; hole_number: number; par: number; stroke_index: number
  course_id: string; par_ladies?: number; stroke_index_ladies?: number
  yardage_black?: number; yardage_blue?: number; yardage_white?: number
  yardage_red?: number; yardage_sandstone?: number; yardage_slate?: number
  yardage_granite?: number; yardage_claret?: number
}
interface Tee {
  id: string; course_id: string; name: string; gender: string
  par: number; course_rating: number; slope: number
}
interface RoundHandicap { round_id: string; player_id: string; playing_handicap: number }
export interface ActiveLiveRound {
  id: string; course_id: string; round_id: string; activated_by: string | null
  rounds: { round_number: number } | null
  courses: { name: string } | null
}

interface Props {
  players: Player[]
  rounds: Round[]
  holes: Hole[]
  tees: Tee[]
  roundHandicaps: RoundHandicap[]
  activeLiveRound: ActiveLiveRound | null
}

type View = "landing" | "standard" | "live" | "leaderboard"

export default function ScoringClient({ players, rounds, holes, tees, roundHandicaps, activeLiveRound }: Props) {
  const [view, setView] = useState<View>("landing")
  const [liveRound, setLiveRound] = useState<ActiveLiveRound | null>(activeLiveRound)
  const [showLiveLeaderboard, setShowLiveLeaderboard] = useState(false)

  const nonComposite = players.filter(p => !p.is_composite)
  const courses = rounds
    .map(r => r.courses)
    .filter((c): c is { id: string; name: string } => c !== null)
    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)

  const isLiveActive = liveRound !== null

  // ─── Header ───────────────────────────────────────────────

  const headerLeft = view === "landing"
    ? <BackButton href="/" />
    : <BackButton onClick={() => { setView("landing"); setShowLiveLeaderboard(false) }} />

  const headerRight = view === "landing"
    ? <Link href="/leaderboard" className="text-white/40 text-xs tracking-[0.2em] uppercase hover:text-[#C9A84C] transition-colors">Leaderboard →</Link>
    : view === "live" && liveRound
      ? <button
          onClick={() => setShowLiveLeaderboard(v => !v)}
          className={`text-xs tracking-[0.2em] uppercase transition-colors w-[80px] text-right
            ${showLiveLeaderboard ? "text-[#C9A84C]" : "text-white/40 hover:text-white/60"}`}
        >
          {showLiveLeaderboard ? "← Scores" : "Board"}
        </button>
      : <div className="w-[80px]" />

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="h-dvh overflow-y-auto bg-[#0a1a0e] text-white">
      {/* Sticky header */}
      <div className="border-b border-[#1e3d28] sticky top-0 z-20 bg-[#0a1a0e]">
        <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between">
          {headerLeft}
          <h1 className="font-[family-name:var(--font-playfair)] text-lg text-white tracking-wide">
            Scoring
          </h1>
          {headerRight}
        </div>
      </div>

      {/* Content */}
      {view === "landing" && (
        <Landing
          isLiveActive={isLiveActive}
          liveRound={liveRound}
          onStandard={() => setView("standard")}
          onLive={() => setView("live")}
          onWatchLive={() => setView("leaderboard")}
        />
      )}

      {view === "standard" && (
        <ScoreEntryForm players={nonComposite as any} courses={courses} />
      )}

      {view === "live" && (
        <LiveScoringFlow
          players={nonComposite}
          rounds={rounds}
          holes={holes}
          tees={tees}
          roundHandicaps={roundHandicaps}
          activeLiveRound={liveRound}
          onBack={() => { setView("landing"); setShowLiveLeaderboard(false) }}
          onLiveRoundChange={setLiveRound}
          showLeaderboard={showLiveLeaderboard}
          onLeaderboardChange={setShowLiveLeaderboard}
        />
      )}

      {view === "leaderboard" && liveRound && (
        <LiveLeaderboardPanel
          liveRound={liveRound}
          players={nonComposite}
          holes={holes}
          roundHandicaps={roundHandicaps}
          onClose={() => setView("landing")}
          showBackButton={true}
        />
      )}
    </div>
  )
}

// ─── Landing ──────────────────────────────────────────────

function Landing({
  isLiveActive, liveRound, onStandard, onLive, onWatchLive
}: {
  isLiveActive: boolean
  liveRound: ActiveLiveRound | null
  onStandard: () => void
  onLive: () => void
  onWatchLive: () => void
}) {
  const liveLabel = isLiveActive
    ? `Join Live Round — ${liveRound!.courses?.name ?? `Round ${liveRound!.rounds?.round_number}`}`
    : "Live Scoring"
  const liveSub = isLiveActive
    ? "Live round in progress — tap to join"
    : "Tap to start a live round"

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-16 min-h-[calc(100dvh-57px)]">
      <div className="text-center mb-2">
        <p className="text-white/30 text-xs tracking-[0.25em] uppercase">Choose entry mode</p>
      </div>

      {/* Standard Entry */}
      <button
        onClick={onStandard}
        className="w-full max-w-xs py-5 border border-[#C9A84C]/50 text-[#C9A84C] tracking-[0.2em] uppercase text-sm hover:bg-[#C9A84C]/10 transition-colors"
      >
        Standard Entry
        <div className="text-[10px] text-white/40 normal-case tracking-normal mt-1 font-normal">
          18-hole scorecard entry
        </div>
      </button>

      {/* Live Scoring */}
      <button
        onClick={onLive}
        className={`w-full max-w-xs py-5 border tracking-[0.2em] uppercase text-sm transition-all relative
          ${isLiveActive
            ? "border-green-500 text-green-400 hover:bg-green-500/10"
            : "border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"}`}
      >
        {isLiveActive && (
          <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
        )}
        {liveLabel}
        <div className="text-[10px] text-white/40 normal-case tracking-normal mt-1 font-normal">
          {liveSub}
        </div>
      </button>

      {/* Watch Live — shown when a live round is in progress */}
      {isLiveActive && (
        <button
          onClick={onWatchLive}
          className="text-white/40 text-xs tracking-[0.2em] uppercase hover:text-green-400 transition-colors"
        >
          Watch Live →
        </button>
      )}
    </div>
  )
}
