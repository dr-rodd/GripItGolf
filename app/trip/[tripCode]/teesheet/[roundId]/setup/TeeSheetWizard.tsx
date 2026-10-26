'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describeTime } from '@/lib/itinerary'
import { courseLabel } from '@/lib/courseDirectory'
import {
  type TeeBatch, type TeeRules, MAX_BATCHES, MAX_SLOTS, MAX_GROUP_SIZE, MIN_GROUP_SIZE,
  MIN_TEE_INTERVAL_MINS, MAX_TEE_INTERVAL_MINS,
  batchLast, clockMins, countToLast, minsClock, teeClocks, sheetLength, sheetCapacity,
  seatsShort, rulesIssue, describeRules,
} from '@/lib/teeSheet'
import WizardShell from '@/app/components/WizardShell'
import { Stepper } from '@/app/components/ItineraryForms'
import { ChoiceChips, FIELD, FIELD_LABEL, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { IconX } from '@/app/components/icons'

/**
 * The tee sheet wizard — a round's tee times, made in three steps and then
 * live (Ross, 26 Oct 2026). Times: one or more batches, each a first tee
 * time, the minutes between and how many (or the last tee time). Then
 * players a tee time — or whole teams, where the round's teammates share
 * one. Then a check, and the save.
 *
 * Never refuses a sheet too short for the field: it says so in a pop-up on
 * the way out and lets the organiser save it anyway, because a field that
 * has not all joined yet, or half of it playing elsewhere, is normal.
 *
 * Every rule is lib/teeSheet.ts's; this only asks and saves.
 */

/** A batch as the form holds it: the last tee time kept for when it is asked that way. */
type Draft = TeeBatch & { ends: 'count' | 'last'; last: string }

const TITLES = ['When do the groups go?', 'How many on each tee time?', 'Check the tee sheet'] as const

const TIME_STYLE: React.CSSProperties = {
  // Stops iOS sizing the field to the native control's preference.
  WebkitAppearance: 'none', appearance: 'none', minWidth: 0, maxWidth: '100%',
}

function toBatch(d: Draft): TeeBatch {
  const count = d.ends === 'last' ? countToLast(d.start, d.interval, d.last) ?? 0 : d.count
  return { start: d.start, interval: d.interval, count, ends: d.ends }
}

function toDraft(b: TeeBatch): Draft {
  return { ...b, ends: b.ends ?? 'count', last: batchLast(b) }
}

export default function TeeSheetWizard({
  tripId, roundId, roundNumber, courseName, itineraryItemId, initial, live,
  fieldSize, lastAssignedSlot, teamSize, backHref, doneHref,
}: {
  tripId: string
  roundId: string
  roundNumber: number
  courseName: string | null
  /** The round's golf item, where its start time lives. */
  itineraryItemId: string | null
  /** Where the form opens — lib/teeSheet.ts `draftRules`. */
  initial: TeeRules
  /** Whether the sheet is live already — a change rather than a first save. */
  live: boolean
  fieldSize: number
  /** The highest slot anybody stands in, or -1. */
  lastAssignedSlot: number
  /** Players in a team, where whole teams may share a tee time; else null. */
  teamSize: number | null
  backHref: string
  doneHref: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.batches.map(toDraft))

  const maxTeams = teamSize ? Math.floor(MAX_GROUP_SIZE / teamSize) : 0
  const [unit, setUnit] = useState<'players' | 'teams'>(
    initial.teamsPerTee && maxTeams > 0 ? 'teams' : 'players',
  )
  const [players, setPlayers] = useState(initial.groupSize)
  const [teams, setTeams] = useState(Math.min(Math.max(1, initial.teamsPerTee ?? 1), Math.max(1, maxTeams)))

  const byTeams = unit === 'teams' && !!teamSize && maxTeams > 0
  const rules: TeeRules = {
    batches: drafts.map(toBatch),
    groupSize: byTeams ? teams * teamSize! : players,
    ...(byTeams ? { teamsPerTee: teams } : {}),
  }
  const issue = rulesIssue(rules)
  const length = sheetLength(rules)
  const short = seatsShort(rules, fieldSize)
  const orphaned = lastAssignedSlot + 1 > length

  const [askShort, setAskShort] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts(prev => prev.map((d, j) => (j === i ? { ...d, ...p } : d)))

  function addBatch() {
    const prev = toBatch(drafts[drafts.length - 1])
    const after = (clockMins(batchLast(prev)) ?? 480) + 60
    const start = minsClock(Math.min(after - (after % 30) + 30, 22 * 60))
    setDrafts(d => [...d, toDraft({ start, interval: prev.interval, count: 4, ends: 'count' })])
  }

  function goBack() {
    if (step === 1) router.push(backHref)
    else setStep(step - 1)
  }

  async function save() {
    setAskShort(false)
    setSaving(true)
    setError(null)
    const first = rules.batches[0]
    const { error: e1 } = await supabase
      .from('rounds')
      .update({
        tee_sheet: rules,
        start_format: 'tee_sheet',
        // The older two, from the first batch, for anything still reading them.
        tee_interval_mins: first.interval,
        tee_group_size: rules.groupSize,
      })
      .eq('id', roundId)
      .eq('trip_id', tripId)
    if (e1) {
      console.error('Tee sheet save failed:', e1)
      setSaving(false)
      setError(/column|schema cache/i.test(e1.message ?? '')
        ? 'Could not save — a database update may not have been applied yet.'
        : 'Could not save the tee sheet — try again')
      return
    }
    // The round's start is the first tee time — the countdown, the weather
    // and the schedule read it off the golf item, so it moves with the sheet.
    if (itineraryItemId) {
      const { error: e2 } = await supabase
        .from('itinerary_items')
        .update({ tee_time: first.start, tee_count: length })
        .eq('id', itineraryItemId)
        .eq('trip_id', tripId)
      if (e2) {
        console.error('Tee sheet start time save failed:', e2)
        setSaving(false)
        setError('The sheet is saved, but the round’s start time could not be — try again')
        return
      }
    }
    router.push(doneHref)
    router.refresh()
  }

  function goNext() {
    if (step < 3) { setStep(step + 1); return }
    if (short > 0) { setAskShort(true); return }
    save()
  }


  return (
    <>
      <WizardShell
        step={step}
        titles={TITLES}
        intro={`Round ${roundNumber}${courseName ? ` at ${courseLabel(courseName)}` : ''}`}
        onBack={goBack}
        aboveTabBar
        footer={
          <>
            {error && <p className="text-rust-deep text-sm mb-3 text-center leading-snug">{error}</p>}
            <button type="button" onClick={goNext} disabled={!!issue || saving} className={buttonClass('primary')}>
              {step < 3 ? 'Continue' : saving ? 'Saving…' : live ? 'Save changes' : 'Make it live'}
            </button>
          </>
        }
      >
        {step === 1 && (
          <div className="flex flex-col gap-4">
            {drafts.map((d, i) => {
              const b = toBatch(d)
              return (
                <div key={i} className={`p-4 flex flex-col gap-4 ${cardClass()}`}>
                  {drafts.length > 1 && (
                    <div className="flex items-center justify-between -mb-1">
                      <p className="t-label text-ink">Batch {i + 1}</p>
                      <button
                        type="button"
                        onClick={() => setDrafts(prev => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove batch ${i + 1}`}
                        className="press w-11 h-11 -mr-2 flex items-center justify-center text-ink/65 hover:text-ink"
                      >
                        <IconX size={16} />
                      </button>
                    </div>
                  )}

                  <div>
                    <label className={FIELD_LABEL} htmlFor={`tee-start-${i}`}>First tee time</label>
                    <input
                      id={`tee-start-${i}`} type="time" value={d.start}
                      onChange={e => e.target.value && patch(i, { start: e.target.value })}
                      className={`${FIELD} block min-w-0 max-w-full`} style={TIME_STYLE}
                    />
                  </div>

                  <Stepper
                    label="Minutes between tee times"
                    value={d.interval}
                    min={MIN_TEE_INTERVAL_MINS}
                    max={MAX_TEE_INTERVAL_MINS}
                    unit={() => 'minutes'}
                    onChange={n => patch(i, { interval: n })}
                  />

                  <div>
                    <p className={FIELD_LABEL}>How long the batch runs</p>
                    <Segmented
                      label="How long the batch runs"
                      value={d.ends}
                      onChange={ends => patch(i, ends === 'last'
                        ? { ends, last: batchLast(b) }
                        : { ends, count: Math.max(1, b.count) })}
                      options={[
                        { value: 'count', label: 'Number of tee times' },
                        { value: 'last', label: 'Last tee time' },
                      ]}
                    />
                  </div>

                  {d.ends === 'count' ? (
                    <Stepper
                      label="Tee times"
                      value={d.count}
                      min={1}
                      max={MAX_SLOTS}
                      unit={n => (n === 1 ? 'tee time' : 'tee times')}
                      onChange={n => patch(i, { count: n })}
                    />
                  ) : (
                    <div>
                      <label className={FIELD_LABEL} htmlFor={`tee-last-${i}`}>Last tee time</label>
                      <input
                        id={`tee-last-${i}`} type="time" value={d.last}
                        onChange={e => e.target.value && patch(i, { last: e.target.value })}
                        className={`${FIELD} block min-w-0 max-w-full`} style={TIME_STYLE}
                      />
                    </div>
                  )}

                  <p className="t-cap text-ink/65 leading-snug" aria-live="polite">
                    {b.count < 1
                      ? 'The last tee time is before the first.'
                      : b.count === 1
                        ? `One tee time, at ${describeTime(b.start)}.`
                        : `${b.count} tee times, ${describeTime(b.start)} to ${describeTime(batchLast(b))}.`}
                  </p>
                </div>
              )
            })}

            {issue && (
              <p className="text-rust-deep text-sm leading-snug">{issue}</p>
            )}

            {drafts.length < MAX_BATCHES && (
              <div>
                <button type="button" onClick={addBatch} className={buttonClass('secondary')}>
                  Add another batch
                </button>
                <p className="t-cap text-ink/65 mt-2 leading-snug">
                  For tee times that aren’t back to back — a morning and an afternoon, say.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            {maxTeams > 0 && (
              <div>
                <p className={FIELD_LABEL}>Count each tee time in</p>
                <ChoiceChips
                  label="Count each tee time in"
                  value={unit}
                  onChange={setUnit}
                  options={[{ value: 'players', label: 'Players' }, { value: 'teams', label: 'Teams' }]}
                />
              </div>
            )}

            {byTeams ? (
              <div>
                <p className={FIELD_LABEL}>Teams on each tee time</p>
                <ChoiceChips
                  label="Teams on each tee time"
                  value={String(teams)}
                  onChange={n => setTeams(Number(n))}
                  options={Array.from({ length: maxTeams }, (_, k) => k + 1).map(n => ({
                    value: String(n),
                    label: `${n} (${n * teamSize!} players)`,
                  }))}
                />
              </div>
            ) : (
              <div>
                <p className={FIELD_LABEL}>Players on each tee time</p>
                <ChoiceChips
                  label="Players on each tee time"
                  value={String(players)}
                  onChange={n => setPlayers(Number(n))}
                  options={Array.from({ length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 }, (_, k) => MIN_GROUP_SIZE + k)
                    .map(n => ({ value: String(n), label: n }))}
                />
              </div>
            )}

            <p className="t-body text-ink/80 leading-snug">
              {length} tee time{length === 1 ? '' : 's'} with room for {sheetCapacity(rules)}.{' '}
              {fieldSize > 0 && `The field is ${fieldSize}.`}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className={`p-4 ${cardClass()}`}>
              <p className="t-card text-ink leading-snug">{describeRules(rules)}</p>
              <p className="t-cap text-ink/65 mt-1">
                Room for {sheetCapacity(rules)}{fieldSize > 0 ? ` — the field is ${fieldSize}` : ''}.
              </p>
              <ul className="flex flex-wrap gap-1.5 mt-3" aria-label="The tee times">
                {teeClocks(rules).map((t, i) => (
                  <li key={i} className="px-2 py-1 rounded-tile bg-tint t-cap text-ink tabular-nums">
                    {describeTime(t)}
                  </li>
                ))}
              </ul>
            </div>

            {short > 0 && (
              <p className="t-cap text-ink/80 leading-snug">
                {short} of the field won’t have a tee time on this sheet.
              </p>
            )}
            {orphaned && (
              <p className="t-cap text-ink/80 leading-snug">
                Somebody is on a tee time this takes away. They stay at the foot of the sheet,
                without a time, until they’re moved.
              </p>
            )}
            <p className="t-cap text-ink/65 leading-snug">
              {live
                ? 'Saving changes the sheet for everybody.'
                : 'Once it’s live, the tee times can be chosen and seen on the Tee times tab.'}
            </p>
          </div>
        )}
      </WizardShell>

      {askShort && createPortal(
        <>
          {/* The scrim's warm near-black constant, as every sheet's. */}
          <div
            className="fixed inset-0 z-50 page-enter"
            style={{ backgroundColor: 'rgba(20, 15, 11, 0.55)' }}
            onClick={() => setAskShort(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Not everyone has a tee time"
              className={`w-full max-w-md mx-auto sheet-up ${cardClass()}`}
            >
              <div className="px-5 py-4 border-b border-line">
                <h2 className="t-card text-ink">Not everyone has a tee time</h2>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <p className="t-body text-ink/80 leading-snug">
                  {short} of the {fieldSize} players won’t fit on {length} tee time{length === 1 ? '' : 's'}.
                  You can add tee times, or save it as it is.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setAskShort(false); setStep(1) }}
                    className={`${buttonClass('secondary', false)} flex-1`}
                  >
                    Add tee times
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className={`${buttonClass('primary', false)} flex-1`}
                  >
                    Save anyway
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
