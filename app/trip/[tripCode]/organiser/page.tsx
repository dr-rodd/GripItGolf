import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { parseBracketSetup, describeSetup } from '@/lib/bracketSetup'
import { parseLeagueSetup, describeLeagueSetup } from '@/lib/leagueSetup'
import { parseEventPermissions } from '@/lib/eventPermissions'
import { TAG_SET, describeTags } from '@/lib/tagBoards'
import { parseInterval, parseGroupSize } from '@/lib/teeSheet'
import { parseLeaderboards } from '@/lib/leaderboards'
import { describeRange } from '@/lib/confirmationEmail'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '../setup/PasscodeGate'
import OrganiserClient from './OrganiserClient'

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
    .select('id, trip_code, name, kind, settings_passcode_hash, start_date, end_date, leaderboards')
    .eq('trip_code', tripCode)
    .single()
  if (error) console.error('OrganiserPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(trip.kind)) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center bg-cream px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
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
    permsResult, playersResult, claimedResult, teeSettingsResult,
    tagsResult, taggedResult,
  ] = await Promise.all([
    supabase
      .from('event_messages')
      .select('id, body, created_at')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('rounds')
      .select('id, round_number, itinerary_item_id, start_format, courses(name)')
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
    // The tee-sheet settings, fail-soft — pre-050 the columns do not exist
    // and every round reads at its defaults.
    supabase
      .from('rounds')
      .select('id, tee_interval_mins, tee_group_size')
      .eq('trip_id', trip.id),
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
    courses: { name: string } | { name: string }[] | null
  }
  const teeSettings = new Map(
    ((teeSettingsResult.data ?? []) as {
      id: string; tee_interval_mins?: unknown; tee_group_size?: unknown
    }[]).map(r => [r.id, r]),
  )

  const rounds = ((roundsResult.data ?? []) as unknown as RoundRow[]).map(r => {
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    const tee = teeSettings.get(r.id)
    return {
      id: r.id,
      roundNumber: r.round_number,
      courseName: course?.name ?? null,
      itineraryItemId: r.itinerary_item_id,
      startFormat: r.start_format,
      teeTime: r.itinerary_item_id ? teeTimes.get(r.itinerary_item_id) ?? null : null,
      teeIntervalMins: parseInterval(tee?.tee_interval_mins),
      teeGroupSize: parseGroupSize(tee?.tee_group_size),
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
        : leagueSetup ? describeLeagueSetup(leagueSetup, rounds.length || 1)
        : null
      }
      isLeague={!!leagueSetup}
      tagsSummary={describeTags(
        tagsResult.count ?? 0,
        taggedResult.count ?? 0,
        playersResult.count ?? 0,
      )}
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
