import { supabase } from '@/lib/supabase'
import { fetchTripKind } from '@/app/trip/[tripCode]/kind'
import { MAIN_SET } from '@/lib/teamSets'
import {
  type RunSetup, type RunPermissions,
  parseRunSetup, parseRunPermissions,
} from '@/lib/runChallenge'
import { type FinalResults, parseFinalResults } from '@/lib/runBoards'

/**
 * A run challenge, as both its pages need it — the hub and the organiser
 * area. One copy of the fetch, so the two cannot disagree about who is on
 * which team.
 *
 * Two rounds of queries, not one: the trip by code first (with the kind and
 * the setup columns asked separately, in parallel, so a database that has
 * not run migration 052 loses those and nothing else), then everything
 * scoped by the trip's id. Teams are the main sheet only — a run challenge
 * has no second sheet — and membership is read from `team_members`, never
 * the `players.team_id` mirror.
 */

export type RunMember = { id: string; name: string; claimed: boolean; isLead: boolean }
export type RunTeam = { id: string; name: string; color: string; members: RunMember[] }

export type RunChallenge = {
  id: string
  code: string
  name: string
  startDate: string | null
  endDate: string | null
  kind: string | null
  passcodeHash: string | null
  setup: RunSetup
  perms: RunPermissions
  teams: RunTeam[]
  /** Players on no team — should be nobody; shown so nobody vanishes. */
  unassigned: RunMember[]
  /** The frozen final team standings, once the challenge has closed (migration 055). */
  final: FinalResults | null
}

export async function fetchRunChallenge(tripCode: string): Promise<RunChallenge | null> {
  const [kind, tripRes, extrasRes, finalRes] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, name, trip_code, start_date, end_date, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
    supabase
      .from('trips')
      .select('run_setup, event_permissions')
      .eq('trip_code', tripCode)
      .single(),
    // Its own query: before migration 055 the column does not exist, and
    // naming it above would take the whole challenge down with it.
    supabase
      .from('trips')
      .select('run_results')
      .eq('trip_code', tripCode)
      .single(),
  ])

  const trip = tripRes.data
  if (!trip) {
    if (tripRes.error && tripRes.error.code !== 'PGRST116') {
      console.error('fetchRunChallenge trip query failed:', tripRes.error)
    }
    return null
  }
  const extras = (extrasRes.data ?? {}) as { run_setup?: unknown; event_permissions?: unknown }

  const [teamsRes, playersRes, membersRes] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, color, created_at')
      .eq('trip_id', trip.id)
      .eq('team_set', MAIN_SET)
      .order('created_at'),
    supabase
      .from('players')
      .select('id, name, claimed, is_lead, created_at')
      .eq('trip_id', trip.id)
      .order('created_at'),
    supabase
      .from('team_members')
      .select('team_id, player_id')
      .eq('trip_id', trip.id)
      .eq('team_set', MAIN_SET),
  ])
  for (const r of [teamsRes, playersRes, membersRes]) {
    if (r.error) console.error('fetchRunChallenge query failed:', r.error)
  }

  const teamOf = new Map<string, string>()
  for (const m of membersRes.data ?? []) teamOf.set(m.player_id, m.team_id)

  const members = (playersRes.data ?? []).map(p => ({
    id: p.id as string,
    name: p.name as string,
    claimed: p.claimed === true,
    isLead: p.is_lead === true,
    teamId: teamOf.get(p.id) ?? null,
  }))

  const toMember = (m: (typeof members)[number]): RunMember =>
    ({ id: m.id, name: m.name, claimed: m.claimed, isLead: m.isLead })

  const teams: RunTeam[] = (teamsRes.data ?? []).map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    members: members.filter(m => m.teamId === t.id).map(toMember),
  }))
  const teamIds = new Set(teams.map(t => t.id))

  return {
    id: trip.id,
    code: trip.trip_code,
    name: trip.name,
    startDate: trip.start_date ?? null,
    endDate: trip.end_date ?? null,
    kind,
    passcodeHash: trip.settings_passcode_hash ?? null,
    setup: parseRunSetup(extras.run_setup),
    perms: parseRunPermissions(extras.event_permissions),
    final: parseFinalResults((finalRes.data as { run_results?: unknown } | null)?.run_results),
    teams,
    unassigned: members
      .filter(m => !m.teamId || !teamIds.has(m.teamId))
      .map(toMember),
  }
}

export type RunRosterEntry = RunMember & { teamId: string | null }

/** Everyone in the challenge, flat, each with the team they run for (or none). */
export function rosterOf(c: RunChallenge): RunRosterEntry[] {
  return [
    ...c.teams.flatMap(t => t.members.map(m => ({ ...m, teamId: t.id }))),
    ...c.unassigned.map(m => ({ ...m, teamId: null })),
  ]
}
