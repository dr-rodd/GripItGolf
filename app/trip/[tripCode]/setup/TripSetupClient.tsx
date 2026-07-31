'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  type TripFormats, type LeagueSettings, type MatchplayFormat,
  isEmpty, LEAGUE_BOARDS, MAX_DISCARD,
} from '@/lib/formats'
import {
  defaultCustomPoints, resolveCustomPoints, clampPoints, MAX_CUSTOM_POINTS,
} from '@/lib/customPoints'
import {
  TEAM_SCORING_MODES, describeTeamScoring,
  type TeamScoring, type TeamScoringMode,
} from '@/lib/teamScoring'
import {
  setupSteps, finaliseBlockedReason, nextUnanswered, emptyFormatsReason,
  type Step,
} from '@/lib/tripSetupFlow'
import {
  teamNoun, teamSizeBanner, teamSizeLimit, oversizedTeams, canJoinTeam,
} from '@/lib/teamLimits'
import MatchplayPanel from './MatchplayPanel'
import DateField from '@/app/components/DateField'
import BackButton from '@/app/components/BackButton'

// ── Types ─────────────────────────────────────────────────────────────────

type Trip = {
  id: string
  trip_code: string
  name: string
  start_date: string | null
  end_date: string | null
  formats: TripFormats
  team_scoring: TeamScoring
  setup_status: string
  edit_permission: string
}

type Team = { id: string; name: string; color: string }

type Player = {
  id: string
  name: string
  handicap: number | null
  gender: string
  team_id: string | null
  is_lead: boolean
}

type RoundInfo = { id: string; round_number: number; courseName: string }

// ── Constants ─────────────────────────────────────────────────────────────

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder-white/30',
  'focus:outline-none focus:border-accent/50 transition-colors',
  'disabled:opacity-40 disabled:cursor-not-allowed',
].join(' ')

const LABEL = 'block text-ink/65 text-xs uppercase tracking-wider mb-2'

const SECTION = 'bg-surface border border-bark/12 rounded-2xl p-5'

/** 1st, 2nd, 3rd, 4th … */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

// ── Decision-tree pieces ──────────────────────────────────────────────────
//
// Settings read as a form: one question at a time, in order, each answer
// opening whatever it opens. The order lives in lib/tripSetupFlow.ts — this
// file renders it rather than deciding it.

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
      on ? 'bg-accent border-accent' : 'border-bark/25'
    }`}>
      {on && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF"
             strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  )
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
      on ? 'border-accent' : 'border-bark/25'
    }`}>
      {on && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
    </span>
  )
}

/** One selectable answer. `pick` draws a radio, otherwise a tickbox. */
function Option({
  on, label, hint, onClick, disabled, pick = false,
}: {
  on: boolean
  label: string
  hint?: string
  onClick: () => void
  disabled?: boolean
  pick?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-colors disabled:opacity-40 ${
        on ? 'border-accent/60 bg-accent/10' : 'border-bark/12 bg-surface hover:border-bark/25'
      }`}
    >
      <div className="flex items-start gap-3">
        {pick ? <Dot on={on} /> : <Tick on={on} />}
        <div className="min-w-0">
          <p className={`text-sm font-medium ${on ? 'text-ink' : 'text-ink/65'}`}>{label}</p>
          {hint && <p className="text-ink/40 text-xs mt-0.5 leading-snug">{hint}</p>}
        </div>
      </div>
    </button>
  )
}

/** A row of segmented buttons — a small answer that doesn't need its own tiles. */
function Chips<T extends string | number>({
  value, options, onChange, disabled, columns,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
  columns?: number
}) {
  return (
    <div
      className={columns ? 'grid gap-2' : 'flex gap-2'}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={`${columns ? '' : 'flex-1'} py-3.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
            value === o.value
              ? 'bg-accent text-ink'
              : 'bg-surface border border-bark/12 text-ink/65 hover:border-bark/25'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * One question in the tree.
 *
 * Numbered so the page reads as a form being filled in, and marked once
 * answered so a glance down the page shows what is left.
 */
function Question({
  step, children,
}: {
  step: Step
  children: React.ReactNode
}) {
  return (
    <section className={SECTION}>
      <div className="flex items-start gap-3 mb-4">
        <span className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold tabular-nums transition-colors ${
          step.answered
            ? 'border-accent/50 bg-accent/15 text-accent'
            : 'border-accent/50 bg-accent/10 text-accent'
        }`}>
          {step.answered ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Answered">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : step.number}
        </span>
        <div className="min-w-0">
          <p className="text-ink/40 text-xs tracking-widest uppercase">{step.title}</p>
          <p className="text-ink text-sm mt-1 leading-snug">{step.question}</p>
        </div>
      </div>

      {children}

      {step.warning ? (
        <p className="text-rust/90 text-xs mt-3 leading-snug">{step.warning}</p>
      ) : step.summary ? (
        <p className="text-ink/40 text-xs mt-3 leading-snug">{step.summary}</p>
      ) : null}
    </section>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export default function TripSetupClient({
  trip,
  teams: initialTeams,
  players: initialPlayers,
  rounds,
}: {
  trip: Trip
  teams: Team[]
  players: Player[]
  rounds: RoundInfo[]
}) {
  // Trip fields
  const [name, setName] = useState(trip.name)
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [formats, setFormats] = useState<TripFormats>(trip.formats)
  const [teamScoring, setTeamScoring] = useState<TeamScoring>(trip.team_scoring)
  const [editPermission, setEditPermission] = useState(trip.edit_permission)
  const [setupStatus, setSetupStatus] = useState(trip.setup_status)

  // Collections
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)

  // New player form
  const [newName, setNewName] = useState('')
  const [newHandicap, setNewHandicap] = useState('')
  const [newGender, setNewGender] = useState<'M' | 'F'>('M')
  const [newTeamId, setNewTeamId] = useState('')

  // UI state
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    try {
      setIsOwner(localStorage.getItem(`gig-owner-${trip.trip_code}`) === '1')
    } catch { /* localStorage unavailable */ }
  }, [trip.trip_code])

  const isDraft = setupStatus === 'draft'
  const canEdit = isDraft && (editPermission === 'everyone' || isOwner)
  const locked = !canEdit || busy
  const unassignedCount = players.filter(p => !p.team_id).length
  const smallestTeamSize = teams.length > 0
    ? Math.min(...teams.map(t => players.filter(p => p.team_id === t.id).length))
    : 0

  function flashError(msg: string) {
    setError(msg)
    setTimeout(() => setError(''), 4000)
  }

  // ── Trip field saves ─────────────────────────────────────────────────────

  async function saveTrip(patch: Record<string, unknown>): Promise<boolean> {
    const { error: err } = await supabase.from('trips').update(patch).eq('id', trip.id)
    if (err) flashError('Could not save — try again')
    return !err
  }

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === trip.name) return
    if (!(await saveTrip({ name: trimmed }))) setName(trip.name)
  }

  async function saveDates(nextStart: string, nextEnd: string) {
    const prev = { s: startDate, e: endDate }
    setStartDate(nextStart)
    setEndDate(nextEnd)
    if (!(await saveTrip({ start_date: nextStart || null, end_date: nextEnd || null }))) {
      setStartDate(prev.s)
      setEndDate(prev.e)
    }
  }

  /**
   * Save an answer, unless it would leave the trip with nothing to play for.
   *
   * A trip with no competition cannot be stored: parseFormats refuses to
   * return one, so reloading the page would quietly replace it with the
   * default and throw away the rest of the organiser's answers. The refusal
   * therefore says which switch to reach for instead of just saying no —
   * turning the league off is a different action from unticking its last board.
   */
  async function saveFormats(next: TripFormats) {
    if (isEmpty(next)) {
      flashError(emptyFormatsReason(next))
      return
    }
    const prev = formats
    setFormats(next)
    if (!(await saveTrip({ formats: next }))) setFormats(prev)
  }

  /** Answer question 1 — who is being ranked. Both is allowed. */
  function toggleCompetitor(key: 'individual' | 'teams') {
    const next: TripFormats = { ...formats, [key]: !formats[key] }
    // A pairs draw is between teams. Without them it can only be singles.
    if (!next.teams) next.matchplay = { ...next.matchplay, format: 'singles' }
    saveFormats(next)
  }

  /** Answer question 2 — league, matchplay, or both. */
  function toggleCompetition(key: 'league' | 'matchplay') {
    const next: TripFormats =
      key === 'league'
        ? { ...formats, league: { ...formats.league, on: !formats.league.on } }
        : { ...formats, matchplay: { ...formats.matchplay, on: !formats.matchplay.on } }
    // Turning matchplay on with teams already picked means pairs by default —
    // it is the only thing a team can play a knockout as.
    if (key === 'matchplay' && next.matchplay.on && next.teams && !next.individual) {
      next.matchplay = { ...next.matchplay, format: 'pairs' }
    }
    saveFormats(next)
  }

  function setMatchplayFormat(format: MatchplayFormat) {
    saveFormats({ ...formats, matchplay: { ...formats.matchplay, format } })
  }

  /** The league is off once no board is ticked — an empty league is no league. */
  function toggleBoard(key: 'stableford' | 'strokes' | 'custom') {
    const league: LeagueSettings = { ...formats.league, [key]: !formats.league[key] }
    // Turning Custom on for the first time seeds a table from the field
    if (key === 'custom' && league.custom && league.customPoints.length === 0) {
      league.customPoints = defaultCustomPoints(players.length)
    }
    saveFormats({ ...formats, league })
  }

  function setLeague(patch: Partial<LeagueSettings>) {
    saveFormats({ ...formats, league: { ...formats.league, ...patch } })
  }

  function setCustomPoint(index: number, raw: string) {
    const table = resolveCustomPoints(formats.league.customPoints, players.length)
    table[index] = clampPoints(raw === '' ? 0 : raw)
    setLeague({ customPoints: table })
  }

  async function saveTeamScoring(patch: Partial<TeamScoring>) {
    const prev = teamScoring
    const next = { ...teamScoring, ...patch }
    setTeamScoring(next)
    if (!(await saveTrip({ team_scoring: next }))) setTeamScoring(prev)
  }

  async function savePermission(next: string) {
    const prev = editPermission
    setEditPermission(next)
    if (!(await saveTrip({ edit_permission: next }))) setEditPermission(prev)
  }

  // ── Players ──────────────────────────────────────────────────────────────

  async function addPlayer() {
    const trimmed = newName.trim()
    const hcp = parseFloat(newHandicap)
    if (!trimmed || isNaN(hcp)) {
      flashError('Enter a name and handicap first')
      return
    }
    setBusy(true)
    const { data, error: err } = await supabase
      .from('players')
      .insert({
        trip_id: trip.id,
        name: trimmed,
        handicap: hcp,
        gender: newGender,
        role: 'player',
        team_id: newTeamId || null,
      })
      .select('id, name, handicap, gender, team_id, is_lead')
      .single()
    if (err || !data) {
      flashError('Could not add player')
    } else {
      setPlayers(prev => [...prev, data])
      setNewName('')
      setNewHandicap('')
      setNewTeamId('')
    }
    setBusy(false)
  }

  async function updatePlayer(id: string, patch: Partial<Player>) {
    const prev = players
    setPlayers(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)))
    const { error: err } = await supabase.from('players').update(patch).eq('id', id)
    if (err) {
      setPlayers(prev)
      flashError('Could not save player')
      return
    }
    // Keep the handicap snapshot used for scoring in step with edits
    if (patch.handicap != null && rounds.length > 0) {
      const rows = rounds.map(r => ({
        round_id: r.id,
        player_id: id,
        playing_handicap: Math.round(patch.handicap as number),
      }))
      const { error: hcpErr } = await supabase
        .from('round_handicaps')
        .upsert(rows, { onConflict: 'round_id,player_id' })
      if (hcpErr) flashError('Handicap saved but round handicaps failed to update')
    }
  }

  /**
   * Move a player between teams, refusing rather than overfilling.
   *
   * A pairs draw is played between teams of two, so a third player in a
   * pairing is not a thing the bracket can represent. Better to say so than
   * to let it save and break the draw later.
   */
  async function movePlayerToTeam(id: string, teamId: string | null) {
    if (teamId && !canJoinTeam(formats, teamId, players)) {
      const team = teams.find(t => t.id === teamId)
      flashError(`${team?.name ?? 'That ' + teamNoun(formats).one} is already full`)
      return
    }
    await updatePlayer(id, { team_id: teamId })
  }

  async function removePlayer(id: string) {
    const player = players.find(p => p.id === id)
    if (!window.confirm(`Remove ${player?.name}? Any scores they have will be deleted.`)) return
    setBusy(true)
    const { error: err } = await supabase.from('players').delete().eq('id', id)
    if (err) flashError('Could not remove player')
    else setPlayers(prev => prev.filter(p => p.id !== id))
    setBusy(false)
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async function finalise() {
    if (!window.confirm('Finalise this trip and go live? Scoring and the leaderboard will open. You can unlock it again later.')) return
    setBusy(true)
    // Every player needs a handicap row for every round before scoring works.
    // Existing rows (e.g. confirmed in a previous live spell) are left untouched.
    if (players.length > 0 && rounds.length > 0) {
      const rows = rounds.flatMap(r =>
        players.map(p => ({
          round_id: r.id,
          player_id: p.id,
          playing_handicap: Math.round(p.handicap ?? 0),
        }))
      )
      const { error: hcpErr } = await supabase
        .from('round_handicaps')
        .upsert(rows, { onConflict: 'round_id,player_id', ignoreDuplicates: true })
      if (hcpErr) {
        flashError('Could not prepare handicaps — trip not finalised')
        setBusy(false)
        return
      }
    }
    const ok = await saveTrip({ setup_status: 'live', finalised_at: new Date().toISOString() })
    if (ok) setSetupStatus('live')
    setBusy(false)
  }

  async function unlock() {
    if (!window.confirm('Unlock this trip for editing? Scoring pauses until you finalise again. All existing scores are kept.')) return
    setBusy(true)
    const ok = await saveTrip({ setup_status: 'draft' })
    if (ok) setSetupStatus('draft')
    setBusy(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const viewOnly = isDraft && !canEdit

  // The decision tree. Which questions show, and whether each has an answer,
  // is decided in lib/tripSetupFlow.ts — this file only draws them.
  const customTable = resolveCustomPoints(formats.league.customPoints, players.length)
  const flowCtx = {
    players,
    teams,
    teamScoring,
    customTableLength: customTable.length,
  }
  const steps    = setupSteps(formats, flowCtx)
  const pending  = nextUnanswered(steps)
  const blocked  = finaliseBlockedReason(formats, flowCtx)
  const noun     = teamNoun(formats)
  const sizeBanner = teamSizeBanner(formats)
  const sizeLimit  = teamSizeLimit(formats)
  const oversize   = oversizedTeams(formats, teams, players)

  /** The answer controls for one question. */
  function questionBody(step: Step) {
    switch (step.key) {
      case 'competitors':
        return (
          <div className="space-y-2.5">
            <Option
              on={formats.teams}
              onClick={() => toggleCompetitor('teams')}
              disabled={locked}
              label="Teams"
              hint="Players are grouped, and the teams are ranked against each other."
            />
            <Option
              on={formats.individual}
              onClick={() => toggleCompetitor('individual')}
              disabled={locked}
              label="Individuals"
              hint="Every player is ranked on their own card."
            />
            {formats.teams && formats.individual && (
              <p className="text-ink/40 text-xs leading-snug px-1">
                Both run off the same cards. The team board is the main
                competition and opens first; the individual boards sit behind it.
              </p>
            )}
          </div>
        )

      case 'competition':
        return (
          <div className="space-y-2.5">
            <Option
              on={formats.league.on}
              onClick={() => toggleCompetition('league')}
              disabled={locked}
              label="League"
              hint="Every round counts towards a running table."
            />
            <Option
              on={formats.matchplay.on}
              onClick={() => toggleCompetition('matchplay')}
              disabled={locked}
              label="Matchplay"
              hint="A knockout draw on its own page, played head to head."
            />
          </div>
        )

      case 'boards':
        return (
          <div className="space-y-2">
            {LEAGUE_BOARDS.map(b => (
              <Option
                key={b.key}
                on={formats.league[b.key]}
                onClick={() => toggleBoard(b.key)}
                disabled={locked}
                label={b.label}
                hint={b.hint}
              />
            ))}
          </div>
        )

      case 'discard':
        return (
          <>
            <Chips
              value={formats.league.discardWorst}
              onChange={n => setLeague({ discardWorst: n })}
              disabled={locked}
              options={Array.from({ length: MAX_DISCARD + 1 }, (_, n) => ({
                value: n,
                label: n === 0 ? 'Keep all' : `Drop ${n}`,
              }))}
            />
            <p className="text-ink/40 text-xs mt-2 leading-snug">
              A bad day stops defining the week. Applies to Stableford and
              Strokes alike, and nobody is ever dropped below one counting round.
            </p>
          </>
        )

      case 'customPoints':
        return players.length === 0 ? null : (
          <>
            <div className="flex items-center justify-between mb-2">
              <label className={`${LABEL} mb-0`}>Points by position</label>
              <button
                onClick={() => setLeague({ customPoints: defaultCustomPoints(players.length) })}
                disabled={locked}
                className="text-accent/70 text-[10px] tracking-wider uppercase hover:text-accent transition-colors disabled:opacity-40"
              >
                Reset
              </button>
            </div>
            <div className="space-y-2">
              {customTable.map((pts, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-14 flex-shrink-0 text-ink/40 text-xs tabular-nums">
                    {ordinal(i + 1)}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={pts}
                    onChange={e => setCustomPoint(i, e.target.value)}
                    disabled={locked}
                    min={0}
                    max={MAX_CUSTOM_POINTS}
                    className="flex-1 min-w-0 bg-surface border border-bark/12 rounded-lg px-3 py-2.5 text-ink text-sm tabular-nums focus:outline-none focus:border-accent/50 disabled:opacity-40"
                  />
                  <span className="w-10 flex-shrink-0 text-ink/25 text-xs">
                    {pts === 1 ? 'pt' : 'pts'}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-ink/40 text-xs mt-2 leading-snug">
              Up to {MAX_CUSTOM_POINTS} a position, and zero is allowed. Players
              level on the day share the places they occupy.
            </p>
          </>
        )

      case 'matchplayFormat':
        return (
          <div className="space-y-2.5">
            <Option
              pick
              on={formats.matchplay.format === 'singles'}
              onClick={() => setMatchplayFormat('singles')}
              disabled={locked}
              label="Singles"
              hint="Player against player."
            />
            <Option
              pick
              on={formats.matchplay.format === 'pairs'}
              onClick={() => setMatchplayFormat('pairs')}
              disabled={locked || !formats.teams}
              label="Pairs"
              hint={formats.teams
                ? 'Pairing against pairing. Teams are locked at two.'
                : 'Needs teams — switch them on above.'}
            />
          </div>
        )

      case 'teamScoring':
        return (
          <>
            <div className="space-y-2.5">
              {TEAM_SCORING_MODES.map(m => (
                <Option
                  key={m.key}
                  pick
                  on={teamScoring.mode === m.key}
                  onClick={() => saveTeamScoring({ mode: m.key as TeamScoringMode })}
                  disabled={locked}
                  label={m.label}
                  hint={m.description}
                />
              ))}
            </div>

            {/* Better Ball — how many scores count per hole */}
            {teamScoring.mode === 'better_ball' && (
              <div className="mt-4">
                <label className={LABEL}>Scores counting on each hole</label>
                <Chips
                  value={teamScoring.countingScores}
                  onChange={n => saveTeamScoring({ countingScores: n })}
                  disabled={locked}
                  options={[1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))}
                />
                {teamScoring.countingScores > smallestTeamSize && smallestTeamSize > 0 && (
                  <p className="text-rust/80 text-xs mt-2 leading-snug">
                    Your smallest {noun.one} has {smallestTeamSize} player
                    {smallestTeamSize === 1 ? '' : 's'} — it can only ever contribute{' '}
                    {smallestTeamSize} score{smallestTeamSize === 1 ? '' : 's'} a hole.
                  </p>
                )}

                <label className={`${LABEL} mt-4`}>Everyone counts on the last…</label>
                <Chips
                  columns={3}
                  value={teamScoring.aggregateFinish}
                  onChange={n => saveTeamScoring({ aggregateFinish: n })}
                  disabled={locked}
                  options={[0, 1, 2, 3, 6, 9].map(n => ({
                    value: n,
                    label: n === 0 ? 'Off' : n === 1 ? '1 hole' : `${n} holes`,
                  }))}
                />
                <p className="text-ink/40 text-xs mt-2 leading-snug">
                  Turn this on for a grandstand finish — the closing holes open up so
                  every player&apos;s score counts, not just the best {teamScoring.countingScores}.
                </p>
              </div>
            )}

            {/* Aggregate — how many closing holes count */}
            {teamScoring.mode === 'aggregate' && (
              <div className="mt-4">
                <label className={LABEL}>Holes that count</label>
                <Chips
                  columns={3}
                  value={teamScoring.aggregateHoles}
                  onChange={n => saveTeamScoring({ aggregateHoles: n })}
                  disabled={locked}
                  options={[18, 9, 6, 3, 2, 1].map(n => ({
                    value: n,
                    label: n === 18 ? 'All 18' : n === 1 ? 'Last hole' : `Last ${n}`,
                  }))}
                />
                <p className="text-ink/40 text-xs mt-2 leading-snug">
                  A short closing stretch keeps every {noun.one} in it to the end — one
                  bad round no longer settles the trip.
                </p>
              </div>
            )}
          </>
        )

      case 'teams':
        return (
          <>
            {/* A pairs draw fixes the size, so say so before anyone picks */}
            {sizeBanner && (
              <div className="flex items-start gap-3 px-4 py-3 mb-3 bg-accent/10 border border-accent/40 rounded-xl">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                <p className="text-accent text-xs leading-snug">{sizeBanner}</p>
              </div>
            )}

            {teams.length > 0 && (
              <div className="space-y-2 mb-4">
                {teams.map(team => {
                  const members = players.filter(p => p.team_id === team.id)
                  const over = oversize.some(o => o.teamId === team.id)
                  return (
                    <div
                      key={team.id}
                      className={`flex items-center gap-3 px-3 py-2.5 border rounded-xl ${
                        over ? 'border-rust/50 bg-rust/10' : 'border-bark/12 bg-surface'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                      <span className="text-ink text-sm flex-1 min-w-0 truncate">{team.name}</span>
                      <span className={`text-xs flex-shrink-0 ${over ? 'text-rust-deep' : 'text-ink/40'}`}>
                        {members.length} player{members.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {!locked && (
              <Link
                href={`/trip/${trip.trip_code}/teams`}
                className="block w-full py-3.5 border border-accent/40 text-accent rounded-xl text-sm tracking-wider uppercase text-center hover:bg-accent/10 transition-colors"
              >
                Pick {noun.many}
              </Link>
            )}

            <p className="text-ink/40 text-xs mt-3 leading-snug">
              {noun.Many} can be changed at any point. Players own their scores and
              carry them to whichever {noun.one} they end up in.
            </p>
          </>
        )
    }
  }

  return (
    <main className="min-h-dvh bg-cream text-ink pb-16">

      {/* Header */}
      <div className="border-b border-bark/12">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href={`/trip/${trip.trip_code}`} />
          <h1 className="font-[family-name:var(--font-display)] text-xl tracking-wide">Trip Setup</h1>
          <div className="w-11" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* ── Status banner ── */}
        {isDraft ? (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-accent/10 border border-bark/25 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
            <p className="text-sm text-accent">
              In setup — finalise below when everyone&apos;s ready to play
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-accent/10 border border-accent/30 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 animate-pulse" />
              <p className="text-sm text-accent">Trip is live — scoring is open</p>
            </div>
            <button
              onClick={unlock}
              disabled={busy}
              className="flex-shrink-0 px-4 py-2 border border-bark/25 rounded-lg text-xs tracking-wider uppercase text-ink/65 hover:border-bark/25 hover:text-ink transition-colors disabled:opacity-40"
            >
              Unlock
            </button>
          </div>
        )}

        {viewOnly && (
          <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
            <p className="text-ink/40 text-sm">
              Only the trip owner can edit this trip. Ask whoever created it to make changes.
            </p>
          </div>
        )}

        {isDraft && (
          <>
            {/* ── Trip details ── */}
            <section className={SECTION}>
              <p className="text-ink/40 text-xs tracking-widest uppercase mb-4">Trip details</p>
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>Trip name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={saveName}
                    disabled={locked}
                    className={INPUT}
                  />
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <DateField
                    label="Start date"
                    value={startDate}
                    onChange={v => saveDates(v, endDate)}
                    disabled={locked}
                  />
                  <DateField
                    label="End date"
                    value={endDate}
                    onChange={v => saveDates(startDate, v)}
                    disabled={locked}
                  />
                </div>
              </div>
            </section>

            {/* ── The decision tree ──
                One question at a time, in the order set by lib/tripSetupFlow.ts.
                A question only appears once the answer above has opened it. */}
            {steps.map(step => (
              <Question key={step.key} step={step}>
                {questionBody(step)}
              </Question>
            ))}

            {/* What is still outstanding, so the page has an end */}
            {pending && (
              <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
                <p className="text-ink/40 text-xs leading-snug">
                  Next up — <span className="text-ink/65">{pending.title}</span>: {pending.question}
                </p>
              </div>
            )}


            {/* ── Players ── */}
            <section className={SECTION}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-ink/40 text-xs tracking-widest uppercase">Players</p>
                <span className="text-ink/40 text-xs">{players.length}</span>
              </div>

              <div className="space-y-3">
                {players.map(player => (
                  <div key={player.id} className="bg-surface border border-bark/12 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        defaultValue={player.name}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v && v !== player.name) updatePlayer(player.id, { name: v })
                        }}
                        disabled={locked}
                        className="flex-1 bg-transparent text-ink text-sm font-medium focus:outline-none disabled:opacity-40"
                      />
                      {player.is_lead && (
                        <span className="text-ink/40 text-[10px] tracking-widest uppercase flex-shrink-0">Lead</span>
                      )}
                      {!locked && (
                        <button
                          onClick={() => removePlayer(player.id)}
                          className="w-9 h-9 flex items-center justify-center text-ink/40 hover:text-ink/65 transition-colors flex-shrink-0"
                          aria-label={`Remove ${player.name}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="w-24 flex-shrink-0">
                        <input
                          type="number"
                          inputMode="decimal"
                          defaultValue={player.handicap ?? ''}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v !== player.handicap) updatePlayer(player.id, { handicap: v })
                          }}
                          disabled={locked}
                          min="0"
                          max="54"
                          step="0.1"
                          placeholder="HCP"
                          className="w-full bg-surface border border-bark/12 rounded-lg px-3 py-2.5 text-ink text-sm focus:outline-none focus:border-accent/50 disabled:opacity-40"
                        />
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {(['M', 'F'] as const).map(g => (
                          <button
                            key={g}
                            onClick={() => player.gender !== g && updatePlayer(player.id, { gender: g })}
                            disabled={locked}
                            className={`w-11 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                              player.gender === g
                                ? 'bg-accent text-ink'
                                : 'bg-surface border border-bark/12 text-ink/40'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      {formats.teams && (
                        <div className="relative flex-1 min-w-0">
                          <select
                            value={player.team_id ?? ''}
                            onChange={e => movePlayerToTeam(player.id, e.target.value || null)}
                            disabled={locked}
                            className="w-full bg-surface border border-bark/12 rounded-lg px-3 py-2.5 text-ink text-sm appearance-none focus:outline-none focus:border-accent/50 disabled:opacity-40"
                          >
                            <option value="" className="bg-cream">No {noun.one}</option>
                            {teams.map(t => {
                              const size = players.filter(p => p.team_id === t.id).length
                              return (
                                <option key={t.id} value={t.id} className="bg-cream">
                                  {t.name}{sizeLimit !== null ? ` (${size}/${sizeLimit})` : ''}
                                </option>
                              )
                            })}
                          </select>
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/40">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {players.length === 0 && (
                  <p className="text-ink/40 text-sm text-center py-2">
                    No players yet — add them below or share the trip code
                  </p>
                )}

                {/* Add player */}
                {!locked && (
                  <div className="border border-dashed border-bark/25 rounded-xl p-4 space-y-3">
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Player name"
                      className={INPUT}
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={newHandicap}
                        onChange={e => setNewHandicap(e.target.value)}
                        placeholder="Handicap"
                        min="0"
                        max="54"
                        step="0.1"
                        className={`${INPUT} flex-1`}
                      />
                      <div className="flex gap-1 flex-shrink-0">
                        {(['M', 'F'] as const).map(g => (
                          <button
                            key={g}
                            onClick={() => setNewGender(g)}
                            className={`w-12 rounded-xl text-sm font-medium transition-colors ${
                              newGender === g
                                ? 'bg-accent text-ink'
                                : 'bg-surface border border-bark/12 text-ink/40'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    {formats.teams && teams.length > 0 && (
                      <div className="relative">
                        <select
                          value={newTeamId}
                          onChange={e => setNewTeamId(e.target.value)}
                          className={`${INPUT} appearance-none pr-10`}
                        >
                          <option value="" className="bg-cream">No {noun.one} assigned</option>
                          {teams.map(t => {
                            const size = players.filter(p => p.team_id === t.id).length
                            const full = sizeLimit !== null && size >= sizeLimit
                            return (
                              <option key={t.id} value={t.id} disabled={full} className="bg-cream">
                                {t.name}{sizeLimit !== null ? ` (${size}/${sizeLimit})` : ''}{full ? ' — full' : ''}
                              </option>
                            )
                          })}
                        </select>
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink/40">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={addPlayer}
                      disabled={busy || !newName.trim() || !newHandicap}
                      className="w-full py-3.5 border border-accent/40 text-accent rounded-xl text-sm tracking-wider uppercase hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      + Add player
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ── Rounds (read-only summary) ── */}
            {rounds.length > 0 && (
              <section className={SECTION}>
                <p className="text-ink/40 text-xs tracking-widest uppercase mb-4">Rounds</p>
                <div className="space-y-2">
                  {rounds.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm">
                      <span className="text-ink/40 w-16 flex-shrink-0">Round {r.round_number}</span>
                      <span className="text-ink/65">{r.courseName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Edit permission ── */}
            <section className={SECTION}>
              <p className="text-ink/40 text-xs tracking-widest uppercase mb-1">Who can edit</p>
              <p className="text-ink/40 text-xs mb-4">Controls who can change this trip while it&apos;s in setup</p>
              <div className="flex gap-2">
                {[
                  { value: 'everyone', label: 'Any player' },
                  { value: 'owner', label: 'Owner only' },
                ].map(o => (
                  <button
                    key={o.value}
                    onClick={() => savePermission(o.value)}
                    disabled={locked}
                    className={`flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                      editPermission === o.value
                        ? 'bg-accent text-ink'
                        : 'bg-surface border border-bark/12 text-ink/65 hover:border-bark/25'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ── Finalise ──
                Blocked only by answers that would make the trip unplayable —
                a half-filled team sheet is the organiser's business. */}
            {canEdit && (
              <>
                {blocked && (
                  <div className="px-4 py-3.5 bg-rust/10 border border-rust/40 rounded-xl">
                    <p className="text-rust-deep text-sm leading-snug">{blocked}</p>
                  </div>
                )}
                <button
                  onClick={finalise}
                  disabled={busy || blocked !== null}
                  className="w-full py-5 bg-accent text-ink text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? 'Working…' : 'Finalise & Go Live'}
                </button>
              </>
            )}
          </>
        )}

        {/* ── Per-format settings ──
            These sit outside the draft-only block on purpose. A bracket is
            normally drawn once the roster has settled, which is at or after
            finalising, so the panel has to survive the switch to live. */}
        {formats.matchplay.on && (
          <MatchplayPanel
            tripId={trip.id}
            tripCode={trip.trip_code}
            canEdit={editPermission === 'everyone' || isOwner}
            formats={formats}
            teams={teams}
            players={players}
          />
        )}

        {/* Live-mode summary */}
        {!isDraft && (
          <div className={SECTION}>
            <p className="text-ink/40 text-sm leading-relaxed">
              The trip is finalised and play is live. To change players, teams, or the format,
              unlock the trip above — all scores entered so far are kept.
            </p>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 bg-surface border border-rust/40 rounded-xl shadow-xl z-50">
            <p className="text-rust-deep text-sm whitespace-nowrap">{error}</p>
          </div>
        )}

      </div>
    </main>
  )
}
