'use client'

/**
 * The app's one score outbox, wired to Supabase and to this phone's storage.
 *
 * The rules live in `lib/scoreOutbox.ts`; this is the half that talks. One
 * instance for the whole app, deliberately: the pending count on the scoring
 * card and the flush the commit waits for have to be the same queue, and two
 * outboxes over one `localStorage` key would each drop the other's holes.
 *
 * Built lazily rather than at import. This module is pulled in by client
 * components that also render on the server, where there is no `localStorage`
 * and no point in a retry timer.
 */

import { supabase } from '@/lib/supabase'
import { recoverEvents } from '@/lib/entryClient'
import { createOutbox, Refused, type Batch, type Outbox } from '@/lib/scoreOutbox'

/**
 * The server saying no, as opposed to the radio failing (stage 6): an
 * expired or lost sign-in, or row-level security. Postgres reports a policy
 * refusal as 42501; PostgREST a bad token as PGRST301/302.
 */
export function refusal(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') return true
  return typeof message === 'string' && /JWT|row-level security|permission denied/i.test(message)
}

/**
 * A match card box the database will never take as it stands — before
 * migration 059 a hole past the 18th, before 062 an NR (a check or not-null
 * refusal, Postgres class 22/23). Retrying would hold every box behind it, so
 * it is taken off the queue and the card is told, to say so in words.
 */
type Rejection = { cell: Batch['match'][number]['cell']; code: string; message: string }
const rejectionListeners = new Set<(r: Rejection) => void>()
export function onMatchRejected(fn: (r: Rejection) => void): () => void {
  rejectionListeners.add(fn)
  return () => { rejectionListeners.delete(fn) }
}
function dataError(error: unknown): { code: string; message: string } | null {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  return typeof code === 'string' && /^2[23]/.test(code) ? { code, message: typeof message === 'string' ? message : '' } : null
}

/** A write failure, sorted: refused (sign back in, retry) or anything else (back off). */
function failed(error: unknown): Error {
  return refusal(error) ? new Refused('refused', error) : (error as Error)
}

/**
 * A delete that came back with fewer rows than asked for. Either the rows
 * were never there — fine — or row-level security hid them from the delete,
 * which reports "0 rows", not an error. Asking what is still there tells the
 * two apart: anything left is a refusal.
 */
async function stillThere(
  table: string, match: Record<string, string>, holes: number[],
): Promise<void> {
  let q = supabase.from(table).select('hole_number')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data, error } = await q.in('hole_number', holes)
  if (error) throw failed(error)
  if ((data ?? []).length > 0) throw new Refused('delete refused')
}

/**
 * One batch, in two calls at most.
 *
 * Throws on a write failure rather than swallowing it — that rejection is
 * what tells the outbox to hold the holes and try again, and returning
 * quietly is precisely the bug this whole mechanism exists to end.
 */
async function send(batch: Batch): Promise<void> {
  if (batch.saves.length > 0) {
    const { data, error } = await supabase
      .from('live_scores')
      .upsert(batch.saves, { onConflict: 'player_id,round_id,hole_number' })
      .select('hole_number')
    if (error) throw failed(error)
    // Every row written comes back; fewer is a write the server quietly refused.
    if ((data ?? []).length < batch.saves.length) throw new Refused('upsert refused')
  }

  if (batch.clears.length > 0) {
    // Grouped by whose card and which round, so clearing four players' holes
    // on one edit is at most a call each rather than one per hole.
    const groups = new Map<string, { player_id: string; round_id: string; holes: number[] }>()
    for (const c of batch.clears) {
      const k = `${c.player_id}:${c.round_id}`
      const g = groups.get(k) ?? { player_id: c.player_id, round_id: c.round_id, holes: [] }
      g.holes.push(c.hole_number)
      groups.set(k, g)
    }
    for (const g of groups.values()) {
      const { data, error } = await supabase
        .from('live_scores')
        .delete()
        .eq('player_id', g.player_id)
        .eq('round_id', g.round_id)
        .in('hole_number', g.holes)
        .select('hole_number')
      if (error) throw failed(error)
      if ((data ?? []).length < g.holes.length) {
        await stillThere('live_scores', { player_id: g.player_id, round_id: g.round_id }, g.holes)
      }
    }
  }

  // Match play card boxes (stage 7), one at a time in the order entered —
  // a handful per hole, and each its own row.
  for (const { cell, clear } of batch.match) {
    const at = { trip_id: cell.trip_id, match_id: cell.match_id, player_id: cell.player_id }
    if (clear) {
      const { data, error } = await supabase.from(cell.table).delete()
        .eq('trip_id', at.trip_id).eq('match_id', at.match_id).eq('player_id', at.player_id)
        .eq('hole_number', cell.hole_number).select('hole_number')
      if (error) throw failed(error)
      if ((data ?? []).length === 0) await stillThere(cell.table, at, [cell.hole_number])
    } else {
      const { data, error } = await supabase.from(cell.table).upsert({
        ...at, hole_number: cell.hole_number, gross: cell.gross, updated_at: new Date().toISOString(),
      }, { onConflict: 'match_id,player_id,hole_number' }).select('hole_number')
      const bad = error ? dataError(error) : null
      if (bad) { for (const fn of rejectionListeners) fn({ cell, ...bad }); continue }
      if (error) throw failed(error)
      if ((data ?? []).length === 0) throw new Refused('upsert refused')
    }
  }
}

let instance: Outbox | null = null

export function scoreOutbox(): Outbox {
  if (instance) return instance

  const browser = typeof window !== 'undefined'
  instance = createOutbox({
    send,
    storage: browser ? window.localStorage : null,
    isOnline: browser ? () => navigator.onLine !== false : undefined,
    // A refused send: sign this phone back in and enter the events again.
    recover: browser ? recoverEvents : undefined,
  })

  if (browser) {
    // The two moments worth trying again immediately, rather than waiting out
    // a backoff that was measured against a connection which has since come
    // back: the radio reconnecting, and the phone coming out of a pocket.
    // A group walking from a dead hollow onto the next tee is both at once.
    window.addEventListener('online', () => { void instance!.flush() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void instance!.flush()
    })
  }

  return instance
}
