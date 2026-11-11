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
import { createOutbox, keyOf, matchKeyOf, PartialSend, Refused, type Batch, type Outbox } from '@/lib/scoreOutbox'

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
function failed_(error: unknown): Error {
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
  if (error) throw failed_(error)
  if ((data ?? []).length > 0) throw new Refused('delete refused')
}

/**
 * One batch, sent group by group — each round's holes together, each
 * player's clears together, each match card box on its own — and **every
 * group tried even if an earlier one fails**, so one entry the server will
 * not take (a card voided on another phone, an event this phone has left)
 * never holds the rest behind it. What got through is reported on
 * `PartialSend`, and the outbox drops exactly that.
 *
 * Throws on any write failure rather than swallowing it — that rejection is
 * what tells the outbox to hold what is left and try again.
 */
async function send(batch: Batch): Promise<void> {
  const done = new Set<string>()
  let refused = false
  let reason = 'network'
  let failedAny = false
  const fail = (e: unknown) => {
    failedAny = true
    const isRef = e instanceof Refused
    if (isRef) refused = true
    reason = isRef ? 'refused' : (e as { code?: string })?.code ? String((e as { code?: string }).code) : reason
  }

  // Holes, one round at a time.
  const byRound = new Map<string, Batch['saves']>()
  for (const r of batch.saves) byRound.set(r.round_id, [...(byRound.get(r.round_id) ?? []), r])
  for (const rows of byRound.values()) {
    try {
      const { data, error } = await supabase
        .from('live_scores')
        .upsert(rows, { onConflict: 'player_id,round_id,hole_number' })
        .select('hole_number')
      if (error) throw failed_(error)
      // Every row written comes back; fewer is a write the server quietly refused.
      if ((data ?? []).length < rows.length) throw new Refused('upsert refused')
      for (const r of rows) done.add(keyOf(r.player_id, r.round_id, r.hole_number))
    } catch (e) { fail(e) }
  }

  // Cleared holes, grouped by whose card and which round.
  const groups = new Map<string, { player_id: string; round_id: string; holes: number[] }>()
  for (const c of batch.clears) {
    const k = `${c.player_id}:${c.round_id}`
    const g = groups.get(k) ?? { player_id: c.player_id, round_id: c.round_id, holes: [] }
    g.holes.push(c.hole_number)
    groups.set(k, g)
  }
  for (const g of groups.values()) {
    try {
      const { data, error } = await supabase
        .from('live_scores')
        .delete()
        .eq('player_id', g.player_id)
        .eq('round_id', g.round_id)
        .in('hole_number', g.holes)
        .select('hole_number')
      if (error) throw failed_(error)
      if ((data ?? []).length < g.holes.length) {
        await stillThere('live_scores', { player_id: g.player_id, round_id: g.round_id }, g.holes)
      }
      for (const h of g.holes) done.add(keyOf(g.player_id, g.round_id, h))
    } catch (e) { fail(e) }
  }

  // Match play card boxes (stage 7), one at a time in the order entered.
  for (const { cell, clear } of batch.match) {
    try {
      const at = { trip_id: cell.trip_id, match_id: cell.match_id, player_id: cell.player_id }
      if (clear) {
        const { data, error } = await supabase.from(cell.table).delete()
          .eq('trip_id', at.trip_id).eq('match_id', at.match_id).eq('player_id', at.player_id)
          .eq('hole_number', cell.hole_number).select('hole_number')
        if (error) throw failed_(error)
        if ((data ?? []).length === 0) await stillThere(cell.table, at, [cell.hole_number])
      } else {
        const { data, error } = await supabase.from(cell.table).upsert({
          ...at, hole_number: cell.hole_number, gross: cell.gross, updated_at: new Date().toISOString(),
        }, { onConflict: 'match_id,player_id,hole_number' }).select('hole_number')
        const bad = error ? dataError(error) : null
        if (bad) { for (const fn of rejectionListeners) fn({ cell, ...bad }) }
        else {
          if (error) throw failed_(error)
          if ((data ?? []).length === 0) throw new Refused('upsert refused')
        }
      }
      done.add(matchKeyOf(cell))
    } catch (e) { fail(e) }
  }

  if (failedAny) throw new PartialSend(done, refused, reason)
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
    window.addEventListener('online', () => { void instance!.nudge() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void instance!.nudge()
    })
  }

  return instance
}
