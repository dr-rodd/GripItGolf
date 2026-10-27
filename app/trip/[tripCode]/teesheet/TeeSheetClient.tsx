'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import InlineUnlock from '@/app/components/InlineUnlock'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import { IconPlus, IconX, IconUsers } from '@/app/components/icons'
import {
  type SlotPlayer, type RoundSheet, groupSlot, pickerUnits, unitMatches,
  sheetClock, sheetSlots, sheetGroupSize, describeRules, myTee, mayRemoveBooking,
} from '@/lib/teeSheet'
import { joinNames, firstName } from '@/lib/matchplayEntrants'
import {
  TAG_SET, untaggedIds, tagGateReason, dayTeamTagIssue,
} from '@/lib/tagBoards'
import { setTeam } from '@/lib/teamMembers'
import { PRESET_COLORS } from '@/lib/teamColors'
import { FIELD, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { courseLabel } from '@/lib/courseDirectory'

/**
 * The tee sheet on a phone: a full day is a long scroll, so every row is
 * condensed — the names stacked on the left, the time on the right, one
 * hairline between groups. Teammates in a slot gather into one block, side
 * by side at two or three and a 2×2 grid at four, because a team going out
 * together should read as one thing.
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

/** What a round's slots are grouped by, and whether it makes its own teams. */
type RoundTeams = {
  teamOf: Record<string, { teamId: string; teamName: string }>
  /** The sheet those teams stand on (lib/teamSets.ts `sheetForBoard`). */
  sheet: string
  /** A sheet belonging to this round alone — its teams are made here. */
  isDay: boolean
  teeTeamsSeparate: boolean
  /** The size the day's board asks for, when it asks for one. */
  teamSize: number | null
}

export default function TeeSheetClient({
  tripId, tripCode, rounds, players, initialAssignments,
  roundTeams, tagOf, playingForTags = false,
  hasTeamBoard, fieldMayEdit, fieldMaySet = false, passcodeHash = null,
  storageReady = true, meId = null, initialRoundId = null, isTrip = false, bookerRecorded = false,
}: {
  tripId: string
  tripCode: string
  rounds: Round[]
  players: { id: string; name: string }[]
  initialAssignments: Assignment[]
  /**
   * Per round, whose teams its slots group by. A day with its own team
   * board plays that day's fourballs; a day without plays the event's
   * teams for the week — `teamBoardForRound` decides, on the server.
   */
  roundTeams: Record<string, RoundTeams>
  /** Player id → the tag they carry, for the gate and the block's colour. */
  tagOf: Record<string, { teamId: string; teamName: string; color: string }>
  /** The event ranks tags, so a player without one cannot go on the sheet. */
  playingForTags?: boolean
  hasTeamBoard: boolean
  /** The `edit_tee_sheet` permission — each player picks their own time. */
  fieldMayEdit: boolean
  /** The `set_tee_sheets` permission — anyone may make the sheets, no PIN. */
  fieldMaySet?: boolean
  /** This phone's claimed player, who may pick their own time. */
  meId?: string | null
  /** The round to open on — the wizard sends people back to the one they made. */
  initialRoundId?: string | null
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
  const [search, setSearch] = useState('')

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
    }
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
            [id, { teamId: team.id, teamName: team.name }])),
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
    setTeamsByRound(prev => {
      const rest = { ...(prev[round.id]?.teamOf ?? {}) }
      for (const id of memberIds) delete rest[id]
      return { ...prev, [round.id]: { ...roundTeamInfo, teamOf: rest } }
    })
  }

  // On a board whose teammates share a tee time, the picker offers linked
  // teams as one stuck-together card and never their members alone. A day
  // that makes its own teams never does: nobody is linked to anybody until
  // the groups are on the sheet, which is the whole point of picking them
  // here.
  const teeTeamsSeparate = roundTeamInfo?.teeTeamsSeparate ?? false
  const together = hasTeamBoard && !teeTeamsSeparate && !roundTeamInfo?.isDay
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
                ? 'One player still needs a team'
                : `${untagged.length} players still need a team`}
            </p>
            <p className="text-ink/65 t-cap mt-1 leading-snug">
              The event ranks its teams, so these cannot go on the sheet yet:{' '}
              {untagged.map(id => nameOf.get(id)).filter(Boolean).join(' · ')}
            </p>
            <Link
              href={`/trip/${tripCode}/organiser/tags`}
              className="inline-block mt-2 t-cap text-accent-deep hover:text-accent transition-colors"
            >
              Set teams →
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

        {/* The way to the pairings, when the event has them. Adding a team
            as one — tap a partner, book the pair — arrives with the teams
            machinery; the door to picking them is already this one. */}
        {hasTeamBoard && (
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
                {teeTeamsSeparate
                  ? 'Teammates may go out in separate slots — every card feeds the board.'
                  : 'Partners share a tee time — teammates group together on the sheet.'}
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

                return (
                  <li key={i} className={`px-3.5 py-2.5 ${isMine ? 'bg-accent/[0.06]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      {/* Names on the left, stacked; a team is one block —
                          side by side at 2 or 3, a 2×2 grid at 4. */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        {slotPlayers.length === 0 && !mayBookOthers && !(selfPick && myUnitIds.length > 0) && (
                          <span className="t-cap text-ink/50 py-0.5">Open</span>
                        )}

                        {groups.map((g, gi) => (
                          g.teamId ? (
                            /* A linked team is one thing: on a share-a-tee
                               board its ✕ takes the whole block out, because
                               stuck together cuts both ways. Separate-play
                               boards keep the per-name ✕. */
                            <div
                              key={g.teamId}
                              className="rounded-lg bg-accent/[0.06] border border-accent/20 px-2 py-1.5 flex items-start gap-1"
                            >
                              <div
                                className={`flex-1 min-w-0 ${
                                  g.players.length === 4
                                    ? 'grid grid-cols-2 gap-x-3 gap-y-0.5'
                                    : 'flex flex-wrap items-center gap-x-3 gap-y-0.5'
                                }`}
                              >
                                {g.players.map(p => (
                                  <span key={p.id} className="flex items-center gap-1 min-w-0">
                                    <span className="t-card text-ink truncate">{p.name}</span>
                                    {mayRemove(p.id) && !together && (
                                      <button
                                        type="button"
                                        onClick={() => removePlayers(i, [p.id])}
                                        aria-label={`Remove ${p.name}`}
                                        className="flex-shrink-0 text-ink/50 hover:text-rust transition-colors p-0.5"
                                      >
                                        <IconX size={12} />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {together && g.players.every(p => mayRemove(p.id)) && (
                                <button
                                  type="button"
                                  onClick={() => removePlayers(i, g.players.map(p => p.id))}
                                  aria-label={`Remove ${g.teamName}`}
                                  className="flex-shrink-0 text-ink/50 hover:text-rust transition-colors p-0.5"
                                >
                                  <IconX size={12} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div key={`solo-${gi}`} className="flex flex-col gap-0.5">
                              {g.players.map(p => (
                                <span key={p.id} className="flex items-center gap-1 min-w-0">
                                  <span className="t-card text-ink truncate">{p.name}</span>
                                  {mayRemove(p.id) && (
                                    <button
                                      type="button"
                                      onClick={() => removePlayers(i, [p.id])}
                                      aria-label={`Remove ${p.name}`}
                                      className="flex-shrink-0 text-ink/50 hover:text-rust transition-colors p-0.5"
                                    >
                                      <IconX size={12} />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )
                        ))}

                        {mayBookOthers && storageReady && vacancy > 0 && !open && (
                          <button
                            type="button"
                            onClick={() => { setAdding(i); setSearch('') }}
                            className="self-start flex items-center gap-1 t-cap text-accent-deep hover:text-accent transition-colors py-0.5"
                          >
                            <IconPlus size={12} />
                            Add player{vacancy > 1 ? ` · ${vacancy} open` : ''}
                          </button>
                        )}

                        {/* A player picking their own time: join a time with
                            room for them (and their linked team), leave the
                            one they are in. Nobody else's name is theirs to
                            move. */}
                        {selfPick && storageReady && myUnitIds.length > 0 && vacancy >= myUnitIds.length && (
                          <button
                            type="button"
                            onClick={() => addPlayers(i, myUnitIds)}
                            className="self-start flex items-center gap-1 t-cap text-accent-deep hover:text-accent transition-colors py-0.5"
                          >
                            <IconPlus size={12} />
                            {myUnitIds.length > 1 ? 'Join with your team' : 'Join'}
                          </button>
                        )}
                        {selfPick && isMine && (
                          <button
                            type="button"
                            onClick={() => removePlayers(i, myLeavers(slotPlayers))}
                            className="self-start t-cap text-ink/65 hover:text-ink transition-colors py-0.5"
                          >
                            Leave this time
                          </button>
                        )}

                        {/* A day that plays its own teams makes them here.
                            The group standing in the slot is the team —
                            the fourball that is about to go out — so the
                            control is one tap rather than a picker. */}
                        {(organiser || (selfPick && isMine)) && roundTeamInfo?.isDay && slotPlayers.length >= 2 && (
                          untidyGroups(groups).length > 0 ? (
                            <button
                              type="button"
                              onClick={() => formTeam(i, slotPlayers)}
                              className="self-start flex items-center gap-1 t-cap text-accent-deep hover:text-accent transition-colors py-0.5"
                            >
                              <IconUsers size={12} />
                              Make this group a team
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => unformTeam(i, slotPlayers.map(p => p.id))}
                              className="self-start t-cap text-ink/50 hover:text-ink/80 transition-colors py-0.5"
                            >
                              Break the team up
                            </button>
                          )
                        )}
                      </div>

                      {/* The time, on the right — tabular so a column of
                          them reads as a column. */}
                      <span className="flex-shrink-0 t-card text-ink/80 tabular-nums pt-0.5">
                        {clock ?? `Group ${i + 1}`}
                      </span>
                    </div>

                    {/* A refused write says so in the slot it was refused
                        in. At the foot of the sheet it was a scroll away
                        from the tap, so a name appearing and vanishing read
                        as a glitch rather than as a message. */}
                    {error?.slot === i && (
                      <p className="text-rust-deep t-cap mt-1.5 leading-snug">{error.message}</p>
                    )}

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
