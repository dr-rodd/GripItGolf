import { supabase } from '@/lib/supabase'
import PlayersClient from './PlayersClient'
import BackButton from '@/app/components/BackButton'

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
      <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-3">Trip not found</p>
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
    <main className="min-h-dvh bg-[#0a1a0e] px-6 py-12">
      <div className="max-w-md mx-auto">

        <div className="mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
          <div className="w-3 h-3 rounded-full bg-[#C9A84C]" />
          <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
        </div>

        <h1 className="font-[family-name:var(--font-playfair)] text-4xl sm:text-5xl text-white leading-tight mb-2">
          {trip.name}
        </h1>
        <p className="text-white/40 text-sm tracking-wide mb-10">Who are you?</p>

        {playersError && (
          <p className="text-[#C9A84C] text-sm mb-6">
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
    </main>
  )
}
