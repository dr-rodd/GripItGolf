import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { fetchMemberships } from '@/lib/teamMembers'
import { roundsWithScores } from '@/lib/scoreReads'
import type { ItemKind, ItineraryItem, TravelMode } from '@/lib/itinerary'
import { fromItemRow } from '@/lib/itinerarySync'
import TripSetupClient from './TripSetupClient'
import PasscodeGate from './PasscodeGate'
import { isLocked } from '@/lib/passcode'
import { isEvent, parseStartFormat, teeSheetInUse } from '@/lib/eventHub'
import { roundSheet, teeSheetSummary } from '@/lib/teeSheet'
import { readAllRows } from '@/lib/allRows'
import TripTeeTimes from './TripTeeTimes'

export const dynamic = 'force-dynamic'

export default async function TripSetupPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripSetupPage trip query failed:', tripError)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center paper px-6">
        <p className="t-h2 text-ink mb-3">Trip not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  const [teamsResult, playersResult, roundsResult, memberships, itineraryResult] =
    await Promise.all([
      supabase
        .from('teams')
        .select('id, name, color, team_set')
        .eq('trip_id', trip.id)
        .order('created_at'),
      supabase
        .from('players')
        .select('id, name, handicap, gender, team_id, is_lead')
        .eq('trip_id', trip.id)
        // A composite is a synthetic scorecard, not a person. The join screen
        // has always excluded them; this page did not, so the no-two-same-
        // names check here was comparing against machine-generated names the
        // other check never saw — and against names the database constraint
        // deliberately does not cover either. All three agree now.
        .eq('is_composite', false)
        .order('created_at'),
      // The item id rides along so a round with scores can lock its own
      // golf tile in the itinerary editor — and only its own; the casual
      // flags ride back onto the golf items the same way. `*` rather than a
      // column list so a database that has not run migration 031 yet still
      // loads this page — the flags simply come back undefined, which reads
      // as counting. Still ordered, so the ids arrive in playing order.
      //
      // The course rides along embedded, which is how this page learns what
      // each round is called. It used to read that out of the whole platform
      // catalogue, fetched below purely to be indexed by id — a growing list
      // of every course on the site, on every load of this tab, to name the
      // two or three this trip actually plays.
      supabase
        .from('rounds')
        .select('*, courses(id, name)')
        .eq('trip_id', trip.id)
        .order('round_number'),
      fetchMemberships(trip.id),
      supabase
        .from('itinerary_items')
        .select('id, day_index, position, kind, course_id, tee_time, tee_count, ' +
                'stay_name, travel_mode, from_place, to_place, duration_mins, ' +
                'activity_name, activity_time')
        .eq('trip_id', trip.id)
        .order('day_index')
        .order('position'),
    ])

  if (teamsResult.error) console.error('TripSetupPage teams query failed:', teamsResult.error)
  if (playersResult.error) console.error('TripSetupPage players query failed:', playersResult.error)
  if (roundsResult.error) console.error('TripSetupPage rounds query failed:', roundsResult.error)
  if (itineraryResult.error) console.error('TripSetupPage itinerary query failed:', itineraryResult.error)

  const rounds = roundsResult.data ?? []
  // Each round's course, off the round itself. The itinerary editor's picker
  // fetches the full catalogue for itself when it opens — see
  // `usePlatformCourses`.
  const courseNameById = new Map(
    rounds
      .map(r => (r.courses as unknown as { id: string; name: string } | null))
      .filter((c): c is { id: string; name: string } => Boolean(c))
      .map(c => [c.id, c.name]),
  )

  type ItinRow = {
    id: string; day_index: number; position: number; kind: ItemKind
    course_id: string | null; tee_time: string | null; tee_count: number | null
    stay_name: string | null; travel_mode: TravelMode | null
    from_place: string | null; to_place: string | null; duration_mins: number | null
    activity_name: string | null; activity_time: string | null
  }
  // Whether each golf item's round counts. The flags live on the round —
  // `itinerary_items` has no such columns — so they are read back through
  // the same link the round was created through.
  const roundByItem = new Map(
    rounds.filter(r => r.itinerary_item_id).map(r => [r.itinerary_item_id as string, r])
  )
  const itinerary: ItineraryItem[] = ((itineraryResult.data ?? []) as unknown as ItinRow[])
    .map(r => ({
      ...fromItemRow(r),
      ...(r.kind === 'golf'
        ? {
            casual: roundByItem.get(r.id)?.casual === true,
            casualStats: roundByItem.get(r.id)?.casual_stats === true,
          }
        : {}),
    }))

  // A round locks its own golf item once it has a score or a card open on
  // it — a course change would orphan real data. Per round, not per trip:
  // rounds nobody has played stay editable, and new golf can be added at
  // any point, which is how an impromptu game mid-trip gets its round. The
  // check is against the scores themselves — a trip has no draft and no
  // live, and everything else on this screen stays editable for as long as
  // the trip does.
  //
  // Counted per round rather than read: this used to fetch every score's
  // round_id to build a set of a few ids, and past Supabase's 1,000-row cap
  // the set could miss a played round and offer its course up for changing.
  const roundIds = rounds.map(r => r.id)
  const [scored, liveRes] = roundIds.length > 0
    ? await Promise.all([
        roundsWithScores(supabase, roundIds),
        supabase.from('live_rounds').select('round_id').in('round_id', roundIds),
      ])
    : [{ data: new Set<string>(), error: null }, { data: [], error: null }]
  if (scored.error) console.error('TripSetupPage scores count failed:', scored.error)
  if (liveRes.error) console.error('TripSetupPage live rounds query failed:', liveRes.error)
  const lockedRoundIds = new Set([
    ...scored.data,
    ...(liveRes.data ?? []).map(r => r.round_id as string),
  ])
  const lockedGolfItemIds = rounds
    .filter(r => lockedRoundIds.has(r.id) && r.itinerary_item_id)
    .map(r => r.itinerary_item_id as string)

  // A trip's tee times (Ross, 26 Oct 2026) — the Trip Setup counterpart to
  // an event's Starts card. The rounds came whole (`*`), so their start
  // format, rules and settings are here already; who is on each sheet is
  // the one more read, taken whole (lib/allRows.ts). An event keeps its
  // tee times in the organiser area.
  let teeTimes: React.ReactNode = null
  if (!isEvent(trip.kind) && rounds.length > 0) {
    const booked = await readAllRows<{ round_id: string; player_id: string }>(
      () => supabase
        .from('tee_assignments')
        .select('round_id, player_id', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('created_at').order('round_id').order('player_id'),
      a => `${a.round_id}|${a.player_id}`,
    )
    const bookedOn = new Map<string, number>()
    for (const a of (booked.data ?? []) as { round_id: string }[]) {
      bookedOn.set(a.round_id, (bookedOn.get(a.round_id) ?? 0) + 1)
    }
    const teeTimeOf = new Map(((itineraryResult.data ?? []) as unknown as ItinRow[]).map(i => [i.id, i.tee_time]))
    const now = new Date()
    const teeRounds = rounds
      .filter(r => parseStartFormat(r.start_format) === 'tee_sheet')
      .map(r => {
        const sheet = roundSheet({
          rules: r.tee_sheet,
          startTime: r.itinerary_item_id ? teeTimeOf.get(r.itinerary_item_id) ?? null : null,
          intervalMins: r.tee_interval_mins,
          groupSize: r.tee_group_size,
          hasAssignments: bookedOn.has(r.id),
        })
        return {
          id: r.id as string,
          roundNumber: r.round_number as number,
          state: sheet.state,
          summary: teeSheetSummary(sheet, (r.scheduled_date as string | null) ?? null, now),
          booked: bookedOn.get(r.id) ?? 0,
        }
      })
    teeTimes = (
      <TripTeeTimes
        tripId={trip.id}
        tripCode={tripCode}
        initialOn={teeSheetInUse(rounds.map(r => r.start_format))}
        rawPermissions={trip.event_permissions}
        rounds={teeRounds}
      />
    )
  }

  const settings = (
    <TripSetupClient
      trip={{
        id: trip.id,
        trip_code: tripCode,
        name: trip.name,
        // What the lead player wrote about the trip. It was missing here
        // while Trip Settings rendered a box for it, so the drawer opened
        // blank on a trip that had one — and the only way to edit a
        // description was to type it again from nothing.
        description: trip.description ?? null,
        start_date: trip.start_date ?? null,
        end_date: trip.end_date ?? null,
        // Through the compat reader, so a trip set up before the column
        // existed arrives with the boards its old flags described rather
        // than a blank slate. Its first save writes them down for real.
        leaderboards: boardsForTrip(trip),
        edit_permission: trip.edit_permission ?? 'everyone',
        // `?? false` rather than trusting the column: a trip read back before
        // migration 028 ran has no such field, and undefined would put the
        // toggle in neither position.
        track_stats: trip.track_stats ?? false,
      }}
      teams={(teamsResult.data ?? []).map(t => ({ ...t, team_set: t.team_set ?? 'main' }))}
      players={playersResult.data ?? []}
      memberships={memberships}
      // Named as well as identified: the matchplay board can link a bracket
      // round to one of these, and "Round 2 — Ballyliffin" is what an
      // organiser recognises where a uuid is not.
      rounds={rounds.map(r => ({
        id: r.id,
        roundNumber: r.round_number as number,
        courseName: courseNameById.get(r.course_id as string) ?? null,
      }))}
      itinerary={itinerary}
      lockedGolfItemIds={lockedGolfItemIds}
      // Team boards on an event are asked how they meet the tee sheet;
      // a trip has no sheet and is never asked (fail-soft over kind).
      askTeeTeams={isEvent(trip.kind)}
      askTags={isEvent(trip.kind)}
      teeTimes={teeTimes}
    />
  )

  // Locked at creation and never afterwards, so a trip cannot be locked out
  // from under whoever runs it. An event's gate speaks to the organiser —
  // "ask your lead player" is a trip sentence, and the field is not meant
  // to be here at all (the tab bar no longer brings them).
  if (isLocked(trip.settings_passcode_hash)) {
    const event = isEvent(trip.kind)
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        {...(event ? {
          title: 'Organisers only',
          hint: `Enter the organiser PIN for ${trip.name}.`,
        } : {})}
      >
        {settings}
      </PasscodeGate>
    )
  }

  return settings
}
