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
    <div className="border-b border-[#1e3d28] last:border-b-0">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold leading-tight">
            Round {roundNumber} · {courseName}
          </p>
          <p className="text-white/50 text-xs mt-0.5 truncate">{players}</p>
          <p className="text-white/25 text-[10px] mt-0.5">Started {startedAt}</p>
        </div>
        <button
          onClick={toggle}
          className={`flex-shrink-0 px-3 py-1.5 border rounded-sm text-xs tracking-wide transition-colors
            ${confirming
              ? "border-white/20 text-white/40"
              : "border-red-700/50 text-red-400 hover:border-red-500 hover:bg-red-900/20"}`}
        >
          {confirming ? "Back" : "Void"}
        </button>
      </div>

      {confirming && (
        <div className="border-t border-[#1e3d28] px-4 py-3 space-y-3 bg-red-900/5">
          <p className="text-red-300/80 text-xs">
            Voids this scorecard and removes these players from the live leaderboard.
          </p>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setWrongPw(false) }}
            onKeyDown={e => e.key === "Enter" && handleVoid()}
            placeholder="••••••••••••"
            autoFocus
            className={`w-full bg-[#0a1a0e] border rounded-sm px-3 py-2 text-white text-sm outline-none transition-colors
              ${wrongPw ? "border-red-500/70" : "border-[#1e3d28] focus:border-[#C9A84C]/50"}`}
          />
          {wrongPw              && <p className="text-red-400 text-xs">Incorrect password.</p>}
          {status === "error"   && <p className="text-red-400 text-xs">Failed to void. Try again.</p>}
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
    <div className="border border-[#1e3d28] rounded-sm overflow-hidden">
      <div className="px-4 py-3 bg-[#0a1a10] border-b border-[#1e3d28]">
        <p className="text-white font-semibold text-sm">Live Scorecards</p>
        <p className="text-white/35 text-xs mt-0.5">Active scoring sessions — void to remove from leaderboard</p>
      </div>
      <div className="bg-[#0f2418]">
        {loading ? (
          <p className="px-4 py-4 text-white/30 text-xs">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="px-4 py-4 text-white/30 text-xs">No active live sessions</p>
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
        ? config.danger ? "border-red-700/60 bg-red-900/10" : "border-[#C9A84C]/40 bg-[#C9A84C]/5"
        : "border-[#1e3d28] bg-[#0f2418]"}`}>

      <div className="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <p className={`font-semibold text-sm ${config.danger ? "text-red-300" : "text-white"}`}>
            {config.label}
          </p>
          <p className="text-white/35 text-xs mt-0.5">{config.description}</p>
        </div>
        <button
          onClick={toggle}
          className={`flex-shrink-0 px-3 py-1.5 border rounded-sm text-xs tracking-wide transition-colors
            ${open
              ? "border-white/20 text-white/40 hover:text-white/60"
              : config.danger
                ? "border-red-700/50 text-red-400 hover:border-red-500 hover:bg-red-900/20"
                : "border-[#C9A84C]/40 text-[#C9A84C] hover:border-[#C9A84C] hover:bg-[#C9A84C]/10"}`}
        >
          {open ? "Cancel" : config.label}
        </button>
      </div>

      {open && (
        <div className="border-t border-[#1e3d28] px-4 py-4 space-y-3">
          <p className={`text-xs ${config.danger ? "text-red-300/80" : "text-[#C9A84C]/80"}`}>
            {config.confirmText}
          </p>
          <div>
            <label className="block text-[10px] tracking-[0.15em] uppercase text-white/25 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setWrongPw(false) }}
              onKeyDown={e => e.key === "Enter" && confirm()}
              placeholder="••••••••••••"
              autoFocus
              className={`w-full bg-[#0a1a0e] border rounded-sm px-3 py-2 text-white text-sm outline-none transition-colors
                ${wrongPw ? "border-red-500/70" : "border-[#1e3d28] focus:border-[#C9A84C]/50"}`}
            />
            {wrongPw && <p className="text-red-400 text-xs mt-1">Incorrect password.</p>}
            {status === "error" && <p className="text-red-400 text-xs mt-1">Action failed. Try again.</p>}
          </div>
          <button
            onClick={confirm}
            disabled={status === "loading"}
            className={`w-full py-2.5 rounded-sm text-sm font-semibold border transition-colors disabled:opacity-50
              ${config.danger
                ? "border-red-600 bg-red-900/30 text-red-300 hover:bg-red-900/50"
                : "border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] hover:bg-[#C9A84C]/20"}`}
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
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-50 p-4">
        <div className="bg-[#0a1a0e] border border-[#1e3d28] rounded-sm w-full sm:max-w-md shadow-2xl max-h-[90dvh] flex flex-col">

          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e3d28] flex-shrink-0">
            <h2 className="font-[family-name:var(--font-playfair)] text-white text-lg">Settings</h2>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto">
            {successMsg && (
              <div className="border border-emerald-700/50 bg-emerald-900/20 rounded-sm px-4 py-2.5 flex items-center justify-between">
                <span className="text-emerald-300 text-sm">{successMsg}</span>
                <button onClick={() => setSuccessMsg(null)} className="text-emerald-400/50 hover:text-emerald-300 text-lg leading-none ml-3">×</button>
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
