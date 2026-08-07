import { supabase } from '@/lib/supabase'
import PlayersClient from './PlayersClient'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'
import { sortForClaiming, confirmedCount } from '@/lib/roster'

export const dynamic = 'force-dynamic'

export default async function PlayersPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('players/page trip query failed:', tripError)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Trip not found</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  // ── Everybody ──
  //
  // This used to ask for unclaimed, non-lead players only, and that is the
  // whole reason a second device could not be linked: the moment somebody
  // claimed their slot their name left this list, and the only thing left to
  // do was "Add yourself", which makes a second copy of a person who is
  // already on the trip. The organiser was excluded outright and could never
  // link a second device at all.
  //
  // So: every player on the trip, leads included, whatever their state. What
  // a name does when it is tapped is now the thing that differs, not whether
  // it is offered.
  const [playersResult, roundsResult] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, handicap, gender, claimed')
      .eq('trip_id', trip.id)
      // A composite is a synthetic scorecard, not a person — the leaderboard
      // and the matchplay draw both leave them out, and nobody should be able
      // to tap one and become it. The column is NOT NULL, so this is safe as
      // an equality where `claimed` would not have been.
      .eq('is_composite', false)
      .order('name'),
    // A player adding themselves after the rounds exist needs a handicap
    // snapshot for each of them, so the ids come down with the page.
    supabase
      .from('rounds')
      .select('id')
      .eq('trip_id', trip.id)
      .order('round_number'),
  ])

  if (playersResult.error) console.error('players/page players query failed:', playersResult.error)
  if (roundsResult.error) console.error('players/page rounds query failed:', roundsResult.error)

  const players = sortForClaiming(playersResult.data ?? [])
  const roundIds = (roundsResult.data ?? []).map(r => r.id as string)

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-md mx-auto px-6 py-10">

        <div className="mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-accent" />
          <div className="w-3 h-3 rounded-full bg-accent" />
          <div className="w-3 h-3 rounded-full border-2 border-accent" />
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-ink leading-tight mb-2">
          {trip.name}
        </h1>
        <p className="text-ink/65 text-sm tracking-wide mb-10">Join the trip!</p>

        {playersResult.error && (
          <p className="text-accent text-sm mb-6">
            Could not load players — please refresh the page.
          </p>
        )}

        <PlayersClient
          tripCode={tripCode}
          tripId={trip.id}
          players={players}
          confirmed={confirmedCount(players)}
          roundIds={roundIds}
        />

        <div className="mt-12">
          <BackButton href={`/trip/${tripCode}`} label="Trip" />
        </div>

      </div>

      <SupportLink className="px-6 pb-8" />
      <TabBar tripCode={tripCode} />
    </main>
  )
}
