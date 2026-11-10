'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import DateField from '@/app/components/DateField'
import { NO_FORMATS } from '@/lib/formats'
import { normaliseEmail, emailWarning, MAX_EMAIL } from '@/lib/email'
import { rememberPlayer } from '@/lib/playerCookie'
import {
  MIN_PASSCODE, MAX_PASSCODE, hashPasscode, passcodeError, rememberUnlock,
} from '@/lib/passcode'
import { NO_PUBLIC_PIN, publicPinIssue, rememberEntry } from '@/lib/publicPin'
import PublicPinField from '@/app/components/PublicPinField'
import { parseHandicap, isPlusHandicap, PLUS_HANDICAP_WARNING } from '@/lib/handicap'
import { NO_FIELD_SEED, drawStandings, seedPairs, type FieldPlayer, type FieldSeed } from '@/lib/fieldSeed'
import { NO_FIELD_TAGS, activeTags, fieldTagsIssue, withTagTally, type FieldTags } from '@/lib/fieldTags'
import { boardRules, boardTitle, matchTallyBoard } from '@/lib/leaderboards'
import Toggle from '@/app/components/Toggle'
import { writeFieldTags } from './fieldTagsWrite'
import { firstDuplicateIndex, duplicateNameError } from '@/lib/roster'
import {
  type EventPermissions, defaultPermissions, permissionsFor, storedPermissions,
} from '@/lib/eventPermissions'
import CollaborationQuestion from '@/app/components/CollaborationQuestion'
import {
  NO_DEADLINES_ANSWER, deadlinesAnswerIssue, knockoutBoards, knockoutSeed, storedDeadlines, type DeadlinesAnswer,
} from '@/lib/bracketSetup'
import RoundDeadlines from '@/app/components/RoundDeadlines'
import { todayString } from '@/lib/tripStatus'
import CreationDraw, {
  DRAW_INTRO, NO_CREATION_DRAW, creationDrawIssue, creationEntrants, creationPlan, creationRounds, drawKey, writeCreationDraw,
  type CreationDrawValue,
} from './CreationDraw'
import MatchPlayField from './MatchPlayField'
import { bringAcross } from './SeedFromEvent'
import { describeError, generateCode } from './CreateTripForm'
import { CODE_CHAR, FIELD, FIELD_LABEL, buttonClass, cardClass } from '@/app/components/ui'
import WizardShell from '@/app/components/WizardShell'
import { tripBase } from '@/lib/tripPaths'
import { createTripRow, enterEvent } from '@/lib/entryClient'

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

/**
 * Each step opens on its question — WizardShell draws it as the step's
 * title. The field and the draw are a step each (Ross, 4 Nov 2026).
 */
type StepKey = 'details' | 'field' | 'draw' | 'deadlines' | 'ready'
const STEP_TITLES: Record<StepKey, string> = {
  details: 'Name your event',
  field: 'Next, let’s add the field',
  draw: 'Plan the draw',
  // Only once there is a bracket (Ross, 5 Nov 2026).
  deadlines: 'Set a deadline for each round?',
  ready: 'Ready to go',
}
/** At most one line under the question. */
const STEP_INTROS: Partial<Record<StepKey, string>> = {
  draw: DRAW_INTRO,
  deadlines: 'Do you want to set a deadline for each round to be completed?',
}

export default function CreateKnockoutForm({ onExit }: {
  /**
   * Back to the tournament door's chooser, from step 1 (CreateFlow). Absent
   * — the trip door — step 1 has no way back but the header mark, as ever.
   */
  onExit?: () => void
} = {}) {
  const [step, setStep] = useState<number | 'done'>(1)

  // Step 1 — the event and its period
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')

  // Step 2 — the field, seeded from another event if wanted (lib/fieldSeed.ts)
  const [organiserPlaying, setOrganiserPlaying] = useState(true)
  const [players, setPlayers] = useState<FieldPlayer[]>([
    { name: '', handicap: '', gender: 'M' },
  ])
  const [seed, setSeed] = useState<FieldSeed>(NO_FIELD_SEED)
  // Tags, switched on in the field step (lib/fieldTags.ts).
  const [tags, setTags] = useState<FieldTags>(NO_FIELD_TAGS)
  const [tagsWarning, setTagsWarning] = useState<string | null>(null)
  // The secondary leaderboard tags bring: wins and losses by tag, kept unless switched off.
  // Off until the organiser switches it on (Ross, 8 Nov 2026: leaderboards
  // are set by hand, never pre-filled — the bracket alone, which is the event).
  const [tagTally, setTagTally] = useState(false)
  const [seedWarning, setSeedWarning] = useState<string | null>(null)

  // Step 3 — the draw: now, later or on a date (lib/bracketDraw.ts)
  const [draw, setDraw] = useState<CreationDrawValue>(NO_CREATION_DRAW)
  const [drawWarning, setDrawWarning] = useState<string | null>(null)
  // And, once a bracket is made, a deadline a round (lib/bracketSetup.ts).
  const [deadlines, setDeadlines] = useState<DeadlinesAnswer>(NO_DEADLINES_ANSWER)

  // Step 4 — how collaborative, and the organiser PIN
  const [perms, setPerms] = useState<EventPermissions>(defaultPermissions)
  const [passcode, setPasscode] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')
  const [publicPin, setPublicPin] = useState(NO_PUBLIC_PIN)

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
  // The public PIN, beside it on an event (lib/publicPin.ts).
  const publicIssue = publicPinIssue(publicPin, passcode)

  const today = todayString(new Date())
  const drawEntrants = creationEntrants(players)
  const drawIssue = creationDrawIssue(draw, drawEntrants, today)
  // The rounds of the bracket being made — none while the draw is still to
  // be allocated, so no deadlines are asked until there is a bracket.
  const bracketRounds = creationRounds(draw, drawEntrants)
  const keys: StepKey[] = ['details', 'field', 'draw', ...(bracketRounds > 0 ? ['deadlines' as const] : []), 'ready']
  const key = keys[Math.min(Number(step) || 1, keys.length) - 1]
  const lastStep = keys.length

  const canProceed = !submitting && (
    key === 'details' ? name.trim().length > 0 && !!startDate && !!endDate && !datesBackwards :
    key === 'field' ? !duplicateIssue && !fieldTagsIssue(tags) :
    key === 'draw' ? !drawIssue :
    key === 'deadlines' ? !deadlinesAnswerIssue(deadlines, bracketRounds) :
    key === 'ready' ? !passcodeIssue && !publicIssue :
    false
  )

  function goNext() {
    if (step === 'done') return
    if (step < lastStep) setStep(step + 1)
    else handleSubmit()
  }

  function goBack() {
    setError(null)
    if (step === 1 && onExit) { onExit(); return }
    if (step !== 'done' && step > 1) setStep(step - 1)
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

    // The public PIN, when one was asked for — hashed here too, and only
    // sent when set, so an un-migrated database still creates events.
    let publicHash: string | null = null
    if (publicIssue === null && publicPin.on) {
      try {
        publicHash = await hashPasscode(publicPin.pin)
      } catch {
        setError('Could not set the public PIN on this device — try again.')
        setSubmitting(false)
        return
      }
    }

    // 1. The trip row. No rounds and no itinerary follow — the golf comes
    // later, when bracket rounds are linked to real days — so the row is
    // the whole of the structure this door creates.
    // The players' ids, given now — before the event row, which carries a
    // pre-made draw's places by them (CreationDraw `creationPlan`).
    const validPlayers = players.filter(p => p.name.trim())
    const idFor = new Map(validPlayers.map(p => [drawKey(p.name), crypto.randomUUID()]))

    const tripRow: Record<string, unknown> = {
      name: name.trim(),
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: startDate || null,
      end_date: endDate || null,
      kind: 'tournament',
      settings_passcode_hash: passcodeHash,
      ...(publicHash ? { public_passcode_hash: publicHash } : {}),
      formats: {
        ...NO_FORMATS,
        league: { ...NO_FORMATS.league },
        matchplay: { ...NO_FORMATS.matchplay },
      },
      // The format and the shape, seeded now so the bracket form knows what
      // it is finishing. Not a complete setup — parseBracketSetup rightly
      // returns null on it — and never claimed to be one.
      bracket_setup: knockoutSeed('continuous', creationPlan(draw, drawEntrants, idFor),
        bracketRounds > 0 ? storedDeadlines(deadlines, bracketRounds) : null),
      // The bracket's board, so the event plays from the moment it exists —
      // without it the bracket said match play was not switched on.
      leaderboards: withTagTally(knockoutBoards(), activeTags(tags).length > 0 && tagTally),
      // Only when a toggle was actually flipped — nothing opened writes
      // nothing, so creation still lands before migration 049 has run.
      ...(storedPermissions(perms) ? { event_permissions: perms } : {}),
    }

    const leadEmail = normaliseEmail(email)
    if (leadEmail) tripRow.lead_email = leadEmail

    const { data: trip, error: tripErr } = await createTripRow(tripRow)

    if (tripErr || !trip) {
      setError(`Could not create the event. ${describeError(tripErr)}`)
      setSubmitting(false)
      return
    }

    // 2. Players — same shape as every creation door; no round_handicaps
    // because there are no rounds yet.
    if (validPlayers.length > 0) {
      const { data: insertedPlayers, error: playersErr } = await supabase
        .from('players')
        .insert(
          validPlayers.map((p, i) => ({
            // Given here, so a draw made now can name them (CreationDraw).
            id: idFor.get(drawKey(p.name)),
            trip_id: trip.id,
            name: p.name.trim(),
            // Blank is pending, never scratch (lib/handicap.ts)
            handicap: parseHandicap(p.handicap),
            gender: p.gender,
            role: 'player',
            is_lead: organiserPlaying && i === 0,
            claimed: organiserPlaying && i === 0,
            team_id: null,
          }))
        )
        .select('id, is_lead')

      if (playersErr || !insertedPlayers) {
        setError(`Event created, but the players could not be saved. ${describeError(playersErr)}`)
        setSubmitting(false)
        return
      }
      const lead = insertedPlayers.find(p => p.is_lead)
      if (lead) { rememberPlayer(code, lead.id); void enterEvent(code, { playerId: lead.id }) }
    }

    // 3. Everything brought across from the event the field was seeded
    // from, when its organiser PIN was given (lib/fieldSeed.ts). Like the
    // draw below, a failure costs that and never the event.
    setSeedWarning(await bringAcross(seed, code, passcode, seedPairs(validPlayers, idFor, drawKey)))

    // The field step's tags — a failure costs them, never the event.
    setTagsWarning(await writeFieldTags(supabase, trip.id, tags, validPlayers, n => idFor.get(drawKey(n))))

    // 4. The draw, when it is made now. A draw that fails costs the draw,
    // never the event — it can be made from the organiser area.
    if (draw.timing.when === 'now') {
      try {
        await writeCreationDraw(supabase, trip.id, draw, drawEntrants, idFor)
      } catch (e) {
        console.error('Creation draw failed:', e)
        setDrawWarning('The event is made, but the draw could not be saved — make it from the organiser area.')
      }
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
    void enterEvent(code, { adminPin: passcode })
    if (publicHash) rememberEntry(code, publicHash)

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
      <div className="min-h-dvh paper flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mx-auto mb-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A9D56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <h1 className="t-h1 text-ink mb-2">
            Event created
          </h1>
          <p className="text-ink/65 text-sm mb-10">
            {draw.timing.when === 'now' && !drawWarning
              ? 'Share this code with the field. The draw is made — it is on the bracket.'
              : 'Share this code with the field. Next, set up the bracket in the organiser area on your Event Hub.'}
          </p>
          {drawWarning && <p className="text-rust-deep text-sm mb-6 leading-snug">{drawWarning}</p>}
          {seedWarning && <p className="text-rust-deep text-sm mb-6 leading-snug">{seedWarning}</p>}
          {tagsWarning && <p className="text-rust-deep text-sm mb-6 leading-snug">{tagsWarning}</p>}

          <div className={`px-4 py-8 mb-4 ${cardClass()}`}>
            <p className="t-label text-ink/65 mb-4">Your event code</p>
            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
              {resultCode.split('').map((ch, i) => (
                <span
                  key={i}
                  className={CODE_CHAR}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>

          <div className={`mb-4 px-4 py-3 ${cardClass()}`}>
            <p className="text-ink/80 text-[13px] leading-snug">
              Your organiser PIN is set. Keep it safe — it cannot be recovered
              or changed.
            </p>
          </div>

          <button
            onClick={copyCode}
            className={`${buttonClass('secondary')} mb-3`}
          >
            {copied ? '✓ Copied' : 'Copy code'}
          </button>

          <Link
            href={tripBase(resultCode, 'tournament')}
            className={buttonClass('primary')}
          >
            Go to your event
          </Link>
        </div>
      </div>
    )
  }

  // ── The wizard ───────────────────────────────────────────────────────────

  const stepNum = Math.min(Number(step) || 1, lastStep)

  return (
    <div className="min-h-dvh paper text-ink">
      <TripHeader backTo="/golf" />

      <div className="page-enter">

      <WizardShell
        step={stepNum}
        titles={keys.map(k => STEP_TITLES[k])}
        intro={STEP_INTROS[key]}
        onBack={goBack}
        backOnFirst={!!onExit}
        footer={<>
          <button
            onClick={goNext}
            disabled={!canProceed}
            className={buttonClass('primary')}
          >
            {submitting ? 'Creating…' : stepNum === lastStep ? 'Create event' : 'Continue'}
          </button>
          {key === 'field' && (
            <p className="text-center text-ink/65 text-[13px] mt-3">
              Players without a name will be skipped
            </p>
          )}
          </>}
      >

        {/* ── 1 · The event and its period ── */}
        {key === 'details' && (
          <div className="space-y-6">
            <div>
              <label className={FIELD_LABEL}>Event name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Summer Knockout 2027"
                className={FIELD}
                autoFocus
              />
            </div>

            {/* The period, a prompt a date (Ross, 4 Nov 2026). The end's
                calendar opens on the start: picking a start fills the end
                in with it, to be moved on from there, rather than leaving
                the picker on today. */}
            <div className="space-y-4">
              <DateField
                label="Pick a start date for the event."
                value={startDate}
                onChange={v => {
                  setStartDate(v)
                  if (v && (!endDate || endDate < v)) setEndDate(v)
                }}
              />
              <div>
                <label className={FIELD_LABEL}>Pick an end date for the event.</label>
                <p className="text-ink/65 text-[13px] -mt-1 mb-2 leading-snug">
                  When should the final round be played by?
                </p>
                <DateField value={endDate} onChange={setEndDate} min={startDate || undefined} openAt={startDate || null} />
              </div>
              {datesBackwards ? (
                <p className="text-rust-deep text-[13px] leading-snug">
                  The end cannot come before the start.
                </p>
              ) : (
                <p className="text-ink/65 text-[13px] leading-snug">
                  How many rounds there are, and so each round&apos;s deadline,
                  depends on how many players enter. You can change these
                  dates later in your event settings.
                </p>
              )}
            </div>

            <div>
              <label className={FIELD_LABEL} htmlFor="ko-email">Email (optional)</label>
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
                className={FIELD}
              />
              <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                We&apos;ll email you the event details and share link.
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
        {key === 'field' && (
          <MatchPlayField
            players={players}
            setPlayers={setPlayers}
            organiserPlaying={organiserPlaying}
            setOrganiserPlaying={setOrganiserPlaying}
            duplicateIndex={duplicateIndex}
            duplicateIssue={duplicateIssue}
            seed={seed}
            setSeed={setSeed}
            tags={tags}
            setTags={setTags}
          />
        )}

        {/* ── 3 · The draw, a step of its own ── */}
        {key === 'draw' && (
          <CreationDraw entrants={drawEntrants} value={draw} onChange={setDraw} issue={drawIssue} today={today} heading={false}
            standings={drawStandings(seed, players, drawKey)} from={seed.source?.name} />
        )}

        {/* ── 4 · How collaborative, and the organiser PIN ── */}
        {key === 'deadlines' && (
          <RoundDeadlines value={deadlines} onChange={setDeadlines} rounds={bracketRounds} start={startDate || null} />
        )}

        {key === 'ready' && (
          <div className="space-y-3">
            {/* The tags' secondary leaderboard (Ross, 5 Nov 2026) — wins and
                losses by tag, under the bracket; off until switched on. */}
            {activeTags(tags).length > 0 && (
              <div className="mb-6">
                <label className={FIELD_LABEL}>Leaderboards</label>
                <div className={`flex items-start justify-between gap-4 p-4 ${cardClass()}`}>
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium">{boardTitle(matchTallyBoard())}</p>
                    <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                      {boardRules(matchTallyBoard())} Shown under the bracket, and editable in the organiser area.
                    </p>
                  </div>
                  <Toggle checked={tagTally} onChange={setTagTally} label="Rank the tags by match wins" />
                </div>
              </div>
            )}
            <div className="mb-6">
              <label className={FIELD_LABEL}>How collaborative should this event be?</label>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                Choose a style, or set each one. Editable in the organiser area.
              </p>
              <CollaborationQuestion value={perms} onChange={setPerms} registry={permissionsFor(false, true)} />
            </div>

            <div className={`px-4 py-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">Organiser PIN</p>
              <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                Unlocks the bracket, notices and settings in the organiser area.
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
              className={FIELD}
            />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={passcodeConfirm}
              onChange={e => setPasscodeConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter it again"
              maxLength={MAX_PASSCODE}
              className={FIELD}
            />
            {passcodeIssue && (passcode || passcodeConfirm) && (
              <p className="text-rust-deep text-[13px] leading-snug">{passcodeIssue}</p>
            )}
            <PublicPinField value={publicPin} onChange={setPublicPin} issue={publicIssue} />
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
            <p className="text-rust-deep text-sm">{error}</p>
          </div>
        )}

      </WizardShell>

      </div>
    </div>
  )
}
