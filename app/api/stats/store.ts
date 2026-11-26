// The service-role half of the card summaries (./summaries.ts). The round's
// scores are read through its event's own reader (./read.ts); the summary
// table and the club lookup on the admin client, which is the only thing
// that reaches them. Every write is fail-soft before migration
// 088: a summary is never in the way of a card being signed.

import { createAdminClient } from '@/lib/supabase-admin'
import type { SummaryDeps } from './summaries'
import { readRoundForSummary } from './read'
import { feedAfterSummaries } from '../feed/write'
export { retagSummaries } from './retag'

type Db = ReturnType<typeof createAdminClient>

/** Missing table or column: migration 088 (or 086) not pasted yet. */
const notThere = (e: { code?: string } | null) => !!e && ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(e.code ?? '')

export function summaryDeps(db: Db = createAdminClient()): SummaryDeps {
  return {
    readRound: readRoundForSummary,
    async verifiedClubOf(tripId) {
      const { data, error } = await db.from('trip_private').select('club_id').eq('trip_id', tripId).maybeSingle()
      const clubId = error ? null : (data as { club_id?: string | null } | null)?.club_id ?? null
      if (!clubId) return null
      const { data: club } = await db.from('clubs').select('verified_at').eq('id', clubId).maybeSingle()
      return (club as { verified_at?: string | null } | null)?.verified_at ? clubId : null
    },
    async upsert(rows) {
      let { error } = await db.from('card_summaries').upsert(rows, { onConflict: 'round_id,player_id' })
      // Before migration 107 there is no `sg` column: the rest written, and
      // marked as the older rules so the backfill fills `sg` once it lands.
      if (error && notThere(error)) {
        const older = rows.map(({ sg: _sg, ...r }) => ({ ...r, rules_version: 1 }))
        ;({ error } = await db.from('card_summaries').upsert(older, { onConflict: 'round_id,player_id' }))
      }
      if (error && !notThere(error)) throw error
    },
    held: roundId => heldRound(db, roundId),
    // D302: the round's signed cards into the feed (a club competition's are its signing's).
    afterWrite: read => feedAfterSummaries(db, read.roundId, read.stats),
    async removeOthers(roundId, keep) {
      let q = db.from('card_summaries').delete().eq('round_id', roundId)
      if (keep.length) q = q.not('player_id', 'in', `(${keep.join(',')})`)
      const { error } = await q
      if (error && !notThere(error)) throw error
    },
  }
}

/**
 * A club competition's round not yet certified (stage (d4)): its cards feed
 * nobody's season until Certify. Before 091 no round is certified, so a
 * competition's round is held; outside a competition nothing is.
 */
export async function heldRound(db: Db, roundId: string): Promise<boolean> {
  return (await heldRounds(db, [roundId])).has(roundId)
}

async function heldRounds(db: Db, roundIds: string[]): Promise<Set<string>> {
  if (roundIds.length === 0) return new Set()
  const { data: rounds } = await db.from('rounds').select('id, trip_id').in('id', roundIds)
  const rs = (rounds ?? []) as { id: string; trip_id: string }[]
  const tripIds = [...new Set(rs.map(r => r.trip_id))]
  if (tripIds.length === 0) return new Set()
  const { data: comps, error } = await db.from('trips').select('id').in('id', tripIds).eq('competition', 'club')
  if (error || !(comps ?? []).length) return new Set()
  const compTrips = new Set(((comps ?? []) as { id: string }[]).map(c => c.id))
  const compRounds = rs.filter(r => compTrips.has(r.trip_id)).map(r => r.id)
  if (compRounds.length === 0) return new Set()
  const cert = await db.from('rounds').select('id, certified_at').in('id', compRounds)
  const certified = cert.error ? new Set<string>()
    : new Set(((cert.data ?? []) as { id: string; certified_at: string | null }[]).filter(r => r.certified_at).map(r => r.id))
  return new Set(compRounds.filter(id => !certified.has(id)))
}

/**
 * Signed rounds still without summary rows (or written under older rules),
 * filled — up to `limit` at a time. The nightly backstop and the backfill on
 * /admin. A round counts as signed when any of its scores is committed.
 */
export async function fillSummaries(opts: { limit: number; rewriteOlder?: boolean; deadline?: number }, db: Db = createAdminClient()): Promise<{ filled: number; remaining: number } | { notReady: true }> {
  const probe = await db.from('card_summaries').select('round_id, rules_version').limit(1)
  if (probe.error && notThere(probe.error)) return { notReady: true }
  const { CARD_SUMMARY_RULES } = await import('@/lib/cardSummary')
  // Rounds with a committed card: read in pages of round ids from finalised live cards and committed scores.
  const signed = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('live_rounds').select('round_id').eq('status', 'finalised').order('round_id').range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as { round_id: string }[]) signed.add(r.round_id)
    if ((data ?? []).length < 1000) break
  }
  const done = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('card_summaries').select('round_id, rules_version').order('round_id').range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as { round_id: string; rules_version: number }[]) {
      if (!opts.rewriteOlder || r.rules_version >= CARD_SUMMARY_RULES) done.add(r.round_id)
    }
    if ((data ?? []).length < 1000) break
  }
  // A competition's round waits for Certify (stage (d4)) — never counted as owed.
  const held = await heldRounds(db, [...signed].filter(id => !done.has(id)))
  const todo = [...signed].filter(id => !done.has(id) && !held.has(id))
  if (todo.length === 0) return { filled: 0, remaining: 0 }
  const batch = todo.slice(0, opts.limit)
  const { data: rounds } = await db.from('rounds').select('id, trip_id').in('id', batch)
  const tripIds = [...new Set(((rounds ?? []) as { trip_id: string }[]).map(r => r.trip_id))]
  const { data: trips } = await db.from('trips').select('id, trip_code').in('id', tripIds)
  const codeOf = new Map(((trips ?? []) as { id: string; trip_code: string }[]).map(t => [t.id, t.trip_code]))
  const deps = summaryDeps(db)
  const { writeRoundSummaries } = await import('./summaries')
  let filled = 0
  for (const r of (rounds ?? []) as { id: string; trip_id: string }[]) {
    if (opts.deadline && Date.now() > opts.deadline) break
    const code = codeOf.get(r.trip_id)
    if (!code) continue
    try {
      await writeRoundSummaries(code, r.id, deps, new Date())
      filled++
    } catch (e) {
      console.error('card summary fill failed for round', r.id, e)
    }
  }
  return { filled, remaining: todo.length - filled }
}
