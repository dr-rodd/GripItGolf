'use client'

import { useState } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  MouseSensor, TouchSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import { type TripFormats } from '@/lib/formats'
import {
  teamNoun, teamSizeLimit, teamSizeBanner, teamCountOptions, canJoinTeam,
  PAIR_SIZE,
} from '@/lib/teamLimits'

// ─── Types ─────────────────────────────────────────────────────

interface Team   { id: string; name: string; color: string }
interface Player { id: string; name: string; handicap: number | null; gender: string; team_id: string | null }

const UNASSIGNED = 'unassigned'

const PRESET_COLORS = [
  '#DC2626', '#2563EB', '#16A34A', '#9333EA',
  '#EA580C', '#DB2777', '#0D9488', '#C9A84C',
  '#65A30D', '#7C3AED', '#0891B2', '#B45309',
]

// ─── Player tile ───────────────────────────────────────────────

function PlayerTile({ player, faded = false }: { player: Player; faded?: boolean }) {
  return (
    <div
      className={`border border-[#1e3d28] rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 bg-[#152a1e] transition-opacity ${
        faded ? 'opacity-25' : 'opacity-100'
      }`}
    >
      <span className="text-white text-sm font-medium leading-tight flex-1 min-w-0 truncate">
        {player.name}
      </span>
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
          player.gender === 'F'
            ? 'bg-rose-900/40 text-rose-300'
            : 'bg-blue-900/40 text-blue-300'
        }`}
      >
        {player.gender}
      </span>
      <span className="border border-[#C9A84C]/50 bg-[#C9A84C]/10 px-2 py-0.5 rounded flex-shrink-0">
        <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-base leading-none">
          {player.handicap ?? 0}
        </span>
      </span>
    </div>
  )
}

function DraggablePlayer({ player }: { player: Player }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: player.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      <PlayerTile player={player} faded={isDragging} />
    </div>
  )
}

// ─── Drop zones ────────────────────────────────────────────────

function TeamColumn({
  team, players, totalHandicap, sizeLimit, onRename, onRecolour,
}: {
  team: Team
  players: Player[]
  totalHandicap: number
  /** Null when a team can be any size. */
  sizeLimit: number | null
  onRename: (id: string, name: string) => void
  onRecolour: (id: string, color: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: team.id })
  const [showColors, setShowColors] = useState(false)

  const full = sizeLimit !== null && players.length >= sizeLimit
  const over = sizeLimit !== null && players.length > sizeLimit

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl overflow-hidden flex flex-col min-h-[180px] transition-all duration-150 ${
        isOver && !full
          ? 'border-2 border-[#C9A84C]/60 bg-[#C9A84C]/5'
          : isOver && full
            ? 'border-2 border-amber-500/60 bg-amber-500/5'
            : over
              ? 'border border-amber-500/50 bg-[#0f2418]'
              : 'border border-[#1e3d28] bg-[#0f2418]'
      }`}
    >
      <div className="px-3 py-3 border-b border-[#1e3d28] flex items-center gap-2">
        <button
          onClick={() => setShowColors(v => !v)}
          className="w-4 h-4 rounded-full flex-shrink-0 ring-offset-2 ring-offset-[#0f2418] hover:ring-2 hover:ring-white/40 transition-all"
          style={{ backgroundColor: team.color }}
          aria-label={`Change ${team.name} colour`}
        />
        <input
          defaultValue={team.name}
          onBlur={e => {
            const v = e.target.value.trim()
            if (v && v !== team.name) onRename(team.id, v)
            else e.target.value = team.name
          }}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="flex-1 min-w-0 bg-transparent text-white text-sm font-semibold outline-none border-b border-transparent focus:border-[#C9A84C]/50 transition-colors"
        />
        <span className={`text-xs flex-shrink-0 tabular-nums ${
          over ? 'text-amber-400' : 'text-white/25'
        }`}>
          {sizeLimit !== null ? `${players.length}/${sizeLimit}` : players.length} · {totalHandicap}
        </span>
      </div>

      {showColors && (
        <div className="px-3 py-2.5 border-b border-[#1e3d28] flex gap-2 flex-wrap">
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              onClick={() => { onRecolour(team.id, color); setShowColors(false) }}
              style={{ backgroundColor: color }}
              className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                team.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0f2418]' : ''
              }`}
              aria-label={`Colour ${color}`}
            />
          ))}
        </div>
      )}

      <div className="p-2 space-y-2 flex-1">
        {players.map(p => <DraggablePlayer key={p.id} player={p} />)}
        {players.length === 0 && (
          <p className="text-white/15 text-sm text-center py-8 select-none">Drop here</p>
        )}
        {full && !over && (
          <p className="text-white/20 text-[10px] tracking-wider uppercase text-center pb-2 select-none">
            Full
          </p>
        )}
      </div>
    </div>
  )
}

function UnassignedZone({ players }: { players: Player[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl overflow-hidden transition-all duration-150 ${
        isOver
          ? 'border-2 border-[#C9A84C]/60 bg-[#C9A84C]/5'
          : 'border border-[#1e3d28] bg-[#0f2418]'
      }`}
    >
      <div className="px-4 py-3 border-b border-[#1e3d28] flex items-center justify-between">
        <span className="text-white/50 text-xs tracking-[0.2em] uppercase">Unassigned</span>
        <span className="text-white/25 text-xs tabular-nums">{players.length}</span>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[72px]">
        {players.map(p => <DraggablePlayer key={p.id} player={p} />)}
        {players.length === 0 && (
          <p className="text-white/15 text-sm py-4 col-span-full text-center select-none">
            Everyone has a team
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function TripTeamsClient({
  tripId,
  numTeams: initialNumTeams,
  formats,
  teams: initialTeams,
  players: initialPlayers,
}: {
  tripId: string
  numTeams: number
  formats: TripFormats
  teams: Team[]
  players: Player[]
}) {
  const [teams, setTeams]     = useState<Team[]>(initialTeams)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [activePlayer, setActivePlayer] = useState<Player | null>(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  // What a team is, and how big it may be, both follow from the format
  const noun         = teamNoun(formats)
  const sizeLimit    = teamSizeLimit(formats)
  const banner       = teamSizeBanner(formats)
  const pairs        = sizeLimit !== null
  const countOptions = teamCountOptions(formats, players.length)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function flashError(msg: string) {
    setError(msg)
    setTimeout(() => setError(''), 4000)
  }

  // ── Drag and drop ────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActivePlayer(players.find(p => p.id === active.id) ?? null)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActivePlayer(null)
    if (!over) return

    const playerId = active.id as string
    const overId   = over.id as string
    const targetTeamId = overId === UNASSIGNED ? null : overId

    const dragged = players.find(p => p.id === playerId)
    if (!dragged || dragged.team_id === targetTeamId) return

    // A pairs draw is between teams of two, so a third player is not a thing
    // the bracket can represent. Refuse the drop rather than let it save.
    if (targetTeamId && !canJoinTeam(formats, targetTeamId, players)) {
      const team = teams.find(t => t.id === targetTeamId)
      flashError(`${team?.name ?? noun.One} already has ${PAIR_SIZE} players`)
      return
    }

    const prev = players
    setPlayers(ps => ps.map(p => (p.id === playerId ? { ...p, team_id: targetTeamId } : p)))

    const { error: err } = await supabase
      .from('players')
      .update({ team_id: targetTeamId })
      .eq('id', playerId)

    if (err) {
      setPlayers(prev)
      flashError('Could not move player — try again')
    }
  }

  // ── Team count ───────────────────────────────────────────────

  async function setTeamCount(n: number) {
    if (n === teams.length || busy) return
    setBusy(true)

    if (n > teams.length) {
      const toAdd = Array.from({ length: n - teams.length }, (_, i) => {
        const idx = teams.length + i
        return {
          trip_id: tripId,
          name: `Team ${String.fromCharCode(65 + idx)}`,
          color: PRESET_COLORS[idx % PRESET_COLORS.length],
        }
      })
      const { data, error: err } = await supabase.from('teams').insert(toAdd).select('id, name, color')
      if (err || !data) flashError('Could not add teams')
      else setTeams(prev => [...prev, ...data])
    } else {
      // Remove from the end; their players fall back to unassigned
      const doomed = teams.slice(n)
      const doomedIds = doomed.map(t => t.id)
      const affected = players.filter(p => p.team_id && doomedIds.includes(p.team_id)).length
      if (
        affected > 0 &&
        !window.confirm(
          `Removing ${doomed.length} team${doomed.length === 1 ? '' : 's'} will unassign ${affected} player${affected === 1 ? '' : 's'}. Continue?`
        )
      ) {
        setBusy(false)
        return
      }
      const { error: clearErr } = await supabase
        .from('players')
        .update({ team_id: null })
        .in('team_id', doomedIds)
      if (clearErr) {
        flashError('Could not unassign players')
        setBusy(false)
        return
      }
      const { error: err } = await supabase.from('teams').delete().in('id', doomedIds)
      if (err) {
        flashError('Could not remove teams')
      } else {
        setTeams(prev => prev.slice(0, n))
        setPlayers(ps =>
          ps.map(p => (p.team_id && doomedIds.includes(p.team_id) ? { ...p, team_id: null } : p))
        )
      }
    }

    await supabase.from('trips').update({ num_teams: n }).eq('id', tripId)
    setBusy(false)
  }

  // ── Team edits ───────────────────────────────────────────────

  async function renameTeam(id: string, name: string) {
    const prev = teams
    setTeams(ts => ts.map(t => (t.id === id ? { ...t, name } : t)))
    const { error: err } = await supabase.from('teams').update({ name }).eq('id', id)
    if (err) { setTeams(prev); flashError('Could not rename team') }
  }

  async function recolourTeam(id: string, color: string) {
    const prev = teams
    setTeams(ts => ts.map(t => (t.id === id ? { ...t, color } : t)))
    const { error: err } = await supabase.from('teams').update({ color }).eq('id', id)
    if (err) { setTeams(prev); flashError('Could not change colour') }
  }

  // ── Auto-balance ─────────────────────────────────────────────
  // Snake draft by handicap so team totals land close together. At two per
  // team that is exactly high-with-low pairing: the first lap deals out the
  // low handicaps one each, the second comes back the other way, so the
  // lowest ends up beside the highest.

  async function autoBalance() {
    if (teams.length === 0 || busy) return
    const question = pairs
      ? `Pair everyone up by handicap, lowest with highest? This replaces the current pairings.`
      : 'Spread all players across the teams by handicap? This replaces the current assignment.'
    if (!window.confirm(question)) return
    setBusy(true)

    const sorted = [...players].sort((a, b) => (a.handicap ?? 0) - (b.handicap ?? 0))
    const assignment = new Map<string, string>()
    sorted.forEach((p, i) => {
      const lap = Math.floor(i / teams.length)
      const pos = i % teams.length
      // Reverse direction every other lap so the low handicaps don't all stack up
      const teamIdx = lap % 2 === 0 ? pos : teams.length - 1 - pos
      assignment.set(p.id, teams[teamIdx].id)
    })

    const prev = players
    setPlayers(ps => ps.map(p => ({ ...p, team_id: assignment.get(p.id) ?? p.team_id })))

    const results = await Promise.all(
      [...assignment.entries()].map(([playerId, teamId]) =>
        supabase.from('players').update({ team_id: teamId }).eq('id', playerId)
      )
    )
    if (results.some(r => r.error)) {
      setPlayers(prev)
      flashError(`Could not set the ${noun.many} — try again`)
    }
    setBusy(false)
  }

  // ── Render ───────────────────────────────────────────────────

  const unassigned = players.filter(p => !p.team_id)
  const teamHandicap = (teamId: string) =>
    players.filter(p => p.team_id === teamId).reduce((sum, p) => sum + (p.handicap ?? 0), 0)

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">

        {/* A pairs draw fixes the size, so say so before anyone picks */}
        {banner && (
          <div className="flex items-start gap-3 px-4 py-3.5 bg-[#C9A84C]/10 border border-[#C9A84C]/40 rounded-xl">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0" />
            <p className="text-[#C9A84C] text-sm leading-snug">{banner}</p>
          </div>
        )}

        {/* Team count */}
        <div>
          <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">
            Number of {noun.many}
          </label>
          <div className="flex gap-2 flex-wrap">
            {countOptions.map(n => (
              <button
                key={n}
                onClick={() => setTeamCount(n)}
                disabled={busy}
                className={`flex-1 min-w-[48px] py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                  teams.length === n
                    ? 'bg-[#C9A84C] text-[#0a1a0e]'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-balance */}
        {players.length > 0 && teams.length > 0 && (
          <button
            onClick={autoBalance}
            disabled={busy}
            className="w-full py-3.5 border border-[#C9A84C]/40 text-[#C9A84C] rounded-xl text-sm tracking-wider uppercase hover:bg-[#C9A84C]/10 transition-colors disabled:opacity-40"
          >
            {pairs ? 'Auto-pair high with low' : 'Auto-balance by handicap'}
          </button>
        )}

        <p className="text-white/30 text-xs text-center">
          Drag players between {noun.many}. On a phone, press and hold briefly first.
        </p>

        <UnassignedZone players={unassigned} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map(team => (
            <TeamColumn
              key={team.id}
              team={team}
              players={players.filter(p => p.team_id === team.id)}
              totalHandicap={Math.round(teamHandicap(team.id))}
              sizeLimit={sizeLimit}
              onRename={renameTeam}
              onRecolour={recolourTeam}
            />
          ))}
        </div>

        {teams.length === 0 && (
          <p className="text-white/40 text-sm text-center py-8">
            Pick a number of {noun.many} above to get started.
          </p>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePlayer && (
          <div className="rotate-1 scale-105 shadow-xl shadow-black/60 w-56">
            <PlayerTile player={activePlayer} />
          </div>
        )}
      </DragOverlay>

      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 bg-[#1a0f0a] border border-amber-500/40 rounded-xl shadow-xl z-50">
          <p className="text-amber-400 text-sm whitespace-nowrap">{error}</p>
        </div>
      )}
    </DndContext>
  )
}
