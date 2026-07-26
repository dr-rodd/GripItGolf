'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { FORMATS, type FormatKey, type TripFormats } from '@/lib/formats'
import {
  TEAM_SCORING_MODES, describeTeamScoring,
  type TeamScoring, type TeamScoringMode,
} from '@/lib/teamScoring'

// ── Types ─────────────────────────────────────────────────────────────────

type Trip = {
  id: string
  trip_code: string
  name: string
  start_date: string | null
  end_date: string | null
  formats: TripFormats
  team_scoring: TeamScoring
  setup_status: string
  edit_permission: string
}

type Team = { id: string; name: string; color: string }

type Player = {
  id: string
  name: string
  handicap: number | null
  gender: string
  team_id: string | null
  is_lead: boolean
}

type RoundInfo = { id: string; round_number: number; courseName: string }

// ── Constants ─────────────────────────────────────────────────────────────

const INPUT = [
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5',
  'text-white placeholder-white/30',
  'focus:outline-none focus:border-[#C9A84C]/50 transition-colors',
  'disabled:opacity-40 disabled:cursor-not-allowed',
].join(' ')

const LABEL = 'block text-white/60 text-xs uppercase tracking-wider mb-2'

const SECTION = 'bg-white/5 border border-white/10 rounded-2xl p-5'

// ── Component ─────────────────────────────────────────────────────────────

export default function TripSetupClient({
  trip,
  teams: initialTeams,
  players: initialPlayers,
  rounds,
}: {
  trip: Trip
  teams: Team[]
  players: Player[]
  rounds: RoundInfo[]
}) {
  // Trip fields
  const [name, setName] = useState(trip.name)
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [formats, setFormats] = useState<TripFormats>(trip.formats)
  const [teamScoring, setTeamScoring] = useState<TeamScoring>(trip.team_scoring)
  const [editPermission, setEditPermission] = useState(trip.edit_permission)
  const [setupStatus, setSetupStatus] = useState(trip.setup_status)

  // Collections
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)

  // New player form
  const [newName, setNewName] = useState('')
  const [newHandicap, setNewHandicap] = useState('')
  const [newGender, setNewGender] = useState<'M' | 'F'>('M')
  const [newTeamId, setNewTeamId] = useState('')

  // UI state
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    try {
      setIsOwner(localStorage.getItem(`gig-owner-${trip.trip_code}`) === '1')
    } catch { /* localStorage unavailable */ }
  }, [trip.trip_code])

  const isDraft = setupStatus === 'draft'
  const canEdit = isDraft && (editPermission === 'everyone' || isOwner)
  const locked = !canEdit || busy
  const unassignedCount = players.filter(p => !p.team_id).length
  const smallestTeamSize = teams.length > 0
    ? Math.min(...teams.map(t => players.filter(p => p.team_id === t.id).length))
    : 0

  function flashError(msg: string) {
    setError(msg)
    setTimeout(() => setError(''), 4000)
  }

  // ── Trip field saves ─────────────────────────────────────────────────────

  async function saveTrip(patch: Record<string, unknown>): Promise<boolean> {
    const { error: err } = await supabase.from('trips').update(patch).eq('id', trip.id)
    if (err) flashError('Could not save — try again')
    return !err
  }

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === trip.name) return
    if (!(await saveTrip({ name: trimmed }))) setName(trip.name)
  }

  async function saveDates(nextStart: string, nextEnd: string) {
    const prev = { s: startDate, e: endDate }
    setStartDate(nextStart)
    setEndDate(nextEnd)
    if (!(await saveTrip({ start_date: nextStart || null, end_date: nextEnd || null }))) {
      setStartDate(prev.s)
      setEndDate(prev.e)
    }
  }

  async function toggleFormat(key: FormatKey) {
    const next: TripFormats = { ...formats }
    if (next[key]) delete next[key]
    else next[key] = true

    if (Object.keys(next).length === 0) {
      flashError('Keep at least one format switched on')
      return
    }

    const prev = formats
    setFormats(next)
    if (!(await saveTrip({ formats: next }))) setFormats(prev)
  }

  async function saveTeamScoring(patch: Partial<TeamScoring>) {
    const prev = teamScoring
    const next = { ...teamScoring, ...patch }
    setTeamScoring(next)
    if (!(await saveTrip({ team_scoring: next }))) setTeamScoring(prev)
  }

  async function savePermission(next: string) {
    const prev = editPermission
    setEditPermission(next)
    if (!(await saveTrip({ edit_permission: next }))) setEditPermission(prev)
  }

  // ── Players ──────────────────────────────────────────────────────────────

  async function addPlayer() {
    const trimmed = newName.trim()
    const hcp = parseFloat(newHandicap)
    if (!trimmed || isNaN(hcp)) {
      flashError('Enter a name and handicap first')
      return
    }
    setBusy(true)
    const { data, error: err } = await supabase
      .from('players')
      .insert({
        trip_id: trip.id,
        name: trimmed,
        handicap: hcp,
        gender: newGender,
        role: 'player',
        team_id: newTeamId || null,
      })
      .select('id, name, handicap, gender, team_id, is_lead')
      .single()
    if (err || !data) {
      flashError('Could not add player')
    } else {
      setPlayers(prev => [...prev, data])
      setNewName('')
      setNewHandicap('')
      setNewTeamId('')
    }
    setBusy(false)
  }

  async function updatePlayer(id: string, patch: Partial<Player>) {
    const prev = players
    setPlayers(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)))
    const { error: err } = await supabase.from('players').update(patch).eq('id', id)
    if (err) {
      setPlayers(prev)
      flashError('Could not save player')
      return
    }
    // Keep the handicap snapshot used for scoring in step with edits
    if (patch.handicap != null && rounds.length > 0) {
      const rows = rounds.map(r => ({
        round_id: r.id,
        player_id: id,
        playing_handicap: Math.round(patch.handicap as number),
      }))
      const { error: hcpErr } = await supabase
        .from('round_handicaps')
        .upsert(rows, { onConflict: 'round_id,player_id' })
      if (hcpErr) flashError('Handicap saved but round handicaps failed to update')
    }
  }

  async function removePlayer(id: string) {
    const player = players.find(p => p.id === id)
    if (!window.confirm(`Remove ${player?.name}? Any scores they have will be deleted.`)) return
    setBusy(true)
    const { error: err } = await supabase.from('players').delete().eq('id', id)
    if (err) flashError('Could not remove player')
    else setPlayers(prev => prev.filter(p => p.id !== id))
    setBusy(false)
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async function finalise() {
    if (!window.confirm('Finalise this trip and go live? Scoring and the leaderboard will open. You can unlock it again later.')) return
    setBusy(true)
    // Every player needs a handicap row for every round before scoring works.
    // Existing rows (e.g. confirmed in a previous live spell) are left untouched.
    if (players.length > 0 && rounds.length > 0) {
      const rows = rounds.flatMap(r =>
        players.map(p => ({
          round_id: r.id,
          player_id: p.id,
          playing_handicap: Math.round(p.handicap ?? 0),
        }))
      )
      const { error: hcpErr } = await supabase
        .from('round_handicaps')
        .upsert(rows, { onConflict: 'round_id,player_id', ignoreDuplicates: true })
      if (hcpErr) {
        flashError('Could not prepare handicaps — trip not finalised')
        setBusy(false)
        return
      }
    }
    const ok = await saveTrip({ setup_status: 'live', finalised_at: new Date().toISOString() })
    if (ok) setSetupStatus('live')
    setBusy(false)
  }

  async function unlock() {
    if (!window.confirm('Unlock this trip for editing? Scoring pauses until you finalise again. All existing scores are kept.')) return
    setBusy(true)
    const ok = await saveTrip({ setup_status: 'draft' })
    if (ok) setSetupStatus('draft')
    setBusy(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const viewOnly = isDraft && !canEdit

  return (
    <main className="min-h-dvh bg-[#0a1a0e] text-white pb-16">

      {/* Header */}
      <div className="border-b border-[#1e3d28]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <Link
            href={`/trip/${trip.trip_code}`}
            className="w-11 h-11 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            aria-label="Back to trip"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-[family-name:var(--font-playfair)] text-xl tracking-wide">Trip Setup</h1>
          <div className="w-11" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* ── Status banner ── */}
        {isDraft ? (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0" />
            <p className="text-sm text-[#C9A84C]">
              In setup — finalise below when everyone&apos;s ready to play
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
              <p className="text-sm text-emerald-300">Trip is live — scoring is open</p>
            </div>
            <button
              onClick={unlock}
              disabled={busy}
              className="flex-shrink-0 px-4 py-2 border border-white/20 rounded-lg text-xs tracking-wider uppercase text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
            >
              Unlock
            </button>
          </div>
        )}

        {viewOnly && (
          <div className="px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-white/50 text-sm">
              Only the trip owner can edit this trip. Ask whoever created it to make changes.
            </p>
          </div>
        )}

        {isDraft && (
          <>
            {/* ── Trip details ── */}
            <section className={SECTION}>
              <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-4">Trip details</p>
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>Trip name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={saveName}
                    disabled={locked}
                    className={INPUT}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Start date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => saveDates(e.target.value, endDate)}
                      disabled={locked}
                      className={INPUT}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>End date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => saveDates(startDate, e.target.value)}
                      disabled={locked}
                      className={INPUT}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Formats ── */}
            <section className={SECTION}>
              <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-1">Competitions</p>
              <p className="text-white/40 text-xs mb-4">
                Switch on as many as you like — each one gets its own leaderboard
              </p>
              <div className="space-y-2.5">
                {FORMATS.map(f => {
                  const on = !!formats[f.key]
                  return (
                    <button
                      key={f.key}
                      onClick={() => toggleFormat(f.key)}
                      disabled={locked}
                      className={`w-full text-left px-4 py-4 rounded-xl border transition-colors disabled:opacity-40 ${
                        on
                          ? 'border-[#C9A84C]/60 bg-[#C9A84C]/10'
                          : 'border-white/10 bg-white/5 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                            on ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-white/25'
                          }`}
                        >
                          {on && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a1a0e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${on ? 'text-white' : 'text-white/70'}`}>
                            {f.label}
                          </p>
                          <p className="text-white/40 text-xs mt-0.5 leading-snug">{f.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* ── Teams ── */}
            {formats.teams && (
              <section className={SECTION}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[#C9A84C] text-xs tracking-widest uppercase">Teams</p>
                  <span className="text-white/30 text-xs">
                    {teams.length} team{teams.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-white/40 text-xs mb-4">
                  {unassignedCount > 0
                    ? `${unassignedCount} player${unassignedCount === 1 ? '' : 's'} still to be assigned`
                    : 'Everyone has a team'}
                </p>

                {teams.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {teams.map(team => {
                      const members = players.filter(p => p.team_id === team.id)
                      return (
                        <div key={team.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                          <span className="text-white text-sm flex-1 min-w-0 truncate">{team.name}</span>
                          <span className="text-white/30 text-xs flex-shrink-0">
                            {members.length} player{members.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {!locked && (
                  <Link
                    href={`/trip/${trip.trip_code}/teams`}
                    className="block w-full py-3.5 border border-[#C9A84C]/40 text-[#C9A84C] rounded-xl text-sm tracking-wider uppercase text-center hover:bg-[#C9A84C]/10 transition-colors"
                  >
                    Pick teams
                  </Link>
                )}
              </section>
            )}

            {/* ── Team scoring ── */}
            {formats.teams && (
              <section className={SECTION}>
                <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-1">Team scoring</p>
                <p className="text-white/40 text-xs mb-4">
                  How each team&apos;s points are worked out on every course played
                </p>

                <div className="space-y-2.5">
                  {TEAM_SCORING_MODES.map(m => {
                    const on = teamScoring.mode === m.key
                    return (
                      <button
                        key={m.key}
                        onClick={() => saveTeamScoring({ mode: m.key as TeamScoringMode })}
                        disabled={locked}
                        className={`w-full text-left px-4 py-4 rounded-xl border transition-colors disabled:opacity-40 ${
                          on
                            ? 'border-[#C9A84C]/60 bg-[#C9A84C]/10'
                            : 'border-white/10 bg-white/5 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                              on ? 'border-[#C9A84C]' : 'border-white/25'
                            }`}
                          >
                            {on && <span className="w-2.5 h-2.5 rounded-full bg-[#C9A84C]" />}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${on ? 'text-white' : 'text-white/70'}`}>
                              {m.label}
                            </p>
                            <p className="text-white/40 text-xs mt-0.5 leading-snug">{m.description}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Better Ball — how many scores count per hole */}
                {teamScoring.mode === 'better_ball' && (
                  <div className="mt-4">
                    <label className={LABEL}>Scores counting on each hole</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => saveTeamScoring({ countingScores: n })}
                          disabled={locked}
                          className={`flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                            teamScoring.countingScores === n
                              ? 'bg-[#C9A84C] text-[#0a1a0e]'
                              : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {teamScoring.countingScores > smallestTeamSize && smallestTeamSize > 0 && (
                      <p className="text-amber-400/80 text-xs mt-2 leading-snug">
                        Your smallest team has {smallestTeamSize} player
                        {smallestTeamSize === 1 ? '' : 's'} — it can only ever contribute{' '}
                        {smallestTeamSize} score{smallestTeamSize === 1 ? '' : 's'} a hole.
                      </p>
                    )}
                  </div>
                )}

                {/* Aggregate — how many closing holes count */}
                {teamScoring.mode === 'aggregate' && (
                  <div className="mt-4">
                    <label className={LABEL}>Holes that count</label>
                    <div className="flex gap-2">
                      {[18, 9, 6, 3].map(n => (
                        <button
                          key={n}
                          onClick={() => saveTeamScoring({ aggregateHoles: n })}
                          disabled={locked}
                          className={`flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                            teamScoring.aggregateHoles === n
                              ? 'bg-[#C9A84C] text-[#0a1a0e]'
                              : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                          }`}
                        >
                          {n === 18 ? 'All 18' : `Last ${n}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                  <p className="text-white/50 text-xs">
                    <span className="text-[#C9A84C]">In play:</span>{' '}
                    {describeTeamScoring(teamScoring)}
                  </p>
                </div>
              </section>
            )}

            {/* ── Players ── */}
            <section className={SECTION}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#C9A84C] text-xs tracking-widest uppercase">Players</p>
                <span className="text-white/30 text-xs">{players.length}</span>
              </div>

              <div className="space-y-3">
                {players.map(player => (
                  <div key={player.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        defaultValue={player.name}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v && v !== player.name) updatePlayer(player.id, { name: v })
                        }}
                        disabled={locked}
                        className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none disabled:opacity-40"
                      />
                      {player.is_lead && (
                        <span className="text-[#C9A84C]/70 text-[10px] tracking-widest uppercase flex-shrink-0">Lead</span>
                      )}
                      {!locked && (
                        <button
                          onClick={() => removePlayer(player.id)}
                          className="w-9 h-9 flex items-center justify-center text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                          aria-label={`Remove ${player.name}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="w-24 flex-shrink-0">
                        <input
                          type="number"
                          defaultValue={player.handicap ?? ''}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v !== player.handicap) updatePlayer(player.id, { handicap: v })
                          }}
                          disabled={locked}
                          min="0"
                          max="54"
                          step="0.1"
                          placeholder="HCP"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40"
                        />
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {(['M', 'F'] as const).map(g => (
                          <button
                            key={g}
                            onClick={() => player.gender !== g && updatePlayer(player.id, { gender: g })}
                            disabled={locked}
                            className={`w-11 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                              player.gender === g
                                ? 'bg-[#C9A84C] text-[#0a1a0e]'
                                : 'bg-white/5 border border-white/10 text-white/50'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      {formats.teams &&(
                        <div className="relative flex-1 min-w-0">
                          <select
                            value={player.team_id ?? ''}
                            onChange={e => updatePlayer(player.id, { team_id: e.target.value || null })}
                            disabled={locked}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40"
                          >
                            <option value="" className="bg-[#0a1a0e]">No team</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.id} className="bg-[#0a1a0e]">{t.name}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {players.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-2">
                    No players yet — add them below or share the trip code
                  </p>
                )}

                {/* Add player */}
                {!locked && (
                  <div className="border border-dashed border-white/20 rounded-xl p-4 space-y-3">
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Player name"
                      className={INPUT}
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newHandicap}
                        onChange={e => setNewHandicap(e.target.value)}
                        placeholder="Handicap"
                        min="0"
                        max="54"
                        step="0.1"
                        className={`${INPUT} flex-1`}
                      />
                      <div className="flex gap-1 flex-shrink-0">
                        {(['M', 'F'] as const).map(g => (
                          <button
                            key={g}
                            onClick={() => setNewGender(g)}
                            className={`w-12 rounded-xl text-sm font-medium transition-colors ${
                              newGender === g
                                ? 'bg-[#C9A84C] text-[#0a1a0e]'
                                : 'bg-white/5 border border-white/10 text-white/50'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    {formats.teams &&teams.length > 0 && (
                      <div className="relative">
                        <select
                          value={newTeamId}
                          onChange={e => setNewTeamId(e.target.value)}
                          className={`${INPUT} appearance-none pr-10`}
                        >
                          <option value="" className="bg-[#0a1a0e]">No team assigned</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id} className="bg-[#0a1a0e]">{t.name}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={addPlayer}
                      disabled={busy || !newName.trim() || !newHandicap}
                      className="w-full py-3.5 border border-[#C9A84C]/40 text-[#C9A84C] rounded-xl text-sm tracking-wider uppercase hover:bg-[#C9A84C]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      + Add player
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ── Rounds (read-only summary) ── */}
            {rounds.length > 0 && (
              <section className={SECTION}>
                <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-4">Rounds</p>
                <div className="space-y-2">
                  {rounds.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm">
                      <span className="text-white/30 w-16 flex-shrink-0">Round {r.round_number}</span>
                      <span className="text-white/80">{r.courseName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Edit permission ── */}
            <section className={SECTION}>
              <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-1">Who can edit</p>
              <p className="text-white/40 text-xs mb-4">Controls who can change this trip while it&apos;s in setup</p>
              <div className="flex gap-2">
                {[
                  { value: 'everyone', label: 'Any player' },
                  { value: 'owner', label: 'Owner only' },
                ].map(o => (
                  <button
                    key={o.value}
                    onClick={() => savePermission(o.value)}
                    disabled={locked}
                    className={`flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                      editPermission === o.value
                        ? 'bg-[#C9A84C] text-[#0a1a0e]'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ── Finalise ── */}
            {canEdit && (
              <button
                onClick={finalise}
                disabled={busy}
                className="w-full py-5 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors disabled:opacity-40"
              >
                {busy ? 'Working…' : 'Finalise & Go Live'}
              </button>
            )}
          </>
        )}

        {/* Live-mode summary */}
        {!isDraft && (
          <div className={SECTION}>
            <p className="text-white/50 text-sm leading-relaxed">
              The trip is finalised and play is live. To change players, teams, or the format,
              unlock the trip above — all scores entered so far are kept.
            </p>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 bg-[#1a0f0a] border border-amber-500/40 rounded-xl shadow-xl z-50">
            <p className="text-amber-400 text-sm whitespace-nowrap">{error}</p>
          </div>
        )}

      </div>
    </main>
  )
}
