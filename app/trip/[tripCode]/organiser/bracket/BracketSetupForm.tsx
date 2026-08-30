'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import {
  type BracketMode, type BracketSetup, type BracketSize, type PlayerEntry,
  type Seeding, type TournamentFormat,
  TOURNAMENT_FORMATS, BRACKET_MODES, BRACKET_SIZES, PLAYER_ENTRIES, SEEDINGS,
  bracketRoundNames, describeSize, deadlinesIssue,
  normalizeEventCode, validEventCode, roundsFor,
} from '@/lib/bracketSetup'

/**
 * The bracket setup form — seven answers, one screen each, saved whole.
 *
 * The rules all live in lib/bracketSetup.ts; this file is the asking. A
 * half-finished setup exists only in this component's state — the database
 * only ever sees a complete one, and a finalised one comes back as a
 * read-only summary rather than a form, because finalising is the point of
 * no return the last step says it is.
 *
 * Writes go straight to Supabase with the anon key like every organiser
 * write — the PIN in front of this screen is a soft gate, not a security
 * boundary (lib/passcode.ts), and every query filters by trip.
 */

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

const LABEL = 'block text-ink/80 text-[13px] uppercase tracking-wider mb-2'

const STEP_LABELS = [
  'Format', 'Mode', 'Bracket size', 'Player entry',
  'Qualifying', 'Deadlines', 'Finalise',
]

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

/** The saved setup, said back — the done screen and the finalised view. */
function SetupSummary({ setup }: { setup: BracketSetup }) {
  const names = bracketRoundNames(setup.size)
  const row = 'flex items-baseline justify-between gap-4 py-2.5 border-b border-bark/12 last:border-b-0'
  return (
    <div className="bg-surface border border-bark/12 rounded-2xl px-4 py-1.5">
      <div className={row}>
        <span className="text-ink/65 text-[13px]">Format</span>
        <span className="text-ink text-sm text-right">Match play knockout</span>
      </div>
      <div className={row}>
        <span className="text-ink/65 text-[13px]">Mode</span>
        <span className="text-ink text-sm text-right">
          {BRACKET_MODES.find(m => m.key === setup.mode)?.label}
        </span>
      </div>
      <div className={row}>
        <span className="text-ink/65 text-[13px]">Bracket</span>
        <span className="text-ink text-sm text-right">
          Up to {setup.size} players · {roundsFor(setup.size)} rounds
        </span>
      </div>
      <div className={row}>
        <span className="text-ink/65 text-[13px]">Entry</span>
        <span className="text-ink text-sm text-right">
          {PLAYER_ENTRIES.find(e => e.key === setup.entry)?.label}
        </span>
      </div>
      <div className={row}>
        <span className="text-ink/65 text-[13px]">Qualifying</span>
        <span className="text-ink text-sm text-right">
          {setup.qualifying
            ? `${setup.qualifying.eventCode} · ${SEEDINGS.find(s => s.key === setup.qualifying!.seeding)?.label}`
            : 'None'}
        </span>
      </div>
      {names.map((name, i) => (
        <div key={name} className={row}>
          <span className="text-ink/65 text-[13px]">{name}</span>
          <span className="text-ink text-sm text-right tabular-nums">by {setup.deadlines[i]}</span>
        </div>
      ))}
      <div className={row}>
        <span className="text-ink/65 text-[13px]">Setup</span>
        <span className="text-ink text-sm text-right">
          {setup.finalized ? 'Finalised' : 'Open — players can keep joining'}
        </span>
      </div>
    </div>
  )
}

export default function BracketSetupForm({
  tripId, tripCode, initialSetup, initialSchedule = null,
}: {
  tripId: string
  tripCode: string
  initialSetup: BracketSetup | null
  /**
   * The shape written at the event's creation, recovered from the raw
   * column when no complete setup exists yet — a continuous knockout must
   * stay continuous through this form's first save.
   */
  initialSchedule?: 'continuous' | null
}) {
  // ── The seven answers, prefilled from a saved-but-open setup ─────────────
  const [format, setFormat] = useState<TournamentFormat | null>(initialSetup?.format ?? null)
  const [mode, setMode] = useState<BracketMode | null>(initialSetup?.mode ?? null)
  const [size, setSize] = useState<BracketSize | null>(initialSetup?.size ?? null)
  const [entry, setEntry] = useState<PlayerEntry | null>(initialSetup?.entry ?? null)
  const [qualifyingOn, setQualifyingOn] = useState(!!initialSetup?.qualifying)
  const [qualCode, setQualCode] = useState(initialSetup?.qualifying?.eventCode ?? '')
  const [seeding, setSeeding] = useState<Seeding | null>(initialSetup?.qualifying?.seeding ?? null)
  const [deadlines, setDeadlines] = useState<string[]>(initialSetup?.deadlines ?? [])
  const [finalizeNow, setFinalizeNow] = useState<boolean | null>(
    initialSetup ? initialSetup.finalized : null
  )

  const [step, setStep] = useState<number | 'done'>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<BracketSetup | null>(null)

  // ── A finalised setup is read, not edited ────────────────────────────────
  if (initialSetup?.finalized && !saved) {
    return (
      <main className="min-h-dvh bg-cream has-tabbar page-enter">
        <TripHeader backTo={`/trip/${tripCode}/organiser`} />
        <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-1">
            Bracket setup
          </h1>
          <p className="text-ink/65 text-sm mb-6">
            This event is finalised — the format and bracket structure are
            locked in.
          </p>
          <SetupSummary setup={initialSetup} />
          <div className="mt-6">
            <BackButton href={`/trip/${tripCode}/organiser`} label="Organiser" />
          </div>
        </div>
      </main>
    )
  }

  // ── Step gates ───────────────────────────────────────────────────────────
  const codeTyped = normalizeEventCode(qualCode)
  const qualifyingReady = !qualifyingOn || (validEventCode(codeTyped) && !!seeding)
  const deadlineProblem = size ? deadlinesIssue(deadlines, size) : null

  const canProceed = !saving && (
    step === 1 ? format === 'match_play' :
    step === 2 ? !!mode :
    step === 3 ? !!size :
    step === 4 ? !!entry :
    step === 5 ? qualifyingReady :
    step === 6 ? !!size && !deadlineProblem :
    step === 7 ? finalizeNow !== null :
    false
  )

  function goNext() {
    if (step === 'done') return
    if (step < 7) setStep(step + 1)
    else handleSave()
  }

  function goBack() {
    setError(null)
    if (step !== 'done' && step > 1) setStep(step - 1)
  }

  /** Changing size re-counts the rounds; dates already set keep their slot. */
  function chooseSize(s: BracketSize) {
    setSize(s)
    setDeadlines(prev => prev.slice(0, roundsFor(s)))
  }

  function setDeadline(i: number, value: string) {
    setDeadlines(prev => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = value
      return next
    })
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!mode || !size || !entry || finalizeNow === null) return
    setSaving(true)
    setError(null)

    // The shape rides along whole-object like everything else: from the
    // saved setup when one exists, else from what creation wrote.
    const schedule = initialSetup?.schedule ?? initialSchedule ?? undefined
    const setup: BracketSetup = {
      format: 'match_play',
      ...(schedule === 'continuous' ? { schedule } : {}),
      mode, size, entry,
      deadlines: deadlines.slice(0, roundsFor(size)),
      finalized: finalizeNow,
    }

    if (qualifyingOn) {
      if (codeTyped === tripCode.toUpperCase()) {
        setError('An event cannot qualify for itself — use the qualifying event\'s own code.')
        setSaving(false)
        return
      }
      // The code has to name a real event before it is worth storing —
      // a reference nothing can resolve would sit silently broken until
      // seeding day.
      const { data: qual, error: qualErr } = await supabase
        .from('trips')
        .select('id')
        .eq('trip_code', codeTyped)
        .maybeSingle()
      if (qualErr || !qual) {
        setError(`Could not find an event with the code ${codeTyped} — check it and try again.`)
        setSaving(false)
        return
      }
      setup.qualifying = { eventCode: codeTyped, seeding: seeding! }
    }

    const { error: saveErr } = await supabase
      .from('trips')
      .update({ bracket_setup: setup })
      .eq('id', tripId)

    if (saveErr) {
      // A missing column means migration 047 has not been run — trying
      // again will fail identically, so say what is actually wrong.
      setError(/column|schema cache/i.test(saveErr.message ?? '')
        ? 'Could not save the setup — a database update may not have been applied yet.'
        : 'Could not save the setup — try again.')
      setSaving(false)
      return
    }

    setSaved(setup)
    setStep('done')
    setSaving(false)
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (step === 'done' && saved) {
    return (
      <main className="min-h-dvh bg-cream has-tabbar page-enter">
        <TripHeader backTo={`/trip/${tripCode}/organiser`} />
        <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-1">
            {saved.finalized ? 'Bracket finalised' : 'Bracket setup saved'}
          </h1>
          <p className="text-ink/65 text-sm mb-6">
            {saved.finalized
              ? 'The format and bracket structure are locked in.'
              : 'Players can keep joining. Come back here to finalise when the field is set.'}
          </p>
          <SetupSummary setup={saved} />
          <Link
            href={`/trip/${tripCode}/organiser`}
            className="block w-full mt-6 py-4 bg-accent-deep text-white text-center text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors"
          >
            Back to Organiser
          </Link>
        </div>
      </main>
    )
  }

  // ── The wizard ───────────────────────────────────────────────────────────
  const stepNum = step as number
  const roundNames = size ? bracketRoundNames(size) : []

  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo={`/trip/${tripCode}/organiser`} />

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
            Step {stepNum} of 7 — {STEP_LABELS[stepNum - 1]}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">

        {/* ── 1 · Format ── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm">
              What kind of tournament is this?
            </p>
            <Chips
              options={TOURNAMENT_FORMATS}
              chosen={format}
              onChoose={setFormat}
            />
            {format && (
              <p className="text-ink/65 text-[13px] leading-snug">
                {TOURNAMENT_FORMATS.find(f => f.key === format)?.hint}
              </p>
            )}
            {format === 'league' && (
              <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
                <p className="text-ink text-sm font-medium">A league is its own event.</p>
                <p className="text-ink/65 text-[13px] mt-1 leading-snug">
                  Leagues are created whole — venues, dates and field in one
                  go — from Create an Event → Golf Tournament → League. This
                  form sets up a knockout; pick match play to carry on.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 2 · Mode ── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm">
              Who decides how a match comes about?
            </p>
            <Chips options={BRACKET_MODES} chosen={mode} onChoose={setMode} />
            {mode && (
              <p className="text-ink/65 text-[13px] leading-snug">
                {BRACKET_MODES.find(m => m.key === mode)?.hint}
              </p>
            )}
          </div>
        )}

        {/* ── 3 · Size ── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm">
              How big can the field grow? A field that falls short is seated
              with byes.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {BRACKET_SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => chooseSize(s)}
                  aria-pressed={size === s}
                  className={`py-4 rounded-xl text-sm font-medium transition-colors ${
                    size === s
                      ? 'bg-accent-deep text-white'
                      : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                  }`}
                >
                  {s} players
                </button>
              ))}
            </div>
            {size && (
              <p className="text-ink/65 text-[13px] leading-snug">{describeSize(size)}</p>
            )}
          </div>
        )}

        {/* ── 4 · Player entry ── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm">
              How does the field get in?
            </p>
            <Chips options={PLAYER_ENTRIES} chosen={entry} onChoose={setEntry} />
            {entry && (
              <p className="text-ink/65 text-[13px] leading-snug">
                {PLAYER_ENTRIES.find(e => e.key === entry)?.hint}
              </p>
            )}
            {entry === 'self_join' && (
              <p className="text-ink/65 text-[13px] leading-snug">
                The link and QR code are on your Event Hub&apos;s share screen,
                ready to send or hold up.
              </p>
            )}
            {mode === 'strict' && (
              <p className="text-ink/65 text-[13px] leading-snug">
                Either way, in strict mode the match pairings stay yours —
                this only decides how names get on the roster.
              </p>
            )}
          </div>
        )}

        {/* ── 5 · Qualifying ── */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4">
              <div className="min-w-0">
                <p className="text-ink text-sm font-medium">Qualifying event</p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  Feed the bracket from a standalone event&apos;s standings —
                  the top {size ?? 32} qualify.
                </p>
              </div>
              <Toggle
                checked={qualifyingOn}
                onChange={setQualifyingOn}
                label="Attach a qualifying event"
              />
            </div>

            {qualifyingOn && (
              <>
                <div>
                  <label className={LABEL} htmlFor="qual-code">Qualifying event code</label>
                  <input
                    id="qual-code"
                    type="text"
                    value={qualCode}
                    onChange={e => setQualCode(e.target.value.toUpperCase())}
                    placeholder="e.g. QX7K2P"
                    maxLength={6}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`${INPUT} tracking-[0.3em] uppercase`}
                  />
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                    The six-character code of the event whose standings decide
                    who is in.
                  </p>
                </div>

                <div>
                  <label className={LABEL}>How the qualifiers are drawn</label>
                  <Chips options={SEEDINGS} chosen={seeding} onChoose={setSeeding} />
                  {seeding && (
                    <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                      {SEEDINGS.find(s => s.key === seeding)?.hint}
                    </p>
                  )}
                </div>
              </>
            )}

            {!qualifyingOn && (
              <p className="text-ink/65 text-[13px] leading-snug">
                Without one, the draw is among whoever enters — drawn at
                random when the bracket is made.
              </p>
            )}
          </div>
        )}

        {/* ── 6 · Deadlines ── */}
        {step === 6 && size && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm">
              The date each round must be finished by. Two rounds can share a
              day; they can&apos;t run backwards.
            </p>
            <div className="space-y-3">
              {roundNames.map((name, i) => (
                <DateField
                  key={name}
                  label={name}
                  value={deadlines[i] ?? ''}
                  onChange={v => setDeadline(i, v)}
                />
              ))}
            </div>
            {deadlineProblem && deadlines.some(Boolean) && (
              <p className="text-rust-deep text-[13px] leading-snug">{deadlineProblem}</p>
            )}
          </div>
        )}

        {/* ── 7 · Finalise ── */}
        {step === 7 && (
          <div className="space-y-4">
            <p className="text-ink/65 text-sm">
              Lock the format and bracket structure in now, or leave the
              event open so players can keep joining?
            </p>
            <Chips
              options={[
                { key: 'open', label: 'Leave open' },
                { key: 'final', label: 'Finalise now' },
              ] as const}
              chosen={finalizeNow === null ? null : finalizeNow ? 'final' : 'open'}
              onChoose={k => setFinalizeNow(k === 'final')}
            />
            <p className="text-ink/65 text-[13px] leading-snug">
              {finalizeNow === null
                ? 'Open can be finalised any time from this screen; finalised is for keeps.'
                : finalizeNow
                  ? 'The setup locks when you save — no more joiners, no more changes here.'
                  : 'Players keep joining until you come back and finalise. Every answer here stays changeable until then.'}
            </p>
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
            {saving ? 'Saving…' : stepNum === 7
              ? (finalizeNow ? 'Save & Finalise' : 'Save Setup')
              : 'Continue'}
          </button>
        </div>
      </div>

      </div>
    </main>
  )
}
