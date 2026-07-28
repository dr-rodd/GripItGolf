'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import DateField from '@/app/components/DateField'
import { MAX_ROUNDS, roundCountError } from '@/lib/tripLimits'
import Toggle from '@/app/components/Toggle'
import {
  MIN_PASSCODE, MAX_PASSCODE, hashPasscode, passcodeError,
} from '@/lib/passcode'

// ── Types ─────────────────────────────────────────────────────────────────

type Course = { id: string; name: string }
type RoundInput = { courseId: string; scheduledDate: string }
type TeamInput = { name: string; color: string }
type PlayerInput = { name: string; handicap: string; gender: 'M' | 'F'; teamIndex: number }

// ── Constants ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#DC2626', '#2563EB', '#16A34A', '#9333EA',
  '#EA580C', '#DB2777', '#0D9488', '#C9A84C',
]

const INPUT = [
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5',
  'text-white placeholder-white/30',
  'focus:outline-none focus:border-[#C9A84C]/50 transition-colors',
].join(' ')

const LABEL = 'block text-white/60 text-xs uppercase tracking-wider mb-2'

const STEP_LABELS = ['Trip details', 'Rounds', 'Teams', 'Players']

// Presets cover the common cases; the + button goes beyond them.
const ROUND_PRESETS = Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1)

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Root component ────────────────────────────────────────────────────────

export default function CreateTripForm({ courses }: { courses: Course[] }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 'done'>(1)

  // Step 1
  const [tripName, setTripName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [numRounds, setNumRounds] = useState(3)

  // Step 2
  const [rounds, setRounds] = useState<RoundInput[]>(
    Array.from({ length: 3 }, () => ({ courseId: '', scheduledDate: '' }))
  )

  // Step 3
  const [useTeams, setUseTeams] = useState(true)
  const [numTeams, setNumTeams] = useState(2)
  const [teams, setTeams] = useState<TeamInput[]>([
    { name: 'Team A', color: PRESET_COLORS[0] },
    { name: 'Team B', color: PRESET_COLORS[1] },
  ])

  // Step 4
  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', handicap: '', gender: 'M', teamIndex: -1 },
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

  const roundsError = roundCountError(numRounds)
  const step1Valid = tripName.trim().length > 0 && !roundsError
  const selectedCourseIds = rounds.map(r => r.courseId).filter(Boolean)
  // A course may be played more than once — opening and closing on the same
  // links is ordinary. Repeats are flagged for reassurance, never blocked.
  const repeatedCourseIds = new Set(
    selectedCourseIds.filter((id, i) => selectedCourseIds.indexOf(id) !== i)
  )
  const step2Valid = rounds.every(r => r.courseId)
  const step3Valid = !useTeams || teams.every(t => t.name.trim())

  const passcodeIssue = !lockSettings
    ? null
    : passcodeError(passcode) ??
      (passcode !== passcodeConfirm ? 'The two passcodes do not match.' : null)
  const step4Valid = !passcodeIssue

  // ── Navigation ───────────────────────────────────────────────────────────

  function goNext() {
    if (step === 1) {
      setRounds(prev =>
        Array.from({ length: numRounds }, (_, i) => prev[i] ?? { courseId: '', scheduledDate: '' })
      )
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else if (step === 3) {
      setStep(4)
    } else if (step === 4) {
      handleSubmit()
    }
  }

  function goBack() {
    setError(null)
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
    else if (step === 4) setStep(3)
  }

  // ── Round helpers ────────────────────────────────────────────────────────

  function updateRound(i: number, patch: Partial<RoundInput>) {
    setRounds(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  // ── Team helpers ─────────────────────────────────────────────────────────

  function setTeamCount(n: number) {
    setNumTeams(n)
    setTeams(prev => {
      if (n > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, (_, i) => ({
            name: `Team ${String.fromCharCode(65 + prev.length + i)}`,
            color: PRESET_COLORS[(prev.length + i) % PRESET_COLORS.length],
          })),
        ]
      }
      return prev.slice(0, n)
    })
  }

  function updateTeam(i: number, patch: Partial<TeamInput>) {
    setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }

  // ── Player helpers ───────────────────────────────────────────────────────

  function addPlayer() {
    setPlayers(prev => [...prev, { name: '', handicap: '', gender: 'M', teamIndex: -1 }])
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
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert({
        name: tripName.trim(),
        slug: code.toLowerCase(),
        trip_code: code,
        status: 'upcoming',
        start_date: startDate || null,
        end_date: endDate || null,
        formats: useTeams
          ? { individual_stableford: true, teams: true }
          : { individual_stableford: true },
        num_teams: useTeams ? teams.length : 2,
        settings_passcode_hash: passcodeHash,
      })
      .select('id')
      .single()

    if (tripErr || !trip) {
      setError('Failed to create trip. Please try again.')
      setSubmitting(false)
      return
    }

    const tripId = trip.id

    // 2. Teams
    let teamIds: string[] = []
    if (useTeams && teams.length > 0) {
      const { data: inserted, error: teamsErr } = await supabase
        .from('teams')
        .insert(teams.map(t => ({ trip_id: tripId, name: t.name.trim(), color: t.color })))
        .select('id')

      if (teamsErr || !inserted) {
        setError('Failed to create teams. Please try again.')
        setSubmitting(false)
        return
      }
      teamIds = inserted.map(t => t.id)
    }

    // 3. Players (skip blanks)
    const validPlayers = players.filter(p => p.name.trim())
    let playerRows: { id: string; handicap: number }[] = []
    if (validPlayers.length > 0) {
      const { data: insertedPlayers, error: playersErr } = await supabase
        .from('players')
        .insert(
          validPlayers.map((p, i) => ({
            trip_id: tripId,
            name: p.name.trim(),
            handicap: parseFloat(p.handicap) || 0,
            gender: p.gender,
            role: 'player',
            is_lead: i === 0,
            // The organiser entered themselves, so they're in. Everyone else
            // named here is a placeholder until they claim their own slot.
            claimed: i === 0,
            team_id: useTeams && p.teamIndex >= 0 ? teamIds[p.teamIndex] ?? null : null,
          }))
        )
        .select('id, handicap')

      if (playersErr || !insertedPlayers) {
        setError('Failed to add players. Please try again.')
        setSubmitting(false)
        return
      }
      playerRows = insertedPlayers
    }

    // 4. Rounds
    const { data: insertedRounds, error: roundsErr } = await supabase
      .from('rounds')
      .insert(
        rounds.map((r, i) => ({
          trip_id: tripId,
          course_id: r.courseId,
          round_number: i + 1,
          status: 'upcoming',
          ...(r.scheduledDate ? { scheduled_date: r.scheduledDate } : {}),
        }))
      )
      .select('id')

    if (roundsErr || !insertedRounds) {
      setError('Failed to create rounds. Please try again.')
      setSubmitting(false)
      return
    }

    // 5. Round handicaps — one row per player per round
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
        setError('Failed to set player handicaps. Please try again.')
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
      <div className="min-h-dvh bg-[#0a1a0e] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center mx-auto mb-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <h1 className="font-[family-name:var(--font-playfair)] text-3xl text-white mb-2">
            Trip Created!
          </h1>
          <p className="text-white/50 text-sm mb-10">
            Share this code with your group to join. Your trip starts in setup
            mode — finalise it from the trip page when everyone&apos;s ready to play.
          </p>

          <div className="bg-white/5 border border-[#C9A84C]/20 rounded-2xl px-4 py-8 mb-4">
            <p className="text-white/40 text-xs tracking-widest uppercase mb-4">Your Trip Code</p>
            {/* Laid out as characters with a gap rather than letter-spacing:
                tracking adds space after the final character too, which pushed
                the code off the right edge of the box. */}
            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
              {resultCode.split('').map((ch, i) => (
                <span
                  key={i}
                  className="font-[family-name:var(--font-playfair)] text-[clamp(2rem,11vw,3rem)] leading-none text-[#C9A84C] font-bold tabular-nums"
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>

          {lockSettings && (
            <div className="mb-4 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
              <p className="text-white/60 text-xs leading-snug">
                Settings are locked. Keep your passcode safe — it cannot be recovered
                or changed.
              </p>
            </div>
          )}

          <button
            onClick={copyCode}
            className="w-full py-4 rounded-xl border border-white/20 text-white text-sm tracking-[0.15em] uppercase hover:border-white/40 transition-colors mb-3"
          >
            {copied ? '✓ Copied' : 'Copy Code'}
          </button>

          <Link
            href={`/trip/${resultCode}`}
            className="block w-full py-4 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors"
          >
            Go to Your Trip
          </Link>
        </div>
      </div>
    )
  }

  // ── Multi-step form ──────────────────────────────────────────────────────

  const stepNum = step as 1 | 2 | 3 | 4
  const isFinalStep = stepNum === 4
  const canProceed =
    !submitting &&
    !(step === 1 && !step1Valid) &&
    !(step === 2 && !step2Valid) &&
    !(step === 3 && !step3Valid) &&
    !(step === 4 && !step4Valid)

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">

      {/* Header */}
      <div className="border-b border-[#1e3d28]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          {stepNum > 1 ? <BackButton onClick={goBack} /> : <BackButton href="/" />}
          <h1 className="font-[family-name:var(--font-playfair)] text-xl text-white tracking-wide">
            Create a Trip
          </h1>
          <div className="w-11" />
        </div>
      </div>

      {/* Progress bar + step label */}
      <div className="border-b border-[#1e3d28]">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-1 flex gap-1.5">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${s <= stepNum ? 'bg-[#C9A84C]' : 'bg-white/10'}`}
            />
          ))}
        </div>
        <p className="text-center text-white/40 text-xs py-2 tracking-wider uppercase">
          Step {stepNum} of 4 — {STEP_LABELS[stepNum - 1]}
        </p>
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

            <div>
              <label className={LABEL}>Number of rounds</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {ROUND_PRESETS.map(n => (
                  <button
                    key={n}
                    onClick={() => setNumRounds(n)}
                    className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                      numRounds === n
                        ? 'bg-[#C9A84C] text-[#0a1a0e]'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {/* Adds a round beyond the presets. It will go past the limit
                    quite happily — the error below is what stops you, so the
                    cap is visible rather than silently unreachable. */}
                <button
                  onClick={() => setNumRounds(n => n + 1)}
                  aria-label="Add a round"
                  className={`py-3 rounded-xl text-lg leading-none font-medium transition-colors ${
                    numRounds > MAX_ROUNDS
                      ? 'bg-amber-500/20 border border-amber-500/60 text-amber-400'
                      : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                  }`}
                >
                  +
                </button>
              </div>

              {roundsError && (
                <div className="mt-3 flex items-center justify-between gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/40 rounded-xl">
                  <p className="text-amber-400 text-sm leading-snug min-w-0">
                    {numRounds} rounds selected. {roundsError}
                  </p>
                  <button
                    onClick={() => setNumRounds(MAX_ROUNDS)}
                    className="flex-shrink-0 px-3 py-2 border border-amber-500/50 rounded-lg text-amber-400 text-xs tracking-wider uppercase hover:bg-amber-500/10 transition-colors"
                  >
                    Set {MAX_ROUNDS}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Rounds ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {courses.length === 0 && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-white/50 text-sm text-center">
                No platform courses available yet. Add courses with <code className="text-[#C9A84C]">trip_id = NULL</code> to get started.
              </div>
            )}
            {rounds.map((round, i) => {
              const isRepeat = !!round.courseId && repeatedCourseIds.has(round.courseId)
              return (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-4">
                    Round {i + 1}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className={LABEL}>Course</label>
                      <div className="relative">
                        <select
                          value={round.courseId}
                          onChange={e => updateRound(i, { courseId: e.target.value })}
                          className={`${INPUT} appearance-none pr-10`}
                        >
                          <option value="" className="bg-[#0a1a0e]">Select a course…</option>
                          {courses.map(c => (
                            <option key={c.id} value={c.id} className="bg-[#0a1a0e]">
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                      {isRepeat && (
                        <p className="text-white/35 text-xs mt-1.5">
                          Played more than once this trip — that&apos;s fine
                        </p>
                      )}
                    </div>
                    <DateField
                      label="Date"
                      value={round.scheduledDate}
                      onChange={v => updateRound(i, { scheduledDate: v })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Step 3: Teams ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Toggle */}
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4">
              <div>
                <p className="text-white text-sm font-medium">Use teams?</p>
                <p className="text-white/40 text-xs mt-0.5">Enables the team leaderboard</p>
              </div>
              <Toggle checked={useTeams} onChange={setUseTeams} label="Use teams" />
            </div>

            {useTeams && (
              <>
                <div>
                  <label className={LABEL}>Number of teams</label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5, 6].map(n => (
                      <button
                        key={n}
                        onClick={() => setTeamCount(n)}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                          numTeams === n
                            ? 'bg-[#C9A84C] text-[#0a1a0e]'
                            : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {teams.map((team, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                        <input
                          type="text"
                          value={team.name}
                          onChange={e => updateTeam(i, { name: e.target.value })}
                          placeholder={`Team ${i + 1}`}
                          className="flex-1 bg-transparent text-white placeholder-white/30 focus:outline-none text-sm font-medium"
                        />
                      </div>
                      <div className="flex gap-2.5 flex-wrap">
                        {PRESET_COLORS.map(color => (
                          <button
                            key={color}
                            onClick={() => updateTeam(i, { color })}
                            style={{ backgroundColor: color }}
                            className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                              team.color === color
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a1a0e] scale-110'
                                : ''
                            }`}
                            aria-label={`Select colour ${color}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 4: Players ──────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-white/50 text-sm mb-2">
              Optional — players can also join later with the trip code.
            </p>
            {players.map((player, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[#C9A84C] text-xs tracking-widest uppercase">
                    {i === 0 ? 'Lead player' : `Player ${i + 1}`}
                  </span>
                  {i > 0 && (
                    <button
                      onClick={() => removePlayer(i)}
                      className="text-white/30 hover:text-white/60 transition-colors p-1"
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
                    className={INPUT}
                  />

                  <div className="flex gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={player.handicap}
                      onChange={e => updatePlayer(i, { handicap: e.target.value })}
                      placeholder="Handicap"
                      min="0"
                      max="54"
                      step="0.1"
                      className={`${INPUT} flex-1`}
                    />
                    <div className="flex gap-1.5 flex-shrink-0">
                      {(['M', 'F'] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => updatePlayer(i, { gender: g })}
                          className={`w-12 rounded-xl text-sm font-medium transition-colors ${
                            player.gender === g
                              ? 'bg-[#C9A84C] text-[#0a1a0e]'
                              : 'bg-white/5 border border-white/10 text-white/60 hover:border-white/30'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {useTeams && (
                    <div className="relative">
                      <select
                        value={player.teamIndex}
                        onChange={e => updatePlayer(i, { teamIndex: parseInt(e.target.value) })}
                        className={`${INPUT} appearance-none pr-10`}
                      >
                        <option value={-1} className="bg-[#0a1a0e]">No team assigned</option>
                        {teams.map((t, ti) => (
                          <option key={ti} value={ti} className="bg-[#0a1a0e]">
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={addPlayer}
              className="w-full py-4 border border-dashed border-white/20 rounded-xl text-white/50 text-sm hover:border-white/40 hover:text-white/70 transition-colors"
            >
              + Add another player
            </button>

            {/* ── Settings lock ──
                Only settable here. Once the trip exists, anyone holding the
                trip code could otherwise lock a trip they do not run. */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex items-start justify-between gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-4">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">Lock trip settings</p>
                  <p className="text-white/40 text-xs mt-0.5 leading-snug">
                    Ask for a passcode before anyone can change formats, players or teams
                  </p>
                </div>
                <Toggle checked={lockSettings} onChange={setLockSettings} label="Lock trip settings" />
              </div>

              {lockSettings && (
                <div className="mt-3 space-y-3">
                  <div className="px-4 py-3.5 bg-amber-500/10 border border-amber-500/40 rounded-xl">
                    <p className="text-amber-400 text-sm font-semibold leading-snug">
                      This can only be set now.
                    </p>
                    <p className="text-amber-400/70 text-xs leading-snug mt-1.5">
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
                    <p className="text-amber-400 text-xs leading-snug">{passcodeIssue}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <p className="text-amber-400 text-sm">{error}</p>
          </div>
        )}

        {/* Primary CTA */}
        <div className="mt-8">
          <button
            onClick={goNext}
            disabled={!canProceed}
            className="w-full py-5 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : isFinalStep ? 'Create Trip' : 'Continue'}
          </button>
          {isFinalStep && (
            <p className="text-center text-white/30 text-xs mt-3">
              Players without a name will be skipped
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
