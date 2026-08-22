'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import CourseSelect from '@/app/components/CourseSelect'
import HandicapField from '@/app/components/HandicapField'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { NO_FORMATS } from '@/lib/formats'
import { normaliseEmail, emailWarning, MAX_EMAIL } from '@/lib/email'
import { rememberPlayer } from '@/lib/playerCookie'
import {
  dayCount, dateForDay, describeDay, dayNumber, type ItineraryItem,
} from '@/lib/itinerary'
import { toItemRow } from '@/lib/itinerarySync'
import {
  MIN_PASSCODE, MAX_PASSCODE, hashPasscode, passcodeError,
} from '@/lib/passcode'
import { parseHandicap, isPlusHandicap, PLUS_HANDICAP_WARNING } from '@/lib/handicap'
import { firstDuplicateIndex, duplicateNameError } from '@/lib/roster'
import { type PlayerEntry, PLAYER_ENTRIES } from '@/lib/bracketSetup'
import {
  type DayBoards, type LeagueSetup, type LeagueSchedule, DAY_BOARDS,
  MAX_LEAGUE_DAYS, WEEKDAY_NAMES, leagueDaysIssue, starterBoards, weeklyDates,
} from '@/lib/leagueSetup'
import type { Leaderboard } from '@/lib/leaderboards'
import LeaderboardSetup from '@/app/components/LeaderboardSetup'
import { describeError, generateCode } from './CreateTripForm'

/**
 * Creating a league event — the league branch of the tournament door.
 *
 * Not the trip wizard re-worn: a league has no itinerary to build and no
 * formats to defer. It is venues, dates, a field and a leaderboard, and it
 * plays from the moment it exists — so this form is its own four steps,
 * purpose-built, and what it reuses from the trip wizard is the proven
 * underneath: the course picker, the player fields, the date fields, the
 * shared row mapping (`toItemRow`) and the shared write order.
 *
 * Single day is deliberately lightweight — one venue, one date, one
 * leaderboard, live scoring, nothing more elaborate. Multi-day adds a venue
 * per day (or one for all, behind a toggle) and one extra question: how the
 * days relate on the leaderboard (lib/leagueSetup.ts `DayBoards`).
 *
 * What creation writes: the trip row (kind 'tournament', the league setup
 * whole in `bracket_setup`, the starter Stableford board in
 * `leaderboards`), the players, one golf itinerary item per day, the rounds
 * those become, and the handicap snapshots — the platform's insertion
 * order, same as the trip wizard's.
 */

// ── Styles shared with the trip wizard, by convention not import ─────────

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

const LABEL = 'block text-ink/80 text-[13px] uppercase tracking-wider mb-2'

const STEP_LABELS = ['Event details', 'Venues', 'Players', 'Finish']

type PlayerInput = { name: string; handicap: string; gender: 'M' | 'F' }

/** The chip row every either/or question on this form is asked with. */
function Chips<K extends string>({ options, chosen, onChoose }: {
  options: readonly { key: K; label: string }[]
  chosen: K | null
  onChoose: (key: K) => void
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChoose(o.key)}
          aria-pressed={chosen === o.key}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
            chosen === o.key
              ? 'bg-accent-deep text-white'
              : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function CreateLeagueForm({ schedule }: {
  /**
   * The shape chosen on the tournament door — standalone (a single point
   * in time, one day or a run), continuous (a period with the playing days
   * picked inside it, by hand or weekly), or series (a list of events with
   * no dates at all). Decides which questions step one asks and what the
   * venues step is a list of; the players, boards and write path are the
   * same underneath whichever it is.
   */
  schedule: LeagueSchedule
}) {
  // The platform course list, fetched while the event is being named —
  // venues are step two, so it loads behind the first screen exactly as it
  // does on the trip wizard.
  const { courses: fetched, loaded: coursesLoaded } = usePlatformCourses()
  // A course added mid-build lives here — the fetched list is never mutated,
  // the same rule ItineraryBuilder keeps with its own addedCourses.
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const courses = useMemo(() => {
    const extra = added.filter(a => !fetched.some(c => c.id === a.id))
    return [...fetched, ...extra]
  }, [fetched, added])

  function onCourseAdded(course: DirectoryCourse) {
    setAdded(prev => [...prev.filter(c => c.id !== course.id), course])
  }

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 'done'>(1)

  // Step 1 — the event
  const [name, setName] = useState('')
  const [multiDay, setMultiDay] = useState<boolean | null>(null)
  // Standalone: the run's ends (single day writes one date to both).
  // Continuous: the period the event occupies.
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')

  // Continuous — the playing days inside the period: every week on one
  // day, or picked by hand.
  const [repeatOn, setRepeatOn] = useState(false)
  const [weekday, setWeekday] = useState<number | null>(null)
  const [manualDates, setManualDates] = useState<string[]>([''])

  // Series — how many events the list starts with; more can be added to
  // the running order later, which is the point of a series.
  const [seriesCount, setSeriesCount] = useState(1)

  // Step 2 — venues. `venues[i]` is slot i's course id (day i, or event i
  // of a series); with the toggle on, the first pick is every slot's and
  // the rest are ignored. A continuous league keys by date instead, so a
  // date added or removed in step one cannot silently shuffle the courses.
  const [venues, setVenues] = useState<string[]>([])
  const [dateVenues, setDateVenues] = useState<Record<string, string>>({})
  const [sameVenue, setSameVenue] = useState(false)

  // Step 3 — the field
  const [entry, setEntry] = useState<PlayerEntry | null>(null)
  const [requireApproval, setRequireApproval] = useState(false)
  const [organiserPlaying, setOrganiserPlaying] = useState(true)
  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', handicap: '', gender: 'M' },
  ])

  // Step 4 — the leaderboards, how the days relate, and the organiser PIN.
  // Seeded with the starter board so a league that never touches the picker
  // still plays from the moment it exists; the picker itself is the same
  // LeaderboardSetup Trip Setup runs, so creation can offer exactly the
  // competitions the platform can score and not one more.
  const [boards, setBoards] = useState<Leaderboard[]>(() => starterBoards())
  const [dayBoards, setDayBoards] = useState<DayBoards | null>(null)
  const [passcode, setPasscode] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultCode, setResultCode] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Derived shape ────────────────────────────────────────────────────────

  const datesBackwards = !!(startDate && endDate && endDate < startDate)
  const periodSet = !!(startDate && endDate && !datesBackwards)

  // A continuous league's playing days: every week on one day, or picked
  // by hand — deduped and sorted either way, because the running order is
  // the order the days happen, not the order they were typed.
  const playDates = schedule !== 'continuous'
    ? []
    : repeatOn
      ? (weekday !== null && periodSet ? weeklyDates(startDate, endDate, weekday) : [])
      : [...new Set(manualDates.filter(Boolean))].sort()
  const manualOutside = schedule === 'continuous' && !repeatOn && periodSet
    && manualDates.some(d => d && (d < startDate || d > endDate))

  /**
   * The playing slots — what a round will be made from, whatever the
   * shape. Standalone: the run's consecutive days. Continuous: the picked
   * dates, each at its calendar offset inside the period so `dateForDay`
   * keeps telling the truth about it. Series: numbered events, no dates.
   * The rounds are the one copy of this after creation.
   */
  const slots: { dayIndex: number; date: string | null }[] =
    schedule === 'standalone'
      ? Array.from(
          { length: multiDay ? dayCount(startDate || null, endDate || null) : 1 },
          (_, i) => ({ dayIndex: i, date: dateForDay(startDate || null, i) }),
        )
      : schedule === 'continuous'
        ? playDates.map(d => ({
            dayIndex: (dayNumber(d)! - dayNumber(startDate)!) / 86_400_000,
            date: d,
          }))
        : Array.from({ length: seriesCount }, (_, i) => ({ dayIndex: i, date: null }))

  const daysIssue = leagueDaysIssue(slots.length, schedule)

  const venueFor = (slot: { date: string | null }, i: number) =>
    (sameVenue
      ? venues[0]
      : schedule === 'continuous' && slot.date
        ? dateVenues[slot.date]
        : venues[i]) ?? ''
  const venuesComplete = slots.length > 0 && slots.every((s, i) => venueFor(s, i) !== '')

  const duplicateIndex = firstDuplicateIndex(players.map(p => p.name))
  const duplicateIssue = duplicateIndex === -1
    ? null
    : duplicateNameError(players[duplicateIndex].name)

  const passcodeIssue =
    passcodeError(passcode) ??
    (passcode !== passcodeConfirm ? 'The two passcodes do not match.' : null)

  const step1Valid =
    name.trim().length > 0 &&
    (schedule === 'standalone'
      ? multiDay !== null && (multiDay
          ? !!startDate && !!endDate && !datesBackwards && !daysIssue
          : !!startDate)
      : schedule === 'continuous'
        ? periodSet && !manualOutside && slots.length > 0 && !daysIssue
          && (!repeatOn || weekday !== null)
        : !daysIssue)

  const canProceed = !submitting && (
    step === 1 ? step1Valid :
    step === 2 ? venuesComplete :
    step === 3 ? !!entry && !duplicateIssue :
    step === 4 ? boards.length > 0 && (slots.length <= 1 || !!dayBoards) && !passcodeIssue :
    false
  )

  function goNext() {
    if (step === 'done') return
    if (step < 4) setStep((step + 1) as 2 | 3 | 4)
    else handleSubmit()
  }

  function goBack() {
    setError(null)
    if (step !== 'done' && step > 1) setStep((step - 1) as 1 | 2 | 3)
  }

  function setVenue(i: number, id: string) {
    setVenues(prev => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = id
      return next
    })
  }

  function setDateVenue(date: string, id: string) {
    setDateVenues(prev => ({ ...prev, [date]: id }))
  }

  function setManualDate(i: number, value: string) {
    setManualDates(prev => prev.map((d, idx) => (idx === i ? value : d)))
  }

  // ── Player helpers — the trip wizard's, same shapes ─────────────────────

  function addPlayer() {
    setPlayers(prev => [...prev, { name: '', handicap: '', gender: 'M' }])
  }
  function removePlayer(i: number) {
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }
  function updatePlayer(i: number, patch: Partial<PlayerInput>) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  // ── Submit — the platform's insertion order, same as the trip wizard ────

  async function handleSubmit() {
    for (const p of players) {
      if (!p.name.trim()) continue
      if (!isPlusHandicap(parseHandicap(p.handicap))) continue
      if (!window.confirm(`${p.name.trim()} — ${PLUS_HANDICAP_WARNING}`)) return
    }

    setSubmitting(true)
    setError(null)

    const code = generateCode()

    // An event always locks — the PIN is the organiser's key to the Event
    // Hub's admin side. Hashed here so it never leaves the device.
    let passcodeHash: string
    try {
      passcodeHash = await hashPasscode(passcode)
    } catch {
      setError('Could not set the PIN on this device — try again.')
      setSubmitting(false)
      return
    }

    const setup: LeagueSetup = {
      format: 'league',
      // Standalone is the absent default — the keep-the-no-op-off rule.
      ...(schedule !== 'standalone' ? { schedule } : {}),
      ...(schedule === 'continuous' && repeatOn && weekday !== null
        ? { repeatWeekday: weekday } : {}),
      entry: entry!,
      ...(entry === 'self_join' && requireApproval ? { requireApproval: true } : {}),
      ...(slots.length > 1 && dayBoards ? { dayBoards } : {}),
    }

    // 1. The trip row. Unlike the trip wizard, the boards are written at
    // creation: a league's competition is the point of this form, and the
    // boards the organiser built on the last step are what make day one
    // scoreable without a visit to setup. `bracket_setup` needs migration
    // 047 — without it the insert fails and describeError says why in as
    // many words.
    //
    // The dates say the shape: a standalone run carries its ends (one day
    // writes one date to both), a continuous event carries its period, and
    // a series carries none — its days are numbered, not dated.
    const tripStart = schedule === 'series' ? '' : startDate
    const tripEnd = schedule === 'series' ? ''
      : schedule === 'standalone' && !multiDay ? startDate
      : endDate
    const tripRow: Record<string, unknown> = {
      name: name.trim(),
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: tripStart || null,
      end_date: tripEnd || null,
      kind: 'tournament',
      settings_passcode_hash: passcodeHash,
      formats: {
        ...NO_FORMATS,
        league: { ...NO_FORMATS.league },
        matchplay: { ...NO_FORMATS.matchplay },
      },
      leaderboards: boards,
      bracket_setup: setup,
    }

    const leadEmail = normaliseEmail(email)
    if (leadEmail) tripRow.lead_email = leadEmail

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert(tripRow)
      .select('id')
      .single()

    if (tripErr || !trip) {
      setError(`Could not create the event. ${describeError(tripErr)}`)
      setSubmitting(false)
      return
    }
    const tripId = trip.id

    // 2. Players. The organiser's own name leads the list only when they
    // are playing — an organiser off the card has no player row at all.
    const firstIsOrganiser = organiserPlaying
    const validPlayers = players.filter(p => p.name.trim())
    let playerRows: { id: string; handicap: number; is_lead?: boolean }[] = []
    if (validPlayers.length > 0) {
      const { data: insertedPlayers, error: playersErr } = await supabase
        .from('players')
        .insert(
          validPlayers.map((p, i) => ({
            trip_id: tripId,
            name: p.name.trim(),
            handicap: parseHandicap(p.handicap) ?? 0,
            gender: p.gender,
            role: 'player',
            is_lead: firstIsOrganiser && i === 0,
            claimed: firstIsOrganiser && i === 0,
            team_id: null,
          }))
        )
        .select('id, handicap, is_lead')

      if (playersErr || !insertedPlayers) {
        setError(`Event created, but the players failed. ${describeError(playersErr)}`)
        setSubmitting(false)
        return
      }
      playerRows = insertedPlayers
      const lead = insertedPlayers.find(p => p.is_lead)
      if (lead) rememberPlayer(code, lead.id)
    }

    // 3. One golf item per playing slot, through the shared row mapping —
    // never a second copy of it — and then the rounds those items become.
    // A continuous league's day_index is its calendar offset inside the
    // period, so the schedule and the countdown keep reading true dates; a
    // series is simply numbered.
    const items: ItineraryItem[] = slots.map((slot, i) => ({
      id: `tmp-day-${i}`,
      dayIndex: slot.dayIndex,
      position: 0,
      kind: 'golf',
      courseId: venueFor(slot, i),
      teeTime: null,
      teeCount: 1,
    }))

    const { data: savedItems, error: itinErr } = await supabase
      .from('itinerary_items')
      .insert(items.map(item => toItemRow(tripId, item)))
      .select('id, day_index, position, kind')

    if (itinErr) {
      setError(`Event created, but the schedule failed. ${describeError(itinErr)}`)
      setSubmitting(false)
      return
    }

    const savedBySlot = new Map(
      (savedItems ?? []).map(r => [`${r.day_index}:${r.position}`, r.id])
    )

    const { data: insertedRounds, error: roundsErr } = await supabase
      .from('rounds')
      .insert(
        items.map((item, i) => {
          // The slot's own date — a series has none and stores none.
          const date = slots[i].date
          return {
            trip_id: tripId,
            course_id: item.courseId,
            round_number: i + 1,
            status: 'upcoming',
            itinerary_item_id: savedBySlot.get(`${item.dayIndex}:${item.position}`) ?? null,
            ...(date ? { scheduled_date: date } : {}),
          }
        })
      )
      .select('id')

    if (roundsErr || !insertedRounds) {
      setError(`Event created, but the rounds failed. ${describeError(roundsErr)}`)
      setSubmitting(false)
      return
    }

    // 4. Handicap snapshots — one row per player per round. The index
    // stands in until a tee is chosen, exactly as on a trip.
    if (playerRows.length > 0) {
      const hcpRows = insertedRounds.flatMap(round =>
        playerRows.map(player => ({
          round_id: round.id,
          player_id: player.id,
          playing_handicap: Math.round(player.handicap ?? 0),
        }))
      )
      const { error: hcpErr } = await supabase.from('round_handicaps').insert(hcpRows)
      if (hcpErr) {
        setError(`Event created, but the handicaps failed. ${describeError(hcpErr)}`)
        setSubmitting(false)
        return
      }
    }

    try {
      localStorage.setItem(`gig-owner-${code}`, '1')
    } catch { /* localStorage unavailable */ }

    // The confirmation email, fire-and-forget for the same reasons the trip
    // wizard's is — nothing may stand between the organiser and their event.
    if (leadEmail) {
      fetch('/api/trip-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code }),
        keepalive: true,
      }).catch(() => { /* the event is created; the email is best-effort */ })
    }

    setResultCode(code)
    setStep('done')
    setSubmitting(false)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(resultCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable (non-HTTPS) */ }
  }

  // ── Confirmation screen ──────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="min-h-dvh bg-cream flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mx-auto mb-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A9D56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-2">
            League Created!
          </h1>
          <p className="text-ink/65 text-sm mb-10">
            {entry === 'self_join'
              ? 'Players join with this code — your Event Hub has it as a link and a QR to hold up.'
              : 'Your field is in. The leaderboard and live scoring are ready on your Event Hub.'}
          </p>

          <div className="bg-surface border border-bark/25 rounded-2xl px-4 py-8 mb-4">
            <p className="text-ink/65 text-[13px] tracking-widest uppercase mb-4">Your Event Code</p>
            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
              {resultCode.split('').map((ch, i) => (
                <span
                  key={i}
                  className="font-[family-name:var(--font-display)] text-[clamp(2rem,11vw,3rem)] leading-none text-accent font-bold tabular-nums"
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-4 px-4 py-3 bg-surface border border-bark/12 rounded-xl">
            <p className="text-ink/80 text-[13px] leading-snug">
              Your organiser PIN is set. Keep it safe — it cannot be recovered
              or changed.
            </p>
          </div>

          <button
            onClick={copyCode}
            className="w-full py-4 rounded-xl border border-bark/25 text-ink text-sm tracking-[0.15em] uppercase hover:border-bark/25 transition-colors mb-3"
          >
            {copied ? '✓ Copied' : 'Copy Code'}
          </button>

          <Link
            href={`/trip/${resultCode}`}
            className="block w-full py-4 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors"
          >
            Go to Your Event
          </Link>
        </div>
      </div>
    )
  }

  // ── The wizard ───────────────────────────────────────────────────────────

  const stepNum = step as 1 | 2 | 3 | 4

  return (
    <div className="min-h-dvh bg-cream text-ink">
      <TripHeader backTo="/golf" />

      <div className="page-enter">

      <div className="border-b border-bark/12">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-1 flex gap-1.5">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full transition-colors ${i < stepNum ? 'bg-accent' : 'bg-bark/[0.06]'}`}
            />
          ))}
        </div>
        <div className="max-w-lg mx-auto px-4 py-2 relative flex items-center justify-center">
          {stepNum > 1 && (
            <div className="absolute left-4">
              <BackButton onClick={goBack} />
            </div>
          )}
          <p className="text-center text-ink/65 text-[13px] tracking-wider uppercase">
            Step {stepNum} of 4 — {STEP_LABELS[stepNum - 1]}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">

        {/* ── 1 · Event details ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className={LABEL}>Event name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Winter League 2026"
                className={INPUT}
                autoFocus
              />
            </div>

            {/* ── The shape's own questions ──
                Standalone asks one day or a run; continuous asks for the
                period and the playing days inside it; a series asks
                nothing here — its events are named on the next step. */}
            {schedule === 'standalone' && (
              <>
                <div>
                  <label className={LABEL}>Event length</label>
                  <Chips
                    options={[
                      { key: 'single', label: 'Single day' },
                      { key: 'multi', label: 'Multi-day' },
                    ] as const}
                    chosen={multiDay === null ? null : multiDay ? 'multi' : 'single'}
                    onChoose={k => setMultiDay(k === 'multi')}
                  />
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                    {multiDay === null
                      ? 'One day, one venue, one leaderboard — or a run of days, each with its own.'
                      : multiDay
                        ? 'Each day gets its own venue next, and you’ll choose how the days relate on the leaderboard.'
                        : 'Deliberately simple: one venue, one date, one leaderboard, live scoring.'}
                  </p>
                </div>

                {multiDay !== null && (
                  multiDay ? (
                    <div>
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                        <DateField label="First day" value={startDate} onChange={setStartDate} />
                        <DateField label="Last day"  value={endDate}   onChange={setEndDate} />
                      </div>
                      {datesBackwards && (
                        <p className="text-rust-deep text-[13px] mt-2 leading-snug">
                          The last day cannot come before the first.
                        </p>
                      )}
                      {!datesBackwards && startDate && endDate && (
                        daysIssue
                          ? <p className="text-rust-deep text-[13px] mt-2 leading-snug">{daysIssue}</p>
                          : <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                              {slots.length === 1 ? 'One day.' : `${slots.length} days, one round each.`}
                            </p>
                      )}
                    </div>
                  ) : (
                    <DateField
                      label="Event date"
                      value={startDate}
                      onChange={v => { setStartDate(v); setEndDate(v) }}
                    />
                  )
                )}
              </>
            )}

            {schedule === 'continuous' && (
              <>
                <div>
                  <label className={LABEL}>The period</label>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <DateField label="Starts" value={startDate} onChange={setStartDate} />
                    <DateField label="Finishes" value={endDate} onChange={setEndDate} />
                  </div>
                  {datesBackwards && (
                    <p className="text-rust-deep text-[13px] mt-2 leading-snug">
                      The finish cannot come before the start.
                    </p>
                  )}
                </div>

                {periodSet && (
                  <>
                    <div className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4">
                      <div className="min-w-0">
                        <p className="text-ink text-sm font-medium">Repeats weekly</p>
                        <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                          The same day every week — every Wednesday for the
                          summer, or some such.
                        </p>
                      </div>
                      <Toggle checked={repeatOn} onChange={setRepeatOn} label="Repeats weekly" />
                    </div>

                    {repeatOn ? (
                      <div>
                        <label className={LABEL}>Which day?</label>
                        {/* Monday first on screen; stored as the JS 0–6 the
                            repeat keeps. */}
                        <div className="grid grid-cols-7 gap-1">
                          {[1, 2, 3, 4, 5, 6, 0].map(d => (
                            <button
                              key={d}
                              onClick={() => setWeekday(d)}
                              aria-pressed={weekday === d}
                              className={`py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                                weekday === d
                                  ? 'bg-accent-deep text-white'
                                  : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                              }`}
                            >
                              {WEEKDAY_NAMES[d].slice(0, 3)}
                            </button>
                          ))}
                        </div>
                        {weekday !== null && (
                          daysIssue
                            ? <p className="text-rust-deep text-[13px] mt-2 leading-snug">{daysIssue}</p>
                            : <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                                {playDates.length === 0
                                  ? `No ${WEEKDAY_NAMES[weekday]} falls inside the period.`
                                  : `${playDates.length} ${WEEKDAY_NAMES[weekday]}${playDates.length === 1 ? '' : 's'} between the dates — a round each.`}
                              </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className={LABEL}>Playing days</label>
                        <div className="space-y-2">
                          {manualDates.map((d, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <DateField value={d} onChange={v => setManualDate(i, v)} className="flex-1" />
                              {manualDates.length > 1 && (
                                <button
                                  onClick={() => setManualDates(prev => prev.filter((_, idx) => idx !== i))}
                                  className="text-ink/65 hover:text-ink/80 transition-colors p-2 flex-shrink-0"
                                  aria-label="Remove this day"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setManualDates(prev => [...prev, ''])}
                          disabled={manualDates.length >= MAX_LEAGUE_DAYS}
                          className="w-full mt-2 py-3 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/25 hover:text-ink/80 transition-colors disabled:opacity-40"
                        >
                          + Add a day
                        </button>
                        {manualOutside && (
                          <p className="text-rust-deep text-[13px] mt-2 leading-snug">
                            Every playing day must fall inside the period.
                          </p>
                        )}
                        {!manualOutside && daysIssue && manualDates.some(Boolean) && (
                          <p className="text-rust-deep text-[13px] mt-2 leading-snug">{daysIssue}</p>
                        )}
                        {!manualOutside && !daysIssue && playDates.length > 1 && (
                          <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                            {playDates.length} days, a round each — they need not be in a row.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {schedule === 'series' && (
              <div className="bg-surface border border-bark/12 rounded-2xl p-4">
                <p className="text-ink text-sm font-medium">A series carries no dates.</p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  You&apos;ll pick the events and their venues next — they need
                  not be in a row, and more can be added as the season goes.
                </p>
              </div>
            )}

            <div>
              <label className={LABEL} htmlFor="league-email">Email (optional)</label>
              <input
                id="league-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_EMAIL}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT}
              />
              <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                We&apos;ll send you the event details and share link. The event
                works either way, and no player ever sees it.
              </p>
              {emailWarning(email) && (
                <p className="text-rust/80 text-[13px] mt-2 leading-snug">
                  {emailWarning(email)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 2 · Venues ── */}
        {step === 2 && (
          <div className="space-y-5">
            {coursesLoaded && courses.length === 0 && (
              <div className="p-4 bg-surface border border-bark/12 rounded-xl text-ink/65 text-sm text-center">
                The course list could not be loaded — a course can still be
                added by name from the picker.
              </div>
            )}

            {slots.length > 1 && (
              <div className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">
                    Same venue every {schedule === 'series' ? 'event' : 'day'}
                  </p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    One course for the whole event — pick it once below.
                  </p>
                </div>
                <Toggle
                  checked={sameVenue}
                  onChange={setSameVenue}
                  label="Same venue throughout"
                />
              </div>
            )}

            {slots.length === 1 || sameVenue ? (
              <div>
                <label className={LABEL}>Venue</label>
                <CourseSelect
                  courses={courses}
                  value={venues[0] ?? ''}
                  onChange={id => setVenue(0, id)}
                  onCourseAdded={onCourseAdded}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {slots.map((slot, i) => (
                  <div key={slot.date ?? i}>
                    <label className={LABEL}>
                      {schedule === 'series'
                        ? `Event ${i + 1}`
                        : describeDay(slot.date, slot.dayIndex)}
                    </label>
                    <CourseSelect
                      courses={courses}
                      value={venueFor(slot, i)}
                      onChange={id =>
                        schedule === 'continuous' && slot.date
                          ? setDateVenue(slot.date, id)
                          : setVenue(i, id)}
                      onCourseAdded={onCourseAdded}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* A series grows here: its list of events is the thing being
                built, so the way to lengthen it sits with the venues. More
                can be added after creation too, from the running order in
                the organiser's setup. */}
            {schedule === 'series' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setSeriesCount(n => Math.min(n + 1, MAX_LEAGUE_DAYS))}
                  disabled={seriesCount >= MAX_LEAGUE_DAYS}
                  className="flex-1 py-3 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/25 hover:text-ink/80 transition-colors disabled:opacity-40"
                >
                  + Add another event
                </button>
                {seriesCount > 1 && (
                  <button
                    onClick={() => {
                      setSeriesCount(n => n - 1)
                      setVenues(prev => prev.slice(0, seriesCount - 1))
                    }}
                    className="flex-shrink-0 px-4 py-3 border border-bark/25 rounded-xl text-ink/65 text-sm hover:text-ink/80 transition-colors"
                  >
                    Remove last
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 3 · Players ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className={LABEL}>How does the field get in?</label>
              <Chips options={PLAYER_ENTRIES} chosen={entry} onChoose={setEntry} />
              {entry && (
                <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                  {PLAYER_ENTRIES.find(e => e.key === entry)?.hint}
                </p>
              )}
            </div>

            {entry === 'self_join' && (
              <div className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Require approval</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    A joined player waits for your nod before they&apos;re
                    confirmed in the field.
                  </p>
                </div>
                <Toggle
                  checked={requireApproval}
                  onChange={setRequireApproval}
                  label="Require approval before a joined player is confirmed"
                />
              </div>
            )}

            <div className="bg-surface border border-bark/12 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Are you playing?</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    {organiserPlaying
                      ? 'Put your own name first below — the rest of the field follows.'
                      : 'You run the event; the names below are the field.'}
                  </p>
                </div>
                <Toggle
                  checked={organiserPlaying}
                  onChange={setOrganiserPlaying}
                  label="The organiser is playing"
                />
              </div>
            </div>

            <p className="text-ink/65 text-sm">
              {entry === 'self_join'
                ? 'Add anyone now if you like — everyone else joins with the event code.'
                : 'Add the field — anyone missed can still join later with the event code.'}
            </p>

            {players.map((player, i) => (
              <div key={i} className="bg-surface border border-bark/12 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-ink/65 text-[13px] tracking-widest uppercase">
                    {i === 0 && organiserPlaying ? 'Organiser — you' : `Player ${i + 1}`}
                  </span>
                  {i > 0 && (
                    <button
                      onClick={() => removePlayer(i)}
                      className="text-ink/65 hover:text-ink/80 transition-colors p-1"
                      aria-label="Remove player"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    value={player.name}
                    onChange={e => updatePlayer(i, { name: e.target.value })}
                    placeholder="Full name"
                    className={i === duplicateIndex
                      ? INPUT.replace('border-bark/12', 'border-rust/60')
                      : INPUT}
                  />
                  {i === duplicateIndex && (
                    <p className="text-rust-deep text-[13px] leading-snug">
                      {duplicateIssue}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <HandicapField
                      value={player.handicap}
                      onChange={v => updatePlayer(i, { handicap: v })}
                      placeholder="Handicap"
                      rowClassName="flex-1 min-w-0"
                      className={`${INPUT} flex-1 min-w-0`}
                    />
                    <div className="flex gap-1.5 flex-shrink-0">
                      {(['M', 'F'] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => updatePlayer(i, { gender: g })}
                          className={`w-12 rounded-xl text-sm font-medium transition-colors ${
                            player.gender === g
                              ? 'bg-accent-deep text-white'
                              : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addPlayer}
              className="w-full py-4 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/25 hover:text-ink/80 transition-colors"
            >
              + Add another player
            </button>
          </div>
        )}

        {/* ── 4 · Finish ── */}
        {step === 4 && (
          <div className="space-y-6">
            {/* ── The leaderboards ──
                The same LeaderboardSetup Trip Setup runs, seeded with the
                starter individual-Stableford board — so creation offers
                exactly the competitions the platform can score, and an
                organiser who wants only the default taps nothing. Teams
                are apportioned after creation on the teams screen, the
                same as a trip, so a team board here starts unassigned. */}
            <div>
              <label className={LABEL}>Leaderboards</label>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                What the event plays for. Every league starts on individual
                Stableford, added up — change it, or add more formats.
              </p>
              <LeaderboardSetup
                boards={boards}
                playerCount={players.filter(p => p.name.trim()).length}
                teamCount={0}
                onChange={setBoards}
              />
              {boards.length === 0 && (
                <p className="text-rust-deep text-[13px] mt-3 leading-snug">
                  An event needs at least one leaderboard — otherwise what&apos;s
                  being played for?
                </p>
              )}
            </div>

            {slots.length > 1 && (
              <div>
                <label className={LABEL}>
                  The leaderboard across the {schedule === 'series' ? 'events' : 'days'}
                </label>
                <div className="space-y-2">
                  {DAY_BOARDS.map(d => (
                    <button
                      key={d.key}
                      onClick={() => setDayBoards(d.key)}
                      aria-pressed={dayBoards === d.key}
                      className={`block w-full text-left rounded-2xl p-4 transition-colors ${
                        dayBoards === d.key
                          ? 'bg-accent-deep text-white'
                          : 'bg-surface border border-bark/12 hover:border-bark/25'
                      }`}
                    >
                      <p className={`text-sm font-medium ${dayBoards === d.key ? 'text-white' : 'text-ink'}`}>
                        {d.label}
                      </p>
                      <p className={`text-[13px] mt-0.5 leading-snug ${dayBoards === d.key ? 'text-white/80' : 'text-ink/65'}`}>
                        {d.hint}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-bark/12">
              <div className="bg-surface border border-bark/12 rounded-xl px-4 py-4 mb-3">
                <p className="text-ink text-sm font-medium">Organiser PIN</p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  Your key to the organiser side of the Event Hub — notices,
                  starts and event settings ask for it.
                </p>
              </div>

              <div className="space-y-3">
                <div className="px-4 py-3.5 bg-rust/10 border border-rust/40 rounded-xl">
                  <p className="text-rust-deep text-sm font-semibold leading-snug">
                    This can only be set now.
                  </p>
                  <p className="text-rust/70 text-[13px] leading-snug mt-1.5">
                    There is no way to add, change or remove your PIN later —
                    Write it down!
                  </p>
                </div>

                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                  placeholder={`PIN (${MIN_PASSCODE}–${MAX_PASSCODE} digits)`}
                  maxLength={MAX_PASSCODE}
                  className={INPUT}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={passcodeConfirm}
                  onChange={e => setPasscodeConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter it again"
                  maxLength={MAX_PASSCODE}
                  className={INPUT}
                />
                {passcodeIssue && (passcode || passcodeConfirm) && (
                  <p className="text-rust-deep text-[13px] leading-snug">{passcodeIssue}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
            <p className="text-rust-deep text-sm">{error}</p>
          </div>
        )}

        <div className="mt-8">
          <button
            onClick={goNext}
            disabled={!canProceed}
            className="w-full py-5 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : stepNum === 4 ? 'Create League' : 'Continue'}
          </button>
          {stepNum === 3 && (
            <p className="text-center text-ink/65 text-[13px] mt-3">
              Players without a name will be skipped
            </p>
          )}
        </div>
      </div>

      </div>
    </div>
  )
}
