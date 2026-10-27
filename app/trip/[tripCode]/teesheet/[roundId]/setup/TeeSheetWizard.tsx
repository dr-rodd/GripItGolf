'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describeShortDate, describeTime } from '@/lib/itinerary'
import { courseLabel } from '@/lib/courseDirectory'
import {
  type TeeBatch, type TeeRules, type TeeOpening, MAX_BATCHES, MAX_SLOTS, MAX_GROUP_SIZE, MIN_GROUP_SIZE,
  MIN_TEE_INTERVAL_MINS, MAX_TEE_INTERVAL_MINS, MAX_OPEN_DAYS_BEFORE,
  batchLast, clockMins, countToLast, minsClock, teeClocks, sheetLength, sheetCapacity,
  seatsShort, rulesIssue, describeRules, describeOpening,
} from '@/lib/teeSheet'
import { type CarriedPartnership, withPlayTogether } from '@/lib/partnerships'
import { setTeam } from '@/lib/teamMembers'
import DateField from '@/app/components/DateField'
import WizardShell from '@/app/components/WizardShell'
import { Stepper } from '@/app/components/ItineraryForms'
import { ChoiceChips, FIELD, FIELD_LABEL, Segmented, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { IconX } from '@/app/components/icons'

/**
 * The tee sheet wizard — opening a round's tee sheet, in four steps
 * (Ross, 26 Oct 2026: making a sheet is called opening it). Times: one or
 * more batches, each a first tee time, the minutes between and how many (or
 * the last tee time). Then players a tee time — or whole teams, where the
 * round's teammates share one. Then when it opens to the field: now, some
 * days before the round at a time, or on a date at a time, Irish time. Then
 * a check, and the save. A sheet already open can be deleted from the first
 * step — the round goes back to "not open yet", as if it never was.
 *
 * Never refuses a sheet too short for the field: it says so in a pop-up on
 * the way out and lets the organiser save it anyway, because a field that
 * has not all joined yet, or half of it playing elsewhere, is normal.
 *
 * Every rule is lib/teeSheet.ts's; this only asks and saves.
 */

/** A batch as the form holds it: the last tee time kept for when it is asked that way. */
type Draft = TeeBatch & { ends: 'count' | 'last'; last: string }

const TITLES = ['When do the groups go?', 'How many on each tee time?', 'When does it open?', 'Check the tee sheet'] as const

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
  tripId, roundId, roundNumber, courseName, roundDate, itineraryItemId, initial, live,
  fieldSize, lastAssignedSlot, teamSize, playTogether = null, carried = null, backHref, doneHref,
}: {
  tripId: string
  roundId: string
  roundNumber: number
  courseName: string | null
  /** The round's date — what "days before" counts back from. Null offers only a date. */
  roundDate: string | null
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
  /**
   * "Do players play in their teams?" — asked of a league of teams of four
   * or fewer governing this round (lib/partnerships.ts), with its answer so
   * far. Null when there is nothing to ask: a pair always plays together.
   */
  playTogether?: { boardId: string; together: boolean; answered: boolean; size: number | null } | null
  /**
   * The last round's partnerships, for a round that makes its own and has
   * none yet — made on its sheet when it is first opened (lib/partnerships.ts
   * `carriedPartnerships`). Null when there is nothing to carry.
   */
  carried?: { sheet: string; teams: CarriedPartnership[] } | null
  backHref: string
  doneHref: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.batches.map(toDraft))

  // Yes, they play in their teams — the partnerships go out together, and
  // a tee time can be counted in whole teams where their size is known.
  const [together, setTogether] = useState(playTogether?.together ?? true)
  const unitSize = playTogether ? (together ? playTogether.size ?? teamSize : null) : teamSize
  const maxTeams = unitSize ? Math.floor(MAX_GROUP_SIZE / unitSize) : 0
  const [unit, setUnit] = useState<'players' | 'teams'>(
    initial.teamsPerTee && maxTeams > 0 ? 'teams' : 'players',
  )
  const [players, setPlayers] = useState(initial.groupSize)
  const [teams, setTeams] = useState(Math.min(Math.max(1, initial.teamsPerTee ?? 1), Math.max(1, maxTeams)))

  // When it opens — now, some days before the round, or on a date — each
  // answer's fields kept while another is chosen, so changing your mind
  // loses nothing.
  const o = initial.opens
  const [openMode, setOpenMode] = useState<'now' | 'before' | 'date'>(
    !o ? 'now' : 'date' in o ? 'date' : roundDate ? 'before' : 'now',
  )
  const [openDays, setOpenDays] = useState(o && 'daysBefore' in o ? o.daysBefore : 3)
  const [openTime, setOpenTime] = useState(o?.time ?? '20:00')
  const [openDate, setOpenDate] = useState(o && 'date' in o ? o.date : '')
  const opens: TeeOpening | null = openMode === 'before' && roundDate ? { daysBefore: openDays, time: openTime }
    : openMode === 'date' ? { date: openDate, time: openTime }
    : null

  const byTeams = unit === 'teams' && !!unitSize && maxTeams > 0
  const rules: TeeRules = {
    batches: drafts.map(toBatch),
    groupSize: byTeams ? teams * unitSize! : players,
    ...(byTeams ? { teamsPerTee: teams } : {}),
    ...(opens ? { opens } : {}),
  }
  // Each step answers for its own questions: the times and group size on
  // the first two, the opening from the third — so an opening half chosen
  // never holds the first step's Continue.
  const timesIssue = rulesIssue({ batches: rules.batches, groupSize: rules.groupSize })
  const issue = rulesIssue(rules)
  const stepIssue = step <= 2 ? timesIssue : issue
  const length = sheetLength(rules)
  const short = seatsShort(rules, fieldSize)
  const orphaned = lastAssignedSlot + 1 > length

  const [askShort, setAskShort] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opensLine = describeOpening(rules, roundDate)

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
    // The answer to "Do players play in their teams?", written onto the
    // board it was asked of — first time, or changed. Read fresh and edited
    // in place, so nothing else on the boards is touched on the way past.
    if (playTogether && (!playTogether.answered || together !== playTogether.together)) {
      const { data: fresh, error: e0 } = await supabase
        .from('trips').select('leaderboards').eq('id', tripId).single()
      const { error: e3 } = e0 ? { error: e0 } : await supabase
        .from('trips')
        .update({ leaderboards: withPlayTogether((fresh as { leaderboards?: unknown } | null)?.leaderboards, playTogether.boardId, together) })
        .eq('id', tripId)
      if (e3) {
        console.error('Play-together answer save failed:', e3)
        setSaving(false)
        setError('The sheet is saved, but whether players play in their teams could not be — try again')
        return
      }
    }
    // Each round, carried over: the last round's partnerships made on this
    // round's own sheet, so nobody re-picks unless they want to change. A
    // failure here leaves the sheet open and says so — the partnerships can
    // still be made on the sheet itself.
    if (carried && together) {
      for (const t of carried.teams) {
        const { data: made, error: e4 } = await supabase
          .from('teams')
          .insert({ trip_id: tripId, team_set: carried.sheet, name: t.name, color: t.color })
          .select('id')
          .single()
        const failed = e4 || !made
          ? true
          : (await Promise.all(t.playerIds.map(id => setTeam(tripId, id, carried.sheet, (made as { id: string }).id))))
              .some(Boolean)
        if (failed) {
          console.error('Carrying partnerships over failed:', e4)
          setSaving(false)
          setError('The sheet is saved, but last round’s teams could not be carried over — make them on the sheet')
          return
        }
      }
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
    if (step < TITLES.length) { setStep(step + 1); return }
    if (short > 0) { setAskShort(true); return }
    save()
  }

  /**
   * The sheet gone, as if it was never opened: its rules and everybody on
   * it. The round stays a tee-sheet round — "not open yet" on the Tee times
   * tab, ready to be opened again. Bookings first, so a failure part-way
   * leaves an open sheet with fewer names rather than names on no sheet.
   */
  async function deleteSheet() {
    setAskDelete(false)
    setSaving(true)
    setError(null)
    const { error: e1 } = await supabase
      .from('tee_assignments')
      .delete()
      .eq('trip_id', tripId)
      .eq('round_id', roundId)
    const { error: e2 } = e1 ? { error: e1 } : await supabase
      .from('rounds')
      .update({ tee_sheet: null })
      .eq('id', roundId)
      .eq('trip_id', tripId)
    if (e1 || e2) {
      console.error('Tee sheet delete failed:', e1 ?? e2)
      setSaving(false)
      setError('Could not delete the tee sheet — try again')
      return
    }
    router.push(doneHref)
    router.refresh()
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
            <button type="button" onClick={goNext} disabled={!!stepIssue || saving} className={buttonClass('primary')}>
              {step < TITLES.length ? 'Continue' : saving ? 'Saving…' : live ? 'Save changes' : 'Open tee sheet'}
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

            {timesIssue && (
              <p className="text-rust-deep text-sm leading-snug">{timesIssue}</p>
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

            {live && (
              <div className="pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setAskDelete(true)}
                  disabled={saving}
                  className={buttonClass('danger')}
                >
                  Delete this tee sheet
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            {/* Asked here, where it shapes the sheet (Ross, 27 Oct 2026):
                yes makes each team a partnership — booked onto a tee time
                as one, and shown together everywhere. */}
            {playTogether && (
              <div>
                <p className={FIELD_LABEL}>Do players play in their teams?</p>
                <ChoiceChips
                  label="Do players play in their teams?"
                  value={together ? 'yes' : 'no'}
                  onChange={v => {
                    setTogether(v === 'yes')
                    if (v !== 'yes') setUnit('players')
                  }}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
                <p className="t-cap text-ink/65 mt-1.5 leading-snug">
                  {together
                    ? 'Each team goes out together and books its tee time as one.'
                    : 'Teammates can go out at different times — every card still counts for the team.'}
                </p>
              </div>
            )}

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
                    label: `${n} (${n * unitSize!} players)`,
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
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setOpenMode('now')} aria-pressed={openMode === 'now'} className={optionClass(openMode === 'now')}>
              <p className="text-[17px] font-medium leading-snug text-ink">Now</p>
              <p className="t-cap text-ink/65 mt-0.5">The field sees it and picks from it as soon as it’s saved.</p>
            </button>

            {roundDate && (
              <div className={optionClass(openMode === 'before')}>
                <button type="button" onClick={() => setOpenMode('before')} aria-pressed={openMode === 'before'} className="w-full text-left">
                  <p className="text-[17px] font-medium leading-snug text-ink">Some days before the round</p>
                  <p className="t-cap text-ink/65 mt-0.5">The round is on {describeShortDate(roundDate)}.</p>
                </button>
                {openMode === 'before' && (
                  <div className="flex flex-col gap-4 mt-4">
                    <Stepper
                      label="Days before"
                      value={openDays}
                      min={0}
                      max={MAX_OPEN_DAYS_BEFORE}
                      unit={n => (n === 0 ? 'on the day' : n === 1 ? 'day before' : 'days before')}
                      onChange={setOpenDays}
                    />
                    <div>
                      <label className={FIELD_LABEL} htmlFor="tee-open-time-before">At</label>
                      <input
                        id="tee-open-time-before" type="time" value={openTime}
                        onChange={e => e.target.value && setOpenTime(e.target.value)}
                        className={`${FIELD} block min-w-0 max-w-full`} style={TIME_STYLE}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className={optionClass(openMode === 'date')}>
              <button type="button" onClick={() => setOpenMode('date')} aria-pressed={openMode === 'date'} className="w-full text-left">
                <p className="text-[17px] font-medium leading-snug text-ink">On a date</p>
                <p className="t-cap text-ink/65 mt-0.5">A day and a time of your choosing.</p>
              </button>
              {openMode === 'date' && (
                <div className="flex flex-col gap-4 mt-4">
                  <DateField label="Date" value={openDate} onChange={setOpenDate} max={roundDate ?? undefined} />
                  <div>
                    <label className={FIELD_LABEL} htmlFor="tee-open-time-date">At</label>
                    <input
                      id="tee-open-time-date" type="time" value={openTime}
                      onChange={e => e.target.value && setOpenTime(e.target.value)}
                      className={`${FIELD} block min-w-0 max-w-full`} style={TIME_STYLE}
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="t-cap text-ink/65 leading-snug" aria-live="polite">
              {opensLine
                ? `Opens ${opensLine}, Irish time. Until then the field sees when it opens; you can see it and place players early.`
                : openMode === 'now' ? 'Opens as soon as it’s saved.' : ''}
            </p>
            {issue && <p className="text-rust-deep text-sm leading-snug">{issue}</p>}
          </div>
        )}

        {step === 4 && (
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
            <p className="t-cap text-ink/80 leading-snug">
              {opensLine ? `Opens ${opensLine}.` : 'Opens as soon as it’s saved.'}
            </p>
            <p className="t-cap text-ink/65 leading-snug">
              {live
                ? 'Saving changes the sheet for everybody.'
                : 'Once it’s open, the tee times can be seen and chosen on the Tee times tab.'}
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

      {askDelete && createPortal(
        <>
          <div
            className="fixed inset-0 z-50 page-enter"
            style={{ backgroundColor: 'rgba(20, 15, 11, 0.55)' }}
            onClick={() => setAskDelete(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Delete this tee sheet"
              className={`w-full max-w-md mx-auto sheet-up ${cardClass()}`}
            >
              <div className="px-5 py-4 border-b border-line">
                <h2 className="t-card text-ink">Delete round {roundNumber}’s tee sheet?</h2>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <p className="t-body text-ink/80 leading-snug">
                  Its tee times go, and everybody on them loses their time. The round goes back
                  to not open yet, ready to be opened again.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAskDelete(false)}
                    className={`${buttonClass('secondary', false)} flex-1`}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={deleteSheet}
                    className={`${buttonClass('danger', false)} flex-1`}
                  >
                    Delete
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
