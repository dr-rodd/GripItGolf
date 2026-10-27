import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../kind'
import {
  parseLeaderboards, teamBoardForRound, tagsInPlay,
} from '@/lib/leaderboards'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { readAllRows } from '@/lib/allRows'
import { parseStartFormat } from '@/lib/eventHub'
import { describeOpening, roundSheet, sheetIsOpen } from '@/lib/teeSheet'
import { currentPlayer } from '@/lib/currentPlayer'
import { isConfirmed } from '@/lib/roster'
import { readSheetSettings } from './sheets'
import { sheetForBoard, isDaySheet } from '@/lib/teamSets'
import { TAG_SET } from '@/lib/tagBoards'
import BackButton from '@/app/components/BackButton'
import TeeSheetClient from './TeeSheetClient'

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
 * device already holds, which lives in sessionStorage and only the
 * browser can see.
 */
export default async function TeeSheetPage({ params, searchParams }: {
  params: Promise<{ tripCode: string }>
  searchParams: Promise<{ round?: string }>
}) {
  const [{ tripCode }, { round: initialRoundId }] = await Promise.all([params, searchParams])

  // The kind alongside, for the words only — a trip's sheet speaks of its
  // lead player and passcode.
  const [kind, { data: trip, error }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
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

  // Whose teams a slot is showing is now a per-round question: a day with
  // its own team board plays that day's fourballs, and a day without plays
  // the event's teams for the week. `teamBoardForRound` is the one copy of
  // that order — this page used to take the first team board it found,
  // which on an event running two of them silently picked one.
  //
  // The teams and memberships are fetched for the whole trip either way,
  // so the client can group any round without a second trip to the server.
  const boards = parseLeaderboards(trip.leaderboards)
  const anyTeamBoard = boards.some(b => b.audience === 'team' && !b.tagMode)
  const playingForTags = tagsInPlay(boards)

  const [
    roundsResult, itemsResult, playersResult, settingsResult,
    assignmentsResult, permsResult, teamsResult, membersResult, bookersResult,
  ] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, round_number, itinerary_item_id, start_format, scheduled_date, courses(name)')
      .eq('trip_id', trip.id)
      .order('round_number'),
    supabase
      .from('itinerary_items')
      .select('id, tee_time')
      .eq('trip_id', trip.id)
      .eq('kind', 'golf'),
    supabase
      .from('players')
      .select('id, name, claimed')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
    // Each round's sheet settings — the wizard's rules and the older two
    // columns, each fail-soft on its own.
    readSheetSettings(trip.id),
    // The assignments, fail-soft the same way — pre-050 the sheet is empty
    // and the first write says calmly what is missing.
    // Read whole: one row per player per round, so a long league with a
    // sheet passes Supabase's 1,000-row cap, and a seat past it would look
    // empty (lib/allRows.ts). UNIQUE (round_id, player_id) ends the order.
    readAllRows<{ round_id: string; player_id: string; slot_index: number; created_at: string }>(
      () => supabase
        .from('tee_assignments')
        .select('round_id, player_id, slot_index, created_at', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('created_at').order('round_id').order('player_id'),
      a => `${a.round_id}|${a.player_id}`,
    ),
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('id', trip.id)
      .single(),
    // Every sheet's teams and memberships — the week's, each day's, and
    // the tags. Fetched whenever any of the three could be in play, so a
    // round can be grouped, a team formed and the tag gate answered
    // without a second trip.
    anyTeamBoard || playingForTags
      ? supabase.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id)
      : Promise.resolve({ data: null, error: null }),
    anyTeamBoard || playingForTags
      ? supabase.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id)
      : Promise.resolve({ data: null, error: null }),
    // Who booked each name (migration 065), on its own and fail-soft —
    // named in the read above it would cost the whole sheet before 065.
    readAllRows<{ round_id: string; player_id: string; booked_by: string | null }>(
      () => supabase
        .from('tee_assignments')
        .select('round_id, player_id, booked_by', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('created_at').order('round_id').order('player_id'),
      a => `${a.round_id}|${a.player_id}`,
    ),
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
  const roster = (playersResult.data ?? []) as { id: string; name: string; claimed: boolean | null }[]
  const me = await currentPlayer(tripCode, roster)

  const allTeams = (teamsResult.data ?? []) as {
    id: string; name: string; color: string; team_set: string | null
  }[]
  const memberships = ((membersResult.data ?? []) as {
    team_id: string; team_set: string; player_id: string
  }[]).map(m => ({ team_id: m.team_id, team_set: m.team_set, player_id: m.player_id }))

  /** Which team each player stands in, on one sheet. */
  const teamsOn = (sheet: string) => {
    const names = new Map(
      allTeams.filter(t => (t.team_set ?? 'main') === sheet).map(t => [t.id, t.name]),
    )
    const out: Record<string, { teamId: string; teamName: string }> = {}
    for (const m of memberships) {
      if (m.team_set !== sheet) continue
      const name = names.get(m.team_id)
      if (name) out[m.player_id] = { teamId: m.team_id, teamName: name }
    }
    return out
  }

  // Per round: whose teams its slots group by, and whether that day's
  // teams are its own to make. A record rather than a Map — this crosses
  // the server/client line.
  const roundTeams: Record<string, {
    teamOf: Record<string, { teamId: string; teamName: string }>
    sheet: string
    isDay: boolean
    teeTeamsSeparate: boolean
    teamSize: number | null
  }> = {}
  for (const r of rounds) {
    const board = teamBoardForRound(boards, r.id)
    if (!board) continue
    const sheet = sheetForBoard(board)
    roundTeams[r.id] = {
      teamOf: teamsOn(sheet),
      sheet,
      isDay: isDaySheet(sheet),
      teeTeamsSeparate: board.teeTeams === 'separate',
      teamSize: board.teamSize ?? null,
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

  return (
    <TeeSheetClient
      tripId={trip.id}
      tripCode={tripCode}
      rounds={rounds}
      players={roster.map(p => ({ id: p.id, name: p.name }))}
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
      hasTeamBoard={anyTeamBoard}
      fieldMayEdit={access.playersPick}
      fieldMaySet={access.anyoneOpens}
      meId={me && isConfirmed(me) ? me.id : null}
      initialRoundId={initialRoundId ?? null}
      isTrip={!isEvent(kind)}
      passcodeHash={(trip.settings_passcode_hash as string | null) ?? null}
    />
  )
}
