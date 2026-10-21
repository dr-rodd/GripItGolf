// Writing a knockout's draw — the one writer, for the browser (the creation
// form, the organiser's draw page) and the server (the nightly dated draw)
// alike, each handing in its own Supabase client. lib/bracketDraw.ts decides
// what the draw is; lib/matchplay.ts `bracketFromSlots` builds the tree; this
// only refuses a draw already in play and swaps the rows.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  bracketFromSlots, bracketToRows, rowsInInsertOrder, MatchplayError, type BracketPlayer,
} from './matchplay'
import { toRow, type StoredMatch } from './matchplayStore'
import { drawInPlay, type DrawPlan } from './bracketDraw'
import type { EntrantKind } from './matchplayEntrants'

export type DrawState = { drawn: boolean; inPlay: boolean }

/** Whether this event has a draw, and whether it has started. */
export async function readDrawState(client: SupabaseClient, tripId: string): Promise<DrawState> {
  const [matchesRes, cardsRes] = await Promise.all([
    client.from('matchplay_matches')
      .select('winner_player_id, winner_team_id, player_a_is_bye, player_b_is_bye')
      .eq('trip_id', tripId),
    // Before migration 058 there are no cards — nothing has been entered.
    client.from('match_scores').select('match_id', { count: 'exact', head: true }).eq('trip_id', tripId),
  ])
  if (matchesRes.error) throw new MatchplayError('Could not read the draw — try again.')
  const rows = (matchesRes.data ?? []) as {
    winner_player_id: string | null; winner_team_id: string | null
    player_a_is_bye: boolean; player_b_is_bye: boolean
  }[]
  return {
    drawn: rows.length > 0,
    inPlay: drawInPlay(
      rows.map(r => ({ winner: r.winner_player_id ?? r.winner_team_id, aIsBye: r.player_a_is_bye, bIsBye: r.player_b_is_bye })),
      cardsRes.error ? 0 : cardsRes.count ?? 0,
    ),
  }
}

/**
 * Put a draw in, replacing any not yet in play. `slots` is the first round,
 * place by place (null a bye); `seeds` labels them for a seeded draw.
 */
export async function writeDraw(
  client: SupabaseClient,
  tripId: string,
  slots: readonly (BracketPlayer | null)[],
  opts: { seeds?: readonly (number | null)[] | null; kind?: EntrantKind } = {},
): Promise<void> {
  const state = await readDrawState(client, tripId)
  if (state.inPlay) {
    throw new MatchplayError('The draw is in play — a match has a result or a card has scores, so it cannot be redrawn here.')
  }
  const matches = bracketFromSlots(slots, { seeds: opts.seeds ?? undefined })
  const kind = opts.kind ?? 'player'
  const rows = rowsInInsertOrder(bracketToRows(tripId, matches))
    .map(r => toRow({ ...r, entrant_type: kind } as StoredMatch))

  if (state.drawn) {
    const { error } = await client.from('matchplay_matches').delete().eq('trip_id', tripId)
    if (error) throw new MatchplayError('Could not clear the old draw — try again.')
  }
  // next_match_id is a self-reference; the rows are ordered so every target
  // is written before the matches pointing at it (lib/matchplay.ts).
  const { error } = await client.from('matchplay_matches').insert(rows)
  if (error) throw new MatchplayError('Could not save the draw — try again.')
}

/**
 * Plan the draw — or take the plan off with null — merged into whatever
 * `bracket_setup` holds now, read fresh, so the rest of the setup is never
 * written back from a stale copy.
 */
export async function saveDrawPlan(client: SupabaseClient, tripId: string, plan: DrawPlan | null): Promise<void> {
  const { data, error } = await client.from('trips').select('bracket_setup').eq('id', tripId).single()
  if (error) throw new MatchplayError('Could not read the event — try again.')
  const raw = (data as { bracket_setup?: unknown } | null)?.bracket_setup
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  if (plan) base.draw = plan
  else delete base.draw
  const { error: err } = await client.from('trips').update({ bracket_setup: base }).eq('id', tripId)
  if (err) throw new MatchplayError('Could not save when the draw is made — try again.')
}
