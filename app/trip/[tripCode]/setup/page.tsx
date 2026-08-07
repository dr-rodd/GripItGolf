import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { fetchMemberships } from '@/lib/teamMembers'
import type { ItemKind, ItineraryItem, TravelMode } from '@/lib/itinerary'
import TripSetupClient from './TripSetupClient'
import PasscodeGate from './PasscodeGate'
import { isLocked } from '@/lib/passcode'

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
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Trip not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  const [teamsResult, playersResult, roundsResult, memberships, itineraryResult, platformCoursesResult] =
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
      // Ids only. The number and the course were for the read-only round
      // list this screen used to print; what is left needs neither. Still
      // ordered, so the ids arrive in playing order for anything that cares.
      supabase
        .from('rounds')
        .select('id')
        .eq('trip_id', trip.id)
        .order('round_number'),
      fetchMemberships(trip.id),
      supabase
        .from('itinerary_items')
        .select('id, day_index, position, kind, course_id, tee_time, tee_count, ' +
                'stay_name, travel_mode, from_place, to_place, duration_mins')
        .eq('trip_id', trip.id)
        .order('day_index')
        .order('position'),
      // The picker inside the itinerary editor offers the same list trip
      // creation does — platform courses only, never another trip's own.
      supabase.from('courses').select('id, name, location').is('trip_id', null).order('name'),
    ])

  if (teamsResult.error) console.error('TripSetupPage teams query failed:', teamsResult.error)
  if (playersResult.error) console.error('TripSetupPage players query failed:', playersResult.error)
  if (roundsResult.error) console.error('TripSetupPage rounds query failed:', roundsResult.error)
  if (itineraryResult.error) console.error('TripSetupPage itinerary query failed:', itineraryResult.error)
  if (platformCoursesResult.error) console.error('TripSetupPage platform courses query failed:', platformCoursesResult.error)

  const rounds = roundsResult.data ?? []

  type ItinRow = {
    id: string; day_index: number; position: number; kind: ItemKind
    course_id: string | null; tee_time: string | null; tee_count: number | null
    stay_name: string | null; travel_mode: TravelMode | null
    from_place: string | null; to_place: string | null; duration_mins: number | null
  }
  const itinerary: ItineraryItem[] = ((itineraryResult.data ?? []) as unknown as ItinRow[])
    .map(r => ({
      id: r.id, dayIndex: r.day_index, position: r.position, kind: r.kind,
      courseId: r.course_id, teeTime: r.tee_time, teeCount: r.tee_count,
      stayName: r.stay_name, travelMode: r.travel_mode,
      fromPlace: r.from_place, toPlace: r.to_place, durationMins: r.duration_mins,
    }))

  // Golf can only be edited while nothing has been scored yet — a course
  // change would orphan real data. The check is against the scores
  // themselves, which is now the only thing that locks anything on this
  // screen: a trip has no draft and no live, and everything else here stays
  // editable for as long as the trip does.
  const roundIds = rounds.map(r => r.id)
  const [scoresRes, liveRoundsRes] = roundIds.length > 0
    ? await Promise.all([
        supabase.from('scores').select('id', { count: 'exact', head: true }).in('round_id', roundIds),
        supabase.from('live_rounds').select('id', { count: 'exact', head: true }).in('round_id', roundIds),
      ])
    : [{ count: 0, error: null }, { count: 0, error: null }]
  const canEditGolf = (scoresRes.count ?? 0) === 0 && (liveRoundsRes.count ?? 0) === 0

  const settings = (
    <TripSetupClient
      trip={{
        id: trip.id,
        trip_code: tripCode,
        name: trip.name,
        start_date: trip.start_date ?? null,
        end_date: trip.end_date ?? null,
        // Through the compat reader, so a trip set up before the column
        // existed arrives with the boards its old flags described rather
        // than a blank slate. Its first save writes them down for real.
        leaderboards: boardsForTrip(trip),
        edit_permission: trip.edit_permission ?? 'everyone',
      }}
      teams={(teamsResult.data ?? []).map(t => ({ ...t, team_set: t.team_set ?? 'main' }))}
      players={playersResult.data ?? []}
      memberships={memberships}
      rounds={rounds.map(r => ({ id: r.id }))}
      itinerary={itinerary}
      courses={platformCoursesResult.data ?? []}
      canEditGolf={canEditGolf}
    />
  )

  // Locked at creation and never afterwards, so a trip cannot be locked out
  // from under whoever runs it
  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
      >
        {settings}
      </PasscodeGate>
    )
  }

  return settings
}
