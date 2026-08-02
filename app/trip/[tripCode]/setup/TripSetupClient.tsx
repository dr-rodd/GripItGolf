'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  teamNoun, teamSizeBanner, teamSizeLimit, oversizedTeams, canJoinTeam,
  pairsBlockedReason, type TeamNoun,
} from '@/lib/teamLimits'
import MatchplayPanel from './MatchplayPanel'
import DateField from '@/app/components/DateField'
import LeaderboardSetup from '@/app/components/LeaderboardSetup'
import TripHeader from '@/app/components/TripHeader'
import SupportLink from '@/app/components/SupportLink'
import { IconSettings, IconX } from '@/app/components/icons'
import {
  type Leaderboard, needsTeams, needsPairings, hasMatchplay, boardTitle,
} from '@/lib/leaderboards'
import {
  finaliseBlockedReason, sheetsInUse, sheetName, sheetSubtitle, teamsOnSheet,
  teamFor, asMembers, setOf, MAIN_SET, type Membership,
} from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'

// ── Types ─────────────────────────────────────────────────────────────────

type Trip = {
  id: string
  trip_code: string
  name: string
  start_date: string | null
  end_date: string | null
  leaderboards: Leaderboard[]
  setup_status: string
  edit_permission: string
}

type Team = { id: string; name: string; color: string; team_set: string }

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
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
  'disabled:opacity-40 disabled:cursor-not-allowed',
].join(' ')

const LABEL = 'block text-ink/80 text-[13px] uppercase tracking-wider mb-2'

const SECTION = 'bg-surface border border-bark/12 rounded-2xl p-5'

/**
 * Which team a player is in, on one sheet.
 *
 * One of these per sheet, because a player holds one place on each: a team in
 * the league and a pairing in the draw are two different answers about the
 * same person, and one dropdown cannot hold both.
 */
function TeamSelect({
  label, value, teams, sizes, sizeLimit, noun, disabled, wide, onChange,
}: {
  label: string | null
  value: string
  teams: Team[]
  sizes: Record<string, number>
  sizeLimit: number | null
  noun: TeamNoun
  disabled: boolean
  /** The add-player form is full width; a player row shares a line. */
  wide: boolean
  onChange: (teamId: string | null) => void
}) {
  const select = (
    <div className="relative flex-1 min-w-0">
      <select
        value={value}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        aria-label={label ?? `Which ${noun.one}`}
        className={wide
          ? `${INPUT} appearance-none pr-10`
          : 'w-full bg-surface border border-bark/12 rounded-lg px-3 py-2.5 text-ink text-sm appearance-none focus:outline-none focus:border-accent/50 disabled:opacity-40'}
      >
        <option value="" className="bg-cream">No {noun.one}</option>
        {teams.map(t => {
          const size = sizes[t.id] ?? 0
          const full = sizeLimit !== null && size >= sizeLimit && t.id !== value
          return (
            <option key={t.id} value={t.id} disabled={full} className="bg-cream">
              {t.name}{sizeLimit !== null ? ` (${size}/${sizeLimit})` : ''}{full ? ' — full' : ''}
            </option>
          )
        })}
      </select>
      <div className={`pointer-events-none absolute ${wide ? 'right-4' : 'right-3'} top-1/2 -translate-y-1/2 text-ink/65`}>
        <svg width={wide ? 14 : 12} height={wide ? 14 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  )

  // Labelled only when there is more than one sheet. With one, the label
  // would say "Teams" above the only team control on the screen.
  if (!label) return select
  return (
    <div className="flex items-center gap-2">
      <span className="t-cap text-ink/65 w-24 flex-shrink-0 truncate">{label}</span>
      {select}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export default function TripSetupClient({
  trip,
  teams: initialTeams,
  players: initialPlayers,
  memberships: initialMemberships,
  rounds,
}: {
  trip: Trip
  teams: Team[]
  players: Player[]
  memberships: Membership[]
  rounds: RoundInfo[]
}) {
  // Trip fields
  const [name, setName] = useState(trip.name)
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [detailsOpen, setDetailsOpen] = useState(false)
  // What the trip is playing for. A list of complete competitions, replacing
  // the old object of flags — see lib/leaderboards.ts. Nothing on this screen
  // reads `trips.formats` any more: every question it used to answer is now
  // asked properly by a leaderboard card.
  const [boards, setBoards] = useState<Leaderboard[]>(trip.leaderboards ?? [])
  const [editPermission, setEditPermission] = useState(trip.edit_permission)
  const [setupStatus, setSetupStatus] = useState(trip.setup_status)

  // Collections
  const [teams] = useState<Team[]>(initialTeams)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  // Who is in which team, on every sheet. A player holds one place per sheet,
  // so this cannot be a field on the player — see lib/teamSets.ts.
  const [memberships, setMemberships] = useState<Membership[]>(initialMemberships)

  // New player form
  const [newName, setNewName] = useState('')
  const [newHandicap, setNewHandicap] = useState('')
  const [newGender, setNewGender] = useState<'M' | 'F'>('M')
  const [newTeams, setNewTeams] = useState<Record<string, string>>({})

  // UI state
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    try {
      setIsOwner(localStorage.getItem(`gig-owner-${trip.trip_code}`) === '1')
    } catch { /* localStorage unavailable */ }
  }, [trip.trip_code])

  const playerIds = players.map(p => p.id)
  const isDraft = setupStatus === 'draft'
  const canEdit = isDraft && (editPermission === 'everyone' || isOwner)
  const locked = !canEdit || busy
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

  async function saveBoards(next: Leaderboard[]) {
    const prev = boards
    setBoards(next)
    if (!(await saveTrip({ leaderboards: next }))) setBoards(prev)
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
      })
      .select('id, name, handicap, gender, team_id, is_lead')
      .single()
    if (err || !data) {
      flashError('Could not add player')
      setBusy(false)
      return
    }

    setPlayers(prev => [...prev, data])
    // A place on each sheet they were assigned to, one write per sheet.
    for (const [teamSet, teamId] of Object.entries(newTeams)) {
      if (!teamId) continue
      if (await setTeam(trip.id, data.id, teamSet, teamId)) {
        setMemberships(ms => [...ms, { team_id: teamId, team_set: teamSet, player_id: data.id }])
      } else {
        flashError('Player added, but their team could not be saved')
      }
    }
    setNewName('')
    setNewHandicap('')
    setNewTeams({})
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
   * Move a player between teams on one sheet, refusing rather than overfilling.
   *
   * A pairs draw is played between teams of two, so a third player in a
   * pairing is not a thing the bracket can represent. Better to say so than
   * to let it save and break the draw later. The cap is the SHEET's, not the
   * trip's: a draw between pairings has no business resizing the league's
   * teams, which is exactly what it used to do.
   */
  async function movePlayerToTeam(id: string, teamSet: string, teamId: string | null) {
    const onSheet = sheetBoards(teamSet)
    if (teamId && !canJoinTeam(onSheet, teamId, asMembers(playerIds, memberships, teamSet))) {
      const team = teams.find(t => t.id === teamId)
      flashError(`${team?.name ?? 'That ' + teamNoun(onSheet).one} is already full`)
      return
    }
    const prev = memberships
    setMemberships(ms => [
      ...ms.filter(m => !(m.player_id === id && m.team_set === teamSet)),
      ...(teamId ? [{ team_id: teamId, team_set: teamSet, player_id: id }] : []),
    ])
    if (!(await setTeam(trip.id, id, teamSet, teamId))) {
      setMemberships(prev)
      flashError('Could not save that team — try again')
    }
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

  // What a trip plays for is its boards, so that is what finalise asks. It
  // used to ask trips.formats, which a new trip carries as the defaults — so
  // a trip with nothing at all to play for could go live.
  //
  // Every team rule below is asked of one sheet at a time. A trip can run a
  // league between fours and a knockout between pairings, and the rules for
  // one say nothing about the other.
  const sheets = sheetsInUse(boards)
  const sheetBoards = (id: string) => boards.filter(b => b.audience === 'team' && setOf(b) === id)
  // How full each team on each sheet is, so a dropdown can say (2/2) and
  // grey out what is full rather than let the write fail.
  const draw = boards.find(b => b.competition === 'matchplay')
  const drawSheet = draw ? setOf(draw) : MAIN_SET
  const sheetSizes: Record<string, Record<string, number>> = Object.fromEntries(
    sheets.map(id => [
      id,
      Object.fromEntries(teamsOnSheet(teams, id).map(t => [
        t.id, memberships.filter(m => m.team_id === t.id).length,
      ])),
    ]),
  )
  const blocked =
    finaliseBlockedReason(boards, teams)
    ?? sheets
      .map(id => pairsBlockedReason(
        sheetBoards(id),
        teamsOnSheet(teams, id),
        asMembers(playerIds, memberships, id),
      ))
      .find(Boolean)
    ?? null

  /** The answer controls for one question. */
  return (
    <main className="min-h-dvh bg-cream text-ink pb-16">

      {/* The page names itself in the header, the way the leaderboard and
          the scoring screens do. Tapping the mark is the way back. */}
      <TripHeader backTo={`/trip/${trip.trip_code}`} title="settings" />

      {/* The trip's own details — its name and its dates — sit behind the
          gear rather than at the top of the page. They are set once at
          creation and almost never touched again, so they were taking the
          first screenful away from the thing this page is actually for. */}
      <div className="max-w-lg mx-auto px-4 pt-4 flex justify-end">
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          aria-label="Trip name and dates"
          className="w-11 h-11 rounded-xl border border-bark/12 bg-surface text-ink/65 hover:text-ink hover:border-bark/25 flex items-center justify-center transition-colors duration-150"
        >
          <IconSettings size={18} />
        </button>
      </div>

      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setDetailsOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <div
            className="relative bg-cream rounded-t-2xl max-h-[88vh] overflow-y-auto"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-cream px-4 pt-4 pb-3 flex items-center justify-between border-b border-bark/12">
              <h2 className="t-h2 text-ink">Trip details</h2>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close"
                className="w-11 h-11 -mr-2 flex items-center justify-center text-ink/65 hover:text-ink"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="px-4 py-5 space-y-4">
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
                <DateField label="Start date" value={startDate}
                  onChange={v => saveDates(v, endDate)} disabled={locked} />
                <DateField label="End date" value={endDate}
                  onChange={v => saveDates(startDate, v)} disabled={locked} />
              </div>
              {locked && (
                <p className="t-cap text-ink/65">
                  The trip is live. Unlock it below to change these.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
              className="flex-shrink-0 px-4 py-2 border border-bark/25 rounded-lg text-[13px] tracking-wider uppercase text-ink/80 hover:border-bark/25 hover:text-ink transition-colors disabled:opacity-40"
            >
              Unlock
            </button>
          </div>
        )}

        {viewOnly && (
          <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
            <p className="text-ink/65 text-sm">
              Only the trip owner can edit this trip. Ask whoever created it to make changes.
            </p>
          </div>
        )}

        {isDraft && (
          <>
            {/* ── What the trip plays for ──
                The first thing asked, because it is what turns a scorecard
                into a position. Nothing below it can be answered sensibly
                until this is settled. */}
            <section className={SECTION}>
              <p className="t-label text-accent-deep uppercase tracking-[0.18em] mb-1">Leaderboards</p>
              <LeaderboardSetup
                boards={boards}
                playerCount={players.length}
                teamCount={teams.length}
                onChange={saveBoards}
              />
              {boards.length > 0 && needsTeams(boards) && teams.length === 0 && (
                <p className="t-cap text-rust-deep mt-3">
                  {needsPairings(boards)
                    ? 'A pairs draw needs pairings — pick them below.'
                    : 'A team board needs teams — pick them below.'}
                </p>
              )}
            </section>

            {/* ── Teams, one card per sheet ──
                A trip can run a league between fours and a knockout between
                pairings — the same players, arranged twice. Each sheet is
                picked separately and carries its own rules, because a pairs
                draw fixing ITS teams at two has no business resizing the
                league's.

                The only question the leaderboards do not already answer. The
                old decision tree used to render seven more cards here — who
                competes, league or matchplay, scoring, discard, the prize
                table, the draw format, team scoring — every one of which the
                leaderboard cards above now ask properly. They were asked
                twice and answered into a model nothing read. */}
            {sheets.map(id => {
              const onSheet   = sheetBoards(id)
              const sheetTeams = teamsOnSheet(teams, id)
              const members   = asMembers(playerIds, memberships, id)
              const noun      = teamNoun(onSheet)
              const banner    = teamSizeBanner(onSheet)
              const oversize  = oversizedTeams(onSheet, sheetTeams, members)
              return (
                <section key={id} className={SECTION}>
                  <p className="t-label text-accent-deep uppercase tracking-[0.18em] mb-1">
                    {noun.Many}
                  </p>
                  {/* Which board these teams play for. With one sheet it is
                      obvious; with two it is the only thing telling them
                      apart on this screen. */}
                  {sheets.length > 1 && (
                    <p className="t-cap text-ink/65 mb-2">
                      {sheetSubtitle(boards, id, boardTitle)}
                    </p>
                  )}
                  <p className="t-body text-ink/80 mb-4">
                    {needsPairings(onSheet)
                      ? 'Your draw is between pairings, so teams are fixed at two.'
                      : 'Pick who plays with whom.'}
                  </p>

                  {/* A pairs draw fixes the size, so say so before anyone picks */}
                  {banner && (
                    <div className="flex items-start gap-3 px-4 py-3 mb-3 bg-accent/10 border border-accent/40 rounded-xl">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      <p className="text-accent text-[13px] leading-snug">{banner}</p>
                    </div>
                  )}

                  {sheetTeams.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {sheetTeams.map(team => {
                        const size = members.filter(m => m.team_id === team.id).length
                        const over = oversize.some(o => o.teamId === team.id)
                        return (
                          <div
                            key={team.id}
                            className={`flex items-center gap-3 px-3 py-2.5 border rounded-xl ${
                              over ? 'border-rust/50 bg-rust/10' : 'border-bark/12 bg-surface'
                            }`}
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: teams.find(t => t.id === team.id)?.color }} />
                            <span className="text-ink text-sm flex-1 min-w-0 truncate">{team.name}</span>
                            <span className={`text-[13px] flex-shrink-0 ${over ? 'text-rust-deep' : 'text-ink/65'}`}>
                              {size} player{size === 1 ? '' : 's'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {!locked && (
                    <Link
                      href={`/trip/${trip.trip_code}/teams?set=${encodeURIComponent(id)}`}
                      className="block w-full py-3.5 border border-accent/40 text-accent rounded-xl text-sm tracking-wider uppercase text-center hover:bg-accent/10 transition-colors"
                    >
                      Pick {noun.many}
                    </Link>
                  )}

                  <p className="text-ink/65 text-[13px] mt-3 leading-snug">
                    {noun.Many} can be changed at any point. Players own their scores and
                    carry them to whichever {noun.one} they end up in.
                  </p>
                </section>
              )
            })}

            {/* ── Players ── */}
            <section className={SECTION}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-ink/65 text-[13px] tracking-widest uppercase">Players</p>
                <span className="text-ink/65 text-[13px]">{players.length}</span>
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
                        <span className="text-ink/65 text-[12px] tracking-widest uppercase flex-shrink-0">Lead</span>
                      )}
                      {!locked && (
                        <button
                          onClick={() => removePlayer(player.id)}
                          className="w-9 h-9 flex items-center justify-center text-ink/65 hover:text-ink/80 transition-colors flex-shrink-0"
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
                                ? 'bg-accent-deep text-white'
                                : 'bg-surface border border-bark/12 text-ink/65'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      {/* One sheet keeps the dropdown on the same line as
                          the handicap, where it has always been. */}
                      {sheets.length === 1 && (
                        <TeamSelect
                          label={null}
                          value={teamFor(memberships, player.id, sheets[0]) ?? ''}
                          teams={teamsOnSheet(teams, sheets[0]) as Team[]}
                          sizes={sheetSizes[sheets[0]]}
                          sizeLimit={teamSizeLimit(sheetBoards(sheets[0]))}
                          noun={teamNoun(sheetBoards(sheets[0]))}
                          disabled={locked}
                          wide={false}
                          onChange={id => movePlayerToTeam(player.id, sheets[0], id)}
                        />
                      )}
                    </div>

                    {/* Two, and each needs naming — a league team and a
                        pairing are two answers about the same person. */}
                    {sheets.length > 1 && (
                      <div className="flex flex-col gap-2 mt-2">
                        {sheets.map(id => (
                          <TeamSelect
                            key={id}
                            label={teamNoun(sheetBoards(id)).One}
                            value={teamFor(memberships, player.id, id) ?? ''}
                            teams={teamsOnSheet(teams, id) as Team[]}
                            sizes={sheetSizes[id]}
                            sizeLimit={teamSizeLimit(sheetBoards(id))}
                            noun={teamNoun(sheetBoards(id))}
                            disabled={locked}
                            wide={false}
                            onChange={teamId => movePlayerToTeam(player.id, id, teamId)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {players.length === 0 && (
                  <p className="text-ink/65 text-sm text-center py-2">
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
                                ? 'bg-accent-deep text-white'
                                : 'bg-surface border border-bark/12 text-ink/65'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    {sheets.map(id => teamsOnSheet(teams, id).length > 0 && (
                      <TeamSelect
                        key={id}
                        label={sheets.length > 1 ? teamNoun(sheetBoards(id)).One : null}
                        value={newTeams[id] ?? ''}
                        teams={teamsOnSheet(teams, id) as Team[]}
                        sizes={sheetSizes[id]}
                        sizeLimit={teamSizeLimit(sheetBoards(id))}
                        noun={teamNoun(sheetBoards(id))}
                        disabled={false}
                        wide={sheets.length === 1}
                        onChange={teamId =>
                          setNewTeams(t => ({ ...t, [id]: teamId ?? '' }))}
                      />
                    ))}
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
                <p className="text-ink/65 text-[13px] tracking-widest uppercase mb-4">Rounds</p>
                <div className="space-y-2">
                  {rounds.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm">
                      <span className="text-ink/65 w-16 flex-shrink-0">Round {r.round_number}</span>
                      <span className="text-ink/80">{r.courseName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Edit permission ── */}
            <section className={SECTION}>
              <p className="text-ink/65 text-[13px] tracking-widest uppercase mb-1">Who can edit</p>
              <p className="text-ink/65 text-[13px] mb-4">Controls who can change this trip while it&apos;s in setup</p>
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
                        ? 'bg-accent-deep text-white'
                        : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
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
                  className="w-full py-5 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
        {hasMatchplay(boards) && (
          <MatchplayPanel
            tripId={trip.id}
            tripCode={trip.trip_code}
            canEdit={editPermission === 'everyone' || isOwner}
            boards={boards}
            // The draw's own sheet. A knockout between pairings running
            // beside a league of fours must be drawn from the pairings, and
            // judged complete against the pairings.
            teams={teamsOnSheet(teams, drawSheet)}
            players={asMembers(playerIds, memberships, drawSheet)}
          />
        )}

        {/* Live-mode summary */}
        {!isDraft && (
          <div className={SECTION}>
            <p className="text-ink/65 text-sm leading-relaxed">
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

        <SupportLink className="pb-4" />

      </div>
    </main>
  )
}
