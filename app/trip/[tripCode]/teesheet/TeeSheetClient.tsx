'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import InlineUnlock from '@/app/components/InlineUnlock'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import { IconX, IconUsers } from '@/app/components/icons'
import {
  type SlotPlayer, type RoundSheet, groupSlot, seatGrid, pickerUnits, unitMatches,
  sheetClock, sheetSlots, sheetGroupSize, describeRules, myTee, mayRemoveBooking,
} from '@/lib/teeSheet'
import { joinNames, firstName } from '@/lib/matchplayEntrants'
import {
  TAG_SET, untaggedIds, tagGateReason, dayTeamTagIssue,
} from '@/lib/tagBoards'
import { setTeam } from '@/lib/teamMembers'
import { partnershipName } from '@/lib/partnerships'
import { matesLockedIn, toPlace, openTeamOnTime } from '@/lib/teamPicker'
import { boardNames } from '@/lib/displayNames'
import { deleteTeam, refreshTeamName } from '../teams/teamWrites'
import { PRESET_COLORS } from '@/lib/teamColors'
import { FIELD, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { courseLabel } from '@/lib/courseDirectory'
import TeeSeats, { type SeatAction } from './TeeSeats'

/**
 * The tee sheet on a phone reads like a day on a calendar (Ross, 31 Oct
 * 2026): the times down a gutter on the left, a hairline between them, and
 * each tee time's players in seats made for them — two across, a 2×2 grid
 * for a fourball, name and handicap — rather than a line that stretches.
 * Partners are one ticket, joined by a perforation; a player on their own
 * has a seat to themselves (`TeeSeats`, laid out by lib/teeSheet.ts
 * `seatGrid`). Open seats carry Join and Add player.
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
 * On a round that plays in partnerships (Ross, 27 Oct 2026, stage 4), a
 * player in no team who may make one is asked on Join: pick your team —
 * the team picker, with anybody on the time in no team already in it —
 * or just me. The picker sends them back here with the team, which this
 * screen then books onto the time (`placing`), once, with its own checks.
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

/**
 * The blocks in a slot that are not yet a team.
 *
 * A slot standing as one whole team has one block and no loose names;
 * anything else — nobody teamed, or two of four teamed and two not — still
 * has a group to make. That is the difference between offering "make this
 * group a team" and offering to break the one that is there.
 */
const untidyGroups = (groups: { teamId: string | null }[]) =>
  groups.filter(g => g.teamId === null)

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
}

export default function TeeSheetClient({
  tripId, tripCode, rounds, players, initialAssignments,
  roundTeams, tagOf, playingForTags = false,
  fieldMayEdit, fieldMaySet = false, passcodeHash = null,
  storageReady = true, meId = null, initialRoundId = null, isTrip = false, bookerRecorded = false,
  placing = null,
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
  /** Back from the team picker: a team, or one player, to put on a time. */
  placing?: { roundId: string; slot: number; teamId: string | null; playerId: string | null } | null
  /** A trip's sheet: its lead player and passcode, never an organiser and PIN. */
  isTrip?: boolean
  /**
   * Whether who booked each name is recorded (migration 065). Without it a
   * player books themselves only — there is no saying later whom else they
   * may change.
   */
  bookerRecorded?: boolean
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
  const [adding, setAdding] = useState<number | null>(null)
  // The slot whose Join is asking "pick your team, or just you?".
  const [joining, setJoining] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const router = useRouter()

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
   * This round's teams, kept in state because a day's are made here.
   *
   * The server sends every round's grouping; forming a team on the morning
   * has to show at once rather than after a refresh, so the map this
   * screen draws from is its own from then on.
   */
  const [teamsByRound, setTeamsByRound] = useState(roundTeams)
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
  async function addPlayers(slotIndex: number, playerIds: string[]) {
    if (!round) return
    setError(null)

    // The tag gate, checked before the write rather than after — the same
    // manners as `canJoinTeam` refusing a drag. A card that counts towards
    // nobody is worse than a name that would not go in, and the refusal
    // reads in the slot it was refused in.
    if (playingForTags) {
      const refusal = tagGateReason(playerIds, memberships, id => nameOf.get(id))
      if (refusal) {
        setError({ slot: slotIndex, message: refusal })
        return
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
    if (!err) return

    // Ask the database rather than assume. Somebody already on the sheet is
    // the one rejection that is not a failure — another phone got there
    // first, and the resync shows where they actually stand.
    const fresh = await resyncRound()
    if (fresh) {
      const landed = new Set(fresh.map(a => a.player_id))
      if (playerIds.every(id => landed.has(id))) return
    } else {
      const ids = new Set(playerIds)
      setAssignments(prev => prev.filter(a =>
        !(a.round_id === round.id && ids.has(a.player_id))))
    }
    calmError(slotIndex, err, playerIds.length > 1 ? 'add the team' : 'add the player')
  }

  /** One or several players out — a solo's ✕, or a linked block's. */
  async function removePlayers(slotIndex: number, playerIds: string[]) {
    if (!round) return
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
      return
    }
    await leaveRoundTeams(slotIndex, playerIds)
  }

  /**
   * Off the time and out of the round's team with it (Ross, 27 Oct 2026:
   * the organiser removing a player "will remove them from the
   * partnership"). Only where the round's partnerships are its own — the
   * group on the time is the team. A partnership kept for the whole event
   * leaves the time as one block and stays a partnership.
   *
   * A team left with one player is no team: they go back to a name on the
   * time, for whoever joins it next to make a team with.
   */
  async function leaveRoundTeams(slotIndex: number, playerIds: string[]) {
    const info = roundTeamInfo
    if (!round || !info?.isDay) return
    const leaving = new Set(playerIds.filter(id => info.teamOf[id]))
    if (leaving.size === 0) return
    const next = { ...info.teamOf }
    for (const teamId of new Set([...leaving].map(id => info.teamOf[id].teamId))) {
      const before = Object.keys(info.teamOf).filter(id => info.teamOf[id].teamId === teamId)
      const after = before.filter(id => !leaving.has(id))
      const out = after.length < 2 ? before : before.filter(id => leaving.has(id))
      for (const id of out) {
        const failure = await setTeam(tripId, id, info.sheet, null)
        if (failure) {
          calmError(slotIndex, failure.error as { message?: string; code?: string }, 'take them out of their team')
          return
        }
        delete next[id]
      }
      if (after.length < 2) {
        await deleteTeam({ tripId, sheet: info.sheet, teamId, memberIds: [] })
        continue
      }
      const stored = await refreshTeamName({
        tripId,
        team: { id: teamId, name: info.teamOf[before[0]].stored },
        before: before.map(id => nameOf.get(id) ?? ''),
        after: after.map(id => nameOf.get(id) ?? ''),
      })
      const teamName = partnershipName({ name: stored }, after.map(id => ({ id, name: nameOf.get(id) ?? '' })), shortOf)
      for (const id of after) next[id] = { teamId, teamName, stored }
    }
    setTeamsByRound(prev => ({ ...prev, [round.id]: { ...info, teamOf: next } }))
  }

  /**
   * A slot's players made into this day's team.
   *
   * The teams themselves are ordinary `teams` rows on the round's own
   * sheet (`day:<roundId>`), so `membersOf`, the scoring path and this
   * screen's own grouping all read them without knowing they were made on
   * a Tuesday morning. A player already in a team for this day leaves it
   * by joining the new one — the database's UNIQUE(player_id, team_set)
   * is the rule, and `setTeam` is the one writer of it.
   *
   * Named from its members, like a self-picked team: a fourball made on
   * the morning has no name anybody gave it. Coloured by the tag they
   * share when there is one, so the block reads as that side's group.
   */
  async function formTeam(slotIndex: number, slotPlayers: SlotPlayer[]) {
    if (!round || !roundTeamInfo?.isDay || slotPlayers.length < 2) return
    setError(null)
    const ids = slotPlayers.map(p => p.id)

    // A team's card counts towards one tag, so a team is of one tag.
    if (playingForTags) {
      const issue = dayTeamTagIssue(ids, memberships)
      if (issue) { setError({ slot: slotIndex, message: issue }); return }
    }

    const sheet = roundTeamInfo.sheet
    const name = joinNames(slotPlayers.map(p => firstName(p.name)))
    const color = tagOf[ids[0]]?.color
      ?? PRESET_COLORS[slotIndex % PRESET_COLORS.length]

    const { data: made, error: err } = await supabase
      .from('teams')
      .insert({ trip_id: tripId, team_set: sheet, name, color })
      .select('id, name')
      .single()
    if (err || !made) {
      calmError(slotIndex, err, 'make the team')
      return
    }

    const team = made as { id: string; name: string }
    for (const id of ids) {
      const failure = await setTeam(tripId, id, sheet, team.id)
      if (failure) {
        calmError(slotIndex, failure.error as { message?: string; code?: string }, 'make the team')
        return
      }
    }

    // Draw it at once: the grouping this screen reads is its own from
    // here, and a team that only appears after a refresh reads as a tap
    // that did nothing.
    setTeamsByRound(prev => ({
      ...prev,
      [round.id]: {
        ...roundTeamInfo,
        teamOf: {
          ...roundTeamInfo.teamOf,
          ...Object.fromEntries(ids.map(id =>
            [id, { teamId: team.id, teamName: team.name, stored: team.name }])),
        },
      },
    }))
  }

  /** This day's team broken up again — the members go back to loose names. */
  async function unformTeam(slotIndex: number, memberIds: string[]) {
    if (!round || !roundTeamInfo?.isDay) return
    setError(null)
    const sheet = roundTeamInfo.sheet

    for (const id of memberIds) {
      const failure = await setTeam(tripId, id, sheet, null)
      if (failure) {
        calmError(slotIndex, failure.error as { message?: string; code?: string }, 'break up the team')
        return
      }
    }
    // The team itself goes too — a team row with nobody in it is a blank
    // line on the round's leaderboard.
    const teamIds = new Set(memberIds.map(id => roundTeamInfo.teamOf[id]?.teamId).filter(Boolean) as string[])
    for (const teamId of teamIds) await deleteTeam({ tripId, sheet, teamId, memberIds: [] })
    setTeamsByRound(prev => {
      const rest = { ...(prev[round.id]?.teamOf ?? {}) }
      for (const id of memberIds) delete rest[id]
      return { ...prev, [round.id]: { ...roundTeamInfo, teamOf: rest } }
    })
  }

  // Where the round plays in partnerships, the picker offers each as one
  // stuck-together card and never its members alone. A day that makes its
  // own never does: nobody is linked to anybody until the groups are on the
  // sheet, which is the whole point of making them here.
  const together = !!roundTeamInfo && !roundTeamInfo.isDay
  const units = pickerUnits(unassigned, teamMap, together)
    .filter(u => unitMatches(u, search))

  // This phone's own place, and what joining would book: themselves, or on
  // a share-a-tee board their whole team still off the sheet — the same
  // unit the organiser's picker offers.
  const mine = live ? myTee(roundAssignments, meId, live, id => nameOf.get(id) ?? null) : null
  const myUnit = meId && !mine
    ? pickerUnits(unassigned, teamMap, together)
        .find(u => u.kind === 'solo' ? u.player.id === meId : u.players.some(p => p.id === meId))
    : undefined
  const myUnitIds = myUnit
    ? myUnit.kind === 'solo' ? [myUnit.player.id] : myUnit.players.map(p => p.id)
    : []
  /** Who leaving takes out of the slot: this player, or their whole linked block. */
  const myLeavers = (slotPlayers: SlotPlayer[]) => {
    const t = meId ? teamMap.get(meId) : undefined
    return together && t
      ? slotPlayers.filter(p => teamMap.get(p.id)?.teamId === t.teamId).map(p => p.id)
      : meId ? [meId] : []
  }
  const setupHref = round ? `/trip/${tripCode}/teesheet/${round.id}/setup` : null

  // A player in no team, on a round that plays in partnerships they may
  // make — a round's own wherever they book their own time, an event-long
  // one where the board lets the field pick — is asked on Join: pick your
  // team first, or just you (Ross, 27 Oct 2026).
  const asksForTeam = selfPick && !!meId && !!roundTeamInfo && !teamMap.has(meId)
    && (roundTeamInfo.isDay || roundTeamInfo.playersPick)
  const pickHref = (slot: number) =>
    round ? `/trip/${tripCode}/teams/pick?round=${encodeURIComponent(round.id)}&slot=${slot}` : '#'
  /** Those on a time in no team — the ones a team made for it starts with. */
  const looseOn = (slotPlayers: SlotPlayer[]) => {
    const myTag = meId ? tagOf[meId]?.teamId : undefined
    return slotPlayers.filter(p => !teamMap.has(p.id) && p.id !== meId
      && (!playingForTags || !myTag || tagOf[p.id]?.teamId === myTag))
  }

  // Back from the picker: the team (or the one player going alone) onto
  // the time they picked, once. The organiser's unlock is read straight
  // from the session here — the state that mirrors it arrives a render
  // later — and the address loses the request either way, so a refresh
  // never books twice.
  const placed = useRef(false)
  useEffect(() => {
    if (!placing || placed.current || !round || round.id !== placing.roundId || !live) return
    placed.current = true
    router.replace(`/trip/${tripCode}/teesheet?round=${encodeURIComponent(placing.roundId)}`, { scroll: false })
    const byOrganiser = hasUnlocked(tripCode) || !isLocked(passcodeHash)
    if (!storageReady || (!byOrganiser && !(fieldMayEdit && meId && !notYetOpen))) return
    const team = placing.teamId
      ? [...teamMap].filter(([, t]) => t.teamId === placing.teamId).map(([id]) => id)
      : placing.playerId ? [placing.playerId] : []
    const coming = toPlace(team, assignedIds)
    if (coming.length === 0) return
    const room = Math.max(0, groupSize - (slots.get(placing.slot)?.length ?? 0))
    if (coming.length > room) {
      setError({
        slot: placing.slot,
        message: placing.teamId
          ? 'Your team is made, but this time no longer has room for all of you — pick another.'
          : 'This time is full now — pick another.',
      })
      return
    }
    void addPlayers(placing.slot, coming)
    // Once, on arrival: everything it reads is what arrived with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing, round, live])

  // Who may take a name off, and who may book somebody else on: the
  // organiser anybody; a player booking their own times themselves and
  // those they booked (lib/teeSheet.ts `mayRemoveBooking`).
  const bookedBy = new Map(roundAssignments.map(a => [a.player_id, a.booked_by ?? null]))
  const mayRemove = (playerId: string) =>
    mayRemoveBooking({ organiser, meId, playersBook: selfPick }, { playerId, bookedBy: bookedBy.get(playerId) })
  const mayBookOthers = organiser || (selfPick && bookerRecorded)

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        <h1 className="t-h1 text-ink mb-1">
          Tee times
        </h1>
        <p className="text-ink/65 text-sm mb-2">
          {organiser
            ? 'Tap an open time to put a name in it.'
            : selfPick
              ? bookerRecorded
                ? 'Book a free time — Join for yourself, Add player to bring others.'
                : 'Pick a free time — tap Join.'
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

        {/* The way to the partnerships, where this round plays in them and
            they are made ahead (a round making its own makes them here, on
            the sheet). Partnerships are "teams" on screen. */}
        {together && (
          <Link
            href={`/trip/${tripCode}/teams`}
            className={`flex items-center gap-3 p-4 mb-5 ${cardClass('raised', true)}`}
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/[0.14] text-accent-deep flex items-center justify-center">
              <IconUsers size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-ink text-sm font-medium">Pick teams</span>
              <span className="block t-cap text-ink/65 mt-0.5">
                Each team plays together — it books its tee time as one.
              </span>
            </span>
          </Link>
        )}

        {/* One sheet per round; a one-round event skips the chips. */}
        {rounds.length > 1 && (
          <div className="-mx-4 px-4 -mt-2 pt-2 pb-2 mb-3 overflow-x-auto">
            <div className="flex gap-2 w-max">
              {rounds.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setRoundId(r.id); setAdding(null); setSearch('') }}
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
                const vacancy = Math.max(0, groupSize - slotPlayers.length)
                const clock = sheetClock(sheet, i)
                const isMine = !!mine && mine.slotIndex === i
                const groups = groupSlot(slotPlayers, teamMap)
                const open = adding === i

                // What this phone may do in the open seats, first seat first.
                const actions: SeatAction[] = []
                if (selfPick && storageReady && myUnitIds.length > 0 && vacancy >= myUnitIds.length) {
                  actions.push({
                    label: 'Join',
                    sub: myUnitIds.length > 1 ? 'with your team' : undefined,
                    onClick: () => (asksForTeam
                      ? setJoining(joining === i ? null : i)
                      : addPlayers(i, myUnitIds)),
                  })
                }
                if (mayBookOthers && storageReady && vacancy > 0) {
                  actions.push({ label: 'Add player', onClick: () => { setAdding(open ? null : i); setSearch('') } })
                }
                // "8:10 am" in the gutter as the hour over its half of the day.
                const cut = clock ? clock.lastIndexOf(' ') : -1
                const [hourMins, meridiem] = clock
                  ? cut > 0 ? [clock.slice(0, cut), clock.slice(cut + 1)] : [clock, '']
                  : [String(i + 1), 'Group']

                return (
                  <li key={i} className="grid grid-cols-[3.75rem_minmax(0,1fr)]">
                    {/* The time in the gutter, as a calendar keeps its hours. */}
                    <div className={`pl-3.5 pr-1.5 pt-3 border-r border-line ${isMine ? 'text-accent-deep' : 'text-ink/80'}`}>
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
                    {/* The seats: two across, a 2×2 grid for a fourball,
                        partners one ticket (lib/teeSheet.ts `seatGrid`). On
                        a share-a-tee board a team's ✕ takes the whole block
                        out, because stuck together cuts both ways; it sits
                        on the ticket's top right seat. */}
                    <TeeSeats
                      rows={seatGrid(groups, groupSize)}
                      handicapOf={id => handicapOf.get(id)}
                      meId={meId}
                      actions={actions}
                      removeFor={cell => {
                        if (cell.teamId && together) {
                          if (cell.joins.right || cell.joins.up) return null
                          const block = slotPlayers.filter(p => teamMap.get(p.id)?.teamId === cell.teamId).map(p => p.id)
                          if (!block.every(mayRemove)) return null
                          return {
                            ids: block,
                            label: `Remove ${teamMap.get(cell.player.id)?.teamName ?? cell.player.name}`,
                            onRemove: () => removePlayers(i, block),
                          }
                        }
                        if (!mayRemove(cell.player.id)) return null
                        return {
                          ids: [cell.player.id],
                          label: `Remove ${cell.player.name}`,
                          onRemove: () => removePlayers(i, [cell.player.id]),
                        }
                      }}
                    />

                    {/* Leaving, and a day's own teams — the time's other
                        doings, under its seats and only where they apply. */}
                    {((selfPick && isMine) || ((organiser || (selfPick && isMine)) && roundTeamInfo?.isDay && slotPlayers.length >= 2)) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {selfPick && isMine && (
                          <button
                            type="button"
                            onClick={() => removePlayers(i, myLeavers(slotPlayers))}
                            className="t-cap text-ink/65 hover:text-ink transition-colors py-0.5"
                          >
                            Leave this time
                          </button>
                        )}

                        {/* A day that plays its own teams makes them here.
                            The group standing in the slot is the team —
                            the fourball that is about to go out — so the
                            control is one tap rather than a picker. */}
                        {(organiser || (selfPick && isMine)) && roundTeamInfo?.isDay && slotPlayers.length >= 2 && (
                          untidyGroups(groups).length > 0 && slotPlayers.length > roundTeamInfo.cap ? (
                            /* More on the time than one team holds — a
                               pairs round's fourball — so which of them is
                               a team is a choice, made in the picker. */
                            <Link
                              href={pickHref(i)}
                              className="flex items-center gap-1 t-cap text-accent-deep hover:text-accent transition-colors py-0.5"
                            >
                              <IconUsers size={12} />
                              Pick a team from this time
                            </Link>
                          ) : untidyGroups(groups).length > 0 ? (
                            <button
                              type="button"
                              onClick={() => formTeam(i, slotPlayers)}
                              className="flex items-center gap-1 t-cap text-accent-deep hover:text-accent transition-colors py-0.5"
                            >
                              <IconUsers size={12} />
                              Make this group a team
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => unformTeam(i, slotPlayers.map(p => p.id))}
                              className="t-cap text-ink/50 hover:text-ink/80 transition-colors py-0.5"
                            >
                              Break the team up
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {/* A refused write says so in the slot it was refused
                        in. At the foot of the sheet it was a scroll away
                        from the tap, so a name appearing and vanishing read
                        as a glitch rather than as a message. */}
                    {error?.slot === i && (
                      <p className="text-rust-deep t-cap mt-1.5 leading-snug">{error.message}</p>
                    )}

                    {/* Join, on a round played in partnerships: the team
                        first, or just you. Whoever is on the time in no
                        team is in it, when they all fit — the picker
                        holds them there. */}
                    {joining === i && asksForTeam && (() => {
                      const loose = looseOn(slotPlayers)
                      const names = joinNames(loose.map(p => p.name))
                      // A part-filled team on the time is joined, as the picker will.
                      const openTeamId = openTeamOnTime(
                        Object.entries(roundTeamInfo!.teamOf).map(([player_id, t]) => ({ team_id: t.teamId, team_set: roundTeamInfo!.sheet, player_id })),
                        roundTeamInfo!.sheet, slotPlayers.map(p => p.id), roundTeamInfo!.cap,
                      )
                      const openTeam = groups.find(g => g.teamId && g.teamId === openTeamId)
                      const lockedIn = matesLockedIn(
                        { mates: loose.map(p => p.id), onSlot: slotPlayers.map(p => p.id) },
                        { organiser: false, meId }, 0, roundTeamInfo!.cap,
                      )
                      return (
                        <div className="mt-2 rounded-xl border border-line bg-cream p-3">
                          <p className="text-ink text-sm font-medium">Playing in a team?</p>
                          <p className="t-cap text-ink/65 mt-0.5 leading-snug">
                            {openTeam
                              ? `${openTeam.teamName} ${openTeam.players.length === 1 ? 'is' : 'are'} on this time with room — you’ll be in their team.`
                              : loose.length === 0
                              ? 'Pick your team first, then you all go on this time together.'
                              : lockedIn
                                ? `${names} ${loose.length === 1 ? 'is' : 'are'} on this time and will be in your team.`
                                : `${names} are on this time — pick who is in your team.`}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Link href={pickHref(i)} className={buttonClass('primary', false, true)}>
                              Pick your team
                            </Link>
                            <button
                              type="button"
                              onClick={() => { setJoining(null); addPlayers(i, myUnitIds) }}
                              className={buttonClass('secondary', false, true)}
                            >
                              Just me
                            </button>
                          </div>
                        </div>
                      )
                    })()}

                    {/* The picker: a filter and the unassigned field, the
                        course-select manner in miniature. Stays open while
                        the slot still has room, so a fourball is four taps. */}
                    {open && (
                      <div className="mt-2 rounded-xl border border-line bg-cream p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Find a player…"
                            className={`${FIELD} field-dense flex-1 min-w-0`}
                          />
                          <button
                            type="button"
                            onClick={() => setAdding(null)}
                            aria-label="Close"
                            className="flex-shrink-0 text-ink/50 hover:text-ink/80 transition-colors p-1.5"
                          >
                            <IconX size={14} />
                          </button>
                        </div>
                        {units.length === 0 ? (
                          <p className="t-cap text-ink/65 px-1 py-1.5">
                            {unassigned.length === 0
                              ? 'Everyone is on the sheet.'
                              : 'Nobody by that name still needs a time.'}
                          </p>
                        ) : (
                          <ul className="max-h-48 overflow-y-auto space-y-1">
                            {units.map(u => {
                              if (u.kind === 'solo') {
                                const p = u.player
                                return (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      disabled={vacancy === 0}
                                      onClick={() => {
                                        addPlayers(i, [p.id])
                                        if (vacancy <= 1) setAdding(null)
                                      }}
                                      className="w-full text-left px-2 py-2 rounded-lg text-ink text-sm hover:bg-tint transition-colors disabled:opacity-40"
                                    >
                                      {p.name}
                                      {!together && teamMap.get(p.id) && (
                                        <span className="t-cap text-ink/65 ml-2">
                                          {teamMap.get(p.id)!.teamName}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                )
                              }

                              // A linked team, offered as one stuck-together
                              // card — the same tinted block it becomes in
                              // the slot. Tapping books everyone in it.
                              const fits = u.players.length <= vacancy
                              return (
                                <li key={u.teamId}>
                                  <button
                                    type="button"
                                    disabled={!fits}
                                    onClick={() => {
                                      addPlayers(i, u.players.map(p => p.id))
                                      if (vacancy - u.players.length <= 0) setAdding(null)
                                    }}
                                    className="w-full text-left px-2 py-2 rounded-lg bg-accent/[0.06] border border-accent/20 transition-colors hover:border-accent/40 disabled:opacity-40"
                                  >
                                    <span className="block text-ink text-sm">
                                      {joinNames(u.players.map(p => firstName(p.name)))}
                                    </span>
                                    <span className="block t-cap text-ink/65 mt-0.5">
                                      {fits
                                        ? `${u.players.length === 2 ? 'Pair' : `Team of ${u.players.length}`} — added together`
                                        : `Needs ${u.players.length} spots`}
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )}
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
