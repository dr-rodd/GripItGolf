import { supabase } from '@/lib/supabase'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { MAIN_SET, membersOf, setOf, teamFor } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { drawDeadlines, parseBracketSetup } from '@/lib/bracketSetup'
import type { PortalMatch } from '@/lib/knockoutPortal'
import { commonColour } from '@/lib/matchSides'
import { picksFrom, playerColourOf } from '@/lib/playerColours'

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
  /**
   * Side id → the colour it plays in, where every player in it has the
   * same one: their tag's, or on an event without tags their own pick
   * (lib/playerColours.ts). lib/matchSides.ts decides how a match wears
   * them, or red and blue.
   */
  colours: Record<string, string>
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

  const [matchesRes, memberships, teamsRes, picksRes] = await Promise.all([
    supabase.from('matchplay_matches')
      .select('id, round_number, round_name, slot, player_a_id, player_b_id, ' +
              'player_a_is_bye, player_b_is_bye, team_a_id, team_b_id, ' +
              'winner_player_id, winner_team_id, result, entrant_type')
      .eq('trip_id', trip.id)
      .order('round_number').order('slot'),
    fetchMemberships(trip.id),
    supabase.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id),
    // The players' own colours, on their own and fail-soft (migration 063).
    supabase.from('players').select('id, colour').eq('trip_id', trip.id),
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
  const teamRows = (teamsRes.data ?? []) as
    { id: string; name: string; color?: string | null; team_set?: string | null }[]
  if (pairs) {
    for (const t of teamRows) {
      names[t.id] = t.name
      members[t.id] = membersOf(memberships, t.id)
    }
  } else {
    for (const p of players) { names[p.id] = p.name; members[p.id] = [p.id] }
  }

  // A side's colour: the one every player in it has — the tag (a team on
  // the main sheet), or each player's own pick where there are no tags.
  const colourOf = playerColourOf(
    teamRows, memberships,
    picksFrom(picksRes.data as { id: string; colour?: string | null }[] | null),
  )
  const colours: Record<string, string> = {}
  for (const [side, ids] of Object.entries(members)) {
    const c = commonColour(ids.map(colourOf))
    if (c) colours[side] = c
  }

  const drawnRounds = new Set(matches.map(m => m.roundNumber)).size
  return {
    matches,
    entrantId: !meId ? null : pairs ? teamFor(memberships, meId, setOf(draw) || MAIN_SET) : meId,
    names,
    members,
    deadlines: drawDeadlines(parseBracketSetup(rawSetup)?.deadlines ?? [], drawnRounds),
    pairs,
    colours,
  }
}
