'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import DateField from '@/app/components/DateField'
import { roundCountError } from '@/lib/tripLimits'
import { DEFAULT_FORMATS } from '@/lib/formats'
import { normaliseEmail, emailWarning, MAX_EMAIL } from '@/lib/email'
import { rememberPlayer } from '@/lib/playerCookie'
import ItineraryBuilder from '@/app/components/ItineraryBuilder'
import { type ItineraryItem, golfItems, dateForDay } from '@/lib/itinerary'
import Toggle from '@/app/components/Toggle'
import {
  MIN_PASSCODE, MAX_PASSCODE, hashPasscode, passcodeError,
} from '@/lib/passcode'
import { parseHandicap } from '@/lib/handicap'
import HandicapField from '@/app/components/HandicapField'
import { firstDuplicateIndex, duplicateNameError } from '@/lib/roster'

// ── Types ─────────────────────────────────────────────────────────────────

type Course = { id: string; name: string }
type PlayerInput = { name: string; handicap: string; gender: 'M' | 'F' }

// ── Constants ─────────────────────────────────────────────────────────────

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

const LABEL = 'block text-ink/80 text-[13px] uppercase tracking-wider mb-2'

// Teams are not asked for here. Whether a trip even has teams is decided by
// the leaderboards it runs, and that question lives in trip settings — asking
// it twice is how the two answers come to disagree.
const STEP_LABELS = ['Trip details', 'Itinerary', 'Players']

// Presets cover the common cases; the + button goes beyond them.

/**
 * What actually went wrong, in words.
 *
 * "Failed to create trip. Please try again." is useless when the real cause is
 * a column that has not been added yet — trying again will fail identically.
 * Supabase's message names the column, so it is worth showing.
 */
function describeError(err: unknown): string {
  const e = err as { message?: string; hint?: string; details?: string } | null
  const msg = e?.message?.trim()
  if (!msg) return 'Please try again.'
  // A missing column means a migration has not been run
  if (/column|schema cache/i.test(msg)) {
    return `${msg} — a database update may not have been applied yet.`
  }
  return msg
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Root component ────────────────────────────────────────────────────────

export default function CreateTripForm() {
  /**
   * The platform course list, fetched here rather than handed down.
   *
   * Doing it on the server made this route dynamic, and a dynamic route
   * cannot be prefetched whole — so arriving from the landing page meant a
   * round trip and a query after the mark had already landed. They are not
   * wanted until step two, so they load while the trip is being named.
   */
  const [courses, setCourses] = useState<Course[]>([])
  const [coursesLoaded, setCoursesLoaded] = useState(false)

  useEffect(() => {
    let live = true
    supabase
      .from('courses')
      .select('id, name')
      .is('trip_id', null)
      .order('name')
      .then(({ data }) => {
        if (!live) return
        setCourses(data ?? [])
        setCoursesLoaded(true)
      })
    return () => { live = false }
  }, [])

  const [step, setStep] = useState<1 | 2 | 3 | 'done'>(1)

  // Step 1
  const [tripName, setTripName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Step 2
  // The trip's running order. Golf items in it become the rounds.
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([])

  // Step 3
  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', handicap: '', gender: 'M' },
  ])

  // Settings lock — can only ever be set here, at creation
  const [lockSettings, setLockSettings] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultCode, setResultCode] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Validation ───────────────────────────────────────────────────────────

  const step1Valid = tripName.trim().length > 0

  // A trip needs somewhere to play. Stays and journeys are optional
  // decoration; without golf there is nothing to score.
  //
  // This is checked once, at the end of the itinerary, rather than on every
  // day: a day with nothing planned on it is a normal day, and greying out
  // the way forward because Tuesday is empty says the opposite.
  const plannedGolf = golfItems(itinerary)
  const itineraryBlocked =
    plannedGolf.length === 0
      ? 'Add at least one round of golf — there is nothing to score without it.'
      : roundCountError(plannedGolf.length)

  const passcodeIssue = !lockSettings
    ? null
    : passcodeError(passcode) ??
      (passcode !== passcodeConfirm ? 'The two passcodes do not match.' : null)
  // Two people on one trip cannot share a name. Caught on the form rather
  // than on the insert, so it is said while the box that caused it is still
  // on screen — and said before a trip, its itinerary and its rounds have
  // all been written and only the players fail.
  const duplicateIndex = firstDuplicateIndex(players.map(p => p.name))
  const duplicateIssue = duplicateIndex === -1
    ? null
    : duplicateNameError(players[duplicateIndex].name)

  const step3Valid = !passcodeIssue && !duplicateIssue

  // ── Navigation ───────────────────────────────────────────────────────────

  // Step 2 carries its own way forward, inside the itinerary builder — the
  // add buttons are pinned to the bottom of that screen and a second button
  // floating underneath them was the glitch.
  function goNext() {
    if (step === 1) {
      setStep(2)
    } else if (step === 3) {
      handleSubmit()
    }
  }

  function goBack() {
    setError(null)
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  // ── Player helpers ───────────────────────────────────────────────────────

  function addPlayer() {
    setPlayers(prev => [...prev, { name: '', handicap: '', gender: 'M' }])
  }

  function removePlayer(i: number) {
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }

  function updatePlayer(i: number, patch: Partial<PlayerInput>) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)

    const code = generateCode()

    // Hashed here so the passcode itself never leaves the device
    let passcodeHash: string | null = null
    if (lockSettings) {
      try {
        passcodeHash = await hashPasscode(passcode)
      } catch {
        setError('Could not set the passcode on this device. Try again, or create the trip without one.')
        setSubmitting(false)
        return
      }
    }

    // 1. Trip
    const tripRow: Record<string, unknown> = {
      name: tripName.trim(),
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: startDate || null,
      end_date: endDate || null,
      // A starting point, not the final answer — trip settings is where the
      // competition, and with it whether there are teams at all, is chosen.
      formats: {
        ...DEFAULT_FORMATS,
        league: { ...DEFAULT_FORMATS.league },
        matchplay: { ...DEFAULT_FORMATS.matchplay },
      },
    }
    // Only sent when a passcode was actually set, so a database that has not
    // had that column added yet can still create ordinary trips.
    if (passcodeHash) tripRow.settings_passcode_hash = passcodeHash

    // Same reasoning, and the same for anything that is not an address:
    // blank, half-typed or nonsense all mean "not given", and none of them is
    // worth failing a trip over.
    const email = normaliseEmail(leadEmail)
    if (email) tripRow.lead_email = email

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert(tripRow)
      .select('id')
      .single()

    if (tripErr || !trip) {
      setError(`Could not create the trip. ${describeError(tripErr)}`)
      setSubmitting(false)
      return
    }

    const tripId = trip.id

    // 2. Players (skip blanks)
    //
    // Nobody is put in a team here. There are no teams yet, and there may
    // never be any — the leaderboards a trip runs decide that, and they are
    // chosen in settings. Everyone starts unassigned.
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
            is_lead: i === 0,
            // The organiser entered themselves, so they're in. Everyone else
            // named here is a placeholder until they claim their own slot.
            claimed: i === 0,
            team_id: null,
          }))
        )
        .select('id, handicap, is_lead')

      if (playersErr || !insertedPlayers) {
        setError(`Trip created, but the players failed. ${describeError(playersErr)}`)
        setSubmitting(false)
        return
      }
      playerRows = insertedPlayers

      // The organiser entered themselves first and is already claimed, so
      // remember them here rather than making them go through the join flow
      // to be recognised on their own trip. Found by the flag rather than by
      // position — relying on insert order returning unchanged is a bet that
      // costs nothing to avoid.
      const lead = insertedPlayers.find(p => p.is_lead)
      if (lead) rememberPlayer(code, lead.id)
    }

    // 3. The itinerary, and the rounds that come out of it.
    //
    // Written first so each row has a real id, then the golf ones become
    // rounds pointing back at the item that created them. Order is day then
    // position, which is exactly the order rounds are numbered in.
    const itineraryRows = itinerary.map(item => ({
      trip_id: tripId,
      day_index: item.dayIndex,
      position: item.position,
      kind: item.kind,
      course_id: item.kind === 'golf' ? item.courseId ?? null : null,
      tee_time: item.kind === 'golf' ? item.teeTime || null : null,
      tee_count: item.kind === 'golf' ? item.teeCount ?? 1 : null,
      stay_name: item.kind === 'stay' ? item.stayName ?? null : null,
      travel_mode: item.kind === 'travel' ? item.travelMode ?? null : null,
      from_place: item.kind === 'travel' ? item.fromPlace || null : null,
      to_place: item.kind === 'travel' ? item.toPlace || null : null,
      duration_mins: item.kind === 'travel' ? item.durationMins ?? null : null,
    }))

    const { data: savedItems, error: itinErr } = itineraryRows.length > 0
      ? await supabase.from('itinerary_items').insert(itineraryRows)
          .select('id, day_index, position, kind')
      : { data: [], error: null }

    if (itinErr) {
      setError(`Trip created, but the itinerary failed. ${describeError(itinErr)}`)
      setSubmitting(false)
      return
    }

    // Match each saved row back to the item that produced it, by its slot.
    const savedBySlot = new Map(
      (savedItems ?? []).map(r => [`${r.day_index}:${r.position}`, r.id])
    )

    const { data: insertedRounds, error: roundsErr } = await supabase
      .from('rounds')
      .insert(
        plannedGolf.map((g, i) => {
          const date = dateForDay(startDate || null, g.dayIndex)
          return {
            trip_id: tripId,
            course_id: g.courseId,
            round_number: i + 1,
            status: 'upcoming',
            itinerary_item_id: savedBySlot.get(`${g.dayIndex}:${g.position}`) ?? null,
            ...(date ? { scheduled_date: date } : {}),
          }
        })
      )
      .select('id')

    if (roundsErr || !insertedRounds) {
      setError(`Trip created, but the rounds failed. ${describeError(roundsErr)}`)
      setSubmitting(false)
      return
    }

    // 4. Round handicaps — one row per player per round
    // WHS formula: PH = HI × Slope/113 + (CR − Par). With no tee data yet,
    // slope=113 and CR=Par cancel out, leaving PH = HI rounded to nearest integer.
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
        setError(`Trip created, but the handicaps failed. ${describeError(hcpErr)}`)
        setSubmitting(false)
        return
      }
    }

    // Remember this device created the trip — used by the setup page
    // when edit permission is set to "owner only" (no auth yet).
    try {
      localStorage.setItem(`gig-owner-${code}`, '1')
    } catch { /* localStorage unavailable */ }

    setResultCode(code)
    setStep('done')
    setSubmitting(false)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(resultCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (non-HTTPS)
    }
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
            Trip Created!
          </h1>
          <p className="text-ink/65 text-sm mb-10">
            Share this code with your group to join. Next, choose what
            you&apos;re playing for in trip settings — leaderboards and teams
            live there. Finalise the trip when everyone&apos;s ready to play.
          </p>

          <div className="bg-surface border border-bark/25 rounded-2xl px-4 py-8 mb-4">
            <p className="text-ink/65 text-[13px] tracking-widest uppercase mb-4">Your Trip Code</p>
            {/* Laid out as characters with a gap rather than letter-spacing:
                tracking adds space after the final character too, which pushed
                the code off the right edge of the box. */}
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

          {lockSettings && (
            <div className="mb-4 px-4 py-3 bg-surface border border-bark/12 rounded-xl">
              <p className="text-ink/80 text-[13px] leading-snug">
                Settings are locked. Keep your passcode safe — it cannot be recovered
                or changed.
              </p>
            </div>
          )}

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
            Go to Your Trip
          </Link>
        </div>
      </div>
    )
  }

  // ── Multi-step form ──────────────────────────────────────────────────────

  const stepNum = step as 1 | 2 | 3
  const isFinalStep = stepNum === 3
  // Step 2 is not here: its own footer decides when the itinerary can be
  // left, and it is the only thing that knows which day is open.
  const canProceed =
    !submitting &&
    !(step === 1 && !step1Valid) &&
    !(step === 3 && !step3Valid)

  return (
    <div className="min-h-dvh bg-cream text-ink">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so there is no home button on this screen. */}
      <TripHeader backTo="/" />

      {/* The fade starts below the header. The mark has just travelled into
          that bar from the landing page and is in exactly the same place
          here — fading it in would blink it out and back for no reason. */}
      <div className="page-enter">

      {/* Progress bar + step label. The back control here means one step, not
          one screen: the mark above goes home, this goes to the answers you
          just gave, and losing a half-filled form to a logo would be a poor
          trade for one fewer button. */}
      <div className="border-b border-bark/12">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-1 flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${s <= stepNum ? 'bg-accent' : 'bg-bark/[0.06]'}`}
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
            Step {stepNum} of 3 — {STEP_LABELS[stepNum - 1]}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">

        {/* ── Step 1: Trip details ──────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className={LABEL}>Trip name</label>
              <input
                type="text"
                value={tripName}
                onChange={e => setTripName(e.target.value)}
                placeholder="e.g. Portugal 2027"
                className={INPUT}
                autoFocus
              />
            </div>

            {/* Two equal columns that cannot outgrow the row. The explicit
                minmax(0,1fr) is what stops a date input's intrinsic width
                pushing the second column off the right of the page. */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <DateField label="Start date" value={startDate} onChange={setStartDate} />
              <DateField label="End date"   value={endDate}   onChange={setEndDate} />
            </div>

            {/* Optional, and it stays optional: nothing below depends on it,
                nothing blocks on it, and a malformed address is simply not
                saved rather than standing between anyone and their trip. */}
            <div>
              <label className={LABEL} htmlFor="lead-email">Email (optional)</label>
              <input
                id="lead-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_EMAIL}
                value={leadEmail}
                onChange={e => setLeadEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT}
              />
              <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                So we can confirm your trip and keep you updated. Leave it blank
                if you would rather not — the trip works either way, and no other
                player ever sees it.
              </p>
              {emailWarning(leadEmail) && (
                <p className="text-rust/80 text-[13px] mt-2 leading-snug">
                  {emailWarning(leadEmail)}
                </p>
              )}
            </div>

          </div>
        )}

        {/* ── Step 2: The itinerary ────────────────────────────────
            Replaces the old "pick a course per round" list. A round now
            exists because a golf item does, so the running order is the
            thing being built and the rounds fall out of it. */}
        {step === 2 && (
          <div>
            {/* Only once we know: an empty list mid-fetch is not a problem
                worth reporting. */}
            {coursesLoaded && courses.length === 0 && (
              <div className="p-4 bg-surface border border-bark/12 rounded-xl text-ink/65 text-sm text-center mb-4">
                No platform courses available yet. Add courses with <code className="text-accent">trip_id = NULL</code> to get started.
              </div>
            )}
            <ItineraryBuilder
              startDate={startDate || null}
              endDate={endDate || null}
              courses={courses}
              items={itinerary}
              onChange={setItinerary}
              onContinue={() => setStep(3)}
              blockedReason={itineraryBlocked}
            />
          </div>
        )}

        {/* ── Step 3: Players ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm mb-2">
              Optional — players can also join later with the trip code.
            </p>
            {players.map((player, i) => (
              <div key={i} className="bg-surface border border-bark/12 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-ink/65 text-[13px] tracking-widest uppercase">
                    {i === 0 ? 'Lead player' : `Player ${i + 1}`}
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
                    // Swapped, not appended: two border-colour classes in one
                    // string leaves which one wins up to stylesheet order.
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

            {/* ── Settings lock ──
                Only settable here. Once the trip exists, anyone holding the
                trip code could otherwise lock a trip they do not run. */}
            <div className="mt-8 pt-6 border-t border-bark/12">
              <div className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-xl px-4 py-4">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Lock trip settings</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    Ask for a passcode before anyone can change formats, players or teams
                  </p>
                </div>
                <Toggle checked={lockSettings} onChange={setLockSettings} label="Lock trip settings" />
              </div>

              {lockSettings && (
                <div className="mt-3 space-y-3">
                  <div className="px-4 py-3.5 bg-rust/10 border border-rust/40 rounded-xl">
                    <p className="text-rust-deep text-sm font-semibold leading-snug">
                      This can only be set now.
                    </p>
                    <p className="text-rust/70 text-[13px] leading-snug mt-1.5">
                      There is no way to add, change or remove it later — otherwise anyone
                      with your trip code could lock you out of your own trip. Write it down.
                    </p>
                  </div>

                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={passcode}
                    onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                    placeholder={`Passcode (${MIN_PASSCODE}–${MAX_PASSCODE} digits)`}
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
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
            <p className="text-rust-deep text-sm">{error}</p>
          </div>
        )}

        {/* Primary CTA. Absent on step 2, which pins its own to the bottom
            of the screen beneath the add buttons. */}
        {step !== 2 && (
          <div className="mt-8">
            <button
              onClick={goNext}
              disabled={!canProceed}
              className="w-full py-5 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : isFinalStep ? 'Create Trip' : 'Continue'}
            </button>
            {isFinalStep && (
              <p className="text-center text-ink/65 text-[13px] mt-3">
                Players without a name will be skipped
              </p>
            )}
          </div>
        )}
      </div>

      </div>
    </div>
  )
}
