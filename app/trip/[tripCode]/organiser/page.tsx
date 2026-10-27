import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { parseBracketSetup, describeSetup, isKnockoutEvent, rawDrawPlan } from '@/lib/bracketSetup'
import { describeDrawPlan } from '@/lib/bracketDraw'
import { describeShortDate } from '@/lib/itinerary'
import { parseLeagueSetup, describeLeagueSetup } from '@/lib/leagueSetup'
import { parseEventPermissions } from '@/lib/eventPermissions'
import { TAG_SET, describeTags } from '@/lib/tagBoards'
import { roundSheet, teeSheetSummary } from '@/lib/teeSheet'
import { readAllRows } from '@/lib/allRows'
import { readSheetSettings } from '../teesheet/sheets'
import { parseLeaderboards } from '@/lib/leaderboards'
import { describeRange } from '@/lib/confirmationEmail'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '../setup/PasscodeGate'
import OrganiserClient from './OrganiserClient'
import PublicPinCard from './PublicPinCard'
import { fetchEntryLock } from '../kind'
import { golfIrelandRequests } from '../golfIreland'

export const dynamic = 'force-dynamic'

/**
 * The organiser side of the Event Hub, behind the organiser PIN.
 *
 * Two jobs live here: notices (posted to the hub's Notices section) and how
 * each round starts — shotgun, with one time for the whole field, or a tee
 * sheet, whose groups and times are functionality still to come.
 *
 * The gate is the same PasscodeGate Trip Setup stands behind, checking the
 * same hash — one PIN for everything the organiser does, and unlocking
 * either screen unlocks both for the session. The same honesty applies: it
 * is a soft lock, not a security boundary (lib/passcode.ts).
 *
 * Events only. A trip has no organiser — its lead player runs it from Trip
 * Setup — so a trip landing here is pointed there rather than shown an
 * admin side it does not have.
 */
export default async function OrganiserPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, trip_code, name, kind, settings_passcode_hash, start_date, end_date, leaderboards, track_stats')
    .eq('trip_code', tripCode)
    .single()
  if (error) console.error('OrganiserPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center paper px-6">
        <p className="t-h2 text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(trip.kind)) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6 text-center">
        <p className="t-h2 text-ink mb-3">
          This is a trip
        </p>
        <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">
          The organiser area belongs to events. A trip is run from Trip
          Setup, on the tab bar below.
        </p>
        <BackButton href={`/trip/${tripCode}`} label="Trip" />
      </main>
    )
  }

  // Everything the admin jobs need, in one batch. The rounds embed their
  // course names — one hop, not two — and the golf items carry the tee
  // times a shotgun start writes to. The bracket setup rides in its own
  // query rather than the trip select above, so a database that has not run
  // migration 047 loses the summary line and nothing else.
  const [
    noticesResult, roundsResult, itemsResult, setupResult,
    permsResult, playersResult, claimedResult, teeSettingsResult, teeAssignmentsResult,
    tagsResult, taggedResult,
  ] = await Promise.all([
    supabase
      .from('event_messages')
      .select('id, body, created_at')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false }),
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
      .from('trips')
      .select('bracket_setup')
      .eq('id', trip.id)
      .single(),
    // Its own query for the same reason as the setup: pre-migration-049
    // the column does not exist, this errors, and the toggles simply show
    // their defaults.
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('id', trip.id)
      .single(),
    // The bird's-eye numbers: who is confirmed, out of how many. A count
    // in a header, not a body — the scoring path's own rule.
    supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('is_composite', false),
    supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .eq('claimed', true),
    // Each round's tee sheet — its rules and the older settings, each
    // fail-soft — and who is on one, which is what keeps a sheet made
    // before the wizard live (lib/teeSheet.ts `roundSheet`). Read whole,
    // as the sheet reads them (lib/allRows.ts).
    readSheetSettings(trip.id),
    readAllRows<{ round_id: string; player_id: string }>(
      () => supabase
        .from('tee_assignments')
        .select('round_id, player_id', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('created_at').order('round_id').order('player_id'),
      a => `${a.round_id}|${a.player_id}`,
    ),
    // The Teams & tags card's numbers. A tag is a team on the main sheet
    // (lib/tagBoards.ts), so both are counts in headers against tables
    // that have existed since migration 023.
    supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('team_set', TAG_SET),
    supabase
      .from('team_members')
      .select('player_id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('team_set', TAG_SET),
  ])

  if (noticesResult.error) console.error('OrganiserPage notices query failed:', noticesResult.error)
  if (roundsResult.error) console.error('OrganiserPage rounds query failed:', roundsResult.error)
  if (itemsResult.error) console.error('OrganiserPage items query failed:', itemsResult.error)

  const teeTimes = new Map((itemsResult.data ?? []).map(i => [i.id as string, i.tee_time as string | null]))

  type RoundRow = {
    id: string; round_number: number; itinerary_item_id: string | null
    start_format: string | null
    scheduled_date: string | null
    courses: { name: string } | { name: string }[] | null
  }
  // How many stand on each round's sheet — what Clear would take off.
  const bookedOn = new Map<string, number>()
  for (const a of (teeAssignmentsResult.data ?? []) as { round_id: string }[]) {
    bookedOn.set(a.round_id, (bookedOn.get(a.round_id) ?? 0) + 1)
  }
  const now = new Date()

  const rounds = ((roundsResult.data ?? []) as unknown as RoundRow[]).map(r => {
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    const stored = teeSettingsResult.get(r.id)
    const teeTime = r.itinerary_item_id ? teeTimes.get(r.itinerary_item_id) ?? null : null
    const sheet = roundSheet({
      rules: stored?.rules,
      startTime: teeTime,
      intervalMins: stored?.intervalMins,
      groupSize: stored?.groupSize,
      hasAssignments: bookedOn.has(r.id),
    })
    return {
      id: r.id,
      roundNumber: r.round_number,
      courseName: course?.name ?? null,
      itineraryItemId: r.itinerary_item_id,
      startFormat: r.start_format,
      teeTime,
      teeState: sheet.state,
      teeSummary: teeSheetSummary(sheet, r.scheduled_date, now),
      teeBooked: bookedOn.get(r.id) ?? 0,
    }
  })

  // Errors swallowed deliberately: pre-migration the column does not exist,
  // and the card below simply says the format is not set up yet. The column
  // holds either format, discriminated by the parsers — a league line for a
  // league event, a bracket line for a knockout, never a guess.
  const setupRaw = (setupResult.data as { bracket_setup?: unknown } | null)?.bracket_setup
  const bracketSetup = parseBracketSetup(setupRaw)
  const leagueSetup = parseLeagueSetup(setupRaw)

  // Errors swallowed for the same reason as the setup's: pre-049 there is
  // no column, and defaults are exactly what an untouched event means.
  const permissions = parseEventPermissions(
    (permsResult.data as { event_permissions?: unknown } | null)?.event_permissions
  )

  const boards = parseLeaderboards(trip.leaderboards)

  // A league reading Golf Ireland: its link requests, read on the service
  // role (the link tables are closed to the browser). Null otherwise, or
  // on any failure — the card is then simply absent.
  const [gi, publicLock] = await Promise.all([
    leagueSetup?.golfIreland ? golfIrelandRequests(trip.id, setupRaw) : Promise.resolve(null),
    fetchEntryLock(tripCode),
  ])

  // How many days carry a board of their own — a board is a day's when it
  // is scoped to golf (lib/leaderboards.ts `roundIds`).
  const dayBoardCount = new Set(
    boards.flatMap(b => b.roundIds ?? [])
  ).size

  const content = (
    <OrganiserClient
      tripId={trip.id}
      tripCode={tripCode}
      initialNotices={noticesResult.data ?? []}
      initialRounds={rounds}
      initialPermissions={permissions}
      overview={{
        name: trip.name as string,
        dates: describeRange(trip.start_date ?? null, trip.end_date ?? null),
        players: playersResult.count ?? 0,
        claimed: claimedResult.count ?? 0,
        roundCount: rounds.length,
        boardCount: boards.length,
        noticeCount: (noticesResult.data ?? []).length,
      }}
      formatSummary={
        bracketSetup ? describeSetup(bracketSetup)
        : leagueSetup ? describeLeagueSetup(leagueSetup, rounds.length || 1, trip.start_date ?? null)
        : null
      }
      isLeague={!!leagueSetup}
      initialTrackStats={trip.track_stats === true}
      series={leagueSetup?.schedule === 'series'}
      tagsSummary={describeTags(
        tagsResult.count ?? 0,
        taggedResult.count ?? 0,
        playersResult.count ?? 0,
      )}
      golfIreland={gi}
      knockout={isKnockoutEvent(setupRaw)}
      drawSummary={rawDrawPlan(setupRaw)?.when === 'date' ? describeDrawPlan(rawDrawPlan(setupRaw), d => describeShortDate(d) ?? d) : null}
      accessCard={<PublicPinCard tripId={trip.id} tripCode={tripCode} hasPin={!!publicLock} />}
      // The door to the team picker, while a leaderboard plays in teams.
      hasTeamBoards={boards.some(b => b.audience === 'team' && !b.tagMode)}
      dayFormatSummary={
        dayBoardCount === 0
          ? 'No day has its own format yet.'
          : `${dayBoardCount} of ${rounds.length} days ${dayBoardCount === 1 ? 'has' : 'have'} a format of ${dayBoardCount === 1 ? 'its' : 'their'} own.`
      }
    />
  )

  // A tournament sets its PIN at creation, so this gate always stands — but
  // a row without a hash fails open rather than locking the organiser out
  // of their own event.
  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="Organiser area"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }

  return content
}
