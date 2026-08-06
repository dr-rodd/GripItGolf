// The handicap snapshot a player carries into each round.
//
// `round_handicaps` is written at three moments: when a trip is created, when
// a handicap is edited in settings, and — since a player can add themselves
// to a trip whose rounds already exist — when somebody joins late. The last
// one was missing, which meant a late joiner had no row for the rounds that
// were already there and scored off nothing.
//
// The rule this writes is the one trip settings has always written, lifted
// out of it rather than restated: **what goes in is the handicap INDEX,
// rounded.** No tee exists at this point on most trips, and with slope 113
// and CR = Par the WHS course handicap collapses to the index. Anything that
// holds a real tee computes from the tee instead of trusting this snapshot —
// see `lib/courseHandicap.ts`, which is the only copy of that sum.

import { supabase } from './supabase'

/** One row per round for this player. Pure — no I/O. */
export function handicapRows(
  roundIds: string[],
  playerId: string,
  handicap: number,
) {
  return roundIds.map(roundId => ({
    round_id: roundId,
    player_id: playerId,
    // Rounded, and a plus handicap rounds towards zero the same way: it is
    // stored negative, and -1.4 rounds to -1.
    playing_handicap: Math.round(handicap),
  }))
}

/**
 * Write them, replacing any that are already there.
 *
 * Upsert rather than insert, so a handicap edit and a fresh join both go
 * through the same call. Returns the error, or null.
 */
export async function syncRoundHandicaps(
  roundIds: string[],
  playerId: string,
  handicap: number,
) {
  if (roundIds.length === 0) return null
  const { error } = await supabase
    .from('round_handicaps')
    .upsert(handicapRows(roundIds, playerId, handicap), {
      onConflict: 'round_id,player_id',
    })
  return error
}
