import { eventReader } from '@/lib/eventReader'
import { overallOf, sessionBoardFor, sessionSlotCount } from '@/lib/sessions'
import { tripHomeAt } from '@/lib/tripPaths'
import { eventTags } from '@/lib/tagBoards'
import OrderOfPlayList from '../order/OrderOfPlayList'
import { buildMatchSheets, sessionTimes } from '../session/matchSheets'
import { readSessionCards, readSessionMatchRows } from '../session/sessionMatches'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../kind'
import { parseLeaderboards, tagsInPlay } from '@/lib/leaderboards'
import { roundLabelOf } from '@/lib/eventShape'
import { parseLeagueSetup } from '@/lib/leagueSetup'
import { roundPartnership, partnershipName, teeMode, partnershipsFixed, MAX_PARTNERSHIP, type TeeMode } from '@/lib/partnerships'
import { roundPickerSheet } from '@/lib/teamPicker'
import { boardNames } from '@/lib/displayNames'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { readAllRows } from '@/lib/allRows'
import { parseStartFormat } from '@/lib/eventHub'
import { describeOpening, roundSheet, sheetIsOpen } from '@/lib/teeSheet'
import { currentPlayer } from '@/lib/currentPlayer'
import { isConfirmed } from '@/lib/roster'
import { readSheetSettings } from './sheets'
import { TAG_SET } from '@/lib/tagBoards'
import BackButton from '@/app/components/BackButton'
import TeeSheetClient from './TeeSheetClient'
import { isLocked } from '@/lib/passcode'

export const dynamic = 'force-dynamic'

/**
 * The Tee times tab — who goes off when, a sheet per tee-sheet round.
 *
 * An event's, and a trip's that has turned tee times on — the fourth tab
 * in Stats' place (lib/eventHub.ts `fourthTab`). Only rounds
 * that start from a tee sheet are on it, each vacant until its sheet is
 * made in the wizard (lib/teeSheet.ts `roundSheet`). Everything comes down
 * in one batch; the sheet settings and the assignments table ride in their
 * own fail-soft queries, so an un-migrated database shows vacant rounds
 * rather than no page.
 *
 * Who may do what is decided on the client, deliberately: the field's
 * rights come from two permissions (read here) — picking their own time,
 * and making the sheets — and the organiser's from the PIN unlock this
 * device already holds, which lives in this phone's storage and only the
 * browser can see.
 */
export default async function TeeSheetPage({ params, searchParams }: {
  params: Promise<{ root: string; tripCode: string }>
  searchParams: Promise<{ round?: string; edit?: string }>
}) {
  const [{ root, tripCode }, { round: initialRoundId, edit }] = await Promise.all([params, searchParams])
  const db = eventReader(tripCode)
  const tripHome = tripHomeAt(root, tripCode)
  // A tee time to open for changing, from the Teams page (stage 2).
  const editSlot = initialRoundId && edit && /^\d{1,3}$/.test(edit) ? Number(edit) : null

  // The kind alongside, for the words only — a trip's sheet speaks of its
  // lead player and passcode.
  const [kind, { data: trip, error }] = await Promise.all([
    fetchTripKind(tripCode),
    db
      .from('trips')
      .select('id, trip_code, name, leaderboards, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
  ])
  if (error) console.error('TeeSheetPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center paper px-6">
        <p className="t-h2 text-ink mb-3">Not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  // An event's, or a trip's since tee times reached trips (Ross, 26 Oct
  // 2026) — the same sheet, the same two answers, read from the same column.

  // Whose partnerships a slot is showing is a per-round question: a day
  // with its own team board plays that day's, and a day without plays the
  // governing board's for the whole event — and only the governing board's
  // (lib/partnerships.ts `roundPartnership`, the one copy). This page used
  // to take the first team board it found, primary or not.
  //
  // The teams and memberships are fetched for the whole trip either way,
  // so the client can group any round without a second trip to the server.
  const boards = parseLeaderboards(trip.leaderboards)
  const anyTeamBoard = boards.some(b => b.audience === 'team' && !b.tagMode)
  const playingForTags = tagsInPlay(boards)

  const [
    roundsResult, itemsResult, playersResult, settingsResult,
    assignmentsResult, permsResult, setupNamesResult, teamsResult, membersResult, bookersResult, addedResult,
  ] = await Promise.all([
    db
      .from('rounds')
      .select('id, round_number, itinerary_item_id, start_format, scheduled_date, courses(name)')
      .eq('trip_id', trip.id)
      .order('round_number'),
    db
      .from('itinerary_items')
      .select('id, tee_time')
      .eq('trip_id', trip.id)
      .eq('kind', 'golf'),
    db
      .from('players')
      .select('id, name, claimed, handicap, gender')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
    // Each round's sheet settings — the wizard's rules and the older two
    // columns, each fail-soft on its own.
    readSheetSettings(db, trip.id),
    // The assignments, fail-soft the same way — pre-050 the sheet is empty
    // and the first write says calmly what is missing.
    // Read whole: one row per player per round, so a long league with a
    // sheet passes Supabase's 1,000-row cap, and a seat past it would look
    // empty (lib/allRows.ts). UNIQUE (round_id, player_id) ends the order.
    readAllRows<{ round_id: string; player_id: string; slot_index: number; created_at: string }>(
      () => db
        .from('tee_assignments')
        .select('round_id, player_id, slot_index, created_at', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('created_at').order('round_id').order('player_id'),
      a => `${a.round_id}|${a.player_id}`,
    ),
    db
      .from('trips')
      .select('event_permissions')
      .eq('id', trip.id)
      .single(),
    // A league's round names, in a read of their own — fail soft.
    db
      .from('trips')
      .select('bracket_setup')
      .eq('id', trip.id)
      .maybeSingle(),
    // Every sheet's teams and memberships — the week's, each day's, and
    // the tags. Fetched whenever any of the three could be in play, so a
    // round can be grouped, a team formed and the tag gate answered
    // without a second trip.
    anyTeamBoard || playingForTags
      ? db.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id)
      : Promise.resolve({ data: null, error: null }),
    anyTeamBoard || playingForTags
      ? db.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id)
      : Promise.resolve({ data: null, error: null }),
    // Who booked each name (migration 065), on its own and fail-soft —
    // named in the read above it would cost the whole sheet before 065.
    readAllRows<{ round_id: string; player_id: string; booked_by: string | null }>(
      () => db
        .from('tee_assignments')
        .select('round_id, player_id, booked_by', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('created_at').order('round_id').order('player_id'),
      a => `${a.round_id}|${a.player_id}`,
    ),
    // Whether who put each player in their team is recorded (migration
    // 066) — a booking that makes a partnership names it only then.
    anyTeamBoard
      ? db.from('team_members').select('added_by').eq('trip_id', trip.id).limit(1)
      : Promise.resolve({ data: null, error: { message: 'no team boards' } }),
  ])

  if (roundsResult.error) console.error('TeeSheetPage rounds query failed:', roundsResult.error)
  if (playersResult.error) console.error('TeeSheetPage players query failed:', playersResult.error)
  if (assignmentsResult.error) {
    console.error('TeeSheetPage assignments query failed:', assignmentsResult.error)
  }

  const teeTimes = new Map(
    (itemsResult.data ?? []).map(i => [i.id as string, i.tee_time as string | null]),
  )
  const assignedRounds = new Set(
    ((assignmentsResult.data ?? []) as { round_id: string }[]).map(a => a.round_id),
  )

  type RoundRow = {
    id: string; round_number: number; itinerary_item_id: string | null
    start_format: string | null
    scheduled_date: string | null
    courses: { name: string } | { name: string }[] | null
  }
  // When each live sheet opens to the field, against the server's clock at
  // render — lib/teeSheet.ts works the Irish wall clock into an instant.
  const now = new Date()
  // The rounds that start from a tee sheet — the ones tee times are on for.
  const rounds = ((roundsResult.data ?? []) as unknown as RoundRow[])
    .filter(r => parseStartFormat(r.start_format) === 'tee_sheet')
    .map(r => {
      const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
      const s = settingsResult.get(r.id)
      const sheet = roundSheet({
        rules: s?.rules,
        startTime: r.itinerary_item_id ? teeTimes.get(r.itinerary_item_id) ?? null : null,
        intervalMins: s?.intervalMins,
        groupSize: s?.groupSize,
        hasAssignments: assignedRounds.has(r.id),
      })
      return {
        id: r.id,
        roundNumber: r.round_number,
        label: roundLabelOf(boards, r.id, r.round_number, parseLeagueSetup(
          (setupNamesResult.data as { bracket_setup?: unknown } | null)?.bracket_setup)?.roundNames),
        courseName: course?.name ?? null,
        sheet,
        // A sheet made before the wizard has no opening: it is open.
        opensLabel: sheet.state === 'active' && !sheetIsOpen(sheet.rules, r.scheduled_date, now)
          ? describeOpening(sheet.rules, r.scheduled_date)
          : null,
      }
    })

  // Who booked whom, where recorded.
  const bookerOf = new Map(
    ((bookersResult.data ?? []) as { round_id: string; player_id: string; booked_by: string | null }[])
      .map(b => [`${b.round_id}|${b.player_id}`, b.booked_by]),
  )

  // The tee times question's two answers, stored alike on a trip and an event.
  const access = teeSheetAccess((permsResult.data as { event_permissions?: unknown } | null)?.event_permissions)

  // Who this phone is — the player who may pick their own time.
  const roster = (playersResult.data ?? []) as { id: string; name: string; claimed: boolean | null; handicap: number | null; gender?: string | null }[]
  const me = await currentPlayer(tripCode, roster)

  const allTeams = (teamsResult.data ?? []) as {
    id: string; name: string; color: string; team_set: string | null
  }[]
  const memberships = ((membersResult.data ?? []) as {
    team_id: string; team_set: string; player_id: string
  }[]).map(m => ({ team_id: m.team_id, team_set: m.team_set, player_id: m.player_id }))

  // The field's short names, so a pair reads "Ross & Dave" and two Rosses
  // in different pairs are still two people (lib/partnerships.ts).
  const shortOf = boardNames(roster)
  const nameOf = new Map(roster.map(p => [p.id, p.name]))

  /** Which partnership each player stands in, on one sheet, named as one. */
  const teamsOn = (sheet: string) => {
    const onSheet = memberships.filter(m => m.team_set === sheet)
    const out: Record<string, { teamId: string; teamName: string; stored: string }> = {}
    for (const t of allTeams.filter(t => (t.team_set ?? 'main') === sheet)) {
      const members = onSheet.filter(m => m.team_id === t.id)
        .map(m => ({ id: m.player_id, name: nameOf.get(m.player_id) ?? '' }))
      const teamName = partnershipName(t, members, shortOf)
      for (const m of members) out[m.id] = { teamId: t.id, teamName, stored: t.name }
    }
    return out
  }

  /** The most players in any one team on a sheet — over four is not a partnership. */
  const largestOn = (sheet: string) => {
    const counts = new Map<string, number>()
    for (const m of memberships) {
      if (m.team_set === sheet) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1)
    }
    return Math.max(0, ...counts.values())
  }

  // Per round: its partnerships, when it has any — read off the board that
  // governs the round and no other (lib/partnerships.ts) — and whether they
  // are the round's own to make. A record rather than a Map — this crosses
  // the server/client line.
  const roundTeams: Record<string, {
    teamOf: Record<string, { teamId: string; teamName: string; stored: string }>
    sheet: string
    isDay: boolean
    teamSize: number | null
    cap: number
    playersPick: boolean
    mode: TeeMode
    fixed: boolean
  }> = {}
  for (const r of rounds) {
    const first = roundPartnership(boards, r.id)
    const p = first && roundPartnership(boards, r.id, largestOn(first.sheet))
    if (!p) continue
    roundTeams[r.id] = {
      teamOf: teamsOn(p.sheet),
      sheet: p.sheet,
      isDay: p.isDay,
      teamSize: p.size,
      // The most a team made on the sheet may hold — the picker's own figure.
      cap: roundPickerSheet(boards, r.id, largestOn, false)?.cap ?? MAX_PARTNERSHIP,
      // The field makes its own partnerships here — the board says so.
      playersPick: p.board.teamPick === 'self',
      // How a tee time binds: a row a pairing, the time a team, or neither.
      mode: teeMode(p),
      fixed: partnershipsFixed(p),
    }
  }

  // The tags, for the gate and for colouring a day team the side that made
  // it. Read off the one sheet tags ever live on.
  const tagOfPlayer: Record<string, { teamId: string; teamName: string; color: string }> = {}
  if (playingForTags) {
    const tagRows = new Map(
      allTeams.filter(t => (t.team_set ?? 'main') === TAG_SET)
        .map(t => [t.id, { name: t.name, color: t.color }]),
    )
    for (const m of memberships) {
      if (m.team_set !== TAG_SET) continue
      const tag = tagRows.get(m.team_id)
      if (tag) {
        tagOfPlayer[m.player_id] = {
          teamId: m.team_id, teamName: tag.name, color: tag.color,
        }
      }
    }
  }

  // A Dynamic Overall Leaderboard's Matches sessions: every one of them,
  // drawn as matches (D40) — with its tee times on the rows where its round
  // starts from a tee sheet that is open, and as its order of play where it
  // does not (Ross, 10 Nov 2026: tee times add times to the matches already
  // set, and a session without tee times still shows). Every other round —
  // a stroke session, any trip's or event's round — keeps today's sheet.
  const overall = overallOf(boards)
  const isMatchSession = (roundId: string) => !!overall && sessionBoardFor(boards, roundId)?.competition === 'matches'
  const allRounds = ((roundsResult.data ?? []) as unknown as RoundRow[]).map(r => ({ id: r.id, round_number: r.round_number }))
  const hasMatchSessions = allRounds.some(r => isMatchSession(r.id))
  const sheetRounds = rounds.filter(r => !isMatchSession(r.id))
  const matchResults = hasMatchSessions
    ? (await readSessionCards(db, trip, boards, roster.map(p => ({ ...p, gender: p.gender ?? 'M' })),
        { teams: allTeams, memberships }, await readSessionMatchRows(db, trip.id))).results
    : []
  const tags = eventTags(allTeams)
  const tagIdOf = Object.fromEntries(memberships.filter(m => m.team_set === TAG_SET).map(m => [m.player_id, m.team_id]))
  const { sheets: matchSheets, initialOpen: matchOpen } = hasMatchSessions
    ? buildMatchSheets({
        boards,
        rounds: allRounds,
        results: matchResults,
        times: sessionTimes(
          rounds.filter(r => isMatchSession(r.id)),
          rid => `${tripHome}/teesheet/${rid}/setup`,
          rid => sessionSlotCount(overall?.overall, sessionBoardFor(boards, rid), rid, matchResults, roster.length),
        ),
        onlyRound: initialRoundId ?? null,
        fieldSize: roster.length,
        common: {
          tripId: trip.id,
          tripCode,
          players: roster.map(p => ({ id: p.id, name: p.name, handicap: p.handicap })),
          tags,
          tagOfPlayer: tagIdOf,
          myId: me && isConfirmed(me) ? me.id : null,
          pinSet: isLocked((trip.settings_passcode_hash as string | null) ?? null),
          playersPick: access.playersPick,
          isTrip: !isEvent(kind),
        },
      })
    : { sheets: [], initialOpen: null }
  const matchSessions = matchSheets.length > 0
    ? <OrderOfPlayList sheets={matchSheets} initialOpen={matchOpen} />
    : null

  return (
    <TeeSheetClient
      tripId={trip.id}
      tripCode={tripCode}
      rounds={sheetRounds}
      matchSessions={matchSessions}
      players={roster.map(p => ({ id: p.id, name: p.name, handicap: p.handicap }))}
      initialAssignments={
        ((assignmentsResult.data ?? []) as {
          round_id: string; player_id: string; slot_index: number
        }[]).map(a => ({
          round_id: a.round_id, player_id: a.player_id, slot_index: a.slot_index,
          booked_by: bookerOf.get(`${a.round_id}|${a.player_id}`) ?? null,
        }))
      }
      bookerRecorded={!bookersResult.error}
      roundTeams={roundTeams}
      tagOf={tagOfPlayer}
      playingForTags={playingForTags}
      // Whether the sheet has anywhere to save. The assignments read is
      // fail-soft, so a missing table (pre-050) shows an empty sheet that
      // looks perfectly normal until a name is added and the write bounces
      // — a name appearing for a moment and vanishing, with the reason
      // rendered somewhere off the bottom of a long sheet. Said plainly at
      // the top instead.
      storageReady={!assignmentsResult.error}
      fieldMayEdit={access.playersPick}
      fieldMaySet={access.anyoneOpens}
      meId={me && isConfirmed(me) ? me.id : null}
      initialRoundId={initialRoundId ?? null}
      addedRecorded={!addedResult.error}
      editSlot={editSlot}
      isTrip={!isEvent(kind)}
      pinSet={isLocked((trip.settings_passcode_hash as string | null) ?? null)}
    />
  )
}
