'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  MouseSensor, TouchSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import { revalidateTrip } from '@/app/actions/revalidate'
import { boardTitle, boardRules, isSlotFree, type Leaderboard } from '@/lib/leaderboards'
import { TABBAR_SPACE } from '@/app/components/tabbarMetrics'
import {
  MAIN_SET, setOf, teamBoards, isBoardOpen, sheetForSelection, withSheet,
  sheetChanges, teamsOnSheet, teamFor, membersOf, type Membership,
} from '@/lib/teamSets'
import { setTeam, clearMirror } from '@/lib/teamMembers'
import { failed, why } from '@/lib/writeFailure'
import {
  teamNoun, teamSizeLimit, teamSizeBanner, teamCountOptions, canJoinTeam,
  PAIR_SIZE,
} from '@/lib/teamLimits'
import { anyPointsOutOfStep, TEAM_POINTS_MISMATCH } from '@/lib/customPoints'
import { Card, Badge, buttonClass } from '@/app/components/ui'
import { IconCheck, IconChevronDown, IconUsers } from '@/app/components/icons'

/**
 * Team selection — apportioning teams to the leaderboards that need them.
 *
 * A team leaderboard is made in settings without any teams. This screen is
 * where it gets them, and it is built around that job rather than around a
 * single team sheet reached by a link:
 *
 *   · every team board is a tile at the top
 *   · a board with no teams yet is OPEN and can be ticked. Tick more than one
 *     and they will be played by the same teams — that is what sharing a
 *     sheet means, and it is now answered here rather than guessed at in
 *     settings before the teams exist
 *   · a board that has teams shows them when tapped, with an edit button that
 *     puts the players back on the board
 *
 * Confirming writes the sheet onto every board in the selection and refreshes,
 * so the leaderboard tab shows the new tables straight away.
 *
 * Nothing here touches a score. Scores are the player's, keyed by player id;
 * a team row is worked out from whoever is in the team right now. Moving
 * somebody mid-trip moves their cards with them — which is why this screen
 * stays open after the trip has gone live.
 */

// ─── Types ─────────────────────────────────────────────────────

interface Team   { id: string; name: string; color: string; team_set: string }
interface Player { id: string; name: string; handicap: number | null; gender: string }
/** A player as the picker sees them: their place on the sheet being edited. */
interface Placed extends Player { team_id: string | null }

const UNASSIGNED = 'unassigned'

const PRESET_COLORS = [
  '#DC2626', '#2563EB', '#16A34A', '#9333EA',
  '#EA580C', '#DB2777', '#0D9488', '#0A9D56',
  '#65A30D', '#7C3AED', '#0891B2', '#B45309',
]

/**
 * Clear of the tab bar, which is fixed at the bottom of every trip screen.
 * A sticky action bar at `bottom-4` sits underneath it and cannot be tapped.
 */
const ABOVE_TABBAR = `calc(${TABBAR_SPACE} + 1rem)`

// ─── Player tile ───────────────────────────────────────────────

function PlayerTile({ player, faded = false }: { player: Placed; faded?: boolean }) {
  return (
    <div
      className={`border border-bark/12 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 bg-surface transition-opacity ${
        faded ? 'opacity-25' : 'opacity-100'
      }`}
    >
      <span className="text-ink text-sm font-medium leading-tight flex-1 min-w-0 truncate">
        {player.name}
      </span>
      <span
        className={`text-[13px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
          player.gender === 'F'
            ? 'bg-rust/40 text-rose-300'
            : 'bg-bark/40 text-blue-300'
        }`}
      >
        {player.gender}
      </span>
      <span className="border border-accent/50 bg-accent/10 px-2 py-0.5 rounded flex-shrink-0">
        <span className="font-[family-name:var(--font-display)] text-accent text-base leading-none">
          {player.handicap ?? 0}
        </span>
      </span>
    </div>
  )
}

function DraggablePlayer({ player }: { player: Placed }) {
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
  players: Placed[]
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
          ? 'border-2 border-accent/60 bg-accent/5'
          : isOver && full
            ? 'border-2 border-rust/60 bg-rust/5'
            : over
              ? 'border border-rust/50 bg-surface'
              : 'border border-bark/12 bg-surface'
      }`}
    >
      <div className="px-3 py-3 border-b border-bark/12 flex items-center gap-2">
        <button
          onClick={() => setShowColors(v => !v)}
          className="w-4 h-4 rounded-full flex-shrink-0 ring-offset-2 ring-offset-surface hover:ring-2 hover:ring-bark/25 transition-all"
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
          className="flex-1 min-w-0 bg-transparent text-ink text-sm font-semibold outline-none border-b border-transparent focus:border-accent/50 transition-colors"
        />
        <span className={`text-[13px] flex-shrink-0 tabular-nums ${
          over ? 'text-rust-deep' : 'text-ink/50'
        }`}>
          {sizeLimit !== null ? `${players.length}/${sizeLimit}` : players.length} · {totalHandicap}
        </span>
      </div>

      {showColors && (
        <div className="px-3 py-2.5 border-b border-bark/12 flex gap-2 flex-wrap">
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              onClick={() => { onRecolour(team.id, color); setShowColors(false) }}
              style={{ backgroundColor: color }}
              className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                team.color === color ? 'ring-2 ring-bark/40 ring-offset-2 ring-offset-surface' : ''
              }`}
              aria-label={`Colour ${color}`}
            />
          ))}
        </div>
      )}

      <div className="p-2 space-y-2 flex-1">
        {players.map(p => <DraggablePlayer key={p.id} player={p} />)}
        {players.length === 0 && (
          <p className="text-ink/50 text-sm text-center py-8 select-none">Drop here</p>
        )}
        {full && !over && (
          <p className="text-ink/50 text-[13px] tracking-wider uppercase text-center pb-2 select-none">
            Full
          </p>
        )}
      </div>
    </div>
  )
}

function UnassignedZone({ players }: { players: Placed[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl overflow-hidden transition-all duration-150 ${
        isOver
          ? 'border-2 border-accent/60 bg-accent/5'
          : 'border border-bark/12 bg-surface'
      }`}
    >
      <div className="px-4 py-3 border-b border-bark/12 flex items-center justify-between">
        <span className="text-ink/65 text-[13px] tracking-[0.2em] uppercase">Unassigned</span>
        <span className="text-ink/50 text-[13px] tabular-nums">{players.length}</span>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[72px]">
        {players.map(p => <DraggablePlayer key={p.id} player={p} />)}
        {players.length === 0 && (
          <p className="text-ink/50 text-sm py-4 col-span-full text-center select-none">
            Everyone&apos;s in
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Board tile ────────────────────────────────────────────────

/**
 * One leaderboard, and where its teams stand.
 *
 * Open boards are a tick box — several can be picked at once, and picking
 * several is how they come to share teams. A board that already has teams
 * opens instead, showing them, with the way back into the picker on it.
 */
function BoardTile({
  board, open, selected, expanded, teams, memberships, players, onTap, onEdit,
}: {
  board: Leaderboard
  open: boolean
  selected: boolean
  expanded: boolean
  teams: Team[]
  memberships: Membership[]
  players: Player[]
  onTap: () => void
  onEdit: () => void
}) {
  const noun = teamNoun([board])
  const placed = teams.reduce((n, t) => n + membersOf(memberships, t.id).length, 0)
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? ''

  return (
    <Card className={`overflow-hidden transition-colors duration-150 ${
      selected ? 'border-accent bg-accent/[0.06]' : ''
    }`}>
      <button
        type="button"
        onClick={onTap}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        {/* Only an open board is a choice — a picked one is a disclosure */}
        {open ? (
          <span
            aria-hidden="true"
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${
              selected ? 'border-accent-deep bg-accent-deep text-white' : 'border-bark/40'
            }`}
          >
            {selected && <IconCheck size={13} />}
          </span>
        ) : (
          <span className="mt-0.5 flex-shrink-0 text-accent-deep"><IconUsers size={18} /></span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="t-card text-ink">{boardTitle(board)}</span>
            {open
              ? <Badge>No {noun.many} yet</Badge>
              : <Badge tone="win">{teams.length} {teams.length === 1 ? noun.one : noun.many}</Badge>}
          </span>
          <span className="block t-cap text-ink/65 mt-1 leading-snug">{boardRules(board)}</span>
          {!open && (
            <span className="block t-cap text-ink/65 mt-1">
              {placed} player{placed === 1 ? '' : 's'} placed
            </span>
          )}
        </span>

        {!open && (
          <span className={`flex-shrink-0 mt-0.5 text-ink/50 transition-transform duration-150 ${
            expanded ? 'rotate-180' : ''
          }`}>
            <IconChevronDown size={16} />
          </span>
        )}
      </button>

      {expanded && !open && (
        <div className="px-4 pb-4 space-y-2">
          {teams.map(t => {
            const names = membersOf(memberships, t.id).map(nameOf).filter(Boolean)
            return (
              <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 border border-bark/12 rounded-xl">
                <span className="mt-1 w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-ink text-sm truncate">{t.name}</span>
                  <span className="block t-cap text-ink/65 mt-0.5 leading-snug">
                    {names.length > 0 ? names.join(' · ') : 'Nobody yet'}
                  </span>
                </span>
              </div>
            )
          })}
          <button type="button" onClick={onEdit} className={`${buttonClass('secondary')} mt-1`}>
            Edit {noun.many}
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function TripTeamsClient({
  tripId,
  tripCode,
  boards: initialBoards,
  teams: initialTeams,
  players,
  memberships: initialMemberships,
}: {
  tripId: string
  tripCode: string
  /** Everything the trip plays for, individual boards included. */
  boards: Leaderboard[]
  /** Every team on the trip, on every sheet. */
  teams: Team[]
  players: Player[]
  memberships: Membership[]
}) {
  const router = useRouter()

  const [boards, setBoards]           = useState<Leaderboard[]>(initialBoards)
  const [teams, setTeams]             = useState<Team[]>(initialTeams)
  const [memberships, setMemberships] = useState<Membership[]>(initialMemberships)

  /** Which boards are being given teams. Board ids. */
  const [selected, setSelected] = useState<string[]>([])
  /** The sheet the picker is working on, or null when showing the tiles. */
  const [sheet, setSheet] = useState<string | null>(null)
  /** Which picked board is showing its teams. */
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [activePlayer, setActivePlayer] = useState<Placed | null>(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function flashError(msg: string) {
    setError(msg)
    setTimeout(() => setError(''), 6000)
  }

  // ── What is where ────────────────────────────────────────────

  const tiles = teamBoards(boards)
  const isOpen = (lb: Leaderboard) => isBoardOpen(lb, teams)

  // The boards these teams will play for. Every rule about what a team may be
  // is read off them: a pairs draw in the selection caps the teams at two,
  // and calls them pairings, whatever else is selected alongside it.
  const forBoards = boards.filter(b => selected.includes(b.id))
  const noun         = teamNoun(forBoards)
  const sizeLimit    = teamSizeLimit(forBoards)
  const banner       = teamSizeBanner(forBoards)
  const pairs        = sizeLimit !== null
  const countOptions = teamCountOptions(forBoards, players.length)

  const sheetTeams: Team[] = sheet ? teamsOnSheet(teams, sheet) as Team[] : []
  // `team_id` is their place on the sheet being edited, so the picker works
  // in one shape whichever sheet it is showing.
  const placed: Placed[] = sheet
    ? players.map(p => ({ ...p, team_id: teamFor(memberships, p.id, sheet) }))
    : []
  const unassigned = placed.filter(p => !p.team_id)

  /**
   * Whether this board could join what is already selected.
   *
   * Two boards scored identically on the same teams are the same table twice,
   * and the reader drops the second on the way back in — so a selection that
   * would produce one has to be refused here rather than quietly lose a board
   * on the next page load. Only reachable on a trip set up under the older
   * form, which let the same format be run twice on different teams.
   */
  const canJoinSelection = (lb: Leaderboard, sheetId: string) =>
    isSlotFree(
      forBoards.filter(b => b.id !== lb.id).map(b => ({ ...b, teamSet: sheetId })),
      { ...lb, teamSet: sheetId },
    )

  // Boards with no teams that could join the sheet being edited. Ticking one
  // is how a board comes to be played by teams that already exist.
  const couldJoin = sheet
    ? tiles.filter(lb => isOpen(lb) && !selected.includes(lb.id) && canJoinSelection(lb, sheet))
    : []

  // ── Selecting ────────────────────────────────────────────────

  function toggle(lb: Leaderboard) {
    if (!isOpen(lb)) {
      setExpandedId(id => (id === lb.id ? null : lb.id))
      return
    }
    if (selected.includes(lb.id)) {
      setSelected(s => s.filter(id => id !== lb.id))
      return
    }
    // Where these boards would land, if this one joined them
    const landing = sheetForSelection(boards, [...selected, lb.id], teams)
    if (!canJoinSelection(lb, landing)) {
      flashError(`${boardTitle(lb)} is scored the same way — one set of ${noun.many} cannot play both`)
      return
    }
    setSelected(s => [...s, lb.id])
  }

  /** Start picking teams for whatever is ticked. */
  function beginSelection() {
    if (selected.length === 0) return
    setSheet(sheetForSelection(boards, selected, teams))
    setExpandedId(null)
  }

  /**
   * Go back to a board's teams.
   *
   * Everything already sharing the sheet comes with it: those boards are
   * played by these teams, so their rules — a pairs cap above all — still
   * apply while the teams are being changed.
   */
  function beginEdit(lb: Leaderboard) {
    const set = setOf(lb)
    setSelected(boards.filter(b => b.audience === 'team' && setOf(b) === set).map(b => b.id))
    setSheet(set)
    setExpandedId(null)
  }

  // ── Drag and drop ────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActivePlayer(placed.find(p => p.id === active.id) ?? null)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActivePlayer(null)
    if (!over || !sheet) return

    const playerId = active.id as string
    const overId   = over.id as string
    const targetTeamId = overId === UNASSIGNED ? null : overId

    const dragged = placed.find(p => p.id === playerId)
    if (!dragged || dragged.team_id === targetTeamId) return

    // A pairs draw is between teams of two, so a third player is not a thing
    // the bracket can represent. Refuse the drop rather than let it save.
    if (targetTeamId && !canJoinTeam(forBoards, targetTeamId, placed)) {
      const team = sheetTeams.find(t => t.id === targetTeamId)
      flashError(`${team?.name ?? noun.One} already has ${PAIR_SIZE} players`)
      return
    }

    const prev = memberships
    setMemberships(ms => [
      ...ms.filter(m => !(m.player_id === playerId && m.team_set === sheet)),
      ...(targetTeamId ? [{ team_id: targetTeamId, team_set: sheet, player_id: playerId }] : []),
    ])

    const fail = await setTeam(tripId, playerId, sheet, targetTeamId)
    if (fail) {
      setMemberships(prev)
      flashError(`Could not move ${dragged.name}${why(fail)}`)
    }
  }

  // ── Team count ───────────────────────────────────────────────

  async function setTeamCount(n: number) {
    if (!sheet || n === sheetTeams.length || busy) return
    setBusy(true)

    if (n > sheetTeams.length) {
      const toAdd = Array.from({ length: n - sheetTeams.length }, (_, i) => {
        const idx = sheetTeams.length + i
        return {
          trip_id: tripId,
          team_set: sheet,
          name: `${noun.One} ${String.fromCharCode(65 + idx)}`,
          color: PRESET_COLORS[idx % PRESET_COLORS.length],
        }
      })
      const { data, error: err } = await supabase
        .from('teams').insert(toAdd).select('id, name, color, team_set')
      // Say what the database said. "Could not add teams" on its own has sent
      // more than one afternoon looking in the wrong place.
      if (err || !data) flashError(`Could not add ${noun.many}${why(failed('teams insert', err))}`)
      else setTeams(prev => [...prev, ...(data as Team[])])
    } else {
      // Remove from the end; their players fall back to unassigned
      const doomed = sheetTeams.slice(n)
      const doomedIds = doomed.map(t => t.id)
      const affected = placed.filter(p => p.team_id && doomedIds.includes(p.team_id)).length
      if (
        affected > 0 &&
        !window.confirm(
          `Removing ${doomed.length} ${doomed.length === 1 ? noun.one : noun.many} will unassign ${affected} player${affected === 1 ? '' : 's'}. Their scores are theirs and stay with them. Continue?`
        )
      ) {
        setBusy(false)
        return
      }
      // Deleting the teams cascades their memberships, so nothing has to
      // unassign anybody first. players.team_id is only a mirror for the
      // archive routes, and it is ours to clear.
      if (sheet === MAIN_SET) {
        const mirrorFail = await clearMirror(
          placed.filter(p => p.team_id && doomedIds.includes(p.team_id)).map(p => p.id))
        if (mirrorFail) flashError(`Teams removed, but one record did not clear${why(mirrorFail)}`)
      }
      const { error: err } = await supabase.from('teams').delete().in('id', doomedIds)
      if (err) {
        flashError(`Could not remove ${noun.many}${why(failed('teams delete', err))}`)
      } else {
        setTeams(prev => prev.filter(t => !doomedIds.includes(t.id)))
        setMemberships(ms => ms.filter(m => !doomedIds.includes(m.team_id)))
      }
    }

    // A board on this sheet paying by position pays a fixed table of places,
    // and the sheet just changed size. The table has already been padded or
    // trimmed where it is read, so the competition is still scorable — this
    // is the part `resolveCustomPoints` cannot do, which is tell anybody.
    //
    // Only this sheet's team boards. A trip can run a league between fours
    // and a knockout between pairings, so the other sheet's table is
    // measured against its own teams and is none of this change's business.
    // Individual boards are not asked either: their field is the players,
    // and no player arrived or left just now.
    const sheetBoards = boards.filter(
      b => b.audience === 'team' && (b.teamSet ?? MAIN_SET) === sheet)
    if (anyPointsOutOfStep(sheetBoards, { players: players.length, teams: n })) {
      window.alert(TEAM_POINTS_MISMATCH)
    }

    setBusy(false)
  }

  // ── Team edits ───────────────────────────────────────────────

  async function renameTeam(id: string, name: string) {
    const prev = teams
    setTeams(ts => ts.map(t => (t.id === id ? { ...t, name } : t)))
    const { error: err } = await supabase.from('teams').update({ name }).eq('id', id)
    if (err) { setTeams(prev); flashError(`Could not rename${why(failed('team rename', err))}`) }
  }

  async function recolourTeam(id: string, color: string) {
    const prev = teams
    setTeams(ts => ts.map(t => (t.id === id ? { ...t, color } : t)))
    const { error: err } = await supabase.from('teams').update({ color }).eq('id', id)
    if (err) { setTeams(prev); flashError(`Could not change colour${why(failed('team recolour', err))}`) }
  }

  // ── Auto-balance ─────────────────────────────────────────────
  // Snake draft by handicap so team totals land close together. At two per
  // team that is exactly high-with-low pairing: the first lap deals out the
  // low handicaps one each, the second comes back the other way, so the
  // lowest ends up beside the highest.

  async function autoBalance() {
    if (!sheet || sheetTeams.length === 0 || busy) return
    const question = pairs
      ? 'Pair everyone up by handicap, lowest with highest? This replaces the current pairings.'
      : 'Spread all players across the teams by handicap? This replaces the current assignment.'
    if (!window.confirm(question)) return
    setBusy(true)

    const sorted = [...players].sort((a, b) => (a.handicap ?? 0) - (b.handicap ?? 0))
    const assignment = new Map<string, string>()
    sorted.forEach((p, i) => {
      const lap = Math.floor(i / sheetTeams.length)
      const pos = i % sheetTeams.length
      // Reverse direction every other lap so the low handicaps don't all stack up
      const teamIdx = lap % 2 === 0 ? pos : sheetTeams.length - 1 - pos
      assignment.set(p.id, sheetTeams[teamIdx].id)
    })

    const prev = memberships
    setMemberships(ms => [
      ...ms.filter(m => m.team_set !== sheet),
      ...[...assignment.entries()].map(([player_id, team_id]) =>
        ({ player_id, team_id, team_set: sheet })),
    ])

    const fails = (await Promise.all(
      [...assignment.entries()].map(([playerId, teamId]) =>
        setTeam(tripId, playerId, sheet, teamId)
      )
    )).filter(Boolean)
    if (fails.length > 0) {
      setMemberships(prev)
      flashError(`Could not set the ${noun.many}${why(fails[0])}`)
    }
    setBusy(false)
  }

  // ── Confirming ───────────────────────────────────────────────

  /**
   * Tie the selected boards to these teams.
   *
   * The teams themselves are already saved — every drag writes as it lands.
   * What is written here is the association: which boards are played by this
   * sheet. Then the trip is revalidated, so the leaderboard tab shows the new
   * tables without anybody reloading.
   */
  async function confirm() {
    if (!sheet || busy) return
    setBusy(true)

    if (sheetChanges(boards, selected, sheet)) {
      const next = withSheet(boards, selected, sheet)
      const { error: err } = await supabase
        .from('trips').update({ leaderboards: next }).eq('id', tripId)
      if (err) {
        flashError(`Could not save which leaderboards these ${noun.many} play for${why(failed('leaderboards update', err))}`)
        setBusy(false)
        return
      }
      setBoards(next)
    }

    await revalidateTrip(tripCode)
    router.refresh()
    setSheet(null)
    setSelected([])
    setBusy(false)
  }

  // ── Render ───────────────────────────────────────────────────

  const teamHandicap = (teamId: string) =>
    placed.filter(p => p.team_id === teamId).reduce((sum, p) => sum + (p.handicap ?? 0), 0)

  // Nothing to apportion. Better to say so than to show an empty picker that
  // makes teams no board would ever rank.
  if (tiles.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="t-body text-ink/80">
          No leaderboard on this trip is played by teams yet.
        </p>
        <p className="t-cap text-ink/65 mt-2 leading-snug">
          Add a team leaderboard in settings, then come back and pick who
          plays with whom.
        </p>
      </Card>
    )
  }

  // ── The tiles ──
  if (!sheet) {
    return (
      <div className="space-y-6">
        <div>
          <p className="t-body text-ink/80">
            {tiles.some(isOpen)
              ? 'Pick the leaderboards, then choose the teams.'
              : 'Tap a leaderboard to see its teams, or to change them.'}
          </p>
        </div>

        <div className="space-y-3">
          {tiles.map(lb => (
            <BoardTile
              key={lb.id}
              board={lb}
              open={isOpen(lb)}
              selected={selected.includes(lb.id)}
              expanded={expandedId === lb.id}
              teams={teamsOnSheet(teams, setOf(lb)) as Team[]}
              memberships={memberships}
              players={players}
              onTap={() => toggle(lb)}
              onEdit={() => beginEdit(lb)}
            />
          ))}
        </div>

        {selected.length > 0 && (
          <div className="sticky z-30" style={{ bottom: ABOVE_TABBAR }}>
            <button type="button" onClick={beginSelection} className={buttonClass('primary')}>
              Choose {teamNoun(forBoards).many} for {selected.length} leaderboard
              {selected.length === 1 ? '' : 's'}
            </button>
          </div>
        )}

        {error && (
          <div
            className="fixed left-1/2 -translate-x-1/2 max-w-[92vw] px-5 py-3 bg-surface border border-rust/40 rounded-xl shadow-xl z-50"
            style={{ bottom: ABOVE_TABBAR }}
          >
            <p className="text-rust-deep text-sm">{error}</p>
          </div>
        )}
      </div>
    )
  }

  // ── The picker ──
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">

        <div>
          <button
            type="button"
            onClick={() => { setSheet(null); setSelected([]) }}
            className="t-cap uppercase tracking-[0.12em] text-accent-deep"
          >
            ‹ All leaderboards
          </button>
          <h2 className="t-h2 text-ink mt-2">
            {noun.Many} for {forBoards.map(boardTitle).join(' · ') || 'this trip'}
          </h2>
          <p className="t-cap text-ink/65 mt-1 leading-snug">
            Press confirm when you&apos;re done.
          </p>
        </div>

        {/* A pairs draw fixes the size, so say so before anyone picks */}
        {banner && (
          <div className="flex items-start gap-3 px-4 py-3.5 bg-accent/10 border border-accent/40 rounded-xl">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <p className="text-accent text-sm leading-snug">{banner}</p>
          </div>
        )}

        {/* Another board with no teams can be played by these ones */}
        {couldJoin.length > 0 && (
          <div className="border border-bark/12 rounded-xl p-4">
            <p className="t-label text-ink/80 mb-2">Play these {noun.many} for another leaderboard too?</p>
            <div className="space-y-2">
              {couldJoin.map(lb => (
                <button
                  key={lb.id}
                  type="button"
                  onClick={() => setSelected(s => [...s, lb.id])}
                  className="w-full text-left px-3 py-2.5 border border-bark/25 rounded-xl hover:border-bark/40 transition-colors duration-150"
                >
                  <span className="block t-card text-ink">{boardTitle(lb)}</span>
                  <span className="block t-cap text-ink/65 mt-0.5 leading-snug">{boardRules(lb)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Team count */}
        <div>
          <label className="block text-ink/80 text-[13px] uppercase tracking-wider mb-2">
            Number of {noun.many}
          </label>
          <div className="flex gap-2 flex-wrap">
            {countOptions.map(n => (
              <button
                key={n}
                onClick={() => setTeamCount(n)}
                disabled={busy}
                className={`flex-1 min-w-[48px] py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                  sheetTeams.length === n
                    ? 'bg-accent-deep text-white'
                    : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-balance */}
        {players.length > 0 && sheetTeams.length > 0 && (
          <button
            onClick={autoBalance}
            disabled={busy}
            className="w-full py-3.5 border border-accent/40 text-accent rounded-xl text-sm tracking-wider uppercase hover:bg-accent/10 transition-colors disabled:opacity-40"
          >
            {pairs ? 'Auto-pair high with low' : 'Auto-balance by handicap'}
          </button>
        )}

        <p className="text-ink/65 text-[13px] text-center">
          Drag players between {noun.many}. On a phone, press and hold briefly first.
        </p>

        <UnassignedZone players={unassigned} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheetTeams.map(team => (
            <TeamColumn
              key={team.id}
              team={team}
              players={placed.filter(p => p.team_id === team.id)}
              totalHandicap={Math.round(teamHandicap(team.id))}
              sizeLimit={sizeLimit}
              onRename={renameTeam}
              onRecolour={recolourTeam}
            />
          ))}
        </div>

        {sheetTeams.length === 0 && (
          <p className="text-ink/65 text-sm text-center py-8">
            Pick a number of {noun.many} above to get started.
          </p>
        )}

        <div className="sticky z-30" style={{ bottom: ABOVE_TABBAR }}>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || sheetTeams.length === 0}
            className={buttonClass('primary')}
          >
            {busy ? 'Saving…' : `Confirm ${noun.many}`}
          </button>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activePlayer && (
          <div className="rotate-1 scale-105 shadow-xl shadow-bark/20 w-56">
            <PlayerTile player={activePlayer} />
          </div>
        )}
      </DragOverlay>

      {error && (
        <div
          className="fixed left-1/2 -translate-x-1/2 max-w-[92vw] px-5 py-3 bg-surface border border-rust/40 rounded-xl shadow-xl z-50"
          style={{ bottom: ABOVE_TABBAR }}
        >
          <p className="text-rust-deep text-sm">{error}</p>
        </div>
      )}
    </DndContext>
  )
}
