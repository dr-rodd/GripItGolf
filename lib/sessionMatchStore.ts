/**
 * Setting a session's matches — the one writer of `session_matches` sides
 * (migration 067; lib/sessions.ts holds the rules). The order of play and a
 * Matches session's tee sheet both come through here.
 *
 * **Every change is a compare-and-set** on the row's `updated_at`: read the
 * match, change one side, write only where it still reads as it did. Two
 * phones putting players into one match at once interleave — the second
 * re-reads and tries again — rather than one quietly overwriting the other.
 * A match whose card has a score keeps its players unless the organiser
 * says otherwise (D-brief 5.2).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseLeaderboards } from './leaderboards'
import { withSessionSlots } from './sessions'

type Side = 'a' | 'b'
type Row = { id: string; side_a: string[]; side_b: string[]; updated_at: string; result: string | null }

const TRIES = 3

/** Why a change cannot be saved, or null when it was. */
export type StoreResult = { ok: true } | { ok: false; reason: string }

async function read(client: SupabaseClient, tripId: string, roundId: string, slot: number): Promise<Row | null | 'error'> {
  const { data, error } = await client.from('session_matches')
    .select('id, side_a, side_b, updated_at, result')
    .eq('trip_id', tripId).eq('round_id', roundId).eq('slot', slot).maybeSingle()
  if (error) return 'error'
  return (data as Row | null) ?? null
}

async function hasScores(client: SupabaseClient, tripId: string, matchId: string): Promise<boolean> {
  const { count, error } = await client.from('session_match_scores')
    .select('hole_number', { count: 'exact', head: true }).eq('trip_id', tripId).eq('match_id', matchId)
  // Unknown is treated as scored: the safer refusal.
  return error ? true : (count ?? 0) > 0
}

/**
 * Change one side of a match: `next` replaces the side's players. Makes the
 * match the first time anybody is put in it.
 */
export async function setMatchSide(
  client: SupabaseClient,
  opts: {
    tripId: string; roundId: string; slot: number; side: Side; next: string[]; organiser: boolean
    /** A tee-sheet round: the players' tee times follow their match (`mirrorTeeTimes`). */
    teeSheet?: boolean
  },
): Promise<StoreResult> {
  const result = await writeSide(client, opts)
  if (result.ok && opts.teeSheet) await mirrorTeeTimes(client, opts.tripId, opts.roundId)
  return result
}

/**
 * A Matches session's tee sheet is its matches, so each player's tee time
 * is their match's (slot i is tee time i) — written into `tee_assignments`
 * so everything that reads a tee time (the home screen's "your time", the
 * hub module) reads it as it always has. Best effort: a match is saved
 * whether or not this lands, and the next change puts it right.
 */
export async function mirrorTeeTimes(client: SupabaseClient, tripId: string, roundId: string): Promise<void> {
  const { data, error } = await client.from('session_matches')
    .select('slot, side_a, side_b').eq('trip_id', tripId).eq('round_id', roundId)
  if (error) return
  const wanted = new Map<string, number>()
  for (const m of (data ?? []) as { slot: number; side_a: string[]; side_b: string[] }[]) {
    for (const pid of [...m.side_a, ...m.side_b]) wanted.set(pid, m.slot)
  }
  const { data: had } = await client.from('tee_assignments')
    .select('player_id, slot_index').eq('trip_id', tripId).eq('round_id', roundId)
  const gone = ((had ?? []) as { player_id: string; slot_index: number }[])
    .filter(a => !wanted.has(a.player_id)).map(a => a.player_id)
  if (gone.length) await client.from('tee_assignments').delete().eq('trip_id', tripId).eq('round_id', roundId).in('player_id', gone)
  const rows = [...wanted].filter(([, slot]) => slot < 64)
    .map(([player_id, slot_index]) => ({ trip_id: tripId, round_id: roundId, player_id, slot_index }))
  if (rows.length) await client.from('tee_assignments').upsert(rows, { onConflict: 'round_id,player_id' })
}

async function writeSide(
  client: SupabaseClient,
  opts: { tripId: string; roundId: string; slot: number; side: Side; next: string[]; organiser: boolean },
): Promise<StoreResult> {
  const { tripId, roundId, slot, side, next, organiser } = opts
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const row = await read(client, tripId, roundId, slot)
    if (row === 'error') return { ok: false, reason: 'Could not reach the matches — check your connection and try again.' }
    const now = new Date().toISOString()
    if (!row) {
      if (next.length === 0) return { ok: true }
      const { error } = await client.from('session_matches').insert({
        trip_id: tripId, round_id: roundId, slot,
        side_a: side === 'a' ? next : [], side_b: side === 'b' ? next : [], updated_at: now,
      })
      if (!error) return { ok: true }
      // Somebody else made it a moment ago: read it and go again.
      if ((error as { code?: string }).code === '23505') continue
      return { ok: false, reason: 'Could not save the match — try again.' }
    }
    if (row.result && !organiser) return { ok: false, reason: 'This match has a result — the organiser can change it with the PIN.' }
    if (!organiser && await hasScores(client, tripId, row.id)) {
      return { ok: false, reason: 'This match has started, so its players are fixed — the organiser can change them with the PIN.' }
    }
    const patch = side === 'a' ? { side_a: next } : { side_b: next }
    const { data, error } = await client.from('session_matches')
      .update({ ...patch, updated_at: now })
      .eq('id', row.id).eq('trip_id', tripId).eq('updated_at', row.updated_at)
      .select('id')
    if (error) return { ok: false, reason: 'Could not save the match — try again.' }
    if ((data ?? []).length > 0) return { ok: true }
    // It changed under us: read it again.
  }
  return { ok: false, reason: 'Somebody else is changing this match — have another look and try again.' }
}

/** Take a match away altogether — only one nobody has scored, unless the organiser. */
export async function removeMatch(
  client: SupabaseClient,
  opts: { tripId: string; roundId: string; slot: number; organiser: boolean; teeSheet?: boolean },
): Promise<StoreResult> {
  const result = await deleteMatch(client, opts)
  if (result.ok && opts.teeSheet) await mirrorTeeTimes(client, opts.tripId, opts.roundId)
  return result
}

async function deleteMatch(
  client: SupabaseClient,
  opts: { tripId: string; roundId: string; slot: number; organiser: boolean },
): Promise<StoreResult> {
  const row = await read(client, opts.tripId, opts.roundId, opts.slot)
  if (row === 'error') return { ok: false, reason: 'Could not reach the matches — try again.' }
  if (!row) return { ok: true }
  if (!opts.organiser && (row.result || await hasScores(client, opts.tripId, row.id))) {
    return { ok: false, reason: 'This match has started — only the organiser can remove it.' }
  }
  const { error } = await client.from('session_matches').delete().eq('id', row.id).eq('trip_id', opts.tripId)
  return error ? { ok: false, reason: 'Could not remove the match — try again.' } : { ok: true }
}

/**
 * How many matches a session holds — the order of play's − and +. Read
 * fresh and merged, so nothing else on the leaderboards is put back to how
 * this phone last saw it; a vacant match is still a point up for grabs on
 * the Overall's ticker (lib/faceOff.ts).
 */
export async function setSessionSlots(
  client: SupabaseClient, tripId: string, roundId: string, count: number,
): Promise<StoreResult> {
  const { data, error } = await client.from('trips').select('leaderboards').eq('id', tripId).single()
  if (error || !data) return { ok: false, reason: 'Could not save — try again' }
  const next = withSessionSlots(parseLeaderboards((data as { leaderboards: unknown }).leaderboards), roundId, count)
  const { error: err } = await client.from('trips').update({ leaderboards: next }).eq('id', tripId)
  return err ? { ok: false, reason: 'Could not save — try again' } : { ok: true }
}
