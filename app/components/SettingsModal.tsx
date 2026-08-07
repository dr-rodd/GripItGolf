"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { revalidateLeaderboards } from "@/app/actions/revalidate"

type Action = "reset-scores" | "reset-teams"
type PanelStatus = "idle" | "loading" | "error"

interface ActionConfig {
  id: Action
  label: string
  description: string
  confirmText: string
  successMessage: string
  danger: boolean
}

interface LiveSession {
  id: string
  round_id: string
  activated_at: string
  rounds: { round_number: number; courses: { name: string } } | null
  live_player_locks: Array<{ player_id: string; players: { name: string } | null }>
}

const ACTIONS: ActionConfig[] = [
  {
    id: "reset-scores",
    label: "Reset All Scores",
    description: "Clears all submitted scores and playing handicaps. Player and team data is preserved.",
    confirmText: "This will permanently delete all scores and round handicaps. This cannot be undone.",
    successMessage: "All scores and round handicaps cleared.",
    danger: true,
  },
  {
    id: "reset-teams",
    label: "Reset Teams",
    description: "Removes all team assignments. Players remain but are moved to unassigned.",
    confirmText: "This will remove all players from their teams. This cannot be undone.",
    successMessage: "All team assignments cleared.",
    danger: false,
  },
]

const PASSWORD = "donegal2026"

async function executeAction(action: Action): Promise<void> {
  if (action === "reset-scores") {
    const [a, b, c, d, e, f] = await Promise.all([
      supabase.from("scores").delete().not("round_id", "is", null),
      supabase.from("round_handicaps").delete().not("round_id", "is", null),
      supabase.from("composite_holes").delete().not("id", "is", null),
      supabase.from("live_scores").delete().not("id", "is", null),
      supabase.from("live_player_locks").delete().not("id", "is", null),
      supabase.from("live_rounds").delete().not("id", "is", null),
    ])
    if (a.error) throw new Error(a.error.message)
    if (b.error) throw new Error(b.error.message)
    if (c.error) throw new Error(c.error.message)
    if (d.error) throw new Error(d.error.message)
    if (e.error) throw new Error(e.error.message)
    if (f.error) throw new Error(f.error.message)
    await revalidateLeaderboards()
  } else {
    const { error } = await supabase.from("players").update({ team_id: null }).not("id", "is", null)
    if (error) throw new Error(error.message)
  }
}

function LiveSessionCard({ session, onVoided }: { session: LiveSession; onVoided: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword]     = useState("")
  const [wrongPw, setWrongPw]       = useState(false)
  const [status, setStatus]         = useState<"idle" | "loading" | "error">("idle")

  const courseName  = session.rounds?.courses?.name ?? "Unknown course"
  const roundNumber = session.rounds?.round_number ?? "?"
  const players     = session.live_player_locks
    .map(l => l.players?.name)
    .filter(Boolean)
    .join(", ") || "No players locked"

  const startedAt = new Date(session.activated_at).toLocaleTimeString("en-IE", {
    hour: "2-digit", minute: "2-digit",
  })

  function toggle() {
    setConfirming(c => !c)
    setPassword("")
    setWrongPw(false)
    setStatus("idle")
  }

  async function handleVoid() {
    if (password !== PASSWORD) { setWrongPw(true); return }
    setStatus("loading")
    try {
      const playerIds = session.live_player_locks.map(l => l.player_id).filter(Boolean)

      const { error: err } = await supabase
        .from("live_rounds")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", session.id)
      if (err) throw new Error(err.message)

      // Also clear committed and in-progress scores for these players in this round
      if (playerIds.length > 0) {
        await Promise.all([
          supabase.from("scores").delete().eq("round_id", session.round_id).in("player_id", playerIds),
          supabase.from("live_scores").delete().eq("round_id", session.round_id).in("player_id", playerIds),
        ])
      }

      await revalidateLeaderboards()
      onVoided()
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="border-b border-bark/12 last:border-b-0">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-sm font-semibold leading-tight">
            Round {roundNumber} · {courseName}
          </p>
          <p className="text-ink/65 text-[13px] mt-0.5 truncate">{players}</p>
          <p className="text-ink/50 text-[13px] mt-0.5">Started {startedAt}</p>
        </div>
        <button
          onClick={toggle}
          className={`flex-shrink-0 px-3 py-1.5 border rounded-sm text-[13px] tracking-wide transition-colors
            ${confirming
              ? "border-bark/25 text-ink/65"
              : "border-red-700/50 text-red-400 hover:border-red-500 hover:bg-red-900/20"}`}
        >
          {confirming ? "Back" : "Void"}
        </button>
      </div>

      {confirming && (
        <div className="border-t border-bark/12 px-4 py-3 space-y-3 bg-red-900/5">
          <p className="text-red-300/80 text-[13px]">
            Voids this scorecard and removes these players from the live leaderboard.
          </p>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setWrongPw(false) }}
            onKeyDown={e => e.key === "Enter" && handleVoid()}
            placeholder="••••••••••••"
            autoFocus
            className={`w-full bg-cream border rounded-sm px-3 py-2 text-ink text-sm outline-none transition-colors
              ${wrongPw ? "border-red-500/70" : "border-bark/12 focus:border-accent/50"}`}
          />
          {wrongPw              && <p className="text-red-400 text-[13px]">Incorrect password.</p>}
          {status === "error"   && <p className="text-red-400 text-[13px]">Failed to void. Try again.</p>}
          <button
            onClick={handleVoid}
            disabled={status === "loading"}
            className="w-full py-2.5 rounded-sm text-sm font-semibold border border-red-600 bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors disabled:opacity-50"
          >
            {status === "loading" ? "Voiding…" : "Confirm Void"}
          </button>
        </div>
      )}
    </div>
  )
}

function LiveSessionsPanel({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.resolve(
      supabase
        .from("live_rounds")
        .select("id, round_id, activated_at, rounds(round_number, courses(name)), live_player_locks(player_id, players(name))")
        .eq("status", "active")
    ).then(({ data }) => {
      setSessions((data as unknown as LiveSession[]) ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function handleVoided(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id))
    onSuccess("Scorecard voided.")
  }

  return (
    <div className="border border-bark/12 rounded-sm overflow-hidden">
      <div className="px-4 py-3 bg-cream border-b border-bark/12">
        <p className="text-ink font-semibold text-sm">Live Scorecards</p>
        <p className="text-ink/65 text-[13px] mt-0.5">Active scoring sessions — void to remove from leaderboard</p>
      </div>
      <div className="bg-surface">
        {loading ? (
          <p className="px-4 py-4 text-ink/65 text-[13px]">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="px-4 py-4 text-ink/65 text-[13px]">No active live sessions</p>
        ) : (
          sessions.map(session => (
            <LiveSessionCard
              key={session.id}
              session={session}
              onVoided={() => handleVoided(session.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ActionCard({ config, onSuccess }: { config: ActionConfig; onSuccess: (msg: string) => void }) {
  const [open, setOpen]         = useState(false)
  const [password, setPassword] = useState("")
  const [wrongPw, setWrongPw]   = useState(false)
  const [status, setStatus]     = useState<PanelStatus>("idle")

  function toggle() {
    setOpen(o => !o)
    setPassword("")
    setWrongPw(false)
    setStatus("idle")
  }

  async function confirm() {
    if (password !== PASSWORD) { setWrongPw(true); return }
    setStatus("loading")
    try {
      await executeAction(config.id)
      setOpen(false)
      setPassword("")
      setStatus("idle")
      onSuccess(config.successMessage)
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className={`border rounded-sm overflow-hidden transition-colors
      ${open
        ? config.danger ? "border-red-700/60 bg-red-900/10" : "border-accent/40 bg-accent/5"
        : "border-bark/12 bg-surface"}`}>

      <div className="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <p className={`font-semibold text-sm ${config.danger ? "text-red-300" : "text-ink"}`}>
            {config.label}
          </p>
          <p className="text-ink/65 text-[13px] mt-0.5">{config.description}</p>
        </div>
        <button
          onClick={toggle}
          className={`flex-shrink-0 px-3 py-1.5 border rounded-sm text-[13px] tracking-wide transition-colors
            ${open
              ? "border-bark/25 text-ink/65 hover:text-ink/80"
              : config.danger
                ? "border-red-700/50 text-red-400 hover:border-red-500 hover:bg-red-900/20"
                : "border-accent/40 text-accent hover:border-accent hover:bg-accent/10"}`}
        >
          {open ? "Cancel" : config.label}
        </button>
      </div>

      {open && (
        <div className="border-t border-bark/12 px-4 py-4 space-y-3">
          <p className={`text-[13px] ${config.danger ? "text-red-300/80" : "text-accent/80"}`}>
            {config.confirmText}
          </p>
          <div>
            <label className="block text-[13px] tracking-[0.15em] uppercase text-ink/50 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setWrongPw(false) }}
              onKeyDown={e => e.key === "Enter" && confirm()}
              placeholder="••••••••••••"
              autoFocus
              className={`w-full bg-cream border rounded-sm px-3 py-2 text-ink text-sm outline-none transition-colors
                ${wrongPw ? "border-red-500/70" : "border-bark/12 focus:border-accent/50"}`}
            />
            {wrongPw && <p className="text-red-400 text-[13px] mt-1">Incorrect password.</p>}
            {status === "error" && <p className="text-red-400 text-[13px] mt-1">Action failed. Try again.</p>}
          </div>
          <button
            onClick={confirm}
            disabled={status === "loading"}
            className={`w-full py-2.5 rounded-sm text-sm font-semibold border transition-colors disabled:opacity-50
              ${config.danger
                ? "border-red-600 bg-red-900/30 text-red-300 hover:bg-red-900/50"
                : "border-accent bg-accent/10 text-accent hover:bg-accent/20"}`}
          >
            {status === "loading" ? "Working…" : "Confirm"}
          </button>
        </div>
      )}
    </div>
  )
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  return (
    <>
      {/* z-50, not z-40: the tab bar is on z-40, and a scrim tied with it
          gets painted over — the bar would stay bright and tappable behind a
          modal that is supposed to be blocking the screen. The panel below is
          z-50 too and comes after this in the DOM, so it still sits on top. */}
      <div className="fixed inset-0 bg-ink/50 z-50" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-50 p-4">
        <div className="bg-cream border border-bark/12 rounded-sm w-full sm:max-w-md shadow-2xl max-h-[90dvh] flex flex-col">

          <div className="flex items-center justify-between px-5 py-4 border-b border-bark/12 flex-shrink-0">
            <h2 className="font-[family-name:var(--font-display)] text-ink text-lg">Settings</h2>
            <button
              onClick={onClose}
              className="text-ink/65 hover:text-ink/80 transition-colors text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto">
            {successMsg && (
              <div className="border border-accent/50 bg-accent/20 rounded-sm px-4 py-2.5 flex items-center justify-between">
                <span className="text-accent text-sm">{successMsg}</span>
                <button onClick={() => setSuccessMsg(null)} className="text-accent/50 hover:text-accent text-lg leading-none ml-3">×</button>
              </div>
            )}

            <LiveSessionsPanel onSuccess={setSuccessMsg} />

            <div className="pt-1 space-y-3">
              {ACTIONS.map(config => (
                <ActionCard key={config.id} config={config} onSuccess={setSuccessMsg} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
