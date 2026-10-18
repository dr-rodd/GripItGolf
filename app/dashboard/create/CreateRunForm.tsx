'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import EventPermissionToggles from '@/app/components/EventPermissionToggles'
import { normaliseEmail, emailWarning, MAX_EMAIL } from '@/lib/email'
import { rememberPlayer } from '@/lib/playerCookie'
import {
  MIN_PASSCODE, MAX_PASSCODE, hashPasscode, passcodeError, rememberUnlock,
} from '@/lib/passcode'
import { PRESET_COLORS } from '@/lib/teamColors'
import { MAIN_SET } from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'
import RunRulesFields from '@/app/components/RunRulesFields'
import {
  RUN_KIND, RUN_PERMISSIONS, MAX_TEAM_NAME, MAX_RUN_TEAMS,
  type RunPermissions, type RulesDraft,
  defaultRules, defaultBoards, draftFromSetup, rulesFromDraft, draftIssue,
  defaultRunPermissions, storedRunPermissions,
  challengeDatesIssue, teamNamesIssue, migrationMissing, MIGRATION_MISSING_MESSAGE,
} from '@/lib/runChallenge'
import { describeError, generateCode } from './CreateTripForm'
import { CODE_CHAR, FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass } from '@/app/components/ui'

/**
 * Creating a Green Dot Run challenge — an ongoing team running competition.
 *
 * Four steps: the challenge and its period; the starting teams (and whether
 * the organiser is running, and for whom); how runs earn points; and how
 * collaborative it is, with the organiser PIN. No roster step — a company
 * challenge fills itself, everyone joining with the code — and no golf
 * anywhere: no courses, no rounds, no handicaps.
 *
 * What creation writes, in the platform's insertion order:
 *
 *   trips        kind 'run', the period, the PIN, `run_setup` (rules and the
 *                two starting boards) and any permission that differs from
 *                the run defaults. Needs migration 052 — until it runs, the
 *                kind check refuses the row and this form says so plainly.
 *   teams        one per name, on the main sheet, coloured from the palette.
 *   players      the organiser alone, and only when they are running —
 *                the first player, `is_lead`, claimed, and this device's
 *                cookie. Not running, there is no row for them at all.
 *   team_members the organiser's team, through the one writer (setTeam),
 *                which keeps `players.team_id` in step.
 *
 * The rules themselves are lib/runChallenge.ts — this form only collects
 * them; it never decides what a rule means.
 */

const STEP_LABELS = ['Challenge', 'Teams', 'Points', 'Finish']

export default function CreateRunForm() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 'done'>(1)

  // Step 1 — the challenge and its period
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')

  // Step 2 — the starting teams, and the organiser
  const [teams, setTeams] = useState<string[]>(['', ''])
  const [organiserRunning, setOrganiserRunning] = useState(true)
  const [organiserName, setOrganiserName] = useState('')
  const [organiserTeam, setOrganiserTeam] = useState<number | null>(null)

  // Step 3 — how a run earns points. Kept as typed; read through parseRules.
  const [draft, setDraft] = useState<RulesDraft>(
    () => draftFromSetup({ rules: defaultRules(), boards: defaultBoards() }),
  )

  // Step 4 — how collaborative, and the organiser PIN
  const [perms, setPerms] = useState<RunPermissions>(defaultRunPermissions)
  const [passcode, setPasscode] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultCode, setResultCode] = useState('')
  const [copied, setCopied] = useState(false)

  // ── What each step needs before it can move on ──

  const datesIssue = startDate && endDate ? challengeDatesIssue(startDate, endDate) : null

  const realTeams = teams.map(t => t.trim()).filter(Boolean)
  const teamsIssue = teamNamesIssue(teams)
  // The organiser's pick is an index into the typed rows; a row emptied
  // after being picked is no longer a team, so the pick lapses with it.
  const pickedTeam = organiserTeam !== null && teams[organiserTeam]?.trim()
    ? teams[organiserTeam].trim()
    : null
  const organiserIssue = !organiserRunning ? null
    : !organiserName.trim() ? 'Add your name — you\'re the first runner.'
    : !pickedTeam ? 'Pick the team you\'re running for.'
    : null

  const rules = rulesFromDraft(draft)
  const pointsIssue = draftIssue(draft)

  const passcodeIssue =
    passcodeError(passcode) ??
    (passcode !== passcodeConfirm ? 'The two passcodes do not match.' : null)

  const canProceed = !submitting && (
    step === 1 ? name.trim().length > 0 && !!startDate && !!endDate && !datesIssue :
    step === 2 ? !teamsIssue && !organiserIssue :
    step === 3 ? !pointsIssue :
    step === 4 ? !passcodeIssue :
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

  function updateTeam(i: number, value: string) {
    setTeams(prev => prev.map((t, idx) => idx === i ? value : t))
  }
  function removeTeam(i: number) {
    setTeams(prev => prev.filter((_, idx) => idx !== i))
    setOrganiserTeam(prev =>
      prev === null || prev === i ? null : prev > i ? prev - 1 : prev)
  }

  async function handleSubmit() {
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

    // 1. The trip row — the whole challenge's settings, in one write.
    const tripRow: Record<string, unknown> = {
      name: name.trim(),
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: startDate,
      end_date: endDate,
      kind: RUN_KIND,
      settings_passcode_hash: passcodeHash,
      run_setup: { rules, boards: defaultBoards(draft.teamScore) },
      ...(storedRunPermissions(perms) ? { event_permissions: perms } : {}),
    }
    const leadEmail = normaliseEmail(email)
    if (leadEmail) tripRow.lead_email = leadEmail

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert(tripRow)
      .select('id')
      .single()

    if (tripErr || !trip) {
      setError(migrationMissing(tripErr)
        ? MIGRATION_MISSING_MESSAGE
        : `Could not create the challenge. ${describeError(tripErr)}`)
      setSubmitting(false)
      return
    }

    // 2. The starting teams, on the main sheet — the one players.team_id
    // mirrors, so every coloured dot the platform draws already knows them.
    const { data: insertedTeams, error: teamsErr } = await supabase
      .from('teams')
      .insert(realTeams.map((t, i) => ({
        trip_id: trip.id,
        name: t,
        color: PRESET_COLORS[i % PRESET_COLORS.length],
      })))
      .select('id, name')

    if (teamsErr || !insertedTeams) {
      setError(`Challenge created, but the teams could not be saved. ${describeError(teamsErr)}`)
      setSubmitting(false)
      return
    }

    // 3. The organiser, when running — first player, lead, claimed, and
    // the holder of this phone. Matched to their team by name, which the
    // form has already made unique.
    if (organiserRunning && pickedTeam) {
      const { data: lead, error: leadErr } = await supabase
        .from('players')
        .insert({
          trip_id: trip.id,
          name: organiserName.trim(),
          role: 'player',
          is_lead: true,
          claimed: true,
          team_id: null,
        })
        .select('id')
        .single()

      if (leadErr || !lead) {
        setError(`Challenge created, but your name could not be added. ${describeError(leadErr)}`)
        setSubmitting(false)
        return
      }
      rememberPlayer(code, lead.id)

      const team = insertedTeams.find(t => t.name === pickedTeam)
      if (team) {
        const failure = await setTeam(trip.id, lead.id, MAIN_SET, team.id)
        if (failure) console.error('CreateRunForm: organiser team failed:', failure)
      }
    }

    if (leadEmail) {
      fetch('/api/trip-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code }),
        keepalive: true,
      }).catch(() => { /* the challenge is created; the email is best-effort */ })
    }

    // The device that just set the PIN plainly knows it.
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
      <div className="min-h-dvh paper flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mx-auto mb-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A9D56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-2">
            Challenge Created!
          </h1>
          <p className="text-ink/65 text-sm mb-10">
            Share this code with everyone taking part — they join with it
            and pick their team. Run logging and the leaderboard arrive in
            the next update.
          </p>

          <div className={`px-4 py-8 mb-4 ${cardClass()}`}>
            <p className="t-label text-ink/65 mb-4">Your challenge code</p>
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
            href={`/run/${resultCode}`}
            className={buttonClass('primary')}
          >
            Go to your challenge
          </Link>
        </div>
      </div>
    )
  }

  // ── The wizard ───────────────────────────────────────────────────────────

  const stepNum = step as 1 | 2 | 3 | 4

  return (
    <div className="min-h-dvh paper text-ink">
      <TripHeader backTo="/create" />

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
        {/* Three cells: the way back, the step, and an empty one to keep the
            step centred. The button is in the row rather than laid over it,
            and the row is its 48px — it used to hang out of a shorter one,
            over the progress bar. The left cell holds its width on step 1,
            so nothing shifts when the arrow arrives. */}
        <div className="max-w-lg mx-auto px-4 grid grid-cols-[48px_1fr_48px] min-h-12 items-center">
          <div>
            {stepNum > 1 && <BackButton onClick={goBack} />}
          </div>
          <p className="text-center t-label text-ink/65">
            Step {stepNum} of 4 — {STEP_LABELS[stepNum - 1]}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">

        {/* ── 1 · The challenge and its period ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className={FIELD_LABEL}>Challenge name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Autumn Office Run"
                className={FIELD}
                autoFocus
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>The period</label>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <DateField label="Starts" value={startDate} onChange={setStartDate} />
                <DateField label="Finishes" value={endDate} onChange={setEndDate} />
              </div>
              {datesIssue ? (
                <p className="text-rust-deep text-[13px] mt-2 leading-snug">{datesIssue}</p>
              ) : (
                <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                  Runs between these dates count — a week, a month, a quarter.
                </p>
              )}
            </div>

            <div>
              <label className={FIELD_LABEL} htmlFor="run-email">Email (optional)</label>
              <input
                id="run-email"
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
                We&apos;ll send you the challenge details, the share link and
                your admin link. The challenge works either way, and no
                participant ever sees it.
              </p>
              {emailWarning(email) && (
                <p className="text-rust/80 text-[13px] mt-2 leading-snug">
                  {emailWarning(email)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 2 · The starting teams ── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm leading-snug">
              Everyone runs for a team. Add the ones you know about — you can
              rename and add more later, and let players start their own on
              the last step.
            </p>

            {teams.map((team, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PRESET_COLORS[i % PRESET_COLORS.length] }}
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={team}
                  onChange={e => updateTeam(i, e.target.value)}
                  placeholder={`Team ${i + 1}`}
                  maxLength={MAX_TEAM_NAME}
                  className={FIELD}
                />
                {teams.length > 1 && (
                  <button
                    onClick={() => removeTeam(i)}
                    className="text-ink/65 hover:text-ink/80 transition-colors p-2 flex-shrink-0"
                    aria-label="Remove team"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {teams.length < MAX_RUN_TEAMS && (
              <button
                onClick={() => setTeams(prev => [...prev, ''])}
                className="w-full py-4 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/25 hover:text-ink/80 transition-colors"
              >
                + Add another team
              </button>
            )}

            {teamsIssue && realTeams.length > 0 && (
              <p className="text-rust-deep text-[13px] leading-snug">{teamsIssue}</p>
            )}

            <div className={`p-4 mt-6 ${cardClass()}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Are you running?</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    {organiserRunning
                      ? 'Your name goes on the board like everyone else\'s.'
                      : 'You run the challenge; everyone else runs in it.'}
                  </p>
                </div>
                <Toggle
                  checked={organiserRunning}
                  onChange={setOrganiserRunning}
                  label="The organiser is running"
                />
              </div>

              {organiserRunning && (
                <div className="space-y-3 mt-4">
                  <input
                    type="text"
                    value={organiserName}
                    onChange={e => setOrganiserName(e.target.value)}
                    placeholder="Your name"
                    className={FIELD}
                  />
                  {realTeams.length > 0 && (
                    <div>
                      <p className="text-ink/65 text-[13px] mb-2">Your team</p>
                      <div className="flex flex-wrap gap-2">
                        {teams.map((t, i) => t.trim() && (
                          <button
                            key={i}
                            onClick={() => setOrganiserTeam(i)}
                            className={`${chipClass(organiserTeam === i)}`}
                          >
                            {t.trim()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 3 · How a run earns points ── */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-ink/65 text-sm leading-snug mb-2">
              How runs turn into points. You can change these later from the
              organiser area — the leaderboard re-counts itself.
            </p>

            <RunRulesFields draft={draft} onChange={setDraft} />
          </div>
        )}

        {/* ── 4 · How collaborative, and the organiser PIN ── */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="mb-6">
              <label className={FIELD_LABEL}>How collaborative should this challenge be?</label>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                What participants can do for themselves. You can change any of
                these later from the organiser area.
              </p>
              <EventPermissionToggles
                registry={RUN_PERMISSIONS}
                value={perms}
                onChange={setPerms}
              />
            </div>

            <div className={`px-4 py-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">Organiser PIN</p>
              <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                Your key to the organiser area — teams, permissions and the
                points rules ask for it. Share it with anyone you want helping
                you run the challenge.
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
            className={buttonClass('primary')}
          >
            {submitting ? 'Creating…' : stepNum === 4 ? 'Create challenge' : 'Continue'}
          </button>
          {stepNum === 2 && organiserIssue && realTeams.length > 0 && (
            <p className="text-center text-ink/65 text-[13px] mt-3">{organiserIssue}</p>
          )}
        </div>
      </div>

      </div>
    </div>
  )
}
