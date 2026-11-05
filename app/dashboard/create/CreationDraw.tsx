'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  draftIssue, draftSlots, newDraft, syncDraft,
  type DrawEntrant, type DrawPlan,
} from '@/lib/bracketDraw'
import { parseHandicap } from '@/lib/handicap'
import { buildsNow } from '@/app/components/BracketDrawer'
import DrawPlanner, { DRAW_INTRO, type DrawPlannerValue } from '@/app/components/DrawPlanner'

/**
 * The draw on a match play event's creation form (lib/bracketDraw.ts) —
 * `DrawPlanner`, the one draw screen the organiser area shares: made now
 * from the names typed in, left for later, or set for a date and the time it
 * goes live, pre-made now or allocated then. The players have no ids yet,
 * so the draft is keyed by name (no two may share one — lib/roster.ts) and
 * the form hands each name its id when it saves — a pre-made draw's places
 * among them, stored in the plan until it goes live.
 */

export type CreationDrawValue = DrawPlannerValue
export { DRAW_INTRO }

export const NO_CREATION_DRAW: CreationDrawValue = {
  timing: { when: 'later', on: '', at: '20:00', seeding: 'random' },
  draft: newDraft([]),
}

/**
 * The rounds of the bracket creation is making — the draw made now, or
 * pre-made for its date — or 0 while it is still to be allocated, when
 * nobody can know its rounds and no deadline is asked (Ross, 5 Nov 2026).
 */
export function creationRounds(value: CreationDrawValue, entrants: readonly DrawEntrant[]): number {
  if (!buildsNow(value.timing) || entrants.length < 2) return 0
  return syncDraft(value.draft, entrants.map(e => e.id)).layout.rounds
}

/** A typed-in player's key in the draft. */
export const drawKey = (name: string) => name.trim().toLowerCase()

/** The names typed in so far, as the draw sees them. */
export function creationEntrants(players: readonly { name: string; handicap: string }[]): DrawEntrant[] {
  return players
    .filter(p => p.name.trim())
    .map(p => ({ id: drawKey(p.name), name: p.name.trim(), handicap: parseHandicap(p.handicap) }))
}

/** Why the draw as set cannot be created, or null. */
export function creationDrawIssue(value: CreationDrawValue, entrants: readonly DrawEntrant[], today: string): string | null {
  const ids = entrants.map(e => e.id)
  if (value.timing.when === 'date') {
    if (!value.timing.on) return 'Choose the day of the draw.'
    if (value.timing.on < today) return 'The day of the draw has passed.'
    if (!value.timing.at) return 'Choose the time it goes live.'
    if (value.timing.seeding === 'premade' && ids.length < 2) return 'A pre-made draw needs at least two players.'
  }
  if (buildsNow(value.timing)) return draftIssue(syncDraft(value.draft, ids), ids)
  return null
}

/**
 * What goes into `bracket_setup.draw` — a draw made now needs no plan. A
 * pre-made one carries its places, each name turned into the id the form
 * gave it.
 */
export function creationPlan(
  value: CreationDrawValue, entrants: readonly DrawEntrant[], idFor: ReadonlyMap<string, string>,
): DrawPlan | null {
  const t = value.timing
  if (t.when === 'date') {
    const seeding = t.seeding === 'order' ? 'random' : t.seeding
    if (seeding === 'premade') {
      const { slots, seeds } = draftSlots(syncDraft(value.draft, entrants.map(e => e.id)))
      return {
        when: 'date', on: t.on, at: t.at, seeding,
        slots: slots.map(key => (key ? idFor.get(key) ?? null : null)),
        ...(seeds ? { seeds } : {}),
      }
    }
    return { when: 'date', on: t.on, at: t.at, seeding }
  }
  return t.when === 'later' ? { when: 'later' } : null
}

/** The draw made now, once the players have their ids. */
export async function writeCreationDraw(
  client: SupabaseClient, tripId: string, value: CreationDrawValue,
  entrants: readonly DrawEntrant[], idFor: ReadonlyMap<string, string>,
): Promise<void> {
  const { writeDraw } = await import('@/lib/drawStore')
  const { slots, seeds } = draftSlots(syncDraft(value.draft, entrants.map(e => e.id)))
  const byKey = new Map(entrants.map(e => [e.id, e]))
  await writeDraw(client, tripId, slots.map(key => {
    const e = key ? byKey.get(key) : null
    const id = key ? idFor.get(key) : undefined
    return e && id ? { id, name: e.name } : null
  }), { seeds, kind: 'player' })
}

export default DrawPlanner
