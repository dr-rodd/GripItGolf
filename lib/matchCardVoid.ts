import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Voiding a match card — the only copy, for a knockout match's card and a
 * session match's alike (Ross, 10 Nov 2026).
 *
 * **A match's course and tees are fixed once its card has a score.** The
 * shots and the holes come off them, so changing either under a card in
 * play transplanted its raw scores onto another course's holes and kept it
 * on the same hole, as if nothing had happened. The way to change them is
 * to void the card — every score on it deleted, the match back to the 1st —
 * then change the course or tees, then start again.
 *
 * Refused once the match has a result: a finished card is reopened by the
 * organiser on the card itself, never voided from under the draw.
 */

export type CardKind = 'knockout' | 'session'

export type VoidResult = { ok: true } | { ok: false; reason: string }

const scoreTable = (kind: CardKind) => (kind === 'session' ? 'session_match_scores' : 'match_scores')

/**
 * Whether the match's card has anything on it. A failed count reads as
 * scored — the safer answer, since it only ever refuses a change.
 */
export async function cardHasScores(
  client: SupabaseClient, kind: CardKind, tripId: string, matchId: string,
): Promise<boolean> {
  const { count, error } = await client.from(scoreTable(kind))
    .select('match_id', { count: 'exact', head: true })
    .eq('trip_id', tripId).eq('match_id', matchId)
  return error ? true : (count ?? 0) > 0
}

/** Every score on the match's card deleted, and a knockout card's extra holes. */
export async function voidMatchCard(
  client: SupabaseClient, kind: CardKind, tripId: string, matchId: string,
): Promise<VoidResult> {
  // A result in already: not this door's to undo.
  const decided = kind === 'session'
    ? await client.from('session_matches').select('result').eq('trip_id', tripId).eq('id', matchId).maybeSingle()
    : await client.from('matchplay_matches').select('winner_player_id, winner_team_id').eq('trip_id', tripId).eq('id', matchId).maybeSingle()
  if (decided.error || !decided.data) return { ok: false, reason: 'Could not void the card — try again' }
  const row = decided.data as { result?: string | null; winner_player_id?: string | null; winner_team_id?: string | null }
  if (row.result || row.winner_player_id || row.winner_team_id) {
    return { ok: false, reason: 'This match has a result — the organiser reopens it on the card.' }
  }

  const scores = await client.from(scoreTable(kind)).delete().eq('trip_id', tripId).eq('match_id', matchId)
  if (scores.error) return { ok: false, reason: 'Could not void the card — try again' }

  if (kind === 'knockout') {
    // Older cards' conceded holes, and where each extra hole was played off.
    const conceded = await client.from('match_concessions').delete().eq('trip_id', tripId).eq('match_id', matchId)
    if (conceded.error) return { ok: false, reason: 'Could not void the card — try again' }
    // Fail-soft: before migration 061 there is no plan to clear.
    await client.from('matchplay_matches').update({ extra_holes: {} }).eq('trip_id', tripId).eq('id', matchId)
  }
  return { ok: true }
}
