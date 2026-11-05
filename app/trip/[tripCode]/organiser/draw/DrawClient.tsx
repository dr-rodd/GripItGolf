'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  describeDrawPlan, draftIssue, draftSlots, newDraft, premadeSlots, syncDraft,
  type DrawDraft, type DrawEntrant, type DrawPlan,
} from '@/lib/bracketDraw'
import { describeShortDate, describeTime } from '@/lib/itinerary'
import { todayString } from '@/lib/tripStatus'
import type { EntrantKind } from '@/lib/matchplayEntrants'
import type { DrawState } from '@/lib/drawStore'
import { layoutFromSlots } from '@/lib/bracketEditor'
import { buildsNow } from '@/app/components/BracketDrawer'
import DrawPlanner, { type DrawPlannerValue } from '@/app/components/DrawPlanner'
import { buttonClass, cardClass } from '@/app/components/ui'

/**
 * The organiser's draw — the same screen creation shows (`DrawPlanner`;
 * Ross, 5 Nov 2026): **Draw now** from the field as it stands, **Draw
 * later**, or **Set date** for the moment it goes live, pre-made now or
 * allocated then. One button, saying what it does. A draw not yet in play
 * can be made again, which replaces it; one in play is not touched from here.
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
  const today = todayString(new Date())
  const [value, setValue] = useState<DrawPlannerValue>(() => ({
    timing: {
      when: state.drawn || field.length < 2 ? (state.drawn ? 'now' : 'later') : plan?.when === 'date' ? 'date' : 'later',
      on: plan?.on ?? '',
      at: plan?.at ?? '20:00',
      seeding: plan?.seeding ?? 'random',
    },
    draft: plan?.seeding === 'premade' && plan.slots ? premadeDraft(plan, field) : newDraft(field),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const t = value.timing
  const draft = syncDraft(value.draft, field)
  const draftProblem = buildsNow(t) ? draftIssue(draft, field, ceiling) : null
  const dateProblem = t.when !== 'date' ? null
    : !t.on ? 'Choose the day of the draw.'
      : t.on < today ? 'The day of the draw has passed.'
        : !t.at ? 'Choose the time it goes live.' : null
  const issue = draftProblem ?? dateProblem
  const byId = new Map(entrants.map(e => [e.id, e]))
  const describe = (p: DrawPlan | null) => describeDrawPlan(p, d => describeShortDate(d) ?? d, describeTime)

  async function makeDraw() {
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
    let next: DrawPlan
    if (t.when === 'date') {
      const { slots, seeds } = draftSlots(draft)
      next = {
        when: 'date', on: t.on, at: t.at, seeding: t.seeding,
        ...(t.seeding === 'order' ? { order: draft.order } : {}),
        ...(t.seeding === 'premade' ? { slots, ...(seeds ? { seeds } : {}) } : {}),
      }
    } else {
      next = { when: 'later' }
    }
    setBusy(true)
    setError(null)
    try {
      const { saveDrawPlan } = await import('@/lib/drawStore')
      await saveDrawPlan(supabase, tripId, next)
      setSaved(describe(next))
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
    <div className="space-y-6">
      {state.drawn ? (
        <p className={`p-4 text-sm text-ink/80 leading-snug ${cardClass('flat')}`}>
          A draw is made and nothing has been played yet. Making it again replaces it.{' '}
          <Link href={`/trip/${tripCode}/matchplay`} className="text-accent-deep">See it →</Link>
        </p>
      ) : (
        <p className="text-ink/65 text-sm leading-snug">
          {entrants.length} {entrants.length === 1 ? 'entrant' : 'entrants'} so far. {plan ? describe(plan) : ''}
        </p>
      )}

      <DrawPlanner
        entrants={entrants}
        value={value}
        onChange={v => { setValue(v); setSaved(null) }}
        issue={issue}
        today={today}
        heading={false}
        allowLater={!state.drawn}
        allowOrder={draft.method === 'seeded'}
      />

      {t.when === 'now' ? (
        <button type="button" disabled={busy || !!issue || field.length < 2} onClick={makeDraw} className={buttonClass('primary')}>
          {busy ? 'Drawing…' : state.drawn ? 'Make the draw again' : 'Make the draw'}
        </button>
      ) : (
        <button type="button" disabled={busy || !!issue} onClick={savePlan} className={buttonClass('primary')}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
      {saved && <p className="t-cap text-accent-deep">Saved. {saved}</p>}
      {error && <p className="text-rust-deep text-sm leading-snug">{error}</p>}
    </div>
  )
}

/**
 * A pre-made draw read back into the bracket, as it was laid out — its seed
 * numbers kept where it was seeded, anybody who has left since gone from it.
 */
function premadeDraft(plan: DrawPlan, field: string[]): DrawDraft {
  const slots = premadeSlots(plan.slots ?? [], field)
  const seeded = (plan.seeds ?? []).some(n => n !== null)
  const order = seeded
    ? slots.map((id, i) => ({ id, n: plan.seeds?.[i] ?? null }))
      .filter((x): x is { id: string; n: number } => x.id !== null && x.n !== null)
      .sort((a, b) => a.n - b.n).map(x => x.id)
    : []
  const known = new Set(order)
  return {
    method: seeded ? 'seeded' : 'manual',
    order: [...order, ...field.filter(id => !known.has(id))],
    layout: layoutFromSlots(slots),
    edited: true,
  }
}
