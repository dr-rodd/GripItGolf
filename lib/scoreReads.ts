import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllRows, type AllRows } from './allRows'

/**
 * A trip's golf rows, read whole — the three tables that grow with every
 * hole played, and the only way the trip-wide screens read them.
 *
 * `scores`, `live_scores` and `round_handicaps` are each one row per player
 * per round (or per hole), so a trip passes Supabase's 1,000-row cap at
 * about fifty-six player-rounds: fourteen players over four rounds, or a
 * twenty-strong weekly league by its third week. Each reader here goes
 * through `readAllRows` with its table's own order and key — the columns of
 * that table's UNIQUE constraint, which are always among those selected and
 * which an index already holds in that order — so no caller has to know
 * either, and none can get them wrong.
 *
 * `cols` is the caller's own column list, unchanged; it must include the
 * key's columns, which every reader already asks for. Works with either
 * client: the pages read on the anon key, the browser's in-play board too.
 */

type Client = SupabaseClient

/** Committed scores for these rounds. UNIQUE (round_id, player_id, hole_id). */
export function readScores<T extends { round_id: string; player_id: string; hole_id: string }>(
  client: Client, cols: string, roundIds: string[],
): Promise<AllRows<T>> {
  return readAllRows<T>(
    () => client.from('scores').select(cols, { count: 'exact' })
      .in('round_id', roundIds)
      .order('round_id').order('player_id').order('hole_id'),
    r => `${r.round_id}|${r.player_id}|${r.hole_id}`,
  )
}

/** In-progress scores for these rounds. UNIQUE (player_id, round_id, hole_number). */
export function readLiveScores<T extends { player_id: string; round_id: string; hole_number: number }>(
  client: Client, cols: string, roundIds: string[],
): Promise<AllRows<T>> {
  return readAllRows<T>(
    () => client.from('live_scores').select(cols, { count: 'exact' })
      .in('round_id', roundIds)
      .order('player_id').order('round_id').order('hole_number'),
    r => `${r.player_id}|${r.round_id}|${r.hole_number}`,
  )
}

/** The per-round handicap snapshots for these rounds. UNIQUE (round_id, player_id). */
export function readRoundHandicaps<T extends { round_id: string; player_id: string }>(
  client: Client, cols: string, roundIds: string[],
): Promise<AllRows<T>> {
  return readAllRows<T>(
    () => client.from('round_handicaps').select(cols, { count: 'exact' })
      .in('round_id', roundIds)
      .order('round_id').order('player_id'),
    r => `${r.round_id}|${r.player_id}`,
  )
}

/**
 * Which of these rounds have a committed score — counted, never fetched,
 * the Scoring tab's way: one header-only request per round, together. The
 * question is yes or no per round, and reading every score to answer it is
 * both the slow way and, past 1,000 rows, the wrong one — a played round
 * missed here would offer its course up for changing under real scores.
 *
 * A round whose count fails is answered *scored*, and the error returned
 * beside it: wrongly locking a round costs a refresh, wrongly unlocking one
 * can orphan a card.
 */
export async function roundsWithScores(
  client: Client, roundIds: string[],
): Promise<{ data: Set<string>; error: { message: string } | null }> {
  const answers = await Promise.all(roundIds.map(async id => {
    const { count, error } = await client.from('scores')
      .select('round_id', { count: 'exact', head: true })
      .eq('round_id', id)
    return { id, has: error ? true : (count ?? 0) > 0, error }
  }))
  return {
    data: new Set(answers.filter(a => a.has).map(a => a.id)),
    error: answers.find(a => a.error)?.error ?? null,
  }
}
