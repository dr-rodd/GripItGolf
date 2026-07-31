import { supabase } from '@/lib/supabase'
import PlayersClient from './PlayersClient'
import BackButton from '@/app/components/BackButton'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'

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

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name, handicap, gender')
    .eq('trip_id', trip.id)
    .eq('is_lead', false)
    .or('claimed.is.null,claimed.eq.false')
    .order('name')

  if (playersError) console.error('players/page players query failed:', playersError)

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader tripCode={tripCode} />

      <div className="max-w-md mx-auto px-6 py-10">

        <div className="mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-accent" />
          <div className="w-3 h-3 rounded-full bg-accent" />
          <div className="w-3 h-3 rounded-full border-2 border-accent" />
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-ink leading-tight mb-2">
          {trip.name}
        </h1>
        <p className="text-ink/40 text-sm tracking-wide mb-10">Who are you?</p>

        {playersError && (
          <p className="text-accent text-sm mb-6">
            Could not load players — please refresh the page.
          </p>
        )}

        <PlayersClient
          tripCode={tripCode}
          tripId={trip.id}
          unclaimedPlayers={players ?? []}
        />

        <div className="mt-12">
          <BackButton href={`/trip/${tripCode}`} label="Trip" />
        </div>

      </div>

      <TabBar tripCode={tripCode} />
    </main>
  )
}
