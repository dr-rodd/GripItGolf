'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  byStandings, draftIssue, draftSlots, newDraft, syncDraft,
  type DrawDraft, type DrawEntrant, type DrawPlan,
} from '@/lib/bracketDraw'
import { cardClass, chipClass } from '@/app/components/ui'
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

/** What the draw offers, said under its title — the step's own, where it has one. */
export const DRAW_INTRO = 'Make it now, leave it for later, or have it made on a date.'

export default function CreationDraw({ entrants, value, onChange, issue, today, heading = true, standings = [], from }: {
  entrants: DrawEntrant[]
  value: CreationDrawValue
  onChange: (next: CreationDrawValue) => void
  issue: string | null
  today: string
  /** Its own title and line — off where it is a step of its own (Ross, 4 Nov 2026). */
  heading?: boolean
  /**
   * The leaderboards of the event the field was seeded from, as finishing
   * orders in this draw's keys (lib/fieldSeed.ts `drawStandings`) — offered
   * as the seeds, one to pick where there are several (Ross, 4 Nov 2026).
   */
  standings?: { id: string; title: string; order: string[] }[]
  /** That event's name. */
  from?: string
}) {
  const field = entrants.map(e => e.id)
  const draft = syncDraft(value.draft, field)
  const [picked, setPicked] = useState<string | null>(null)
  const seedFrom = (board: { id: string; order: string[] }) => {
    setPicked(board.id)
    onChange({ ...value, draft: { ...draft, method: 'seeded', order: byStandings(draft.order, board.order) } })
  }
  return (
    <div className="space-y-4">
      {heading && (
        <div>
          <p className="t-card text-ink">The draw</p>
          <p className="t-cap text-ink/65 mt-0.5">{DRAW_INTRO}</p>
        </div>
      )}
      <DrawTiming
        value={value.timing}
        onChange={timing => onChange({ ...value, timing })}
        allowNow={entrants.length >= 2}
        min={today}
      />
      {standings.length > 0 && (
        value.timing.when === 'now' ? (
          <div className={`p-4 ${cardClass()}`}>
            <p className="text-ink text-sm font-medium">Seed from {from ?? 'the other event'}&apos;s leaderboard</p>
            <p className="t-cap text-ink/65 mt-0.5 leading-snug">
              {standings.length > 1
                ? 'Pick which leaderboard — its finishing order becomes the seeds, first plays last.'
                : 'Its finishing order becomes the seeds, first plays last.'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {standings.map(b => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={picked === b.id && draft.method === 'seeded'}
                  onClick={() => seedFrom(b)}
                  className={chipClass(picked === b.id && draft.method === 'seeded')}
                >
                  {b.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="t-cap text-ink/65 leading-snug">
            Make the draw now to seed it from {from ?? 'the other event'}&apos;s leaderboard.
          </p>
        )
      )}
      {value.timing.when === 'now' && (
        <BracketDrawer entrants={entrants} value={draft} onChange={d => onChange({ ...value, draft: d })} />
      )}
      {issue && <p className="t-cap text-rust-deep">{issue}</p>}
    </div>
  )
}
