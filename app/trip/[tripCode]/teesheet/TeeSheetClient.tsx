'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import InlineUnlock from '@/app/components/InlineUnlock'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import {
  type SlotPlayer, type RoundSheet, type SeatCell, type SeatTarget, type PickerUnit,
  SEATS_ACROSS, groupSlot, seatGrid, seatTargets, listName, pickerUnits, unitMatches,
  sheetClock, sheetSlots, sheetGroupSize, describeRules, myTee, mayRemoveBooking,
} from '@/lib/teeSheet'
import {
  type DraftSeat, type BookingLink,
  draftFrom, nextSeat, mayChoose, placeUnit, takeOut, vacate, playingWith, draftRows, bookingPlan,
} from '@/lib/teeBooking'
import { joinNames } from '@/lib/matchplayEntrants'
import {
  TAG_SET, untaggedIds, tagGateReason, dayTeamTagIssue,
} from '@/lib/tagBoards'
import { setTeam } from '@/lib/teamMembers'
import { partnershipName, type TeeMode } from '@/lib/partnerships'
import { madeTeamName } from '@/lib/teamPicker'
import { boardNames } from '@/lib/displayNames'
import { createTeam, deleteTeam, refreshTeamName } from '../teams/teamWrites'
import { PRESET_COLORS } from '@/lib/teamColors'
import { putt, reducedMotion } from '@/lib/motion'
import { HEADER_H } from '@/app/components/headerMetrics'
import { frozenSlots, lockClock } from '@/lib/teeFreeze'
import { useTeeFreeze } from './useTeeFreeze'
import { FIELD, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { courseLabel } from '@/lib/courseDirectory'
import TeeSeats from './TeeSeats'

/**
 * The tee sheet on a phone reads like a day on a calendar (Ross, 31 Oct
 * 2026): the times down a gutter on the left, a hairline between them, and
 * each tee time's players in seats made for them — two across, a 2×2 grid
 * for a fourball, name and handicap — rather than a line that stretches.
 * Partners are one ticket; a player on their own has a seat to themselves
 * (`TeeSeats`, laid out by lib/teeSheet.ts `seatGrid`).
 *
 * One sheet per tee-sheet round, and a round's sheet is live only once it
 * has been made in the wizard (lib/teeSheet.ts `roundSheet`): until then
 * the round shows a vacant slot with the way to make it — the PIN asked
 * there, unless the event lets anyone make the sheets (`set_tee_sheets`),
 * in which case a live sheet carries an Edit button into the wizard too.
 *
 * Who places players (Ross, 26 Oct 2026): the organiser, whoever has
 * unlocked the PIN in this session — read from the same sessionStorage the
 * PasscodeGate writes, after mount, because the server cannot see it and
 * deciding during render would tear hydration — puts anybody anywhere.
 * When the event lets players book their own times (`edit_tee_sheet`, the
 * default — "medium security", Ross, 26 Oct 2026), this phone's claimed
 * player books themselves and anyone they bring, and moves or removes only
 * themselves and those they booked (lib/teeSheet.ts `mayRemoveBooking`,
 * `tee_assignments.booked_by`); otherwise the sheet is read-only to
 * everybody else.
 *
 * Writes are one row per player per round (`tee_assignments`, migration
 * 050) — adding and removing are single-row inserts and deletes, so two
 * phones editing at once interleave instead of clobbering, and the unique
 * constraint makes the same player in two slots impossible however the
 * taps race.
 *
 * Booking is done in place (Ross, 1 Nov 2026). A + presses down under the
 * thumb; let go and the tee time lifts to the top of the screen with the
 * players to pick from beneath it, the seats filling as they are picked —
 * a player booking starts in the seat they tapped, and the seat the next
 * pick goes in is marked. On a round played in partnerships the seats are
 * the linking: a row of two on a pairs time is a pairing, everybody on a
 * team time one team (lib/partnerships.ts `teeMode`), and saving makes
 * them durable partnerships, the same team rows the team picker makes
 * (lib/teeBooking.ts `bookingPlan`). A knockout's pairings book as drawn.
 * Taking somebody off a round whose partnerships are its own takes them
 * out of that round's team as well.
 */

type Round = {
  id: string
  roundNumber: number
  courseName: string | null
  /** Vacant, live from the wizard's rules, or made before the wizard. */
  sheet: RoundSheet
  /** When a live sheet opens to the field — "Thu 30 Oct at 8:00 pm" — or null once it has. */
  opensLabel: string | null
}

/** `booked_by`: who booked them on — absent before migration 065, null for the organiser's. */
type Assignment = { round_id: string; player_id: string; slot_index: number; booked_by?: string | null }

/** A tee time being booked: which, its draft seats, and a seat the booker tapped. */
type Booking = {
  slot: number
  draft: DraftSeat[]
  tapped: number | null
  /** Players already on the time taken off it in this booking. */
  removed: string[]
  /** Who was on the time when it was opened — Save checks the database still says so. */
  start: string[]
  /**
   * Why it is open: a + tapped; your own time's Edit (Ross, 1 Nov 2026: in
   * place of the old leave button — leave with your ✕, or change it); or from
   * Leave on the Teams page, to leave a partnership — the one way a
   * partnership kept for the whole event is left from the sheet.
   */
  purpose: 'book' | 'edit' | 'leave'
}

/** How long the tee time takes to lift to the top — a wizard step's figure. */
const LIFT_MS = 340

/**
 * A round's partnerships (lib/partnerships.ts): what its slots are grouped
 * by, and whether it makes its own. Absent for a round without any — its
 * players go out as they please.
 */
type RoundTeams = {
  /** Player → their partnership, named as one ("Ross & Dave"), and the name it is stored under. */
  teamOf: Record<string, { teamId: string; teamName: string; stored: string }>
  /** The sheet those partnerships stand on (lib/teamSets.ts `sheetForBoard`). */
  sheet: string
  /** A sheet belonging to this round alone — its partnerships are made here. */
  isDay: boolean
  /** The size the board asks for, when it asks for one. */
  teamSize: number | null
  /** The most a team made here may hold — never more than a tee time. */
  cap: number
  /** The board lets the field pick its own teams (`teamPick: 'self'`). */
  playersPick: boolean
  /** How a tee time binds its players — pairs, one team, or separate (lib/partnerships.ts `teeMode`). */
  mode: TeeMode
  /** A knockout's pairings — booked as drawn, never re-made here. */
  fixed: boolean
}

export default function TeeSheetClient({
  tripId, tripCode, rounds, players, initialAssignments,
  roundTeams, tagOf, playingForTags = false,
  fieldMayEdit, fieldMaySet = false, passcodeHash = null,
  storageReady = true, meId = null, initialRoundId = null, isTrip = false, bookerRecorded = false,
  addedRecorded = false, editSlot = null,
}: {
  tripId: string
  tripCode: string
  rounds: Round[]
  /** The field, with each handicap index for the seats (null = not given yet). */
  players: { id: string; name: string; handicap?: number | null }[]
  initialAssignments: Assignment[]
  /**
   * Per round, its partnerships, where it has any. A day with its own team
   * board plays that day's; a day without plays the governing board's for
   * the whole event — `roundPartnership` decides, on the server.
   */
  roundTeams: Record<string, RoundTeams>
  /** Player id → the tag they carry, for the gate and the block's colour. */
  tagOf: Record<string, { teamId: string; teamName: string; color: string }>
  /** The event ranks tags, so a player without one cannot go on the sheet. */
  playingForTags?: boolean
  /** The `edit_tee_sheet` permission — each player picks their own time. */
  fieldMayEdit: boolean
  /** The `set_tee_sheets` permission — anyone may make the sheets, no PIN. */
  fieldMaySet?: boolean
  /** This phone's claimed player, who may pick their own time. */
  meId?: string | null
  /** The round to open on — the wizard sends people back to the one they made. */
  initialRoundId?: string | null
  /**
   * A tee time to open for changing, on arrival — the Teams page sends a
   * player leaving a partnership here, to do it on the sheet and put a
   * replacement in (Ross, 1 Nov 2026).
   */
  editSlot?: number | null
  /** A trip's sheet: its lead player and passcode, never an organiser and PIN. */
  isTrip?: boolean
  /**
   * Whether who booked each name is recorded (migration 065). Without it a
   * player books themselves only — there is no saying later whom else they
   * may change.
   */
  bookerRecorded?: boolean
  /** Who put each player in their team is recorded (migration 066). */
  addedRecorded?: boolean
  /** For the inline organiser unlock; null when the event has no PIN. */
  passcodeHash?: string | null
  /** False when the assignments table could not be read — nothing will save. */
  storageReady?: boolean
}) {
  const [roundId, setRoundId] = useState<string | null>(
    rounds.find(r => r.id === initialRoundId)?.id ?? rounds[0]?.id ?? null,
  )
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  // The failure and the slot it happened in — a message about a name has to
  // appear beside that name, not at the foot of a sheet that may be a long
  // scroll away.
  const [error, setError] = useState<{ slot: number; message: string } | null>(null)
  // The tee time being booked, and its search — one at a time.
  const [booking, setBooking] = useState<Booking | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const slotRefs = useRef(new Map<number, HTMLLIElement>())

  // The organiser's PIN unlock, read after mount — sessionStorage does not
  // exist on the server, and a render that reads it would tear hydration.
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  // The organiser places anybody — the PIN unlocked here, or an event
  // with no PIN at all, the soft lock's fail-open. A player picking their
  // own time places themselves and nobody else.
  const organiser = unlocked || !isLocked(passcodeHash)
  const selfPickAllowed = !organiser && fieldMayEdit && !!meId

  const round = rounds.find(r => r.id === roundId) ?? null
  const sheet = round?.sheet ?? { state: 'vacant' as const }
  const live = sheet.state !== 'vacant' ? sheet : null
  // Not open to the field yet: the organiser sees it and may place players
  // early; everybody else is told when it opens, and nothing more.
  const notYetOpen = !!live && !!round?.opensLabel
  const fieldBarred = notYetOpen && !organiser
  const selfPick = selfPickAllowed && !notYetOpen
  const groupSize = live ? sheetGroupSize(live) : 0
  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const handicapOf = useMemo(() => new Map(players.map(p => [p.id, p.handicap ?? null])), [players])
  const shortOf = useMemo(() => boardNames(players), [players])

  /**
   * A tee time is locked while one phone books it (Ross, 1 Nov 2026: it
   * does not matter whose, only that it is) — lib/teeFreeze.ts. Every
   * other phone sees "Locked by another user" at once; when it thaws they
   * read the sheet again. A booking's lock is two minutes, counted down
   * for the booker: "Time to complete booking · 1:42".
   */
  const router = useRouter()
  const freeze = useTeeFreeze(
    tripId,
    !!live && storageReady,
    lifted => { if (lifted === roundId) router.refresh() },
    // Two tapped it together and the other phone came first: the booking
    // closes, and the time simply reads Locked like any other — no second
    // line saying so, which outlived the lock (Ross, 2 Nov 2026).
    () => {
      setBooking(null)
      setSearch('')
      setError(null)
    },
  )
  // A lock runs out, so the sheet looks again now and then while another
  // phone holds one.
  const [now, setNow] = useState(() => Date.now())
  const othersFreezing = freeze.freezes.some(f => f.key !== freeze.key)
  useEffect(() => {
    if (!othersFreezing) return
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [othersFreezing])
  // Back from another app or a locked screen, the clock is read at once —
  // timers sleep with the page, and a lock that ran out meanwhile is gone.
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') setNow(Date.now()) }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  const frozen = round ? frozenSlots(freeze.freezes, round.id, freeze.key, now) : new Set<number>()

  // The booker's two minutes, counted down each second; at nought the
  // booking closes and the time unlocks — never in the middle of a save.
  const savingNow = useRef(false)
  useEffect(() => { savingNow.current = saving }, [saving])
  const timedUntil = freeze.held?.timed ? freeze.held.until : null
  const timedSlot = freeze.held?.slot ?? null
  const { release } = freeze
  useEffect(() => {
    if (timedUntil === null || timedSlot === null) return
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t < timedUntil || savingNow.current) return
      setBooking(null)
      setSearch('')
      release()
      setError({ slot: timedSlot, message: 'Your two minutes ran out — tap the time again to carry on.' })
    }, 1000)
    return () => clearInterval(timer)
  }, [timedUntil, timedSlot, release])

  /**
   * This round's teams, kept in state because a day's are made here.
   *
   * The server sends every round's grouping; forming a team on the morning
   * has to show at once rather than after a refresh, so the map this
   * screen draws from is its own from then on.
   */
  const [teamsByRound, setTeamsByRound] = useState(roundTeams)
  // Read again from the server — another phone's freeze lifted, so a time
  // may have changed — the sheet starts from what it was sent.
  const [sent, setSent] = useState({ initialAssignments, roundTeams })
  if (sent.initialAssignments !== initialAssignments || sent.roundTeams !== roundTeams) {
    setSent({ initialAssignments, roundTeams })
    setAssignments(initialAssignments)
    setTeamsByRound(roundTeams)
  }
  const roundTeamInfo = roundId ? teamsByRound[roundId] ?? null : null
  const teamMap = useMemo(
    () => new Map(Object.entries(roundTeamInfo?.teamOf ?? {})),
    [roundTeamInfo],
  )

  // The tags, for the gate and for what a formed team is named and coloured.
  const memberships = useMemo(
    () => Object.entries(tagOf).map(([player_id, t]) => ({
      team_id: t.teamId, team_set: TAG_SET, player_id,
    })),
    [tagOf],
  )
  const untagged = useMemo(
    () => (playingForTags ? untaggedIds(players.map(p => p.id), memberships) : []),
    [playingForTags, players, memberships],
  )

  // This round's slots, in assignment order within each.
  const roundAssignments = useMemo(
    () => assignments.filter(a => a.round_id === roundId),
    [assignments, roundId],
  )
  const slots = useMemo(() => {
    const map = new Map<number, SlotPlayer[]>()
    for (const a of roundAssignments) {
      const name = nameOf.get(a.player_id)
      if (!name) continue
      const list = map.get(a.slot_index) ?? []
      list.push({ id: a.player_id, name })
      map.set(a.slot_index, list)
    }
    return map
  }, [roundAssignments, nameOf])

  const assignedIds = useMemo(
    () => new Set(roundAssignments.map(a => a.player_id)),
    [roundAssignments],
  )
  const unassigned = useMemo(
    () => players.filter(p => !assignedIds.has(p.id)),
    [players, assignedIds],
  )

  const maxAssigned = roundAssignments.reduce((m, a) => Math.max(m, a.slot_index), -1)
  const count = round ? sheetSlots(sheet, players.length, maxAssigned) : 0

  /**
   * What a rejected write is allowed to say. The raw error goes to the
   * console for whoever is diagnosing; the screen gets a sentence that
   * names the cause where the cause is knowable — a sheet that has nowhere
   * to save reads very differently from a tap that needs repeating, and
   * "try again" on the first is advice that can never work.
   */
  function calmError(slot: number, err: { message?: string; code?: string } | null, doing: string) {
    console.error(`Tee sheet: could not ${doing}`, err)
    const message = err?.message ?? ''
    setError({
      slot,
      message: /relation|schema cache|does not exist/i.test(message)
        ? `Could not ${doing} — the tee sheet's database update has not been applied yet.`
        : /permission denied|row-level security/i.test(message)
          ? `Could not ${doing} — the database refused the change.`
          : `Could not ${doing} — try again`,
    })
  }

  /**
   * What the database actually holds for this round, after a write that did
   * not go as expected. Truth beats both halves of a guess: a rejected
   * batch changed nothing, a rejected-looking one may have landed, and
   * another phone may have moved somebody while this one was typing.
   * Returns false when even the read fails, so the caller can fall back to
   * putting its own optimistic rows back.
   */
  async function resyncRound(): Promise<Assignment[] | null> {
    if (!round) return null
    const { data, error: err } = await supabase
      .from('tee_assignments')
      .select(bookerRecorded ? 'round_id, player_id, slot_index, booked_by' : 'round_id, player_id, slot_index')
      .eq('trip_id', tripId)
      .eq('round_id', round.id)
      .order('created_at')
    if (err || !data) return null
    const fresh = data as unknown as Assignment[]
    setAssignments(prev => [...prev.filter(a => a.round_id !== round.id), ...fresh])
    return fresh
  }

  /**
   * One or several players into a slot — a solo, or a whole linked team.
   * One batch insert, one INSERT statement, so a race with another phone
   * books all of a team or none of it, never half.
   */
  async function addPlayers(slotIndex: number, playerIds: string[]): Promise<boolean> {
    if (!round) return false
    setError(null)

    // The tag gate, checked before the write rather than after — the same
    // manners as `canJoinTeam` refusing a drag. A card that counts towards
    // nobody is worse than a name that would not go in, and the refusal
    // reads in the slot it was refused in.
    if (playingForTags) {
      const refusal = tagGateReason(playerIds, memberships, id => nameOf.get(id))
      if (refusal) {
        setError({ slot: slotIndex, message: refusal })
        return false
      }
    }

    // Who booked them: this phone's player, or nobody for the organiser
    // placing names without one — named only once the column exists.
    const next: Assignment[] = playerIds.map(id => ({
      round_id: round.id, player_id: id, slot_index: slotIndex,
      ...(bookerRecorded ? { booked_by: meId ?? null } : {}),
    }))
    setAssignments(prev => [...prev, ...next])

    const { error: err } = await supabase
      .from('tee_assignments')
      .insert(next.map(a => ({ trip_id: tripId, ...a })))
    if (!err) return true

    // Ask the database rather than assume. Somebody already on the sheet is
    // the one rejection that is not a failure — another phone got there
    // first, and the resync shows where they actually stand.
    const fresh = await resyncRound()
    if (fresh) {
      const landed = new Set(fresh.map(a => a.player_id))
      if (playerIds.every(id => landed.has(id))) return true
    } else {
      const ids = new Set(playerIds)
      setAssignments(prev => prev.filter(a =>
        !(a.round_id === round.id && ids.has(a.player_id))))
    }
    calmError(slotIndex, err, playerIds.length > 1 ? 'add the team' : 'add the player')
    return false
  }

  /** Players off the time in the database — the partnerships are the caller's. */
  async function deleteAssignments(slotIndex: number, playerIds: string[]): Promise<boolean> {
    if (!round) return false
    setError(null)
    const ids = new Set(playerIds)
    const prev = assignments
    setAssignments(p => p.filter(a =>
      !(a.round_id === round.id && ids.has(a.player_id))))

    const { error: err } = await supabase
      .from('tee_assignments')
      .delete()
      .eq('trip_id', tripId)
      .eq('round_id', round.id)
      .in('player_id', playerIds)

    if (err) {
      if (!(await resyncRound())) setAssignments(prev)
      calmError(slotIndex, err, playerIds.length > 1 ? 'remove the team' : 'remove the player')
      return false
    }
    return true
  }

  /**
   * One or several players out — a solo's ✕, or a linked block's. Off a
   * round whose partnerships are its own they leave its team with it (Ross,
   * 27 Oct 2026: the organiser removing a player "will remove them from the
   * partnership"); a partnership kept for the whole event leaves the time as
   * one block and stays a partnership.
   */
  async function removePlayers(slotIndex: number, playerIds: string[]) {
    if (!round) return
    // Under the time's freeze, like every write to it, so the other phones
    // read it again once it is done.
    freeze.hold(round.id, slotIndex)
    try {
      if (!(await deleteAssignments(slotIndex, playerIds))) return
      const info = roundTeamInfo
      if (!info?.isDay) return
      const next = await leaveTeams(slotIndex, playerIds, info.teamOf, info)
      if (next) setTeamsByRound(prev => ({ ...prev, [round.id]: { ...info, teamOf: next } }))
    } finally {
      freeze.release()
    }
  }

  /**
   * Players out of their partnerships, on a copy of the round's team map,
   * returned — or null where a write failed (said in the slot). On a
   * round's own sheet a team left with one is no team: its last player
   * goes back to a name on the time for whoever joins it next. On an
   * event-long sheet the one left keeps the team, waiting for the
   * replacement that joins them.
   */
  async function leaveTeams(
    slotIndex: number,
    playerIds: string[],
    teamOf: RoundTeams['teamOf'],
    info: RoundTeams,
  ): Promise<RoundTeams['teamOf'] | null> {
    const leaving = new Set(playerIds.filter(id => teamOf[id]))
    const next = { ...teamOf }
    for (const teamId of new Set([...leaving].map(id => teamOf[id].teamId))) {
      const before = Object.keys(teamOf).filter(id => teamOf[id].teamId === teamId)
      const after = before.filter(id => !leaving.has(id))
      const dissolve = after.length < (info.isDay ? 2 : 1)
      for (const id of dissolve ? before : before.filter(id => leaving.has(id))) {
        const failure = await setTeam(tripId, id, info.sheet, null)
        if (failure) {
          calmError(slotIndex, failure.error as { message?: string; code?: string }, 'take them out of their team')
          return null
        }
        delete next[id]
      }
      if (dissolve) {
        await deleteTeam({ tripId, sheet: info.sheet, teamId, memberIds: [] })
        continue
      }
      const stored = await refreshTeamName({
        tripId,
        team: { id: teamId, name: teamOf[before[0]].stored },
        before: before.map(id => nameOf.get(id) ?? ''),
        after: after.map(id => nameOf.get(id) ?? ''),
      })
      const teamName = partnershipName({ name: stored }, after.map(id => ({ id, name: nameOf.get(id) ?? '' })), shortOf)
      for (const id of after) next[id] = { teamId, teamName, stored }
    }
    return next
  }

  /**
   * The partnerships a booking's seats make, kept as durable team rows on
   * the round's sheet — the same rows the team picker writes, through the
   * one writer, `setTeam` (lib/teeBooking.ts `bookingPlan` decides which).
   * A pairing joins the team already waiting for a partner, else is a new
   * team named from its players and coloured by their tag where they have
   * one. Somebody moved out of another team leaves it renamed, or gone
   * where nobody is left — and on a round's own sheet a team left with one
   * is no team. Works on a copy of the round's team map and returns it, or
   * null where a write failed.
   *
   * Who put each player in is recorded (migration 066): this phone's player
   * for their own picks, nobody for the organiser's, and nobody for a player
   * who was already on the time — they are in by where they stood, so the
   * newcomer cannot take them out again.
   */
  async function linkPartnerships(
    slotIndex: number,
    links: BookingLink[],
    picked: ReadonlySet<string>,
    start: RoundTeams['teamOf'],
    info: RoundTeams,
  ): Promise<RoundTeams['teamOf'] | null> {
    const teamOf = { ...start }
    const membersOf = (teamId: string) => Object.keys(teamOf).filter(id => teamOf[id].teamId === teamId)
    const names = (ids: string[]) => ids.map(id => nameOf.get(id) ?? '')
    const shown = (stored: string, ids: string[]) =>
      partnershipName({ name: stored }, ids.map(id => ({ id, name: nameOf.get(id) ?? '' })), shortOf)

    for (const link of links) {
      let teamId = link.teamId
      let stored = teamId ? teamOf[membersOf(teamId)[0]]?.stored ?? '' : ''
      const before = teamId ? membersOf(teamId) : []
      if (!teamId) {
        const colour = tagOf[link.members[0]]?.color ?? PRESET_COLORS[slotIndex % PRESET_COLORS.length]
        const made = await createTeam(tripId, info.sheet, madeTeamName(names(link.members)), colour)
        if (!made) {
          setError({ slot: slotIndex, message: 'Booked — but could not link them as a team. Try again from their seats.' })
          return null
        }
        teamId = made.id
        stored = made.name
      }
      const leaving = new Map<string, string[]>()
      for (const id of link.members) {
        const was = teamOf[id]?.teamId
        if (was === teamId) continue
        const failure = await setTeam(tripId, id, info.sheet, teamId,
          addedRecorded ? (picked.has(id) && !organiser ? meId : null) : undefined)
        if (failure) {
          calmError(slotIndex, failure.error as { message?: string; code?: string }, 'link the team')
          return null
        }
        if (was) leaving.set(was, [...(leaving.get(was) ?? []), id])
        teamOf[id] = { teamId, teamName: '', stored }
      }
      // The teams people came from: renamed, or gone where nobody (or, on a
      // round's own sheet, only one) is left.
      for (const [oldId, gone] of leaving) {
        const was = [...membersOf(oldId), ...gone]
        const left = membersOf(oldId)
        if (left.length === 0 || (info.isDay && left.length < 2)) {
          for (const id of left) { await setTeam(tripId, id, info.sheet, null); delete teamOf[id] }
          await deleteTeam({ tripId, sheet: info.sheet, teamId: oldId, memberIds: [] })
          continue
        }
        const oldStored = teamOf[left[0]].stored
        const renamed = await refreshTeamName({ tripId, team: { id: oldId, name: oldStored }, before: names(was), after: names(left) })
        for (const id of left) teamOf[id] = { teamId: oldId, teamName: shown(renamed, left), stored: renamed }
      }
      const after = membersOf(teamId)
      if (link.teamId) {
        stored = await refreshTeamName({ tripId, team: { id: teamId, name: stored }, before: names(before), after: names(after) })
      }
      for (const id of after) teamOf[id] = { teamId, teamName: shown(stored, after), stored }
    }
    return teamOf
  }

  // How this round's tee times bind (lib/partnerships.ts `teeMode`): pairs,
  // one team a time, or everybody their own. An event-long partnership is
  // offered as one unit and leaves a time as one block.
  const mode: TeeMode = roundTeamInfo?.mode ?? 'separate'
  const fixed = roundTeamInfo?.fixed ?? false
  const together = !!roundTeamInfo && !roundTeamInfo.isDay
  // A team time holds one team: threes on a fourball sheet leave the fourth place empty.
  const seatsOnTime = mode === 'team' ? Math.min(groupSize, roundTeamInfo?.cap ?? groupSize) : groupSize

  // This phone's own place.
  const mine = live ? myTee(roundAssignments, meId, live, id => nameOf.get(id) ?? null) : null
  const setupHref = round ? `/trip/${tripCode}/teesheet/${round.id}/setup` : null

  // Who may take a name off, and who may book somebody else on: the
  // organiser anybody; a player booking their own times themselves and
  // those they booked (lib/teeSheet.ts `mayRemoveBooking`).
  const bookedBy = new Map(roundAssignments.map(a => [a.player_id, a.booked_by ?? null]))
  const mayRemove = (playerId: string) =>
    mayRemoveBooking({ organiser, meId, playersBook: selfPick }, { playerId, bookedBy: bookedBy.get(playerId) })
  const mayBookOthers = organiser || (selfPick && bookerRecorded)
  // A + for this phone: the organiser always; a player while they have a
  // time to book, or may bring somebody.
  const mayBook = storageReady && (organiser || (selfPick && (!mine || mayBookOthers)))

  /** A tee time's seats, as it stands. */
  const rowsFor = (slotPlayers: SlotPlayer[]) => seatGrid(groupSlot(slotPlayers, teamMap), seatsOnTime, mode)

  /** Whether a player has a partner: a team of one is a person on their own (Ross, 1 Nov 2026). */
  const partnered = (playerId: string) => {
    const t = teamMap.get(playerId)?.teamId
    return !!t && [...teamMap.values()].filter(x => x.teamId === t).length > 1
  }

  /** The units the list offers: players on no time this round, a partnership as one. */
  const allUnits = useMemo(
    () => pickerUnits(unassigned, teamMap, mode !== 'separate'),
    [unassigned, teamMap, mode],
  )
  const idsOf = (u: PickerUnit) => (u.kind === 'solo' ? [u.player.id] : u.players.map(p => p.id))
  const draftUnit = (u: PickerUnit) => (u.kind === 'solo' ? [u.player] : u.players)
    .map(p => ({ id: p.id, name: p.name, teamId: teamMap.get(p.id)?.teamId ?? null }))

  /**
   * Why a unit cannot go in the seat the next pick goes in, or null: the
   * tag gate, a team being all one tag, and a knockout's pairings as drawn.
   */
  function unitIssue(u: PickerUnit, draft: DraftSeat[], at: number | null): string | null {
    const ids = idsOf(u)
    if (playingForTags) {
      const gate = tagGateReason(ids, memberships, id => nameOf.get(id))
      if (gate) return 'Needs a tag first'
      if (at !== null && mode !== 'separate') {
        const issue = dayTeamTagIssue([...playingWith(draft, mode, at), ...ids], memberships)
        if (issue) return 'Plays for another tag'
      }
    }
    if (fixed && mode === 'pairs' && at !== null) {
      const mate = playingWith(draft, mode, at)[0]
      const mateTeam = mate ? teamMap.get(mate)?.teamId : undefined
      if (mate && ids.some(id => teamMap.get(id)?.teamId !== mateTeam)) return 'Drawn with someone else'
    }
    return null
  }

  /**
   * Opening a tee time to book: the draft from its seats as they stand,
   * a player booking starting in the seat they tapped (with their partners
   * still off the sheet, where they fit), and the time lifted to the top.
   * Joining a player on their own never quietly re-pairs somebody already
   * partnered — they pick themselves from the list if they mean to. A team
   * of one is nobody's partner yet, so its player joins like anyone else.
   */
  /** Who is on a time, as drawn. */
  const onTime = (rows: SeatCell[][]) => rows.flat().flatMap(c => (c.kind === 'player' ? [c.player.id] : []))

  /**
   * Whether this phone may open a time: not while another phone has it
   * locked — the time already says so. Opening it locks it here — a
   * booking for two minutes, counted down (`timed`); an edit while it is
   * being changed.
   */
  function claim(slot: number, timed: boolean): boolean {
    if (!round || frozen.has(slot)) return false
    freeze.hold(round.id, slot, timed)
    setNow(Date.now())
    return true
  }

  function openBooking(slot: number, rows: SeatCell[][], seat: number, target: SeatTarget) {
    if (!claim(slot, true)) return
    let draft = draftFrom(rows)
    if (selfPick && meId && !assignedIds.has(meId)) {
      const unit = allUnits.find(u => idsOf(u).includes(meId))
      const myTeam = teamMap.get(meId)?.teamId ?? null
      if (unit && !unitIssue(unit, draft, seat)) {
        if (target.kind === 'join') {
          const theirs = teamMap.get(target.with)?.teamId ?? null
          if (fixed ? myTeam !== null && myTeam === theirs : !partnered(meId) || myTeam === theirs) {
            draft = placeUnit(draft, [{ id: meId, name: nameOf.get(meId) ?? '', teamId: myTeam }], mode, seat) ?? draft
          }
        } else {
          draft = placeUnit(draft, draftUnit(unit), mode, seat)
            ?? placeUnit(draft, [{ id: meId, name: nameOf.get(meId) ?? '', teamId: myTeam }], mode, seat)
            ?? draft
        }
      }
    }
    setError(null)
    setSearch('')
    setBooking({ slot, draft, tapped: draft[seat] === null ? seat : null, removed: [], start: onTime(rows), purpose: 'book' })
    liftTo(slot)
  }

  /** Your own time opened to change: leave with your ✕, or put somebody in. */
  function openEdit(slot: number, rows: SeatCell[][]) {
    if (!claim(slot, false)) return
    setError(null)
    setSearch('')
    setBooking({ slot, draft: draftFrom(rows), tapped: null, removed: [], start: onTime(rows), purpose: 'edit' })
    liftTo(slot)
  }

  /**
   * Who taking a seat's player off the time takes with them, or null where
   * this phone may not: this booking's own pick alone; somebody already on
   * it alone — out of their pairing too — except a partnership kept for the
   * whole event, which comes off as one block and stays a partnership,
   * unless this is its player leaving it (from the Teams page).
   */
  function takeOff(b: Booking, seat: number): string[] | null {
    const c = b.draft[seat]
    if (!c || c === 'none') return null
    if (c.isNew) return [c.id]
    const block = together && c.teamId && b.purpose !== 'leave'
      ? b.draft.flatMap(d => (d && d !== 'none' && !d.isNew && d.teamId === c.teamId ? [d.id] : []))
      : [c.id]
    return block.every(mayRemove) ? block : null
  }

  /**
   * The tee time jumps out to the top of the screen, under the header, to
   * make room for the list beneath it (Ross, 1 Nov 2026) — on the putt
   * curve, a wizard step's length; at once under Reduce Motion.
   */
  function liftTo(slot: number) {
    requestAnimationFrame(() => {
      const el = slotRefs.current.get(slot)
      if (!el) return
      const from = window.scrollY
      const to = Math.max(0, el.getBoundingClientRect().top + from - HEADER_H - 8)
      if (reducedMotion() || Math.abs(to - from) < 2) { window.scrollTo(0, to); return }
      const begin = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - begin) / LIFT_MS)
        window.scrollTo(0, from + (to - from) * putt(t))
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }

  // Arriving to change a partnership: that time opened and lifted, once.
  // Nothing is written until Save, so opening it again on a refresh is
  // harmless.
  const editOpened = useRef(false)
  useEffect(() => {
    if (editOpened.current || editSlot === null || !live || !round || round.id !== initialRoundId) return
    editOpened.current = true
    freeze.hold(round.id, editSlot)
    const rows = rowsFor(slots.get(editSlot) ?? [])
    setBooking({ slot: editSlot, draft: draftFrom(rows), tapped: null, removed: [], start: onTime(rows), purpose: 'leave' })
    liftTo(editSlot)
    // Once, on arrival: what it reads is what arrived with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function closeBooking() {
    setBooking(null)
    setSearch('')
    freeze.release()
  }

  // Every change to an edit keeps its lock from going idle.
  const { touch } = freeze
  useEffect(() => { if (booking) touch() }, [booking, touch])

  /**
   * Saving the draft, in order: anybody taken off comes off the time and
   * out of their partnership — a round's own pairings; an event-long one
   * only when its player is leaving it, from the Teams page; a knockout's
   * never, booked as drawn — then the bookings, through the sheet's own
   * `addPlayers`; then the partnerships the seats now make.
   */
  async function saveBooking() {
    if (!booking || saving || !round) return
    const info = roundTeamInfo
    setSaving(true)
    // The database first: if the time changed since it was opened —
    // another phone got in before the freeze reached this one — nothing
    // is written, and the time is shown as it now stands.
    const fresh = await resyncRound()
    if (!fresh) {
      setError({ slot: booking.slot, message: 'Could not save — try again.' })
      setSaving(false)
      return
    }
    const nowOn = new Set(fresh.filter(a => a.slot_index === booking.slot).map(a => a.player_id))
    if (nowOn.size !== booking.start.length || booking.start.some(id => !nowOn.has(id))) {
      setSaving(false)
      closeBooking()
      setError({ slot: booking.slot, message: 'This time changed while you were booking — here it is now.' })
      router.refresh()
      return
    }
    let teamOf = info?.teamOf ?? {}
    if (booking.removed.length > 0) {
      if (!(await deleteAssignments(booking.slot, booking.removed))) { setSaving(false); return }
      if (info && !fixed && (info.isDay || booking.purpose === 'leave')) {
        const after = await leaveTeams(booking.slot, booking.removed, teamOf, info)
        if (!after) { setSaving(false); return }
        teamOf = after
      }
    }
    // Plan against the teams as they now stand: a partner left waiting is
    // still in their team on an event-long sheet, and in none on a day's.
    const draft = booking.draft.map(c => (c && c !== 'none' ? { ...c, teamId: teamOf[c.id]?.teamId ?? null } : c))
    const sizeOf = (teamId: string) => Object.values(teamOf).filter(t => t.teamId === teamId).length
    const { book, links } = bookingPlan(draft, mode, fixed, sizeOf)
    const landed = book.length === 0 || await addPlayers(booking.slot, book)
    const linked = landed && info && links.length > 0
      ? await linkPartnerships(booking.slot, links, new Set(book), teamOf, info)
      : teamOf
    if (info && (booking.removed.length > 0 || links.length > 0)) {
      setTeamsByRound(prev => ({ ...prev, [round.id]: { ...info, teamOf: linked ?? teamOf } }))
    }
    setSaving(false)
    if (landed && linked) closeBooking()
  }


  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        <h1 className="t-h1 text-ink mb-1">
          Tee times
        </h1>
        <p className="text-ink/65 text-sm mb-2">
          {organiser
            ? 'Tap a + to put players on a time.'
            : selfPick
              ? mode === 'pairs'
                ? 'Tap a + beside a player to join their pairing, or in an empty row to start one.'
                : 'Tap a + to book a time.'
              : fieldMayEdit
                ? 'Claim your name to pick a time.'
                : `Who goes off when. The ${isTrip ? 'lead player' : 'organiser'} sets the groups.`}
        </p>
        {fieldMayEdit && !meId && !organiser && (
          <Link
            href={`/trip/${tripCode}/players`}
            className="inline-block mb-2 t-cap text-accent-deep hover:text-accent transition-colors"
          >
            Claim your spot →
          </Link>
        )}

        {/* Nowhere to save. Said once, at the top, before anybody spends a
            minute tapping names that cannot stick — the assignments read
            failed, so the sheet is empty because the table is missing, not
            because the field has no times yet. */}
        {!storageReady && (
          <div className="bg-rust/[0.06] border border-rust/25 rounded-2xl p-4 mb-4">
            <p className="text-ink text-sm font-medium">The sheet cannot save yet</p>
            <p className="text-ink/65 t-cap mt-1 leading-snug">
              Names added here won&apos;t stick until a database update is applied.
            </p>
          </div>
        )}

        {/* Tags are in play and somebody has not got one. Said at the top,
            for the same reason the storage warning is: a name refused at
            the moment it is tapped, with the reason in a slot somebody has
            scrolled past, reads as the sheet being broken. */}
        {untagged.length > 0 && (
          <div className="bg-rust/[0.06] border border-rust/25 rounded-2xl p-4 mb-4">
            <p className="text-ink text-sm font-medium">
              {untagged.length === 1
                ? 'One player still needs a tag'
                : `${untagged.length} players still need a tag`}
            </p>
            <p className="text-ink/65 t-cap mt-1 leading-snug">
              The event ranks its tags, so these cannot go on the sheet yet:{' '}
              {untagged.map(id => nameOf.get(id)).filter(Boolean).join(' · ')}
            </p>
            <Link
              href={`/trip/${tripCode}/organiser/tags`}
              className="inline-block mt-2 t-cap text-accent-deep hover:text-accent transition-colors"
            >
              Set tags →
            </Link>
          </div>
        )}

        {/* The reported bug, closed: an organiser whose session had not
            passed the PasscodeGate saw a read-only sheet with no way in.
            The unlock is offered here, in place — same PIN, same session
            memory as every other gate. */}
        {!organiser && passcodeHash && (
          <div className="mb-4">
            <InlineUnlock
              tripCode={tripCode}
              passcodeHash={passcodeHash}
              onUnlocked={() => setUnlocked(true)}
              prompt={isTrip ? 'Lead player? Enter the passcode to place players.' : 'Organiser? Enter your PIN to place players.'}
            />
          </div>
        )}
        {organiser && <div className="mb-3" /> }

        {/* One sheet per round; a one-round event skips the chips. */}
        {rounds.length > 1 && (
          <div className="-mx-4 px-4 -mt-2 pt-2 pb-2 mb-3 overflow-x-auto">
            <div className="flex gap-2 w-max">
              {rounds.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setRoundId(r.id); closeBooking() }}
                  className={optionClass(r.id === roundId, 'tile')}
                >
                  <span className="block t-label">Round {r.roundNumber}</span>
                  {r.courseName && (
                    <span className="block t-cap text-ink/65 mt-0.5">{courseLabel(r.courseName)}</span>
                  )}
                  {r.sheet.state === 'vacant' && (
                    <span className="block t-cap text-ink/65 mt-0.5">Not open yet</span>
                  )}
                  {r.sheet.state !== 'vacant' && r.opensLabel && (
                    <span className="block t-cap text-ink/65 mt-0.5">Opens {r.opensLabel}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {!round ? (
          <p className="t-cap text-ink/65 text-center py-8">
            No round starts from a tee sheet yet.
          </p>
        ) : !live ? (
          /* The vacant slot: tee times are on for this round, and nobody
             has made its sheet yet. The way to the wizard, the PIN asked
             there unless anyone may make the sheets. */
          <div className={`p-4 ${cardClass()}`}>
            <p className="t-card text-ink">Round {round.roundNumber}&apos;s tee sheet isn&apos;t open yet</p>
            <p className="t-cap text-ink/65 mt-1 leading-snug">
              Once it is, everybody can see who goes off when.
            </p>
            <Link href={setupHref!} className={`${buttonClass('secondary')} mt-4`}>
              Open the tee sheet
            </Link>
            {!fieldMaySet && isLocked(passcodeHash) && !unlocked && (
              <p className="t-cap text-ink/65 mt-2 text-center">
                {isTrip ? 'Asks for the Trip Setup passcode.' : 'Asks for the organiser PIN.'}
              </p>
            )}
          </div>
        ) : fieldBarred ? (
          /* Opened for later: the field is told when, and nothing more. */
          <div className={`p-4 ${cardClass()}`}>
            <p className="t-card text-ink">Round {round.roundNumber}&apos;s tee sheet opens {round.opensLabel}</p>
            <p className="t-cap text-ink/65 mt-1 leading-snug">
              {fieldMayEdit ? 'Pick your time here once it opens.' : 'Who goes off when shows here once it opens.'}
            </p>
            {fieldMaySet && (
              <Link href={setupHref!} className={`${buttonClass('secondary')} mt-4`}>
                Edit the tee sheet
              </Link>
            )}
          </div>
        ) : (
          <>
            {notYetOpen && (
              <p className="t-cap text-ink/80 mb-3 leading-snug">
                Opens to the field {round.opensLabel}. Until then only you can see it.
              </p>
            )}

            {/* Your time, before the scroll: when, and who with. */}
            {mine && (
              <div className={`px-4 py-3 mb-3 ${cardClass('raised')}`}>
                <p className="t-cap text-ink/65">{mine.clock ? 'You’re off at' : 'You’re in'}</p>
                <p className="font-serif text-2xl t-num text-ink mt-0.5">
                  {mine.clock ?? `Group ${mine.slotIndex + 1}`}
                </p>
                <p className="t-cap text-ink/80 mt-0.5 leading-snug">
                  {mine.partners.length > 0 ? `With ${joinNames(mine.partners)}` : 'Nobody else in your group yet.'}
                </p>
              </div>
            )}

            {live.state === 'legacy' && live.startTime === null && (
              <p className="t-cap text-ink/65 mb-3 leading-snug">
                Groups are numbered until the organiser sets a start time.
              </p>
            )}

            {/* Open to everyone: the sheet's own rules are anybody's to change. */}
            {fieldMaySet && (
              <div className="flex justify-end mb-2">
                <Link href={setupHref!} className={`${buttonClass('secondary', false, true)}`}>
                  Edit the tee sheet
                </Link>
              </div>
            )}

            <ol className={`divide-y divide-line ${cardClass()}`}>
              {Array.from({ length: count }, (_, i) => {
                const slotPlayers = slots.get(i) ?? []
                const clock = sheetClock(sheet, i)
                const isMine = !!mine && mine.slotIndex === i
                const rows = rowsFor(slotPlayers)
                const here = booking?.slot === i ? booking : null
                const next = here ? nextSeat(here.draft, mode, here.tapped) : null
                // The + signs this phone may tap. A knockout's lone player
                // is joined only by the partner the draw gave them.
                // Frozen: another phone is booking it, so this one waits.
                const isFrozen = frozen.has(i) && !here
                const targets = mayBook && !isFrozen
                  ? seatTargets(rows, mode).map(t => {
                    if (!t || t.kind !== 'join' || !fixed) return t
                    const theirs = teamMap.get(t.with)?.teamId
                    return theirs && unassigned.some(p => teamMap.get(p.id)?.teamId === theirs) ? t : null
                  })
                  : undefined
                // "8:10 am" in the gutter as the hour over its half of the day.
                const cut = clock ? clock.lastIndexOf(' ') : -1
                const [hourMins, meridiem] = clock
                  ? cut > 0 ? [clock.slice(0, cut), clock.slice(cut + 1)] : [clock, '']
                  : [String(i + 1), 'Group']

                return (
                  <li
                    key={i}
                    ref={el => { if (el) slotRefs.current.set(i, el); else slotRefs.current.delete(i) }}
                    className={`grid grid-cols-[3.75rem_minmax(0,1fr)] transition-shadow duration-200 ${
                      here ? 'relative z-10 bg-surface rounded-card shadow-floating' : ''
                    }`}
                  >
                    {/* The time in the gutter, as a calendar keeps its hours. */}
                    <div className={`pl-3.5 pr-1.5 pt-3 border-r border-line ${isMine || here ? 'text-accent-deep' : 'text-ink/80'}`}>
                      {clock ? (
                        <>
                          <span className="block t-label tabular-nums">{hourMins}</span>
                          <span className="block text-[13px] leading-tight opacity-80">{meridiem}</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-[13px] leading-tight opacity-80">{meridiem}</span>
                          <span className="block t-label tabular-nums">{hourMins}</span>
                        </>
                      )}
                    </div>

                    <div className="min-w-0 p-2.5">
                    {here ? (
                      /* Being booked: the draft, the next seat marked. */
                      <TeeSeats
                        rows={draftRows(here.draft, mode)}
                        handicapOf={id => handicapOf.get(id)}
                        meId={meId}
                        booking={{
                          next,
                          mayChoose: seat => mayChoose(here.draft, seat),
                          // This booking's picks, and anybody already on the
                          // time this phone may take off (medium security).
                          mayTakeOut: seat => takeOff(here, seat) !== null,
                          onTakeOut: seat => {
                            const c = here.draft[seat]
                            const ids = takeOff(here, seat)
                            if (!c || c === 'none' || !ids) return
                            if (c.isNew) { setBooking({ ...here, draft: takeOut(here.draft, seat), tapped: seat }); return }
                            let draft = here.draft
                            const removed = [...here.removed]
                            for (let k = 0; k < draft.length; k++) {
                              const d = draft[k]
                              if (!d || d === 'none' || !ids.includes(d.id)) continue
                              const { draft: after, off } = vacate(draft, k)
                              draft = after
                              if (off) removed.push(off)
                            }
                            setBooking({ ...here, draft, tapped: seat, removed })
                          },
                          onChoose: seat => { if (mayChoose(here.draft, seat)) setBooking({ ...here, tapped: seat }) },
                        }}
                      />
                    ) : (
                      /* The seats: two across, a 2×2 grid for a fourball,
                         partners one ticket (lib/teeSheet.ts `seatGrid`). On
                         a share-a-tee board a team's ✕ takes the whole ticket
                         out, because stuck together cuts both ways; it sits
                         on the ticket's top right seat. */
                      <div className={`transition-opacity duration-200 ${isFrozen ? 'opacity-50' : ''}`}>
                      <TeeSeats
                        rows={rows}
                        handicapOf={id => handicapOf.get(id)}
                        meId={meId}
                        targets={targets}
                        onTarget={(seat, t) => openBooking(i, rows, seat, t)}
                        // Not while this phone books a time: a ✕ writes
                        // under its own freeze, which would let go of that
                        // booking's.
                        removeFor={isFrozen || booking ? undefined : (cell, seat) => {
                          const block = cell.teamId && together
                            ? slotPlayers.filter(p => teamMap.get(p.id)?.teamId === cell.teamId).map(p => p.id)
                            : [cell.player.id]
                          if (block.length > 1) {
                            // One ✕ for the ticket, on its top right seat.
                            const seats = rows.flat().flatMap((c, k) => (c.kind === 'player' && block.includes(c.player.id) ? [k] : []))
                            const rowOf = (k: number) => Math.floor(k / SEATS_ACROSS)
                            const corner = seats.sort((a, b) => rowOf(a) - rowOf(b) || b - a)[0]
                            if (seat !== corner || !block.every(mayRemove)) return null
                            return {
                              label: `Remove ${teamMap.get(cell.player.id)?.teamName ?? cell.player.name}`,
                              onRemove: () => removePlayers(i, block),
                            }
                          }
                          if (!mayRemove(cell.player.id)) return null
                          return { label: `Remove ${cell.player.name}`, onRemove: () => removePlayers(i, [cell.player.id]) }
                        }}
                      />
                      </div>
                    )}

                    {isFrozen && (
                      <p className="t-cap text-ink/65 mt-2" role="status">Locked by another user</p>
                    )}

                    {!here && !isFrozen && selfPick && isMine && (
                      <button
                        type="button"
                        onClick={() => openEdit(i, rows)}
                        className="t-cap text-accent-deep hover:text-accent transition-colors py-0.5 mt-2"
                      >
                        Edit
                      </button>
                    )}

                    {/* A refused write says so in the slot it was refused
                        in. At the foot of the sheet it was a scroll away
                        from the tap, so a name appearing and vanishing read
                        as a glitch rather than as a message. A locked time
                        says Locked and nothing else. */}
                    {error?.slot === i && !isFrozen && (
                      <p className="text-rust-deep t-cap mt-1.5 leading-snug">{error.message}</p>
                    )}

                    {/* The list beneath the lifted time: who can go on it,
                        a partnership as one ("Ross & Dave", "Ross, Dave,
                        Seán"). Saving sits above the box, so the keyboard
                        never covers it; the box asks for no keyboard until
                        it is tapped. */}
                    {here && (() => {
                      const inDraft = new Set(here.draft.filter((c): c is Exclude<DraftSeat, null | 'none'> => !!c && c !== 'none').map(c => c.id))
                      const offered = allUnits
                        .filter(u => !idsOf(u).some(id => inDraft.has(id)))
                        .filter(u => mayBookOthers || idsOf(u).includes(meId ?? ''))
                      const shownUnits = offered.filter(u => unitMatches(u, search))
                      const picks = here.draft.filter(c => !!c && c !== 'none' && c.isNew).length + here.removed.length
                      return (
                        <div className="mt-3">
                          {here.purpose === 'book' && timedUntil !== null && (
                            <p className="t-cap text-ink/65 mb-2 tabular-nums" role="timer">
                              Time to complete booking · {lockClock(timedUntil - now)}
                            </p>
                          )}
                          {here.purpose !== 'book' && (
                            <p className="t-cap text-ink/80 mb-3 leading-snug">
                              {here.purpose === 'leave'
                                ? 'Take yourself off with your ✕, and put in whoever is taking your place.'
                                : mayBookOthers
                                  ? 'Take yourself off with your ✕ to leave, or put somebody in from the list.'
                                  : 'Take yourself off with your ✕ to leave.'}
                            </p>
                          )}
                          <div className="flex gap-2 mb-3">
                            <button
                              type="button"
                              onClick={saveBooking}
                              disabled={saving || picks === 0}
                              className={`${buttonClass('primary', false, true)} flex-1`}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" onClick={closeBooking} className={buttonClass('secondary', false, true)}>
                              Cancel
                            </button>
                          </div>
                          {offered.length > 6 && (
                            <input
                              type="text"
                              value={search}
                              onChange={e => setSearch(e.target.value)}
                              placeholder="Find a player…"
                              aria-label="Find a player"
                              className={`${FIELD} field-dense w-full mb-2`}
                            />
                          )}
                          {next === null && (
                            <p className="t-cap text-ink/65 py-1.5">This time is full — save, or take somebody out.</p>
                          )}
                          {offered.length === 0 ? (
                            <p className="t-cap text-ink/65 py-1.5">
                              {mayBookOthers ? 'Everyone has a time.' : 'You have a time already.'}
                            </p>
                          ) : (
                            <ul className="max-h-[50vh] overflow-y-auto space-y-1">
                              {shownUnits.map(u => {
                                const ids = idsOf(u)
                                const issue = unitIssue(u, here.draft, next)
                                const fits = !issue && placeUnit(here.draft, draftUnit(u), mode, next) !== null
                                const label = u.kind === 'solo'
                                  ? u.player.name
                                  : listName(u.players.map(p => shortOf.get(p.id) ?? p.name))
                                return (
                                  <li key={ids.join('|')}>
                                    <button
                                      type="button"
                                      disabled={!fits}
                                      onClick={() => {
                                        const placed = placeUnit(here.draft, draftUnit(u), mode, next)
                                        if (placed) setBooking({ ...here, draft: placed, tapped: null })
                                      }}
                                      className={`press w-full text-left px-3 py-2.5 rounded-tile transition-colors disabled:opacity-40 ${
                                        u.kind === 'solo' ? 'hover:bg-tint' : 'bg-tint hover:bg-accent-tint'
                                      }`}
                                    >
                                      <span className="block t-label text-ink truncate">{label}</span>
                                      {issue && <span className="block t-cap text-ink/65">{issue}</span>}
                                    </button>
                                  </li>
                                )
                              })}
                              {shownUnits.length === 0 && (
                                <li className="t-cap text-ink/65 px-1 py-1.5">Nobody by that name still needs a time.</li>
                              )}
                            </ul>
                          )}
                        </div>
                      )
                    })()}
                    </div>
                  </li>
                )
              })}
            </ol>

            <p className="t-cap text-ink/65 mt-4 leading-snug">
              {live.state === 'active'
                ? `${describeRules(live.rules)}.`
                : `${live.intervalMins} minutes between groups · groups of up to ${live.groupSize}`}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
