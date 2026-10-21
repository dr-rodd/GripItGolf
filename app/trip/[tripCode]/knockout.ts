import { supabase } from '@/lib/supabase'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { MAIN_SET, membersOf, setOf, teamFor } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { drawDeadlines, parseBracketSetup } from '@/lib/bracketSetup'
import type { PortalMatch } from '@/lib/knockoutPortal'

/**
 * A knockout as one player's screens read it — the hub's next-match card,
 * the Scoring tab's portal and a match's own page (docs/event-use-cases.md,
 * story 2). Fetching only; lib/knockoutPortal.ts decides.
 *
 * Singles and pairs come back in one shape: a pairs draw's sides are moved
 * across from the team columns, its entrant is this player's pairing on
 * the draw's own sheet, and `members` says who plays for each side. Null
 * when the trip runs no knockout; on a failed read, an empty draw and the
 * error logged — a screen without the draw still stands.
 */
export type KnockoutView = {
  matches: PortalMatch[]
  /** This phone's side in the draw — the player, or their pairing. */
  entrantId: string | null
  /** Side id → its name: a player's, or a pairing's. */
  names: Record<string, string>
  /** Side id → the players in it: one for a single, two for a pairing. */
  members: Record<string, string[]>
  /** The date each drawn round is played by, in round order. */
  deadlines: (string | null)[]
  pairs: boolean
}

type Row = {
  id: string; round_number: number; round_name: string; slot: number
  player_a_id: string | null; player_b_id: string | null
  player_a_is_bye: boolean; player_b_is_bye: boolean
  team_a_id?: string | null; team_b_id?: string | null
  winner_player_id: string | null; winner_team_id?: string | null
  result: string | null; entrant_type?: string | null
}

export async function readKnockout(
  trip: { id: string; leaderboards?: unknown; formats?: unknown; team_scoring?: unknown },
  /** `trips.bracket_setup` as the caller read it — fail-soft, its own query. */
  rawSetup: unknown,
  meId: string | null,
  players: readonly { id: string; name: string }[],
): Promise<KnockoutView | null> {
  const draw = boardsForTrip({
    leaderboards: trip.leaderboards, formats: trip.formats, team_scoring: trip.team_scoring,
  }).find(lb => lb.competition === 'matchplay')
  if (!draw) return null

  const [matchesRes, memberships, teamsRes] = await Promise.all([
    supabase.from('matchplay_matches')
      .select('id, round_number, round_name, slot, player_a_id, player_b_id, ' +
              'player_a_is_bye, player_b_is_bye, team_a_id, team_b_id, ' +
              'winner_player_id, winner_team_id, result, entrant_type')
      .eq('trip_id', trip.id)
      .order('round_number').order('slot'),
    fetchMemberships(trip.id),
    supabase.from('teams').select('id, name').eq('trip_id', trip.id),
  ])
  if (matchesRes.error) console.error('readKnockout matches query failed:', matchesRes.error)
  const rows = (matchesRes.data ?? []) as unknown as Row[]

  // The draw itself says what it is between, as on the bracket page.
  const pairs = rows.some(m => m.entrant_type === 'pair')
  const matches: PortalMatch[] = rows.map(m => ({
    id: m.id,
    roundNumber: m.round_number,
    roundName: m.round_name,
    slot: m.slot,
    sideA: pairs ? m.team_a_id ?? null : m.player_a_id,
    sideB: pairs ? m.team_b_id ?? null : m.player_b_id,
    aIsBye: m.player_a_is_bye,
    bIsBye: m.player_b_is_bye,
    winner: pairs ? m.winner_team_id ?? null : m.winner_player_id,
    result: m.result,
  }))

  const names: Record<string, string> = {}
  const members: Record<string, string[]> = {}
  if (pairs) {
    for (const t of (teamsRes.data ?? []) as { id: string; name: string }[]) {
      names[t.id] = t.name
      members[t.id] = membersOf(memberships, t.id)
    }
  } else {
    for (const p of players) { names[p.id] = p.name; members[p.id] = [p.id] }
  }

  const drawnRounds = new Set(matches.map(m => m.roundNumber)).size
  return {
    matches,
    entrantId: !meId ? null : pairs ? teamFor(memberships, meId, setOf(draw) || MAIN_SET) : meId,
    names,
    members,
    deadlines: drawDeadlines(parseBracketSetup(rawSetup)?.deadlines ?? [], drawnRounds),
    pairs,
  }
}
