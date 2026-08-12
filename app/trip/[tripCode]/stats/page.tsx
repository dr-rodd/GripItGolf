import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchTripStats } from '@/lib/hubStanding'
import { coverage } from '@/lib/holeStats'
import { tripState, todayString } from '@/lib/tripStatus'
import { currentPlayer } from '@/lib/currentPlayer'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import { EmptyState } from '@/app/components/ui'
import StatsClient from './StatsClient'

export const dynamic = 'force-dynamic'

/**
 * The stats lab, on its own route.
 *
 * Separate from the leaderboard for the reason the draw is separate: the
 * board links here rather than rendering any of it, so none of this is
 * bundled into the page somebody opens on the eighteenth green.
 *
 * The header carries the green dot and a title row rather than a title mark
 * — the marks are fixed artwork and there is no "stats." lettering. Same
 * shape as the matchplay page.
 */
export default async function StatsPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('StatsPage trip query failed:', tripError)
  if (!trip) notFound()

  // `courseNames` comes back with everything else. It used to be a fourth
  // round trip, made here after this call had returned, because the page
  // thought it needed `courseByRound` before it could know which ids to ask
  // for — but `fetchTripContext` works those ids out itself and is already
  // handing them to the holes and tees queries. See the note there.
  //
  // It is the wider map as a result: every course this trip plays, rather
  // than only the ones left after a casual round opts out of stats. That is
  // safe because it is a lookup and nothing else — `StatsClient` builds its
  // chips by filtering these ids against the courses `stats` actually
  // mentions, and `stats` is the filtered set. A course with no holes behind
  // it still cannot become a chip.
  const { stats, holes, players, rounds, courseByRound, courseNames, error } =
    await fetchTripStats(trip.id)

  // The roster is fetched here rather than taken from `players` above so the
  // cookie is matched against the same shape every other screen matches it
  // against. It personalises which tab opens first and nothing else.
  const me = await currentPlayer(tripCode, players.map(p => ({ id: p.id })))

  const cover = coverage(stats)

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}`} title="statsHub" />

      {/* No page-title row: the header's "stats hub." artwork is the title,
          and it already carries the way back. */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {error ? (
          // Said out loud rather than rendered as an absence: an empty table
          // and a failed query look identical, and only one of them means
          // nobody has played.
          <p className="t-body text-rust-deep">
            Could not work the stats out just now — try again.
          </p>
        ) : cover.level === 'none' ? (
          <EmptyState
            message={
              trip.track_stats
                ? 'No putts or fairways recorded yet. They start filling in from the next card.'
                : 'Stats are switched off for this trip. Turn them on in Trip Setup and the scorecard starts asking.'
            }
            actionLabel={trip.track_stats ? undefined : 'Trip Setup'}
            actionHref={trip.track_stats ? undefined : `/trip/${tripCode}/setup`}
          />
        ) : (
          <StatsClient
            tripCode={tripCode}
            stats={stats}
            holes={holes}
            players={players.map(p => ({ id: p.id, name: p.name }))}
            rounds={rounds}
            courseByRound={[...courseByRound]}
            courseNames={[...courseNames]}
            meId={me?.id ?? null}
            thin={cover.level === 'thin'}
            // Decided here because the server holds the clock. The honours
            // read "as it stands" while the trip is open and settle into a
            // final board once the end date has passed — the same rule the
            // admin overview reads a trip's state by.
            tripOver={!tripState(trip, todayString(new Date())).open}
          />
        )}
      </div>

      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
