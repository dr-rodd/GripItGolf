import type { SupabaseClient } from '@supabase/supabase-js'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { needsPairings } from '@/lib/leaderboards'
import { MAIN_SET, setOf } from '@/lib/teamSets'
import { MAX_BRACKET } from '@/lib/matchplay'
import { parseBracketSetup, rawDrawPlan } from '@/lib/bracketSetup'
import {
  byHandicap, drawCountIssue, drawDue, reconcileOrder, shuffled, slotsFromSeeds,
} from '@/lib/bracketDraw'
import { fetchEntrants } from '@/lib/matchplayStore'
import { readDrawState, writeDraw } from '@/lib/drawStore'

export type DueDrawReport = { tripId: string; outcome: 'drawn' | 'would draw' | 'skipped'; why?: string }

/**
 * The nightly draw (lib/bracketDraw.ts `drawDue`): every match play event
 * whose draw was planned for a day that has come, and which has no draw
 * yet, is drawn from whoever has entered by then — at random, by handicap,
 * or in the organiser's order with late joiners after by handicap. Run from
 * /api/cleanup on the service role. A draw already made, by hand or by a
 * night before, is never touched; a field that will not draw is left and
 * reported, and the organiser area still offers the draw by hand.
 */
export async function runDueDraws(admin: SupabaseClient, today: string, dryRun: boolean): Promise<DueDrawReport[]> {
  const { data, error } = await admin.from('trips')
    .select('id, leaderboards, formats, team_scoring, bracket_setup')
    .eq('bracket_setup->draw->>when', 'date')
  if (error) {
    console.error('due draws read failed:', error)
    return []
  }
  const out: DueDrawReport[] = []
  for (const trip of (data ?? []) as {
    id: string; leaderboards: unknown; formats: unknown; team_scoring: unknown; bracket_setup: unknown
  }[]) {
    const plan = rawDrawPlan(trip.bracket_setup)
    try {
      const state = await readDrawState(admin, trip.id)
      if (!drawDue(plan, today, state.drawn)) continue
      const boards = boardsForTrip({ leaderboards: trip.leaderboards, formats: trip.formats, team_scoring: trip.team_scoring })
      const board = boards.find(lb => lb.competition === 'matchplay')
      const kind = needsPairings(boards) ? 'pair' as const : 'player' as const
      const entrants = await fetchEntrants(trip.id, kind, board ? setOf(board) : MAIN_SET)
      const issue = drawCountIssue(entrants.length, parseBracketSetup(trip.bracket_setup)?.size ?? MAX_BRACKET)
      if (issue) { out.push({ tripId: trip.id, outcome: 'skipped', why: issue }); continue }

      const ranked = byHandicap(entrants).map(e => e.id)
      const order = plan?.seeding === 'handicap' ? ranked
        : plan?.seeding === 'order' ? reconcileOrder(plan.order ?? [], ranked)
          : shuffled(entrants.map(e => e.id))
      const { slots, seeds } = slotsFromSeeds(order)
      if (dryRun) { out.push({ tripId: trip.id, outcome: 'would draw' }); continue }
      const byId = new Map(entrants.map(e => [e.id, e]))
      await writeDraw(admin, trip.id, slots.map(id => {
        const e = id ? byId.get(id) : null
        return e ? { id: e.id, name: e.name } : null
      }), { seeds: plan?.seeding === 'random' ? null : seeds, kind })
      out.push({ tripId: trip.id, outcome: 'drawn' })
    } catch (e) {
      console.error('due draw failed:', trip.id, e)
      out.push({ tripId: trip.id, outcome: 'skipped', why: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
