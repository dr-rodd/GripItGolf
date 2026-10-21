'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  describeDrawPlan, draftIssue, draftSlots, newDraft,
  type DrawDraft, type DrawEntrant, type DrawPlan,
} from '@/lib/bracketDraw'
import { describeShortDate } from '@/lib/itinerary'
import { todayString } from '@/lib/tripStatus'
import type { EntrantKind } from '@/lib/matchplayEntrants'
import type { DrawState } from '@/lib/drawStore'
import BracketDrawer, { DrawTiming, type DrawTimingValue } from '@/app/components/BracketDrawer'
import { SectionHeader, buttonClass, cardClass } from '@/app/components/ui'

/**
 * The organiser's draw: made now from the field as it stands — random,
 * seeded, or placed by hand — or planned for a date and made overnight
 * (lib/bracketDraw.ts). A draw not yet in play can be made again, which
 * replaces it; one in play is not touched from here.
 */
export default function DrawClient({ tripId, tripCode, kind, entrants, ceiling, state, plan }: {
  tripId: string
  tripCode: string
  kind: EntrantKind
  entrants: DrawEntrant[]
  ceiling: number
  state: DrawState
  plan: DrawPlan | null
}) {
  const router = useRouter()
  const field = entrants.map(e => e.id)
  const [draft, setDraft] = useState<DrawDraft>(() => newDraft(field))
  const [timing, setTiming] = useState<DrawTimingValue>({
    when: plan?.when === 'date' ? 'date' : 'later',
    on: plan?.on ?? '',
    seeding: plan?.seeding ?? 'random',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const issue = draftIssue(draft, field, ceiling)
  const byId = new Map(entrants.map(e => [e.id, e]))

  async function makeDraw() {
    if (issue) return
    if (state.drawn && !window.confirm('Make the draw again? The draw already made is replaced.')) return
    setBusy(true)
    setError(null)
    try {
      const { writeDraw } = await import('@/lib/drawStore')
      const { slots, seeds } = draftSlots(draft)
      await writeDraw(supabase, tripId, slots.map(id => {
        const e = id ? byId.get(id) : null
        return e ? { id: e.id, name: e.name } : null
      }), { seeds, kind })
      router.push(`/trip/${tripCode}/matchplay`)
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Could not make the draw — try again.')
      setBusy(false)
    }
  }

  async function savePlan() {
    const next: DrawPlan | null = timing.when === 'date'
      ? {
          when: 'date', on: timing.on, seeding: timing.seeding,
          ...(timing.seeding === 'order' ? { order: draft.order } : {}),
        }
      : { when: 'later' }
    if (next.when === 'date' && !next.on) { setError('Choose the day of the draw.'); return }
    setBusy(true)
    setError(null)
    try {
      const { saveDrawPlan } = await import('@/lib/drawStore')
      await saveDrawPlan(supabase, tripId, next)
      setSaved(describeDrawPlan(next, d => describeShortDate(d) ?? d))
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Could not save when the draw is made — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (state.inPlay) {
    return (
      <div className={`p-5 ${cardClass()}`}>
        <p className="t-card text-ink">The draw is in play</p>
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          A match has a result or a card has scores, so the draw is not made again from here.
          Results are changed on the bracket with the admin PIN.
        </p>
        <Link href={`/trip/${tripCode}/matchplay`} className={`${buttonClass('secondary')} mt-4`}>See the bracket</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {state.drawn && (
        <p className={`p-4 text-sm text-ink/80 leading-snug ${cardClass('flat')}`}>
          A draw is made and nothing has been played yet. Making it again replaces it.{' '}
          <Link href={`/trip/${tripCode}/matchplay`} className="text-accent-deep">See it →</Link>
        </p>
      )}

      <section>
        <SectionHeader hint={`${entrants.length} ${entrants.length === 1 ? 'entrant' : 'entrants'} so far.`}>
          Make the draw now
        </SectionHeader>
        {entrants.length < 2 ? (
          <p className="text-ink/65 text-sm leading-snug">Nobody to draw yet — the field needs at least two.</p>
        ) : (
          <>
            <BracketDrawer entrants={entrants} value={draft} onChange={setDraft} />
            {issue && <p className="t-cap text-rust-deep mt-3">{issue}</p>}
            <button type="button" disabled={busy || !!issue} onClick={makeDraw} className={`${buttonClass('primary')} mt-4`}>
              {busy ? 'Drawing…' : state.drawn ? 'Make the draw again' : 'Make the draw'}
            </button>
          </>
        )}
      </section>

      {!state.drawn && (
        <section>
          <SectionHeader hint={describeDrawPlan(plan, d => describeShortDate(d) ?? d)}>Or make it later</SectionHeader>
          <DrawTiming
            value={timing}
            onChange={v => { setTiming(v); setSaved(null) }}
            allowNow={false}
            allowOrder={draft.method === 'seeded'}
            min={todayString(new Date())}
          />
          <button type="button" disabled={busy} onClick={savePlan} className={`${buttonClass('secondary')} mt-4`}>
            Save when the draw is made
          </button>
          {saved && <p className="t-cap text-accent-deep mt-2">Saved. {saved}</p>}
        </section>
      )}

      {error && <p className="text-rust-deep text-sm leading-snug">{error}</p>}
    </div>
  )
}
