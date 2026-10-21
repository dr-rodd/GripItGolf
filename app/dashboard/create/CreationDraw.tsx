'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  draftIssue, draftSlots, newDraft, syncDraft,
  type DrawDraft, type DrawEntrant, type DrawPlan,
} from '@/lib/bracketDraw'
import { parseHandicap } from '@/lib/handicap'
import BracketDrawer, { DrawTiming, type DrawTimingValue } from '@/app/components/BracketDrawer'

/**
 * The draw on a match play event's creation form (lib/bracketDraw.ts):
 * made now from the names typed in, left for the organiser area, or set for
 * a date and made overnight from whoever has joined by then. The players
 * have no ids yet, so the draft is keyed by name (no two may share one —
 * lib/roster.ts) and the form hands each name its id when it saves.
 */

export type CreationDrawValue = { timing: DrawTimingValue; draft: DrawDraft }

export const NO_CREATION_DRAW: CreationDrawValue = {
  timing: { when: 'later', on: '', seeding: 'random' },
  draft: newDraft([]),
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
  if (value.timing.when === 'now') return draftIssue(syncDraft(value.draft, entrants.map(e => e.id)), entrants.map(e => e.id))
  if (value.timing.when === 'date') {
    if (!value.timing.on) return 'Choose the day of the draw.'
    if (value.timing.on < today) return 'The day of the draw has passed.'
  }
  return null
}

/** What goes into `bracket_setup.draw` — a draw made now needs no plan. */
export function creationPlan(value: CreationDrawValue): DrawPlan | null {
  if (value.timing.when === 'date') {
    return { when: 'date', on: value.timing.on, seeding: value.timing.seeding === 'order' ? 'random' : value.timing.seeding }
  }
  return value.timing.when === 'later' ? { when: 'later' } : null
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

export default function CreationDraw({ entrants, value, onChange, issue, today }: {
  entrants: DrawEntrant[]
  value: CreationDrawValue
  onChange: (next: CreationDrawValue) => void
  issue: string | null
  today: string
}) {
  const field = entrants.map(e => e.id)
  const draft = syncDraft(value.draft, field)
  return (
    <div className="space-y-4">
      <div>
        <p className="t-card text-ink">The draw</p>
        <p className="t-cap text-ink/65 mt-0.5">Make it now, leave it for later, or have it made on a date.</p>
      </div>
      <DrawTiming
        value={value.timing}
        onChange={timing => onChange({ ...value, timing })}
        allowNow={entrants.length >= 2}
        min={today}
      />
      {value.timing.when === 'now' && (
        <BracketDrawer entrants={entrants} value={draft} onChange={d => onChange({ ...value, draft: d })} />
      )}
      {issue && <p className="t-cap text-rust-deep">{issue}</p>}
    </div>
  )
}
