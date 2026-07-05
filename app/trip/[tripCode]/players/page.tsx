import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import PlayersClient from './PlayersClient'

export const dynamic = 'force-dynamic'

export default async function PlayersPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('id, name')
    .eq('trip_code', tripCode)
    .single()

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-3">Trip not found</p>
        <Link href="/" className="text-[#C9A84C] text-sm tracking-wide hover:text-[#d4b35a] transition-colors">
          ← Back to home
        </Link>
      </main>
    )
  }

  const { data: players } = await supabase
    .from('players')
    .select('id, name, handicap, gender')
    .eq('trip_id', trip.id)
    .eq('is_lead', false)
    .or('claimed.is.null,claimed.eq.false')
    .order('name')

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

        <PlayersClient
          tripCode={tripCode}
          tripId={trip.id}
          unclaimedPlayers={players ?? []}
        />

        <div className="mt-12">
          <Link href={`/trip/${tripCode}`} className="text-white/25 text-xs tracking-wide hover:text-white/50 transition-colors">
            ← Back to trip
          </Link>
        </div>

      </div>
    </main>
  )
}
