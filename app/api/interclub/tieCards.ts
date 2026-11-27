import { makeEventReader, type Reads } from '@/lib/eventReader'
import { parseLeaderboards } from '@/lib/leaderboards'
import { fetchMemberships } from '@/lib/teamMembers'
import type { SessionMatchResult } from '@/lib/sessions'
import { readSessionCards, readSessionMatchRows } from '@/app/golf/[root]/[tripCode]/session/sessionMatches'

/**
 * A tie's session matches with where each stands (D363) — read through the
 * event's own reader (lib/eventReader.ts) and its own session reader, so the
 * stream reads a match exactly as the leaderboard does, marks and all.
 */
export async function readTieCards(code: string, tripId: string, admin: Reads): Promise<SessionMatchResult[]> {
  const db = makeEventReader(code, admin)
  const [trip, playersRes, teamsRes, memberships, rows] = await Promise.all([
    db.from('trips').select('id, leaderboards').eq('trip_code', code).maybeSingle(),
    db.from('players').select('id, name, handicap, gender').eq('trip_id', tripId).eq('is_composite', false),
    db.from('teams').select('id, name').eq('trip_id', tripId),
    fetchMemberships(tripId, db),
    readSessionMatchRows(db, tripId),
  ])
  if (trip.error) throw trip.error
  const boards = parseLeaderboards((trip.data as { leaderboards: unknown } | null)?.leaderboards)
  const players = (playersRes.data ?? []) as { id: string; name: string; handicap: number | null; gender: string }[]
  const teams = (teamsRes.data ?? []) as { id: string; name: string }[]
  return (await readSessionCards(db, { id: tripId }, boards, players, { teams, memberships }, rows)).results
}
