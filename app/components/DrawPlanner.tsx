'use client'

import { useState } from 'react'
import { byStandings, syncDraft, type DrawDraft, type DrawEntrant } from '@/lib/bracketDraw'
import BracketDrawer, { DrawTiming, buildsNow, type DrawTimingValue } from './BracketDrawer'
import { cardClass, chipClass } from './ui'

/**
 * The draw, planned — **one screen for creation and the organiser area**
 * (Ross, 5 Nov 2026: "amalgamate the settings draw with the creation
 * draw"). When it is made (`DrawTiming`: now, later, or set for a date and
 * a time it goes live), and where it is built on screen — drawn now, or
 * pre-made for its date — the draw itself (`BracketDrawer`). Where the
 * field came from another event, its leaderboards are offered as the seeds.
 *
 * Controlled: whoever holds the value saves it — the creation form with the
 * event, the organiser area on its own button.
 */
export type DrawPlannerValue = { timing: DrawTimingValue; draft: DrawDraft }

/** What the draw offers, said under its title — the step's own, where it has one. */
export const DRAW_INTRO = 'Draw now, later, or set the moment it goes live.'

export default function DrawPlanner({
  entrants, value, onChange, issue, today, heading = true, standings = [], from,
  allowLater = true, allowOrder = false,
}: {
  entrants: DrawEntrant[]
  value: DrawPlannerValue
  onChange: (next: DrawPlannerValue) => void
  issue: string | null
  today: string
  /** Its own title and line — off where it is a step of its own. */
  heading?: boolean
  /**
   * The leaderboards of the event the field was seeded from, as finishing
   * orders in this draw's keys (lib/fieldSeed.ts `drawStandings`) — offered
   * as the seeds, one to pick where there are several (Ross, 4 Nov 2026).
   */
  standings?: { id: string; title: string; order: string[] }[]
  /** That event's name. */
  from?: string
  /** Later and a date — not once a draw is made, which only a redraw replaces. */
  allowLater?: boolean
  /** "My order" for a dated draw, where a seeded order can be kept. */
  allowOrder?: boolean
}) {
  const field = entrants.map(e => e.id)
  const draft = syncDraft(value.draft, field)
  const [picked, setPicked] = useState<string | null>(null)
  const building = buildsNow(value.timing) && entrants.length >= 2
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
        allowLater={allowLater}
        allowOrder={allowOrder}
        min={today}
      />
      {value.timing.when === 'date' && value.timing.seeding === 'premade' && entrants.length < 2 && (
        <p className="t-cap text-ink/65 leading-snug">A pre-made draw needs at least two players in the field.</p>
      )}
      {standings.length > 0 && (
        building ? (
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
            Draw now, or pre-make it for a date, to seed it from {from ?? 'the other event'}&apos;s leaderboard.
          </p>
        )
      )}
      {building && (
        <BracketDrawer entrants={entrants} value={draft} onChange={d => onChange({ ...value, draft: d })} />
      )}
      {issue && <p className="t-cap text-rust-deep">{issue}</p>}
    </div>
  )
}
