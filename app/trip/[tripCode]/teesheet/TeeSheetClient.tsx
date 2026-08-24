'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import InlineUnlock from '@/app/components/InlineUnlock'
import { hasUnlocked } from '@/lib/passcode'
import { IconPlus, IconX, IconUsers } from '@/app/components/icons'
import {
  type SlotPlayer, slotClock, slotCount, groupSlot, MAX_GROUP_SIZE,
  pickerUnits, unitMatches,
} from '@/lib/teeSheet'
import { joinNames, firstName } from '@/lib/matchplayEntrants'

/**
 * The tee sheet on a phone: a full day is a long scroll, so every row is
 * condensed — the names stacked on the left, the time on the right, one
 * hairline between groups. Teammates in a slot gather into one block, side
 * by side at two or three and a 2×2 grid at four, because a team going out
 * together should read as one thing.
 *
 * Who may edit: the field, when the organiser's `edit_tee_sheet` permission
 * says so — or whoever has already unlocked the organiser PIN in this
 * session, read from the same sessionStorage the PasscodeGate writes. The
 * unlock is checked after mount, deliberately: the server cannot see
 * sessionStorage, and deciding during render would tear hydration.
 *
 * Writes are one row per player per round (`tee_assignments`, migration
 * 050) — adding and removing are single-row inserts and deletes, so two
 * phones editing at once interleave instead of clobbering, and the unique
 * constraint makes the same player in two slots impossible however the
 * taps race.
 */

type Round = {
  id: string
  roundNumber: number
  courseName: string | null
  startTime: string | null
  intervalMins: number
  groupSize: number
}

type Assignment = { round_id: string; player_id: string; slot_index: number }

export default function TeeSheetClient({
  tripId, tripCode, rounds, players, initialAssignments,
  teamOf, hasTeamBoard, teeTeamsSeparate, fieldMayEdit, passcodeHash = null,
}: {
  tripId: string
  tripCode: string
  rounds: Round[]
  players: { id: string; name: string }[]
  initialAssignments: Assignment[]
  /** Player id → their team on the event's team board, for the grouping. */
  teamOf: Record<string, { teamId: string; teamName: string }>
  hasTeamBoard: boolean
  /** The board's tee-teams answer — members may go out in separate slots. */
  teeTeamsSeparate: boolean
  /** The `edit_tee_sheet` permission — the field's right to edit. */
  fieldMayEdit: boolean
  /** For the inline organiser unlock; null when the event has no PIN. */
  passcodeHash?: string | null
}) {
  const [roundId, setRoundId] = useState<string | null>(rounds[0]?.id ?? null)
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  // The organiser's PIN unlock, read after mount — sessionStorage does not
  // exist on the server, and a render that reads it would tear hydration.
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const canEdit = fieldMayEdit || unlocked

  const round = rounds.find(r => r.id === roundId) ?? null
  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const teamMap = useMemo(
    () => new Map(Object.entries(teamOf)),
    [teamOf],
  )

  // This round's slots, in assignment order within each.
  const roundAssignments = useMemo(
    () => assignments.filter(a => a.round_id === roundId),
    [assignments, roundId],
  )
  const slots = useMemo(() => {
    const map = new Map<number, SlotPlayer[]>()
    for (const a of roundAssignments) {
      const name = nameOf.get(a.player_id)
      if (!name) continue
      const list = map.get(a.slot_index) ?? []
      list.push({ id: a.player_id, name })
      map.set(a.slot_index, list)
    }
    return map
  }, [roundAssignments, nameOf])

  const assignedIds = useMemo(
    () => new Set(roundAssignments.map(a => a.player_id)),
    [roundAssignments],
  )
  const unassigned = useMemo(
    () => players.filter(p => !assignedIds.has(p.id)),
    [players, assignedIds],
  )

  const maxAssigned = roundAssignments.reduce((m, a) => Math.max(m, a.slot_index), -1)
  const count = round ? slotCount(players.length, round.groupSize, maxAssigned) : 0

  function calmError(err: { message?: string } | null, doing: string) {
    setError(/relation|column|schema cache|does not exist/i.test(err?.message ?? '')
      ? `Could not ${doing} — a database update may not have been applied yet.`
      : `Could not ${doing} — try again`)
  }

  /**
   * One or several players into a slot — a solo, or a whole linked team.
   * One batch insert, one INSERT statement, so a race with another phone
   * books all of a team or none of it, never half.
   */
  async function addPlayers(slotIndex: number, playerIds: string[]) {
    if (!round) return
    setError(null)
    const next: Assignment[] = playerIds.map(id => ({
      round_id: round.id, player_id: id, slot_index: slotIndex,
    }))
    setAssignments(prev => [...prev, ...next])

    const { error: err } = await supabase
      .from('tee_assignments')
      .insert(next.map(a => ({ trip_id: tripId, ...a })))

    if (err) {
      const ids = new Set(playerIds)
      setAssignments(prev => prev.filter(a =>
        !(a.round_id === round.id && ids.has(a.player_id))))
      calmError(err, playerIds.length > 1 ? 'add the team' : 'add the player')
    }
  }

  /** One or several players out — a solo's ✕, or a linked block's. */
  async function removePlayers(playerIds: string[]) {
    if (!round) return
    setError(null)
    const ids = new Set(playerIds)
    const prev = assignments
    setAssignments(p => p.filter(a =>
      !(a.round_id === round.id && ids.has(a.player_id))))

    const { error: err } = await supabase
      .from('tee_assignments')
      .delete()
      .eq('trip_id', tripId)
      .eq('round_id', round.id)
      .in('player_id', playerIds)

    if (err) {
      setAssignments(prev)
      calmError(err, playerIds.length > 1 ? 'remove the team' : 'remove the player')
    }
  }

  // On a board whose teammates share a tee time, the picker offers linked
  // teams as one stuck-together card and never their members alone.
  const together = hasTeamBoard && !teeTeamsSeparate
  const units = pickerUnits(unassigned, teamMap, together)
    .filter(u => unitMatches(u, search))

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-1">
          Tee Sheet
        </h1>
        <p className="text-ink/65 text-sm mb-2">
          {canEdit
            ? 'Tap an open slot to put a name in it.'
            : 'Who goes off when. The organiser sets the groups.'}
        </p>

        {/* The reported bug, closed: an organiser whose session had not
            passed the PasscodeGate saw a read-only sheet with no way in.
            The unlock is offered here, in place — same PIN, same session
            memory as every other gate. */}
        {!canEdit && passcodeHash && (
          <div className="mb-4">
            <InlineUnlock
              tripCode={tripCode}
              passcodeHash={passcodeHash}
              onUnlocked={() => setUnlocked(true)}
            />
          </div>
        )}
        {canEdit && <div className="mb-3" /> }

        {/* The way to the pairings, when the event has them. Adding a team
            as one — tap a partner, book the pair — arrives with the teams
            machinery; the door to picking them is already this one. */}
        {hasTeamBoard && (
          <Link
            href={`/trip/${tripCode}/teams`}
            className="flex items-center gap-3 bg-surface border border-bark/12 rounded-2xl p-4 mb-5 press hover:border-bark/25"
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/[0.14] text-accent-deep flex items-center justify-center">
              <IconUsers size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-ink text-sm font-medium">Pick teams</span>
              <span className="block t-cap text-ink/65 mt-0.5">
                {teeTeamsSeparate
                  ? 'Teammates may go out in separate slots — every card feeds the board.'
                  : 'Partners share a tee time — teammates group together on the sheet.'}
              </span>
            </span>
          </Link>
        )}

        {/* One sheet per round; a one-round event skips the chips. */}
        {rounds.length > 1 && (
          <div className="-mx-4 px-4 overflow-x-auto mb-5">
            <div className="flex gap-2 w-max">
              {rounds.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setRoundId(r.id); setAdding(null); setSearch('') }}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-colors duration-150 ${
                    r.id === roundId
                      ? 'border-accent bg-accent/[0.10] text-ink'
                      : 'border-bark/12 bg-surface text-ink/80 hover:border-bark/25'
                  }`}
                >
                  <span className="block t-label">Round {r.roundNumber}</span>
                  {r.courseName && (
                    <span className="block t-cap text-ink/65 mt-0.5">{r.courseName}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {!round ? (
          <p className="t-cap text-ink/65 text-center py-8">
            No rounds yet — the sheet fills in once the event has golf.
          </p>
        ) : (
          <>
            {round.startTime === null && (
              <p className="t-cap text-ink/65 mb-3 leading-snug">
                No start time set — groups are numbered until the organiser
                sets one in the Starts section.
              </p>
            )}

            <ol className="bg-surface border border-bark/12 rounded-2xl divide-y divide-bark/12">
              {Array.from({ length: count }, (_, i) => {
                const slotPlayers = slots.get(i) ?? []
                const vacancy = Math.max(0, round.groupSize - slotPlayers.length)
                const clock = slotClock(round.startTime, i, round.intervalMins)
                const groups = groupSlot(slotPlayers, teamMap)
                const open = adding === i

                return (
                  <li key={i} className="px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      {/* Names on the left, stacked; a team is one block —
                          side by side at 2 or 3, a 2×2 grid at 4. */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        {slotPlayers.length === 0 && !canEdit && (
                          <span className="t-cap text-ink/50 py-0.5">Open</span>
                        )}

                        {groups.map((g, gi) => (
                          g.teamId ? (
                            /* A linked team is one thing: on a share-a-tee
                               board its ✕ takes the whole block out, because
                               stuck together cuts both ways. Separate-play
                               boards keep the per-name ✕. */
                            <div
                              key={g.teamId}
                              className="rounded-lg bg-accent/[0.06] border border-accent/20 px-2 py-1.5 flex items-start gap-1"
                            >
                              <div
                                className={`flex-1 min-w-0 ${
                                  g.players.length === 4
                                    ? 'grid grid-cols-2 gap-x-3 gap-y-0.5'
                                    : 'flex flex-wrap items-center gap-x-3 gap-y-0.5'
                                }`}
                              >
                                {g.players.map(p => (
                                  <span key={p.id} className="flex items-center gap-1 min-w-0">
                                    <span className="t-card text-ink truncate">{p.name}</span>
                                    {canEdit && !together && (
                                      <button
                                        type="button"
                                        onClick={() => removePlayers([p.id])}
                                        aria-label={`Remove ${p.name}`}
                                        className="flex-shrink-0 text-ink/50 hover:text-rust transition-colors p-0.5"
                                      >
                                        <IconX size={12} />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {canEdit && together && (
                                <button
                                  type="button"
                                  onClick={() => removePlayers(g.players.map(p => p.id))}
                                  aria-label={`Remove ${g.teamName}`}
                                  className="flex-shrink-0 text-ink/50 hover:text-rust transition-colors p-0.5"
                                >
                                  <IconX size={12} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div key={`solo-${gi}`} className="flex flex-col gap-0.5">
                              {g.players.map(p => (
                                <span key={p.id} className="flex items-center gap-1 min-w-0">
                                  <span className="t-card text-ink truncate">{p.name}</span>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => removePlayers([p.id])}
                                      aria-label={`Remove ${p.name}`}
                                      className="flex-shrink-0 text-ink/50 hover:text-rust transition-colors p-0.5"
                                    >
                                      <IconX size={12} />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )
                        ))}

                        {canEdit && vacancy > 0 && !open && (
                          <button
                            type="button"
                            onClick={() => { setAdding(i); setSearch('') }}
                            className="self-start flex items-center gap-1 t-cap text-accent-deep hover:text-accent transition-colors py-0.5"
                          >
                            <IconPlus size={12} />
                            Add player{vacancy > 1 ? ` · ${vacancy} open` : ''}
                          </button>
                        )}
                      </div>

                      {/* The time, on the right — tabular so a column of
                          them reads as a column. */}
                      <span className="flex-shrink-0 t-card text-ink/80 tabular-nums pt-0.5">
                        {clock ?? `Group ${i + 1}`}
                      </span>
                    </div>

                    {/* The picker: a filter and the unassigned field, the
                        course-select manner in miniature. Stays open while
                        the slot still has room, so a fourball is four taps. */}
                    {open && (
                      <div className="mt-2 rounded-xl border border-bark/12 bg-cream p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Find a player…"
                            className="flex-1 min-w-0 bg-surface border border-bark/12 rounded-lg px-3 py-2 text-ink text-sm placeholder:text-ink/50 focus:outline-none focus:border-accent/50 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setAdding(null)}
                            aria-label="Close"
                            className="flex-shrink-0 text-ink/50 hover:text-ink/80 transition-colors p-1.5"
                          >
                            <IconX size={14} />
                          </button>
                        </div>
                        {units.length === 0 ? (
                          <p className="t-cap text-ink/65 px-1 py-1.5">
                            {unassigned.length === 0
                              ? 'Everyone is on the sheet.'
                              : 'Nobody by that name still needs a time.'}
                          </p>
                        ) : (
                          <ul className="max-h-48 overflow-y-auto space-y-1">
                            {units.map(u => {
                              if (u.kind === 'solo') {
                                const p = u.player
                                return (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      disabled={vacancy === 0}
                                      onClick={() => {
                                        addPlayers(i, [p.id])
                                        if (vacancy <= 1) setAdding(null)
                                      }}
                                      className="w-full text-left px-2 py-2 rounded-lg text-ink text-sm hover:bg-bark/[0.06] transition-colors disabled:opacity-40"
                                    >
                                      {p.name}
                                      {!together && teamMap.get(p.id) && (
                                        <span className="t-cap text-ink/65 ml-2">
                                          {teamMap.get(p.id)!.teamName}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                )
                              }

                              // A linked team, offered as one stuck-together
                              // card — the same tinted block it becomes in
                              // the slot. Tapping books everyone in it.
                              const fits = u.players.length <= vacancy
                              return (
                                <li key={u.teamId}>
                                  <button
                                    type="button"
                                    disabled={!fits}
                                    onClick={() => {
                                      addPlayers(i, u.players.map(p => p.id))
                                      if (vacancy - u.players.length <= 0) setAdding(null)
                                    }}
                                    className="w-full text-left px-2 py-2 rounded-lg bg-accent/[0.06] border border-accent/20 transition-colors hover:border-accent/40 disabled:opacity-40"
                                  >
                                    <span className="block text-ink text-sm">
                                      {joinNames(u.players.map(p => firstName(p.name)))}
                                    </span>
                                    <span className="block t-cap text-ink/65 mt-0.5">
                                      {fits
                                        ? `${u.players.length === 2 ? 'Pair' : `Team of ${u.players.length}`} — added together`
                                        : `Needs ${u.players.length} spots`}
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>

            {error && (
              <p className="text-rust-deep text-sm mt-4 leading-snug">{error}</p>
            )}

            <p className="t-cap text-ink/65 mt-4 leading-snug">
              {round.intervalMins} minutes between groups, up to{' '}
              {round.groupSize === MAX_GROUP_SIZE ? 'four' : round.groupSize === 3 ? 'three' : 'two'}{' '}
              a slot — the organiser tunes both in the Starts section.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
