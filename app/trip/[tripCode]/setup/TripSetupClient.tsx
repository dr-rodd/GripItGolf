'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  teamNoun, teamSizeLimit, oversizedTeams, canJoinTeam,
  pairsBlockedReason, type TeamNoun,
} from '@/lib/teamLimits'
import MatchplayPanel from './MatchplayPanel'
import ItineraryEditor from './ItineraryEditor'
import DateField from '@/app/components/DateField'
import LeaderboardSetup from '@/app/components/LeaderboardSetup'
import TripHeader from '@/app/components/TripHeader'
import SupportLink from '@/app/components/SupportLink'
import Toggle from '@/app/components/Toggle'
import {
  IconSettings, IconX, IconFlag, IconChevronRight, IconPencil,
} from '@/app/components/icons'
import type { ItineraryItem } from '@/lib/itinerary'
import {
  type Leaderboard, needsTeams, needsPairings, hasMatchplay, boardTitle,
} from '@/lib/leaderboards'
import { anyPointsOutOfStep, PLAYER_POINTS_MISMATCH } from '@/lib/customPoints'
import {
  finaliseBlockedReason, sheetsInUse, teamsOnSheet, teamBoards, isBoardOpen,
  teamFor, asMembers, setOf, MAIN_SET, type Membership,
} from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'
import { why } from '@/lib/writeFailure'
import {
  parseHandicap, formatHandicap, isPlusHandicap, PLUS_HANDICAP_WARNING,
} from '@/lib/handicap'
import HandicapField from '@/app/components/HandicapField'
import { duplicateName, duplicateNameError, isDuplicateNameError } from '@/lib/roster'
import { syncRoundHandicaps } from '@/lib/roundHandicaps'
import { rescheduleRounds } from '@/lib/itineraryStore'
import { normalizeDescription, MAX_TRIP_DESCRIPTION } from '@/lib/tripLimits'

// ── Types ─────────────────────────────────────────────────────────────────

type Trip = {
  id: string
  trip_code: string
  name: string
  description?: string | null
  start_date: string | null
  end_date: string | null
  leaderboards: Leaderboard[]
  edit_permission: string
  track_stats: boolean
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

/**
 * A round, as this screen needs it — which is now only its id.
 *
 * It carried a number and a course name for the read-only list that used to
 * sit under the roster. What is left is the handicap snapshot: change a
 * player's handicap and every existing round's `round_handicaps` row has to
 * be rewritten, and that takes ids and nothing else.
 */
type RoundInfo = {
  id: string
  /** For naming it in the matchplay board's round links. */
  roundNumber?: number
  courseName?: string | null
}


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
  itinerary,
  lockedGolfItemIds,
  askTeeTeams = false,
  askTags = false,
}: {
  trip: Trip
  teams: Team[]
  players: Player[]
  memberships: Membership[]
  rounds: RoundInfo[]
  /** The running order — golf, stays and journeys. Empty for a trip made
   * before the itinerary existed; the editor still opens on one and lets an
   * organiser start building it from nothing. */
  itinerary: ItineraryItem[]
  /**
   * Golf items whose round already has a score or a live session recorded.
   * The editor locks exactly those — a course change would orphan real data
   * — and leaves everything else open, adding new golf included. Stays and
   * journeys are unaffected either way.
   */
  lockedGolfItemIds: string[]
  /** Events only — team boards are asked how they meet the tee sheet. */
  askTeeTeams?: boolean
  /** Events only — offer a board that ranks tags (lib/tagBoards.ts). */
  askTags?: boolean
}) {
  const router = useRouter()

  // Trip fields
  const [name, setName] = useState(trip.name)
  const [description, setDescription] = useState(trip.description ?? '')
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [itineraryOpen, setItineraryOpen] = useState(false)
  // What the trip is playing for. A list of complete competitions, replacing
  // the old object of flags — see lib/leaderboards.ts. Nothing on this screen
  // reads `trips.formats` any more: every question it used to answer is now
  // asked properly by a leaderboard card.
  const [boards, setBoards] = useState<Leaderboard[]>(trip.leaderboards ?? [])
  const [editPermission, setEditPermission] = useState(trip.edit_permission)
  const [trackStats, setTrackStats] = useState(trip.track_stats === true)

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
  /**
   * Which player row is open for editing, if any.
   *
   * One at a time, like the hub's sections: two rows of open fields on a
   * phone is most of a screen, and the second one is never the one being
   * looked at. Closing writes nothing — every field in there saves as it is
   * left — so switching rows can never lose an edit.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    try {
      setIsOwner(localStorage.getItem(`gig-owner-${trip.trip_code}`) === '1')
    } catch { /* localStorage unavailable */ }
  }, [trip.trip_code])

  const playerIds = players.map(p => p.id)
  // A trip has no draft and no live: it is always both. There was a
  // Finalise & Go Live button here that flipped a flag, and the flag locked
  // the players, the teams and the format behind an Unlock. Nothing about a
  // trip needs announcing — scoring is open from the moment there is
  // something to score, and a roster that changes on the first tee is the
  // normal case rather than the exception.
  const mayChange = editPermission === 'everyone' || isOwner
  const canEdit = mayChange
  /** Somebody who is not allowed to change this trip, looking at it anyway. */
  const viewOnly = !canEdit
  const locked = !canEdit || busy

  /**
   * Whether the leaderboards and the teams may be rearranged.
   *
   * Not gated on the trip being in draft, unlike everything else here. A
   * leaderboard owns no data — it is a way of reading cards that belong to
   * the players — and a team is worked out from who is in it right now. So
   * both can change mid-trip without a score moving: add a player halfway
   * through and they take their cards into whichever team they land in.
   *
   * Courses, rounds and the roster are a different matter, and stay locked.
   */
  const canArrange = mayChange && !busy
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

  async function saveDescription() {
    // Blank is a real answer here — clearing the box removes the
    // description from the hub — so unlike the name, empty saves as null.
    const next = normalizeDescription(description)
    if (next === normalizeDescription(trip.description)) return
    if (await saveTrip({ description: next })) setDescription(next ?? '')
    else setDescription(trip.description ?? '')
  }

  async function saveDates(nextStart: string, nextEnd: string) {
    const prev = { s: startDate, e: endDate }
    setStartDate(nextStart)
    setEndDate(nextEnd)
    if (!(await saveTrip({ start_date: nextStart || null, end_date: nextEnd || null }))) {
      setStartDate(prev.s)
      setEndDate(prev.e)
      return
    }
    // The rounds follow the trip. A golf item holds a day *index*, so the
    // itinerary re-dates itself the moment the start date moves — but
    // `rounds.scheduled_date` is stored, and stayed where it was. The
    // countdown, the up-next card, the round summary and the weather all
    // read that column, so a trip moved a week later went on counting down
    // to the old Thursday under an itinerary showing the new one.
    //
    // Only when the start date is what moved: the end date sets how many
    // days there are, not which date each one is, and re-dating on it would
    // be a write that changes nothing. Then a refresh, because every one of
    // those screens is server-rendered from the dates just written.
    if (nextStart !== prev.s) {
      const result = await rescheduleRounds(trip.id, nextStart || null)
      if (!result.ok) flashError(result.error)
      router.refresh()
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

  async function saveTrackStats(next: boolean) {
    const prev = trackStats
    setTrackStats(next)
    if (!(await saveTrip({ track_stats: next }))) setTrackStats(prev)
  }

  // ── Players ──────────────────────────────────────────────────────────────

  async function addPlayer() {
    const trimmed = newName.trim()
    const hcp = parseHandicap(newHandicap)
    if (!trimmed || hcp === null) {
      flashError('Enter a name and handicap first')
      return
    }
    // Asked before the write, and only for the one value that means the
    // opposite of what it looks like — see PLUS_HANDICAP_WARNING.
    if (isPlusHandicap(hcp) && !window.confirm(PLUS_HANDICAP_WARNING)) return
    // Two people on one trip cannot share a name: the join list is a list of
    // names, and two of the same is a coin toss over whose card is whose.
    if (duplicateName(trimmed, players)) {
      flashError(duplicateNameError(trimmed))
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
      // The check above ran before this insert; another phone could have
      // taken the name in between. Same sentence, from the other side.
      flashError(isDuplicateNameError(err)
        ? duplicateNameError(trimmed)
        : 'Could not add player')
      setBusy(false)
      return
    }

    setPlayers(prev => [...prev, data])

    // A board paying by position pays a fixed table of places, and the field
    // just grew. `resolveCustomPoints` has already padded the table with a
    // nought so nothing is broken — but a place silently worth nothing is
    // the kind of thing found out at the prizegiving, so it is said here
    // instead. After the write, not before: the player is added either way,
    // and asking permission to do something already decided is a question
    // with one answer.
    //
    // Counted as `players.length + 1` because the state above has not
    // settled yet — `setPlayers` is a queued update, and reading `players`
    // on this line still gives the roster without them.
    if (anyPointsOutOfStep(boards, { players: players.length + 1, teams: teams.length })) {
      window.alert(PLAYER_POINTS_MISMATCH)
    }

    // A place on each sheet they were assigned to, one write per sheet.
    for (const [teamSet, teamId] of Object.entries(newTeams)) {
      if (!teamId) continue
      const fail = await setTeam(trip.id, data.id, teamSet, teamId)
      if (fail) flashError(`Player added, but their team could not be saved${why(fail)}`)
      else setMemberships(ms => [...ms, { team_id: teamId, team_set: teamSet, player_id: data.id }])
    }
    setNewName('')
    setNewHandicap('')
    setNewTeams({})
    setBusy(false)
  }

  async function updatePlayer(id: string, patch: Partial<Player>) {
    // The backstop on a rename. The name field refuses a duplicate itself,
    // because it is the only place that can put the old value back in the
    // box — this catches any other caller that ever patches a name.
    if (patch.name != null && duplicateName(patch.name, players, id)) {
      flashError(duplicateNameError(patch.name))
      return
    }
    const prev = players
    setPlayers(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)))
    const { error: err } = await supabase.from('players').update(patch).eq('id', id)
    if (err) {
      setPlayers(prev)
      flashError(isDuplicateNameError(err) && patch.name != null
        ? duplicateNameError(patch.name)
        : 'Could not save player')
      return
    }
    // Keep the handicap snapshot used for scoring in step with edits. The
    // same call the join screen makes for a player who adds themselves after
    // the rounds already exist — see `lib/roundHandicaps.ts`.
    if (patch.handicap != null && rounds.length > 0) {
      const hcpErr = await syncRoundHandicaps(
        rounds.map(r => r.id), id, patch.handicap as number,
      )
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
    const fail = await setTeam(trip.id, id, teamSet, teamId)
    if (fail) {
      setMemberships(prev)
      flashError(`Could not save that team${why(fail)}`)
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

  // Every team rule below is asked of one sheet at a time. A trip can run a
  // league between fours and a knockout between pairings, and the rules for
  // one say nothing about the other.
  const sheets = sheetsInUse(boards)
  const sheetBoards = (id: string) => boards.filter(b => b.audience === 'team' && setOf(b) === id)
  // Only the sheets somebody has actually picked teams on. A team board made
  // but not yet apportioned has a sheet of its own with nothing on it, and a
  // player dropdown listing no teams is a control that cannot be used.
  const pickedSheets = sheets.filter(id => teamsOnSheet(teams, id).length > 0)
  // What to call them across the whole trip. "Pairings" only when every team
  // board is a pairs draw — a trip running a league of fours beside a draw
  // has both, and one word for the pair of them would be wrong about the
  // fours. Per board, the noun is exact; here it has to cover them all.
  const allTeamBoards = teamBoards(boards)
  const groupNoun = allTeamBoards.length > 0 && allTeamBoards.every(b => needsPairings([b]))
    ? teamNoun(allTeamBoards)
    : teamNoun([])
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
    <main className="min-h-dvh bg-cream text-ink has-tabbar page-enter">

      {/* The page names itself in the header, the way the leaderboard and
          the scoring screens do. Tapping the mark is the way back. */}
      <TripHeader backTo={`/trip/${trip.trip_code}`} title="settings" />

      {/* The trip's own details sit behind the gear rather than at the top of
          the page. They are set once and almost never touched again, so they
          were taking the first screenful away from the thing this page is
          actually for.

          It says what it holds rather than being a bare gear. Two different
          kinds of question live on this screen and they were told apart only
          by which side of a tap they were on: what the trip *is* — its name,
          its dates, its running order, who is allowed to change it — against
          how the golf is *played*, which is everything below. A lone icon in
          the corner names neither of them, so the row names both. */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-bark/12 bg-surface hover:border-bark/25 transition-colors duration-150 text-left"
        >
          <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-bark/[0.06] flex items-center justify-center text-bark">
            <IconSettings size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block t-card text-ink">Trip Settings</span>
            {/* "The non-golf trip details" until the drawer gained a setting
                about the scorecard, at which point the line was quietly
                untrue. The pointer downwards is the part that earns its keep
                — it is what stops somebody hunting in here for the boards. */}
            <span className="block t-cap text-ink/65 mt-0.5 leading-snug">
              Name, dates, itinerary and stats — leaderboards are below
            </span>
          </span>
          <span className="flex-shrink-0 text-ink/50">
            <IconChevronRight size={16} />
          </span>
        </button>
      </div>

      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setDetailsOpen(false)}>
          <div className="absolute inset-0 bg-ink/40 page-enter" />
          <div
            className="relative bg-cream rounded-t-2xl max-h-[88vh] overflow-y-auto sheet-up"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-cream px-4 pt-4 pb-3 flex items-center justify-between border-b border-bark/12">
              <h2 className="t-h2 text-ink">Trip Settings</h2>
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
              <div>
                <label className={LABEL}>About the trip</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onBlur={saveDescription}
                  maxLength={MAX_TRIP_DESCRIPTION}
                  rows={3}
                  disabled={locked}
                  placeholder="The stakes, the plan, the rules of engagement…"
                  className={`${INPUT} resize-none leading-snug`}
                />
                <p className="t-cap text-ink/65 mt-1.5 leading-snug">
                  Shows on the trip hub, under the countdown. Clear it to
                  take it off.
                </p>
              </div>
              <div className="pt-2 border-t border-bark/12">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => { setDetailsOpen(false); setItineraryOpen(true) }}
                  className="w-full flex items-center gap-3 py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-bark/[0.06] flex items-center justify-center text-bark">
                    <IconFlag size={16} />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block t-card text-ink">Itinerary</span>
                    <span className="block t-cap text-ink/65 mt-0.5">
                      Courses, tee times, stays and journeys
                    </span>
                  </span>
                </button>
              </div>

              {/* ── Who can edit ──
                  In here with the name and the dates rather than down the
                  page with the leaderboards. It is a fact about the trip, not
                  about the golf: it decides who may open any of this, which
                  makes it the same kind of question as what the trip is
                  called and when it runs. */}
              <div className="pt-4 border-t border-bark/12">
                <label className={LABEL}>Who can edit</label>
                <p className="t-cap text-ink/65 mb-3 leading-snug">
                  Who can change this trip&apos;s players, teams, format and dates.
                </p>
                <div className="flex gap-2">
                  {[
                    { value: 'everyone', label: 'Any player' },
                    { value: 'owner', label: 'Owner only' },
                  ].map(o => {
                    // Owner is a flag on the device the trip was created on, and
                    // there is no way to hand it to another one. A device that
                    // does not hold it choosing "owner only" would lock this
                    // screen — this control included — the instant it was tapped,
                    // with nothing anywhere able to undo it.
                    const wouldLockMeOut = o.value === 'owner' && !isOwner
                    return (
                      <button
                        key={o.value}
                        onClick={() => savePermission(o.value)}
                        disabled={locked || wouldLockMeOut}
                        className={`flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          editPermission === o.value
                            ? 'bg-accent-deep text-white'
                            : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                        }`}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>

                {/* What it actually did.
                    This setting changes what OTHER people can do, so from the
                    owner's own phone — which is the phone it is usually set from —
                    nothing on screen moves and it reads as a control that does
                    nothing at all. So it says so. */}
                <p className="t-cap text-ink/65 mt-3 leading-snug">
                  {editPermission === 'owner' ? (
                    isOwner
                      ? 'Only the device this trip was created on can change it — this one. Nothing changes for you; it is everybody else who can now read this screen but not touch it.'
                      : 'Only the device this trip was created on can change it.'
                  ) : (
                    isOwner
                      ? 'Anyone who opens this screen can change the trip. This is the device it was created on, so "Owner only" would leave it to you.'
                      : 'Anyone who opens this screen can change the trip. "Owner only" is set from the device the trip was created on, which is not this one.'
                  )}
                </p>
              </div>

              {/* ── Track stats ──
                  Last in the drawer because it is the newest setting and the
                  least visited, and because "Who can edit" carries a long
                  explanation that wants to stay attached to its own control.

                  In the drawer rather than down the page with the
                  leaderboards: it does not change what the trip is playing
                  for, and no board reads it. It changes what the scorecard
                  asks for, which is a fact about how this trip is run. */}
              <div className="pt-4 border-t border-bark/12">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <label className={LABEL}>Track stats</label>
                    <p className="t-cap text-ink/65 leading-snug">
                      Ask for putts and where the tee shot finished on every hole,
                      for everyone on the card.
                    </p>
                  </div>
                  <Toggle
                    checked={trackStats}
                    onChange={saveTrackStats}
                    disabled={locked}
                    label="Track stats"
                  />
                </div>

                {/* Two things somebody will otherwise report as broken: that
                    the rounds already played did not fill in, and that the
                    scorecard looks unchanged until the next one is started. */}
                <p className="t-cap text-ink/65 mt-3 leading-snug">
                  {trackStats
                    ? 'Two extra taps a hole, and neither one holds up the next hole. Holes already played are not affected — stats start from the next card.'
                    : 'Off, so the scorecard asks for a score and nothing else.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {itineraryOpen && (
        <ItineraryEditor
          tripId={trip.id}
          tripName={trip.name}
          startDate={startDate || null}
          endDate={endDate || null}
          initialItems={itinerary}
          lockedGolfItemIds={lockedGolfItemIds}
          trackStats={trackStats}
          players={players}
          onClose={() => setItineraryOpen(false)}
        />
      )}

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {viewOnly && (
          <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
            <p className="text-ink/65 text-sm">
              Only the lead player can edit this trip. Ask them to make changes.
            </p>
          </div>
        )}

        {/* ── What the trip plays for ──
            The first thing asked, because it is what turns a scorecard into a
            position. Nothing below it can be answered sensibly until this is
            settled — and it stays open after the trip goes live, because a
            board is a way of reading cards rather than a place they live.
            Changing one re-reads what is already in; nobody re-enters a
            score. */}
        <section className={SECTION}>
          <p className="t-label text-accent-deep uppercase tracking-[0.18em] mb-1">Leaderboards</p>
          <p className="t-cap text-ink/65 mb-3 leading-snug">
            Choose your Competition Leaderboards. Add as many formats as you like.
          </p>
          <LeaderboardSetup
            boards={boards}
            playerCount={players.length}
            teamCount={teams.length}
            rounds={rounds}
            readOnly={!canArrange}
            askTeeTeams={askTeeTeams}
            askTags={askTags}
            onChange={saveBoards}
          />
          {boards.length > 0 && needsTeams(boards) && teams.length === 0 && (
            <p className="t-cap text-rust-deep mt-3">
              {needsPairings(boards)
                ? 'This leaderboard needs pairings! Pick them below.'
                : 'A team leaderboard needs teams! Pick them below.'}
            </p>
          )}
        </section>

        {/* ── Teams ──
            The only question the leaderboards do not already answer, and it
            is answered on its own screen: which boards are played by which
            teams. Here it is a summary and a way in.

            A trip can run a league between fours and a knockout between
            pairings — the same players, arranged twice — so the summary is
            per board rather than per trip. The old decision tree used to
            render seven more cards here: who competes, league or matchplay,
            scoring, discard, the prize table, the draw format, team scoring.
            Every one of those is a leaderboard card above now. */}
        {allTeamBoards.length > 0 && (
          <section className={SECTION}>
            <p className="t-label text-accent-deep uppercase tracking-[0.18em] mb-1">
              {groupNoun.Many}
            </p>
            <p className="t-body text-ink/80 mb-4">
              Pick your teams! You can pick different teams for different boards.
            </p>

            <div className="space-y-2 mb-4">
              {allTeamBoards.map(lb => {
                const onSheet    = teamsOnSheet(teams, setOf(lb))
                const members    = asMembers(playerIds, memberships, setOf(lb))
                const noun       = teamNoun([lb])
                const open       = isBoardOpen(lb, teams)
                const oversize   = oversizedTeams([lb], onSheet, members)
                const placedHere = members.filter(m => m.team_id).length
                return (
                  <div
                    key={lb.id}
                    className={`px-3 py-3 border rounded-xl ${
                      oversize.length > 0 ? 'border-rust/50 bg-rust/10' : 'border-bark/12 bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-ink text-sm flex-1 min-w-0 truncate">
                        {boardTitle(lb)}
                      </span>
                      <span className={`text-[13px] flex-shrink-0 ${
                        open ? 'text-rust-deep' : 'text-ink/65'
                      }`}>
                        {open
                          ? `No ${noun.many} yet`
                          : `${onSheet.length} ${onSheet.length === 1 ? noun.one : noun.many} · ${placedHere} placed`}
                      </span>
                    </div>
                    {!open && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {onSheet.map(t => (
                          <span
                            key={t.id}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: teams.find(x => x.id === t.id)?.color }}
                            title={t.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* The size rules belong where the picking happens — scoped to
                the boards a sheet is actually being picked for — not restated
                here across boards that may not share them. */}
            {canArrange && (
              <Link
                href={`/trip/${trip.trip_code}/teams`}
                className="block w-full py-3.5 border border-accent/40 text-accent rounded-xl text-sm tracking-wider uppercase text-center hover:bg-accent/10 transition-colors"
              >
                {pickedSheets.length > 0
                  ? `Change ${groupNoun.many}`
                  : `Pick ${groupNoun.many}`}
              </Link>
            )}

            <p className="text-ink/65 text-[13px] mt-3 leading-snug">
              {groupNoun.Many} can be changed at any point, including
              mid-round. Players own their scores and carry them to whichever{' '}
              {groupNoun.one} they end up in.
            </p>
          </section>
        )}

          {/* ── Players ── */}
          <section className={SECTION}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-ink/65 text-[13px] tracking-widest uppercase">Players</p>
              <span className="text-ink/65 text-[13px]">{players.length}</span>
            </div>

            <div className="space-y-3">
              {players.map(player => {
                // `canEdit` is the permission; `locked` is that plus a write
                // in flight. The row opens on the first and its fields go
                // quiet on the second — using `locked` for both would make
                // the edit and remove buttons vanish and come back on every
                // save, which reads as the row flinching.
                const editing = editingId === player.id && canEdit
                return (
                <div key={player.id} className="bg-surface border border-bark/12 rounded-xl p-4">

                  {/* ── Closed: the two facts, and the way in ──
                      A player is read far more often than edited. This row
                      carried a name box, a handicap box, M, F and a team
                      dropdown at all times — five controls each, most of a
                      screen for four players, and nothing on it said which
                      were worth touching. */}
                  {!editing ? (
                    <div className="flex items-center gap-3">
                      <span className="flex-1 min-w-0 text-ink text-sm font-medium truncate">
                        {player.name}
                      </span>
                      {player.is_lead && (
                        <span className="text-ink/65 text-[13px] tracking-widest uppercase flex-shrink-0">Lead</span>
                      )}
                      <span className="t-num text-ink/80 text-sm flex-shrink-0">
                        {player.handicap == null ? '—' : formatHandicap(player.handicap)}
                      </span>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => setEditingId(player.id)}
                            disabled={busy}
                            className="w-9 h-9 -mr-1 flex items-center justify-center text-ink/65 hover:text-ink transition-colors flex-shrink-0 disabled:opacity-40"
                            aria-label={`Edit ${player.name}`}
                          >
                            <IconPencil size={15} />
                          </button>
                          <button
                            onClick={() => removePlayer(player.id)}
                            disabled={busy}
                            className="w-9 h-9 -mr-2 flex items-center justify-center text-ink/65 hover:text-ink/80 transition-colors flex-shrink-0 disabled:opacity-40"
                            aria-label={`Remove ${player.name}`}
                          >
                            <IconX size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    /* ── Open: name, handicap, who they play off ──
                       Laid out like the add-player form directly below, so
                       the two read as the same task: the field stretches and
                       the buttons finish at the right-hand edge. */
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        defaultValue={player.name}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (!v || v === player.name) return
                          // Refused here rather than inside updatePlayer,
                          // because this is the only place holding the input
                          // itself — the box is uncontrolled, so putting the
                          // stored name back is a DOM write, not a re-render.
                          if (duplicateName(v, players, player.id)) {
                            flashError(duplicateNameError(v))
                            e.target.value = player.name
                            return
                          }
                          updatePlayer(player.id, { name: v })
                        }}
                        aria-label="Player name"
                        disabled={locked}
                        className={INPUT}
                      />
                      <div className="flex gap-2">
                        <HandicapField
                          defaultValue={player.handicap == null ? '' : formatHandicap(player.handicap)}
                          onCommit={text => {
                            const v = parseHandicap(text)
                            if (v === null || v === player.handicap) return
                            // Once, on the change that introduces it. The
                            // blur that follows the sign button commits the
                            // same value, which this guard has already
                            // returned on, so it cannot ask twice.
                            if (isPlusHandicap(v) && !window.confirm(PLUS_HANDICAP_WARNING)) return
                            updatePlayer(player.id, { handicap: v })
                          }}
                          placeholder="HCP"
                          disabled={locked}
                          rowClassName="flex-1 min-w-0"
                          className={`${INPUT} flex-1 min-w-0`}
                        />
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
                      </div>
                      {/* Every field saves as it is left, so this closes the
                          row rather than committing it. Named Done because
                          Cancel is what a reader would expect opposite Save,
                          and there is nothing here to cancel. */}
                      <button
                        onClick={() => setEditingId(null)}
                        className="self-end px-4 py-2 t-cap uppercase tracking-[0.18em] text-accent-deep hover:text-accent transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {/* The team stays out of the edit, open or closed. Filling
                      a draw is a job done down the whole list at once, not
                      one player at a time. */}
                  {pickedSheets.length === 1 && (
                    <div className="mt-3">
                      <TeamSelect
                        label={null}
                        value={teamFor(memberships, player.id, pickedSheets[0]) ?? ''}
                        teams={teamsOnSheet(teams, pickedSheets[0]) as Team[]}
                        sizes={sheetSizes[pickedSheets[0]]}
                        sizeLimit={teamSizeLimit(sheetBoards(pickedSheets[0]))}
                        noun={teamNoun(sheetBoards(pickedSheets[0]))}
                        disabled={locked}
                        wide={false}
                        onChange={id => movePlayerToTeam(player.id, pickedSheets[0], id)}
                      />
                    </div>
                  )}

                  {/* Two, and each needs naming — a league team and a
                      pairing are two answers about the same person. */}
                  {pickedSheets.length > 1 && (
                    <div className="flex flex-col gap-2 mt-3">
                      {pickedSheets.map(id => (
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
                )
              })}

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
                    <HandicapField
                      value={newHandicap}
                      onChange={setNewHandicap}
                      placeholder="Handicap"
                      rowClassName="flex-1 min-w-0"
                      className={`${INPUT} flex-1 min-w-0`}
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
                  {pickedSheets.map(id => (
                    <TeamSelect
                      key={id}
                      label={pickedSheets.length > 1 ? teamNoun(sheetBoards(id)).One : null}
                      value={newTeams[id] ?? ''}
                      teams={teamsOnSheet(teams, id) as Team[]}
                      sizes={sheetSizes[id]}
                      sizeLimit={teamSizeLimit(sheetBoards(id))}
                      noun={teamNoun(sheetBoards(id))}
                      disabled={false}
                      wide={pickedSheets.length === 1}
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

        {/* The rounds used to be listed here, read-only, round number beside
            course name. The itinerary behind the gear is the same list and
            editable, and the hub prints it a third time — three statements of
            one fact, the only one of which nobody could act on being this. */}

        {/* Anything that would make the trip unplayable — no leaderboard at
            all, a pairs draw with a team of three. Standing information
            rather than a gate: it used to be the small print under a
            Finalise button, and it is worth saying whether or not there is
            a button to disable. */}
        {canEdit && blocked && (
          <div className="px-4 py-3.5 bg-rust/10 border border-rust/40 rounded-xl">
            <p className="text-rust-deep text-sm leading-snug">{blocked}</p>
          </div>
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

        {/* The trip on paper. Quiet and last: it matters most once the trip
            is over — save the PDF, keep the record — which is also the first
            step of retiring an old trip. Everyone may look; it writes
            nothing. */}
        <div className="text-center">
          <Link
            href={`/trip/${trip.trip_code}/export`}
            className="inline-block px-4 py-2.5 t-label text-ink/65 hover:text-ink"
          >
            Export trip (PDF)
          </Link>
        </div>

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
