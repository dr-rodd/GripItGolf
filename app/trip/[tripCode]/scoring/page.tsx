import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { liveRoundPresence, type OpenCard } from '@/lib/rowContext'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import { roundTone, ROUND_TILE, ROUND_NOTE, ROUND_NOTE_TONE } from '@/lib/roundState'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../kind'
import AddRound from './AddRound'

export const dynamic = 'force-dynamic'

export default async function TripCoursePortalPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  // The trip and its rounds in one request rather than two, one after the
  // other. Every trip page starts by looking a trip up by its code and then
  // wants something scoped by `trip.id`, and PostgREST will do that join —
  // the leaderboard already asks this way. On a bad connection the wait it
  // removes is a whole round trip, which is the expensive unit here.
  //
  // Three more things used to load alongside, for the Add round sheet: the
  // platform course catalogue, the whole itinerary and every player's
  // handicap. All three were on the critical path of a tab a group opens over
  // and over on a course, serialised into its HTML, for a sheet most visits
  // never open. They load inside `AddRound` on the tap now — see the note
  // there and in `usePlatformCourses`; it is the same rule three times.
  // The kind rides alongside rather than inside the select: a named `kind`
  // column would fail this whole query on an un-migrated database — the
  // note on fetchTripKind — and alongside it costs no round trip.
  const [kind, { data: trip, error: tripError }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      // One string, not two joined: supabase-js reads the select as a literal
      // type to work out the row shape, and a `+` between two halves leaves it
      // with nothing to read — every field on `trip` then fails to typecheck.
      .select('id, name, start_date, end_date, track_stats, rounds(id, round_number, status, courses(name, location))')
      .eq('trip_code', tripCode)
      .order('round_number', { referencedTable: 'rounds' })
      .single(),
  ])
  const event = isEvent(kind)

  if (tripError) console.error('TripCoursePortal trip query failed:', tripError)
  if (!trip) notFound()

  const rounds = (trip.rounds ?? []) as unknown as {
    id: string; round_number: number; status: string
    courses: { name: string; location: string | null } | null
  }[]

  // What has actually happened on each round, rather than what `rounds.status`
  // claims: the status column is set by hand and drifts, and the tile is the
  // one place someone checks before walking to the first tee.
  //
  // **Counted, never fetched.** This asked for `scores.round_id` and
  // `live_scores.round_id` across every round of the trip and built a Set of
  // at most half a dozen ids out of the answer — a week's golf for sixteen
  // players is some seventeen hundred rows, scanned, serialised and parsed on
  // the critical path of the Scoring tab, to answer one yes-or-no per tile.
  // `head: true` returns the count in a header and no body at all, so the
  // reply is bytes. One request per round rather than one for the lot, but
  // they go together over the one connection and each is a rounding error;
  // on a bad radio, small and many beats large and few every time.
  const roundIds = (rounds ?? []).map(r => r.id)

  // The locks ride along because they are half the question: a vacant card —
  // open, nobody on it — does not make a round "In play", or one stray tap
  // on "start a scorecard" keeps a finished round green until the nightly
  // job closes it. The rule is liveRoundPresence's, in lib/rowContext.ts.
  const { data: openData, error: openErr } = roundIds.length > 0
    ? await supabase.from('live_rounds').select('round_id, live_player_locks(player_id)')
        .eq('status', 'active').in('round_id', roundIds)
    : { data: [], error: null }
  if (openErr) console.error('TripCoursePortal live rounds query failed:', openErr)
  const openRounds = new Set(
    liveRoundPresence((openData ?? []) as unknown as OpenCard[]).activeRoundIds,
  )

  const anyRows = async (table: 'scores' | 'live_scores', roundId: string) => {
    const { count, error } = await supabase
      .from(table)
      .select('round_id', { count: 'exact', head: true })
      .eq('round_id', roundId)
      .limit(1)
    if (error) console.error(`TripCoursePortal ${table} count failed:`, error)
    return (count ?? 0) > 0
  }

  // A round counts as played once anything has been committed to it, or once
  // there are uncommitted scores against a card that is **still open**.
  //
  // That second clause used to be "uncommitted scores, full stop", which is
  // the phantom: `live_scores` has no foreign key to `live_rounds`, so a card
  // half-entered and abandoned leaves its holes behind for good and the tile
  // read "Scores in" on a round nobody finished. The same rule the board
  // applies — see the note on `buildRowContext` in lib/rowContext.ts.
  //
  // Which is also why `live_scores` is only asked about for a round that is
  // open: on every other round the answer could not change the tile, so the
  // request would be one nobody could read the result of.
  const played = await Promise.all(
    roundIds.map(async id => {
      const [committed, live] = await Promise.all([
        anyRows('scores', id),
        openRounds.has(id) ? anyRows('live_scores', id) : Promise.resolve(false),
      ])
      return { id, scored: committed || live }
    }),
  )
  const scoredRounds = new Set(played.filter(r => r.scored).map(r => r.id))

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">

      <TripHeader backTo={`/trip/${tripCode}`} title="scoring" />

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-ink/65 text-[13px] tracking-[0.2em] uppercase">
            Choose a round
          </p>
          {/* The door for the impromptu game — the same golf form the
              itinerary uses, in a sheet, without a trip through Trip Setup.
              A trip's door: on an event the field plays the rounds the
              organiser set, and anything modifiable lives behind the PIN —
              the organiser adds golf through the setup screen's running
              order. */}
          {!event && (
            <AddRound
              tripId={trip.id}
              startDate={trip.start_date ?? null}
              endDate={trip.end_date ?? null}
              trackStats={trip.track_stats === true}
            />
          )}
        </div>

        {(rounds ?? []).length === 0 && (
          <p className="text-ink/65 text-sm py-8 text-center">
            No rounds set up for this {event ? 'event' : 'trip'} yet.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {(rounds ?? []).map(round => {
            const course = round.courses as unknown as { name: string; location: string | null } | null
            const tone = roundTone(scoredRounds.has(round.id), openRounds.has(round.id))
            return (
              <Link
                key={round.id}
                href={`/trip/${tripCode}/scoring/${round.round_number}`}
                className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl press ${ROUND_TILE[tone]}`}
              >
                <div className="min-w-0">
                  <p className="t-cap uppercase tracking-[0.2em] text-ink/65 mb-1">
                    Round {round.round_number}
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-ink text-lg leading-tight truncate">
                    {course?.name ?? `Round ${round.round_number}`}
                  </p>
                  <p className={`t-cap mt-1 truncate ${ROUND_NOTE_TONE[tone]}`}>
                    {course?.location ? `${course.location} · ` : ''}{ROUND_NOTE[tone]}
                  </p>
                </div>
                {/* The whole tile is the link, so "Open →" was a label for
                    something already obvious — and it was taking the width a
                    long course name needs. The live dot stays: it says
                    something the tile does not. */}
                {tone === 'live' && (
                  <span
                    className="flex-shrink-0 ml-4 w-1.5 h-1.5 rounded-full bg-accent dot-live"
                    aria-hidden="true"
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
