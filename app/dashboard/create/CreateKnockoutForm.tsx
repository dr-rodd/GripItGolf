'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import HandicapField from '@/app/components/HandicapField'
import { NO_FORMATS } from '@/lib/formats'
import { normaliseEmail, emailWarning, MAX_EMAIL } from '@/lib/email'
import { rememberPlayer } from '@/lib/playerCookie'
import {
  MIN_PASSCODE, MAX_PASSCODE, hashPasscode, passcodeError, rememberUnlock,
} from '@/lib/passcode'
import { parseHandicap, isPlusHandicap, PLUS_HANDICAP_WARNING } from '@/lib/handicap'
import { firstDuplicateIndex, duplicateNameError } from '@/lib/roster'
import {
  type EventPermissions, defaultPermissions, storedPermissions,
} from '@/lib/eventPermissions'
import EventPermissionToggles from '@/app/components/EventPermissionToggles'
import { describeError, generateCode } from './CreateTripForm'

/**
 * Creating a continuous knockout — an ongoing match play event occupying a
 * period, like a summer.
 *
 * Deliberately the leanest door on the platform: a name, the period, the
 * field, the PIN. No itinerary and no rounds — a continuous knockout has no
 * fixed days of golf, because its matches happen when the players make them
 * happen and its pace is the bracket's deadlines. The bracket itself —
 * rounds shaped by the size of the field, a qualifying event if wanted,
 * a deadline per round — is set up from the organiser area once the event
 * exists, exactly as for any match play event.
 *
 * What creation writes: the trip row (kind 'tournament', the period as its
 * dates, and `bracket_setup` seeded with the format and the continuous
 * shape — a partial the bracket form's parser rightly refuses to call a
 * setup, but whose shape it carries into its first real save), and the
 * players. Needs migration 047, like everything the column touches.
 */

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

const LABEL = 'block text-ink/80 text-[13px] uppercase tracking-wider mb-2'

const STEP_LABELS = ['Event details', 'Players', 'Finish']

type PlayerInput = { name: string; handicap: string; gender: 'M' | 'F' }

export default function CreateKnockoutForm() {
  const [step, setStep] = useState<1 | 2 | 3 | 'done'>(1)

  // Step 1 — the event and its period
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')

  // Step 2 — the field
  const [organiserPlaying, setOrganiserPlaying] = useState(true)
  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', handicap: '', gender: 'M' },
  ])

  // Step 3 — how collaborative, and the organiser PIN
  const [perms, setPerms] = useState<EventPermissions>(defaultPermissions)
  const [passcode, setPasscode] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultCode, setResultCode] = useState('')
  const [copied, setCopied] = useState(false)

  const datesBackwards = !!(startDate && endDate && endDate < startDate)

  const duplicateIndex = firstDuplicateIndex(players.map(p => p.name))
  const duplicateIssue = duplicateIndex === -1
    ? null
    : duplicateNameError(players[duplicateIndex].name)

  const passcodeIssue =
    passcodeError(passcode) ??
    (passcode !== passcodeConfirm ? 'The two passcodes do not match.' : null)

  const canProceed = !submitting && (
    step === 1 ? name.trim().length > 0 && !!startDate && !!endDate && !datesBackwards :
    step === 2 ? !duplicateIssue :
    step === 3 ? !passcodeIssue :
    false
  )

  function goNext() {
    if (step === 'done') return
    if (step < 3) setStep((step + 1) as 2 | 3)
    else handleSubmit()
  }

  function goBack() {
    setError(null)
    if (step !== 'done' && step > 1) setStep((step - 1) as 1 | 2)
  }

  function addPlayer() {
    setPlayers(prev => [...prev, { name: '', handicap: '', gender: 'M' }])
  }
  function removePlayer(i: number) {
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }
  function updatePlayer(i: number, patch: Partial<PlayerInput>) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  async function handleSubmit() {
    for (const p of players) {
      if (!p.name.trim()) continue
      if (!isPlusHandicap(parseHandicap(p.handicap))) continue
      if (!window.confirm(`${p.name.trim()} — ${PLUS_HANDICAP_WARNING}`)) return
    }

    setSubmitting(true)
    setError(null)

    const code = generateCode()

    let passcodeHash: string
    try {
      passcodeHash = await hashPasscode(passcode)
    } catch {
      setError('Could not set the PIN on this device — try again.')
      setSubmitting(false)
      return
    }

    // 1. The trip row. No rounds and no itinerary follow — the golf comes
    // later, when bracket rounds are linked to real days — so the row is
    // the whole of the structure this door creates.
    const tripRow: Record<string, unknown> = {
      name: name.trim(),
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: startDate || null,
      end_date: endDate || null,
      kind: 'tournament',
      settings_passcode_hash: passcodeHash,
      formats: {
        ...NO_FORMATS,
        league: { ...NO_FORMATS.league },
        matchplay: { ...NO_FORMATS.matchplay },
      },
      // The format and the shape, seeded now so the bracket form knows what
      // it is finishing. Not a complete setup — parseBracketSetup rightly
      // returns null on it — and never claimed to be one.
      bracket_setup: { format: 'match_play', schedule: 'continuous' },
      // Only when a toggle was actually flipped — nothing opened writes
      // nothing, so creation still lands before migration 049 has run.
      ...(storedPermissions(perms) ? { event_permissions: perms } : {}),
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

    // 2. Players — same shape as every creation door; no round_handicaps
    // because there are no rounds yet.
    const validPlayers = players.filter(p => p.name.trim())
    if (validPlayers.length > 0) {
      const { data: insertedPlayers, error: playersErr } = await supabase
        .from('players')
        .insert(
          validPlayers.map((p, i) => ({
            trip_id: trip.id,
            name: p.name.trim(),
            handicap: parseHandicap(p.handicap) ?? 0,
            gender: p.gender,
            role: 'player',
            is_lead: organiserPlaying && i === 0,
            claimed: organiserPlaying && i === 0,
            team_id: null,
          }))
        )
        .select('id, is_lead')

      if (playersErr || !insertedPlayers) {
        setError(`Event created, but the players failed. ${describeError(playersErr)}`)
        setSubmitting(false)
        return
      }
      const lead = insertedPlayers.find(p => p.is_lead)
      if (lead) rememberPlayer(code, lead.id)
    }

    try {
      localStorage.setItem(`gig-owner-${code}`, '1')
    } catch { /* localStorage unavailable */ }

    if (leadEmail) {
      fetch('/api/trip-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code }),
        keepalive: true,
      }).catch(() => { /* the event is created; the email is best-effort */ })
    }

    // The device that just set the PIN plainly knows it — remember the
    // unlock now, so the organiser's own tee sheet and organiser area
    // are editable without being asked for the code they just typed.
    rememberUnlock(code)

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

  // ── Confirmation ─────────────────────────────────────────────────────────

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
            Event Created!
          </h1>
          <p className="text-ink/65 text-sm mb-10">
            Share this code with the field. Next, set the bracket up in the
            organiser area on your Event Hub — mode, field size, qualifying
            and round deadlines.
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

  const stepNum = step as 1 | 2 | 3

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
            Step {stepNum} of 3 — {STEP_LABELS[stepNum - 1]}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">

        {/* ── 1 · The event and its period ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className={LABEL}>Event name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Summer Knockout 2027"
                className={INPUT}
                autoFocus
              />
            </div>

            <div>
              <label className={LABEL}>The period</label>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <DateField label="Starts" value={startDate} onChange={setStartDate} />
                <DateField label="Finishes" value={endDate} onChange={setEndDate} />
              </div>
              {datesBackwards ? (
                <p className="text-rust-deep text-[13px] mt-2 leading-snug">
                  The finish cannot come before the start.
                </p>
              ) : (
                <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                  The event runs across this whole period — matches happen
                  when players make them happen, paced by round deadlines
                  you&apos;ll set in the bracket setup.
                </p>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="ko-email">Email (optional)</label>
              <input
                id="ko-email"
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

        {/* ── 2 · The field ── */}
        {step === 2 && (
          <div className="space-y-4">
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
              Optional — how players get in is a bracket setup question, and
              anyone can join later with the event code.
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

        {/* ── 3 · How collaborative, and the organiser PIN ── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="mb-6">
              <label className={LABEL}>How collaborative should this event be?</label>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                What the field can do for themselves. Everything starts off —
                you can change any of these later from the organiser area.
              </p>
              <EventPermissionToggles value={perms} onChange={setPerms} />
            </div>

            <div className="bg-surface border border-bark/12 rounded-xl px-4 py-4">
              <p className="text-ink text-sm font-medium">Organiser PIN</p>
              <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                Your key to the organiser side of the Event Hub — the bracket
                setup, notices and event settings ask for it.
              </p>
            </div>

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
            {submitting ? 'Creating…' : stepNum === 3 ? 'Create Event' : 'Continue'}
          </button>
          {stepNum === 2 && (
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
