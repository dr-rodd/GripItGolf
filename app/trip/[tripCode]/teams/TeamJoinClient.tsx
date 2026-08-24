'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Leaderboard } from '@/lib/leaderboards'
import { teamSizeLimit, teamNoun } from '@/lib/teamLimits'
import { type Membership, membersOf, teamSheet } from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'
import { joinNames, firstName } from '@/lib/matchplayEntrants'
import { PRESET_COLORS } from './TripTeamsClient'

/**
 * Players picking their own teams — the join side of the teams screen.
 *
 * Shown on an event whose team board says `teamPick: 'self'`: the organiser
 * set the criteria (a team size), and the field does the forming. No drag,
 * no counts, no sheets — a claimed player starts a team or joins one with
 * room, and leaves again if plans change. One team per player (the sheet's
 * unique constraint), size capped by `teamSizeLimit` — the same one copy
 * the organiser's editor enforces.
 *
 * A team is named from its members — "Ross & Dave" — recomputed after every
 * join and leave. The stored name follows along (best-effort) so the
 * leaderboard reads the same thing; on screen the name always derives from
 * whoever is actually in it.
 *
 * Identity is the claim cookie (lib/currentPlayer.ts): personalises, never
 * authorises, like everywhere. A device that has claimed nobody is pointed
 * at the players screen first.
 */

type Player = { id: string; name: string }
type Team = { id: string; name: string; color: string; team_set: string | null }

export default function TeamJoinClient({
  tripId, tripCode, boards, teams: initialTeams, players, memberships: initialMemberships,
  viewerPlayerId,
}: {
  tripId: string
  tripCode: string
  boards: Leaderboard[]
  teams: Team[]
  players: Player[]
  memberships: Membership[]
  /** The claimed player this device carries, or null for a stranger. */
  viewerPlayerId: string | null
}) {
  // The self-pick board decides the sheet the field is forming. One team
  // board per event for now; the first self-pick one is the one.
  const board = boards.find(b => b.audience === 'team' && b.teamPick === 'self') ?? null
  const sheet = board?.teamSet ?? 'main'
  // Every board weighs in — the one copy of the cap, pairs draws included.
  const cap = teamSizeLimit(boards)
  const noun = teamNoun(boards)

  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [memberships, setMemberships] = useState<Membership[]>(initialMemberships)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const sheetTeams = teams.filter(t => teamSheet(t) === sheet)
  const viewer = players.find(p => p.id === viewerPlayerId) ?? null
  const myTeamId = viewer
    ? memberships.find(m => m.team_set === sheet && m.player_id === viewer.id)?.team_id ?? null
    : null

  /** "Ross & Dave" from whoever is in the team right now. */
  function displayName(teamId: string): string {
    const names = membersOf(memberships, teamId)
      .map(id => nameOf.get(id))
      .filter((n): n is string => !!n)
    return names.length > 0
      ? joinNames(names.map(firstName))
      : teams.find(t => t.id === teamId)?.name ?? 'New team'
  }

  /**
   * Keep the stored name in step with the members, best-effort — the screen
   * derives, the database follows, and a failed rename costs nothing the
   * next join won't fix.
   */
  async function refreshStoredName(teamId: string, ms: Membership[]) {
    const names = ms
      .filter(m => m.team_set === sheet && m.team_id === teamId)
      .map(m => nameOf.get(m.player_id))
      .filter((n): n is string => !!n)
    if (names.length === 0) return
    await supabase
      .from('teams')
      .update({ name: joinNames(names.map(firstName)) })
      .eq('id', teamId)
      .eq('trip_id', tripId)
  }

  async function join(teamId: string) {
    if (!viewer || busy) return
    setBusy(true)
    setError(null)
    const prev = memberships
    const next = [
      ...memberships.filter(m => !(m.team_set === sheet && m.player_id === viewer.id)),
      { team_id: teamId, team_set: sheet, player_id: viewer.id },
    ]
    setMemberships(next)

    const failure = await setTeam(tripId, viewer.id, sheet, teamId)
    if (failure) {
      setMemberships(prev)
      setError('Could not join — try again')
    } else {
      await refreshStoredName(teamId, next)
      if (myTeamId && myTeamId !== teamId) await refreshStoredName(myTeamId, next)
    }
    setBusy(false)
  }

  async function leave() {
    if (!viewer || !myTeamId || busy) return
    setBusy(true)
    setError(null)
    const prev = memberships
    const next = memberships.filter(m => !(m.team_set === sheet && m.player_id === viewer.id))
    setMemberships(next)

    const failure = await setTeam(tripId, viewer.id, sheet, null)
    if (failure) {
      setMemberships(prev)
      setError('Could not leave — try again')
    } else {
      await refreshStoredName(myTeamId, next)
    }
    setBusy(false)
  }

  async function startTeam() {
    if (!viewer || busy) return
    setBusy(true)
    setError(null)

    const { data: made, error: err } = await supabase
      .from('teams')
      .insert({
        trip_id: tripId,
        team_set: sheet,
        name: firstName(viewer.name),
        color: PRESET_COLORS[sheetTeams.length % PRESET_COLORS.length],
      })
      .select('id, name, color, team_set')
      .single()

    if (err || !made) {
      setError(`Could not start a ${noun.one} — try again`)
      setBusy(false)
      return
    }
    setTeams(prev => [...prev, made as Team])
    setBusy(false)
    await join((made as Team).id)
  }

  if (!board) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink/65 text-sm leading-snug">
        {cap
          ? `${noun.Many} of ${cap} — start one, or join one with room.`
          : `Start a ${noun.one}, or join one.`}
      </p>

      {!viewer && (
        <div className="bg-surface border border-bark/12 rounded-2xl p-4">
          <p className="text-ink text-sm font-medium">First, say who you are.</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            Claim your name on the players screen, then come back and pick
            your {noun.one}.
          </p>
          <Link
            href={`/trip/${tripCode}/players`}
            className="inline-block mt-3 t-label text-accent-deep hover:text-accent transition-colors"
          >
            Claim your name →
          </Link>
        </div>
      )}

      {sheetTeams.length === 0 && (
        <p className="t-cap text-ink/65 text-center py-4">
          No {noun.many} yet — somebody has to be first.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {sheetTeams.map(team => {
          const members = membersOf(memberships, team.id)
          const mine = team.id === myTeamId
          const room = cap ? Math.max(0, cap - members.length) : null
          const full = room === 0

          return (
            <li
              key={team.id}
              className={`bg-surface border rounded-2xl p-4 ${
                mine ? 'border-accent/40' : 'border-bark/12'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-ink text-sm font-medium">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="truncate">{displayName(team.id)}</span>
                    {mine && <span className="t-cap text-accent-deep flex-shrink-0">Your {noun.one}</span>}
                  </p>
                  <p className="t-cap text-ink/65 mt-1 leading-snug">
                    {members.length === 0
                      ? 'Nobody yet'
                      : members.map(id => nameOf.get(id)).filter(Boolean).join(' · ')}
                    {room !== null && !full &&
                      ` — ${room} spot${room === 1 ? '' : 's'} open`}
                    {full && ' — full'}
                  </p>
                </div>

                {viewer && (
                  mine ? (
                    <button
                      type="button"
                      onClick={leave}
                      disabled={busy}
                      className="flex-shrink-0 px-4 py-2 rounded-lg border border-bark/25 text-ink/80 text-sm hover:border-bark/40 transition-colors disabled:opacity-40"
                    >
                      Leave
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => join(team.id)}
                      disabled={busy || full}
                      className="flex-shrink-0 px-4 py-2 rounded-lg bg-accent-deep text-white text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      Join
                    </button>
                  )
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {viewer && (
        <button
          type="button"
          onClick={startTeam}
          disabled={busy}
          className="w-full py-4 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/25 hover:text-ink/80 transition-colors disabled:opacity-40"
        >
          + Start a {noun.one}
        </button>
      )}

      {error && (
        <p className="text-rust-deep text-sm leading-snug">{error}</p>
      )}
    </div>
  )
}
