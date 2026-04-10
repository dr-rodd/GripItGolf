"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { revalidateLeaderboards } from "@/app/actions/revalidate"

type Action = "reset-scores" | "reset-teams"
type Status = "idle" | "confirming" | "loading" | "success" | "error"

interface ActionConfig {
  id: Action
  label: string
  description: string
  confirmText: string
  successMessage: string
  danger: boolean
}

const ACTIONS: ActionConfig[] = [
  {
    id: "reset-scores",
    label: "Reset All Scores",
    description: "Clears all submitted scores and playing handicaps from all rounds. Player and team data is preserved.",
    confirmText: "This will permanently delete all scores and round handicaps. This cannot be undone.",
    successMessage: "All scores and round handicaps have been cleared.",
    danger: true,
  },
  {
    id: "reset-teams",
    label: "Reset Teams",
    description: "Removes all team assignments from players. Players remain in the system but are moved to unassigned.",
    confirmText: "This will remove all players from their teams. This cannot be undone.",
    successMessage: "All team assignments have been cleared.",
    danger: false,
  },
]

const PASSWORD = "donegal2026"

async function executeAction(action: Action): Promise<void> {
  if (action === "reset-scores") {
    const [scoresRes, hcpsRes, compositeRes, liveScoresRes, liveLocksRes, liveRoundsRes] = await Promise.all([
      supabaseAdmin.from("scores").delete().not("round_id", "is", null),
      supabaseAdmin.from("round_handicaps").delete().not("round_id", "is", null),
      supabaseAdmin.from("composite_holes").delete().not("id", "is", null),
      supabaseAdmin.from("live_scores").delete().not("id", "is", null),
      supabaseAdmin.from("live_player_locks").delete().not("id", "is", null),
      supabaseAdmin.from("live_rounds").delete().not("id", "is", null),
    ])
    if (scoresRes.error) throw new Error(scoresRes.error.message)
    if (hcpsRes.error) throw new Error(hcpsRes.error.message)
    if (compositeRes.error) throw new Error(compositeRes.error.message)
    if (liveScoresRes.error) throw new Error(liveScoresRes.error.message)
    if (liveLocksRes.error) throw new Error(liveLocksRes.error.message)
    if (liveRoundsRes.error) throw new Error(liveRoundsRes.error.message)
  } else {
    const { error } = await supabaseAdmin
      .from("players")
      .update({ team_id: null })
      .not("id", "is", null)
    if (error) throw new Error(error.message)
  }
}

export default function SettingsClient() {
  const router = useRouter()
  const [activeAction, setActiveAction] = useState<Action | null>(null)
  const [password, setPassword]         = useState("")
  const [wrongPassword, setWrongPassword] = useState(false)
  const [status, setStatus]             = useState<Status>("idle")
  const [message, setMessage]           = useState("")

  const config = ACTIONS.find(a => a.id === activeAction)

  function openAction(id: Action) {
    setActiveAction(id)
    setPassword("")
    setWrongPassword(false)
    setStatus("confirming")
    setMessage("")
  }

  function cancel() {
    setActiveAction(null)
    setStatus("idle")
    setPassword("")
    setWrongPassword(false)
    setMessage("")
  }

  async function confirm() {
    if (password !== PASSWORD) {
      setWrongPassword(true)
      return
    }
    if (!activeAction || !config) return
    setStatus("loading")
    try {
      await executeAction(activeAction)
      if (activeAction === "reset-scores") await revalidateLeaderboards()
      setStatus("success")
      setMessage(config.successMessage)
      setActiveAction(null)
      router.refresh()
    } catch (e: any) {
      setStatus("error")
      setMessage(e.message ?? "An error occurred.")
    }
  }

  return (
    <div className="space-y-4 max-w-lg">

      {/* Result banner */}
      {status === "success" && (
        <div className="border border-emerald-700/50 bg-emerald-900/20 rounded-sm px-4 py-3 flex items-center justify-between">
          <span className="text-emerald-300 text-sm">{message}</span>
          <button onClick={() => setStatus("idle")} className="text-emerald-400/50 hover:text-emerald-300 text-lg leading-none ml-4">×</button>
        </div>
      )}
      {status === "error" && (
        <div className="border border-red-700/50 bg-red-900/20 rounded-sm px-4 py-3 flex items-center justify-between">
          <span className="text-red-300 text-sm">{message}</span>
          <button onClick={() => setStatus("idle")} className="text-red-400/50 hover:text-red-300 text-lg leading-none ml-4">×</button>
        </div>
      )}

      {ACTIONS.map(action => (
        <div
          key={action.id}
          className={`border rounded-sm overflow-hidden transition-colors
            ${activeAction === action.id
              ? action.danger ? "border-red-700/60 bg-red-900/10" : "border-[#C9A84C]/40 bg-[#C9A84C]/5"
              : "border-[#1e3d28] bg-[#0f2418]"}`}
        >
          {/* Action header */}
          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`font-[family-name:var(--font-playfair)] text-lg ${action.danger ? "text-red-300" : "text-white"}`}>
                  {action.label}
                </h2>
                <p className="text-white/40 text-sm mt-1">{action.description}</p>
              </div>
              {activeAction !== action.id && (
                <button
                  onClick={() => openAction(action.id)}
                  className={`flex-shrink-0 px-4 py-2 border rounded-sm text-sm tracking-wide transition-colors
                    ${action.danger
                      ? "border-red-700/50 text-red-400 hover:border-red-500 hover:bg-red-900/20"
                      : "border-[#C9A84C]/40 text-[#C9A84C] hover:border-[#C9A84C] hover:bg-[#C9A84C]/10"}`}
                >
                  {action.label}
                </button>
              )}
            </div>
          </div>

          {/* Confirm panel */}
          {activeAction === action.id && status === "confirming" && (
            <div className="border-t border-[#1e3d28] px-5 py-4 space-y-4">
              <p className={`text-sm ${action.danger ? "text-red-300/80" : "text-[#C9A84C]/80"}`}>
                {action.confirmText}
              </p>

              <div>
                <label className="block text-xs tracking-[0.15em] uppercase text-white/30 mb-1.5">
                  Enter password to confirm
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setWrongPassword(false) }}
                  onKeyDown={e => e.key === "Enter" && confirm()}
                  placeholder="••••••••••••"
                  autoFocus
                  className={`w-full bg-[#0a1a0e] border rounded-sm px-4 py-2.5 text-white text-sm outline-none transition-colors
                    ${wrongPassword ? "border-red-500/70" : "border-[#1e3d28] focus:border-[#C9A84C]/50"}`}
                />
                {wrongPassword && (
                  <p className="text-red-400 text-xs mt-1">Incorrect password.</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={confirm}
                  className={`flex-1 py-2.5 rounded-sm text-sm font-semibold border transition-colors
                    ${action.danger
                      ? "border-red-600 bg-red-900/30 text-red-300 hover:bg-red-900/50"
                      : "border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] hover:bg-[#C9A84C]/20"}`}
                >
                  Confirm
                </button>
                <button
                  onClick={cancel}
                  className="px-5 py-2.5 rounded-sm text-sm text-white/40 border border-[#1e3d28] hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {activeAction === action.id && status === "loading" && (
            <div className="border-t border-[#1e3d28] px-5 py-4">
              <p className="text-white/40 text-sm">Working…</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
