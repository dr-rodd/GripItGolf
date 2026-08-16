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
import { createOutbox, type Batch, type Outbox } from '@/lib/scoreOutbox'

/**
 * One batch, in two calls at most.
 *
 * Throws on a write failure rather than swallowing it — that rejection is
 * what tells the outbox to hold the holes and try again, and returning
 * quietly is precisely the bug this whole mechanism exists to end.
 */
async function send(batch: Batch): Promise<void> {
  if (batch.saves.length > 0) {
    const { error } = await supabase
      .from('live_scores')
      .upsert(batch.saves, { onConflict: 'player_id,round_id,hole_number' })
    if (error) throw error
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
      const { error } = await supabase
        .from('live_scores')
        .delete()
        .eq('player_id', g.player_id)
        .eq('round_id', g.round_id)
        .in('hole_number', g.holes)
      if (error) throw error
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
