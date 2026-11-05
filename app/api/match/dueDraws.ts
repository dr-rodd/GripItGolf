import type { SupabaseClient } from '@supabase/supabase-js'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { needsPairings } from '@/lib/leaderboards'
import { MAIN_SET, setOf } from '@/lib/teamSets'
import { MAX_BRACKET } from '@/lib/matchplay'
import { parseBracketSetup, rawDrawPlan } from '@/lib/bracketSetup'
import {
  byHandicap, drawCountIssue, drawDue, premadeSlots, reconcileOrder, shuffled, slotsFromSeeds,
} from '@/lib/bracketDraw'
import { fetchEntrants } from '@/lib/matchplayStore'
import { readDrawState, writeDraw } from '@/lib/drawStore'

export type DueDrawReport = { tripId: string; outcome: 'drawn' | 'would draw' | 'skipped'; why?: string }

type DueTrip = { id: string; leaderboards: unknown; formats: unknown; team_scoring: unknown; bracket_setup: unknown }

/**
 * A draw set for a date and a time, made once that moment has come (lib/
 * bracketDraw.ts `drawDue`; Ross, 5 Nov 2026) — by the first visit after it
 * (/api/match/draw-due, from the countdown on the event's home screen) or,
 * failing any, the nightly job. Either way through here, on the service
 * role: a pre-made draw as it was made (anybody who has left since a bye),
 * or one made from whoever has entered by then — at random, by handicap, or
 * in the organiser's order with late joiners after by handicap.
 *
 * **Made once.** The visit takes the job first by stamping `claimedAt` on
 * the plan where it still reads as it did (`claimDue`), so two visits at
 * the same moment cannot both draw; a claim that comes to nothing is let go,
 * and one left by a visit that died is free again after `CLAIM_MS`. A draw
 * already made, by hand or before, is never touched.
 */
export async function makeDueDraw(admin: SupabaseClient, trip: DueTrip, now: Date, dryRun: boolean): Promise<DueDrawReport> {
  const plan = rawDrawPlan(trip.bracket_setup)
  const state = await readDrawState(admin, trip.id)
  if (!drawDue(plan, now, state.drawn) || !plan) return { tripId: trip.id, outcome: 'skipped', why: 'not due' }

  const boards = boardsForTrip({ leaderboards: trip.leaderboards, formats: trip.formats, team_scoring: trip.team_scoring })
  const board = boards.find(lb => lb.competition === 'matchplay')
  const kind = needsPairings(boards) ? 'pair' as const : 'player' as const
  const entrants = await fetchEntrants(trip.id, kind, board ? setOf(board) : MAIN_SET)
  const field = entrants.map(e => e.id)

  let slots: (string | null)[]
  let seeds: number[] | null
  if (plan.seeding === 'premade' && plan.slots) {
    slots = premadeSlots(plan.slots, field)
    seeds = plan.seeds ?? null
  } else {
    const ranked = byHandicap(entrants).map(e => e.id)
    const order = plan.seeding === 'handicap' ? ranked
      : plan.seeding === 'order' ? reconcileOrder(plan.order ?? [], ranked)
        : shuffled(field)
    const made = slotsFromSeeds(order)
    slots = made.slots
    seeds = plan.seeding === 'random' ? null : made.seeds
  }
  const issue = drawCountIssue(slots.filter(Boolean).length, parseBracketSetup(trip.bracket_setup)?.size ?? MAX_BRACKET)
  if (issue) return { tripId: trip.id, outcome: 'skipped', why: issue }
  if (dryRun) return { tripId: trip.id, outcome: 'would draw' }

  if (!(await claimDue(admin, trip, now, plan.claimedAt ?? null))) {
    return { tripId: trip.id, outcome: 'skipped', why: 'another visit is making it' }
  }
  const byId = new Map(entrants.map(e => [e.id, e]))
  try {
    await writeDraw(admin, trip.id, slots.map(id => {
      const e = id ? byId.get(id) : null
      return e ? { id: e.id, name: e.name } : null
    }), { seeds, kind })
  } catch (e) {
    // Let the claim go, so the next visit or the night can try again.
    await releaseClaim(admin, trip.id, now)
    throw e
  }
  return { tripId: trip.id, outcome: 'drawn' }
}

/**
 * Take the job of making the draw: stamp the plan's `claimedAt`, only where
 * it still holds what was read — a compare-and-set on the stored plan, so
 * exactly one of two racing visits gets a row back.
 */
async function claimDue(admin: SupabaseClient, trip: DueTrip, now: Date, was: string | null): Promise<boolean> {
  const raw = trip.bracket_setup as Record<string, unknown>
  const draw = { ...(raw.draw as Record<string, unknown>), claimedAt: now.toISOString() }
  let q = admin.from('trips').update({ bracket_setup: { ...raw, draw } }).eq('id', trip.id)
  q = was === null ? q.is('bracket_setup->draw->>claimedAt', null) : q.eq('bracket_setup->draw->>claimedAt', was)
  const { data, error } = await q.select('id')
  return !error && (data ?? []).length === 1
}

/** A claim that came to nothing, given back — read fresh, so nothing else is undone. */
async function releaseClaim(admin: SupabaseClient, tripId: string, now: Date): Promise<void> {
  const { data } = await admin.from('trips').select('bracket_setup').eq('id', tripId).maybeSingle()
  const raw = (data as { bracket_setup?: Record<string, unknown> } | null)?.bracket_setup
  const draw = raw?.draw as Record<string, unknown> | undefined
  if (!raw || !draw || draw.claimedAt !== now.toISOString()) return
  const { claimedAt: _gone, ...rest } = draw
  void _gone
  await admin.from('trips').update({ bracket_setup: { ...raw, draw: rest } }).eq('id', tripId)
}

/**
 * The nightly backstop: every match play event whose draw's moment has come
 * and which has nothing drawn yet. Run from /api/cleanup on the service
 * role; a field that will not draw is left and reported, and the organiser
 * area still offers the draw by hand.
 */
export async function runDueDraws(admin: SupabaseClient, now: Date, dryRun: boolean): Promise<DueDrawReport[]> {
  const { data, error } = await admin.from('trips')
    .select('id, leaderboards, formats, team_scoring, bracket_setup')
    .eq('bracket_setup->draw->>when', 'date')
  if (error) {
    console.error('due draws read failed:', error)
    return []
  }
  const out: DueDrawReport[] = []
  for (const trip of (data ?? []) as DueTrip[]) {
    try {
      const report = await makeDueDraw(admin, trip, now, dryRun)
      if (report.why !== 'not due') out.push(report)
    } catch (e) {
      console.error('due draw failed:', trip.id, e)
      out.push({ tripId: trip.id, outcome: 'skipped', why: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
