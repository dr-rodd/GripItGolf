// Taking a scorecard back out of the trip.
//
// Voiding a card released its players, closed the session and left every score
// on it exactly where it was. So "void" meant "you may re-enter this round",
// and the round it was supposed to undo carried on standing on the leaderboard
// as though the card had been signed.
//
// The scores live in two tables and both have to go:
//
//   · `live_scores` — every hole is written here as it is entered, so a card
//     voided halfway through has real rows in it. The trip leaderboard merges
//     that table in by round so the board moves during play, and it has no
//     idea a lock was released — the rows simply stay on the board for good.
//   · `scores` — a card that was finalised before being voided has committed
//     rows too, and the settings screen offers Void on finalised cards.
//
// `round_handicaps` is deliberately left alone. It is a snapshot, not a score:
// nothing appears on a leaderboard because of it, `finalise()` writes one for
// every player of every round anyway, and starting a new card overwrites it.
// Removing it could only make a later fallback worse.
//
// Scoped to the players who were actually on the card, never to the round: two
// groups can be out on the same round at once, and voiding one of them must
// not touch the other's scores.
//
// I/O. The caller reports the failure — see lib/writeFailure.ts.

import { supabase } from './supabase'
import { failed, type WriteFailure } from './writeFailure'

/**
 * Who is on this scorecard.
 *
 * Read before anything is deleted: the locks are what say who was on it, and
 * every void removes them. Reading afterwards returns nobody, which is what
 * made this look like it worked — a delete scoped to an empty list of players
 * deletes nothing at all and reports no error.
 */
export async function playersOnScorecard(
  liveRoundId: string,
): Promise<{ playerIds: string[]; failure: WriteFailure | null }> {
  const { data, error } = await supabase
    .from('live_player_locks')
    .select('player_id')
    .eq('live_round_id', liveRoundId)
  return {
    playerIds: (data ?? []).map(l => l.player_id as string),
    failure: failed('reading who was on the scorecard', error),
  }
}

/**
 * Erase these players' scores for this round, live and committed alike.
 *
 * Returns the first failure rather than throwing, so a caller can say which
 * step refused it. An empty `playerIds` is a no-op and not an error: a card
 * nobody was ever locked into has nothing to erase.
 */
export async function eraseScores(
  roundId: string,
  playerIds: readonly string[],
): Promise<WriteFailure | null> {
  if (playerIds.length === 0) return null

  const live = await supabase
    .from('live_scores')
    .delete()
    .eq('round_id', roundId)
    .in('player_id', playerIds as string[])
  const liveFailure = failed('deleting the in-progress scores', live.error)
  if (liveFailure) return liveFailure

  const committed = await supabase
    .from('scores')
    .delete()
    .eq('round_id', roundId)
    .in('player_id', playerIds as string[])
  return failed('deleting the committed scores', committed.error)
}

/**
 * Void one scorecard: erase its scores, release its players, close it.
 *
 * In that order. The locks say who was on the card, so they are the last thing
 * to go — release them first and there is no longer any record of whose scores
 * to erase.
 */
export async function voidScorecard(
  liveRoundId: string,
  roundId: string,
): Promise<WriteFailure | null> {
  const { playerIds, failure } = await playersOnScorecard(liveRoundId)
  if (failure) return failure

  const erased = await eraseScores(roundId, playerIds)
  if (erased) return erased

  const locks = await supabase
    .from('live_player_locks')
    .delete()
    .eq('live_round_id', liveRoundId)
  const lockFailure = failed('releasing the players', locks.error)
  if (lockFailure) return lockFailure

  const closed = await supabase
    .from('live_rounds')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', liveRoundId)
  return failed('closing the scorecard', closed.error)
}

/**
 * Take one player off a scorecard, taking their round with them.
 *
 * The same rule as voiding the whole card, for one person: they are off the
 * card, so the round they had started must not keep standing on the board.
 * Unfinalising is the opposite operation and deliberately keeps the scores —
 * it reopens the card rather than undoing it.
 */
export async function removePlayerFromScorecard(
  liveRoundId: string,
  roundId: string,
  playerId: string,
): Promise<WriteFailure | null> {
  const erased = await eraseScores(roundId, [playerId])
  if (erased) return erased

  const locks = await supabase
    .from('live_player_locks')
    .delete()
    .eq('live_round_id', liveRoundId)
    .eq('player_id', playerId)
  return failed('releasing the player', locks.error)
}
