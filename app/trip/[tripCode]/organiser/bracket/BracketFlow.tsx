'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import Toggle from '@/app/components/Toggle'
import WizardShell from '@/app/components/WizardShell'
import RoundDeadlines from '@/app/components/RoundDeadlines'
import { buildsNow } from '@/app/components/BracketDrawer'
import DrawPlanner, { DRAW_INTRO, type DrawPlannerValue } from '@/app/components/DrawPlanner'
import {
  describeDrawPlan, draftFromSlots, draftIssue, draftSlots, newDraft, sameSlots, syncDraft,
  type DrawEntrant, type DrawPlan,
} from '@/lib/bracketDraw'
import {
  BRACKET_MODES, PLAYER_ENTRIES, SEEDINGS, deadlinesAnswerFrom, deadlinesAnswerIssue, normalizeEventCode,
  storedDeadlines, validEventCode,
  type BracketMode, type BracketSetup, type DeadlinesAnswer, type PlayerEntry, type Seeding,
} from '@/lib/bracketSetup'
import { describeShortDate, describeTime } from '@/lib/itinerary'
import { MAX_BRACKET } from '@/lib/matchplay'
import { todayString } from '@/lib/tripStatus'
import type { EntrantKind } from '@/lib/matchplayEntrants'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { useTripBase } from '@/app/trip/[tripCode]/TripBase'

/**
 * The bracket, from the organiser area — the same flow as at creation
 * (Ross, 5 Nov 2026: "so it is the same as doing it at creation"):
 *
 * 1. **Plan the draw** — `DrawPlanner`, creation's own screen, the draw
 *    already made read back into the bracket to change (until it is in
 *    play, when it is only said to be);
 * 2. **deadlines**, only once there is a bracket — "Do you want to set a
 *    deadline for each round to be completed?", a date for each of its
 *    rounds (`RoundDeadlines`);
 * 3. **More settings** — strict or relaxed, how the field gets in, a
 *    qualifying event, and whether it is locked in.
 *
 * One Save at the end: the draw when it was made or changed (the one
 * writer, `writeDraw`, which refuses a draw in play), then the answers
 * merged into the setup read fresh (`saveBracketSetup`).
 */
type StepKey = 'draw' | 'deadlines' | 'more'

const STEP_TITLES: Record<StepKey, string> = {
  draw: 'Plan the draw',
  deadlines: 'Set a deadline for each round?',
  more: 'More settings',
}
const INTROS: Record<StepKey, string | undefined> = {
  draw: DRAW_INTRO,
  deadlines: 'Do you want to set a deadline for each round to be completed?',
  more: 'Who decides the matches, how players get in, and the rest.',
}

export default function BracketFlow({
  tripId, tripCode, kind, entrants, drawn, inPlay, drawnRounds, plan, setup, existing, startDate,
}: {
  tripId: string
  tripCode: string
  kind: EntrantKind
  entrants: DrawEntrant[]
  /** A draw is made. */
  drawn: boolean
  /** …and has started: a result played, or a hole on a card. */
  inPlay: boolean
  /** How many rounds the draw made has. */
  drawnRounds: number
  plan: DrawPlan | null
  setup: BracketSetup
  /** The draw made, as its first round — what the bracket opens on. */
  existing: { slots: (string | null)[]; seeds: (number | null)[] } | null
  /** The event's start, where the first round's calendar opens. */
  startDate: string | null
}) {
  const tripHome = useTripBase(tripCode)
  const router = useRouter()
  const field = entrants.map(e => e.id)
  const today = todayString(new Date())

  // 1 · The draw: the one made, or the plan, or a fresh bracket.
  const [value, setValue] = useState<DrawPlannerValue>(() => ({
    timing: {
      when: drawn ? 'now' : field.length < 2 ? 'later' : plan?.when === 'date' ? 'date' : 'later',
      on: plan?.on ?? '',
      at: plan?.at ?? '20:00',
      seeding: plan?.seeding ?? 'random',
    },
    draft: existing ? draftFromSlots(existing.slots, existing.seeds, field)
      : plan?.seeding === 'premade' && plan.slots ? draftFromSlots(plan.slots, plan.seeds, field)
        : newDraft(field),
  }))
  const t = value.timing
  const draft = syncDraft(value.draft, field)
  // Is there a bracket to set deadlines against? One in play, or one being
  // built now (made now, or pre-made for its date) — never a draw still to
  // be allocated, whose rounds nobody knows yet (Ross: "no need to ask for
  // dates if the user hasn't yet made a bracket").
  const building = !inPlay && buildsNow(t) && field.length >= 2
  const rounds = inPlay ? drawnRounds : building ? draft.layout.rounds : 0
  const keys: StepKey[] = ['draw', ...(rounds > 0 ? ['deadlines' as const] : []), 'more']

  // 2 · Deadlines
  const [deadlines, setDeadlines] = useState<DeadlinesAnswer>(() => deadlinesAnswerFrom(setup.deadlines))

  // 3 · More settings
  const [mode, setMode] = useState<BracketMode>(setup.mode)
  const [entry, setEntry] = useState<PlayerEntry>(setup.entry)
  const [qualifyingOn, setQualifyingOn] = useState(!!setup.qualifying)
  const [qualCode, setQualCode] = useState(setup.qualifying?.eventCode ?? '')
  const [seeding, setSeeding] = useState<Seeding>(setup.qualifying?.seeding ?? 'random')
  const [locked, setLocked] = useState(setup.finalized)

  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const step = keys[Math.min(index, keys.length - 1)]
  const dateProblem = t.when !== 'date' ? null
    : !t.on ? 'Choose the day of the draw.'
      : t.on < today ? 'The day of the draw has passed.'
        : !t.at ? 'Choose the time it goes live.' : null
  const drawProblem = inPlay ? null : (building ? draftIssue(draft, field, MAX_BRACKET) : null) ?? dateProblem
  const code = normalizeEventCode(qualCode)
  const problem =
    step === 'draw' ? drawProblem
      : step === 'deadlines' ? deadlinesAnswerIssue(deadlines, rounds)
        : qualifyingOn && !validEventCode(code) ? 'Enter the qualifying event’s six-character code.' : null

  const isLast = index >= keys.length - 1
  const describe = (p: DrawPlan | null) => describeDrawPlan(p, d => describeShortDate(d) ?? d, describeTime)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (qualifyingOn) {
        if (code === tripCode.toUpperCase()) throw new Error('An event cannot qualify for itself — use the qualifying event’s own code.')
        const { data: qual, error: qualErr } = await supabase.from('trips').select('id').eq('trip_code', code).maybeSingle()
        if (qualErr || !qual) throw new Error(`Could not find an event with the code ${code} — check it and try again.`)
      }
      const { slots, seeds } = draftSlots(draft)
      // The draw, when it is made now and is new or changed.
      const makeNow = building && t.when === 'now'
      const changed = !existing || !sameSlots(slots, existing.slots)
      if (makeNow && changed) {
        if (drawn && !window.confirm('Make the draw again? The draw already made is replaced.')) { setBusy(false); return }
        const { writeDraw } = await import('@/lib/drawStore')
        const byId = new Map(entrants.map(e => [e.id, e]))
        await writeDraw(supabase, tripId, slots.map(id => {
          const e = id ? byId.get(id) : null
          return e ? { id: e.id, name: e.name } : null
        }), { seeds, kind })
      }
      // The plan: none once made; else when, and how.
      const nextPlan: DrawPlan | null = inPlay ? plan
        : t.when === 'now' ? null
          : t.when === 'later' ? { when: 'later' }
            : {
                when: 'date', on: t.on, at: t.at, seeding: t.seeding,
                ...(t.seeding === 'order' ? { order: draft.order } : {}),
                ...(t.seeding === 'premade' ? { slots, ...(seeds ? { seeds } : {}) } : {}),
              }
      const { saveBracketSetup } = await import('@/lib/drawStore')
      await saveBracketSetup(supabase, tripId, {
        ...(inPlay ? {} : { draw: nextPlan }),
        deadlines: rounds > 0 ? storedDeadlines(deadlines, rounds) : undefined,
        ...(setup.finalized ? {} : {
          mode, entry, finalized: locked,
          qualifying: qualifyingOn ? { eventCode: code, seeding } : null,
        }),
      })
      setDone(makeNow && changed ? 'The draw is made.' : nextPlan ? describe(nextPlan) : 'Saved.')
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Could not save the bracket — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main className="min-h-dvh paper has-tabbar page-enter">
        <TripHeader backTo={`${tripHome}/organiser`} />
        <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
          <h1 className="t-h1 text-ink mb-1">Bracket saved</h1>
          <p className="text-ink/65 text-sm mb-6">{done}</p>
          <div className="space-y-3">
            <Link href={`${tripHome}/matchplay`} className={buttonClass('primary')}>See the bracket</Link>
            <Link href={`${tripHome}/organiser`} className={buttonClass('secondary')}>Back to the organiser area</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`${tripHome}/organiser`} />
      <div className="page-enter">
        <WizardShell
          step={index + 1}
          titles={keys.map(k => STEP_TITLES[k])}
          intro={INTROS[step]}
          onBack={() => { setError(null); if (index > 0) setIndex(index - 1); else router.push(`${tripHome}/organiser`) }}
          aboveTabBar
          footer={(
            <button
              type="button"
              disabled={busy || !!problem}
              onClick={() => (isLast ? save() : setIndex(index + 1))}
              className={buttonClass('primary')}
            >
              {busy ? 'Saving…' : isLast ? 'Save' : 'Continue'}
            </button>
          )}
        >
          {step === 'draw' && (inPlay ? (
            <div className={`p-5 ${cardClass()}`}>
              <p className="t-card text-ink">The draw is in play</p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A match has a result or a card has scores, so the draw is not made again from here.
                Results are changed on the bracket with the admin PIN. Its deadlines and settings are next.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {drawn && (
                <p className={`p-4 text-sm text-ink/80 leading-snug ${cardClass('flat')}`}>
                  This is the draw as it was made, and nothing has been played yet. Change it here, and Save makes it again.
                </p>
              )}
              <DrawPlanner
                entrants={entrants}
                value={value}
                onChange={setValue}
                issue={drawProblem}
                today={today}
                heading={false}
                allowLater={!drawn}
                allowOrder={draft.method === 'seeded'}
              />
            </div>
          ))}

          {step === 'deadlines' && (
            <RoundDeadlines value={deadlines} onChange={setDeadlines} rounds={rounds} start={startDate} />
          )}

          {step === 'more' && (setup.finalized ? (
            <div className={`p-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">Locked in</p>
              <p className="t-cap text-ink/65 mt-0.5 leading-snug">
                {BRACKET_MODES.find(m => m.key === setup.mode)?.label} · {PLAYER_ENTRIES.find(e => e.key === setup.entry)?.label}
                {setup.qualifying ? ` · qualifier ${setup.qualifying.eventCode}` : ''}. These can no longer be changed.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <Choice label="Who decides the matches?" options={BRACKET_MODES} chosen={mode} onChoose={setMode} />
              <Choice label="How does the field get in?" options={PLAYER_ENTRIES} chosen={entry} onChoose={setEntry} />
              <div className="space-y-3">
                <div className={`flex items-start justify-between gap-4 p-4 ${cardClass()}`}>
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium">Qualifying event</p>
                    <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">Feed the bracket from another event&apos;s standings.</p>
                  </div>
                  <Toggle checked={qualifyingOn} onChange={setQualifyingOn} label="Attach a qualifying event" />
                </div>
                {qualifyingOn && (
                  <>
                    <div>
                      <label className={FIELD_LABEL} htmlFor="qual-code">Qualifying event code</label>
                      <input id="qual-code" type="text" value={qualCode} onChange={e => setQualCode(e.target.value.toUpperCase())}
                        placeholder="e.g. QX7K2P" maxLength={6} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                        className={`${FIELD} field-code`} />
                    </div>
                    <Choice label="How the qualifiers are drawn" options={SEEDINGS} chosen={seeding} onChoose={setSeeding} />
                  </>
                )}
              </div>
              <Choice
                label="Lock it in?"
                options={[
                  { key: 'open', label: 'Leave open', hint: 'These answers stay changeable.' },
                  { key: 'locked', label: 'Lock it in', hint: 'Saving fixes these answers for good.' },
                ] as const}
                chosen={locked ? 'locked' : 'open'}
                onChoose={k => setLocked(k === 'locked')}
              />
            </div>
          ))}

          {problem && step !== 'draw' && step !== 'deadlines' && <p className="t-cap text-rust-deep mt-4">{problem}</p>}
          {error && (
            <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
              <p className="text-rust-deep text-sm">{error}</p>
            </div>
          )}
        </WizardShell>
      </div>
    </main>
  )
}

/** A question answered by a chip, its hint under it. */
function Choice<K extends string>({ label, options, chosen, onChoose }: {
  label: string
  options: readonly { key: K; label: string; hint: string }[]
  chosen: K
  onChoose: (key: K) => void
}) {
  return (
    <div>
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex gap-1.5">
        {options.map(o => (
          <button key={o.key} type="button" aria-pressed={chosen === o.key} onClick={() => onChoose(o.key)}
            className={`${chipClass(chosen === o.key)} flex-1`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="t-cap text-ink/65 mt-1.5 leading-snug">{options.find(o => o.key === chosen)?.hint}</p>
    </div>
  )
}
