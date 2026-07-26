import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import TripTeamsClient from './TripTeamsClient'

export const dynamic = 'force-dynamic'

export default async function TripTeamsPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, num_teams')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripTeamsPage trip query failed:', tripError)
  if (!trip) notFound()

  const [teamsRes, playersRes] = await Promise.all([
    supabase.from('teams').select('id, name, color').eq('trip_id', trip.id).order('created_at'),
    supabase
      .from('players')
      .select('id, name, handicap, gender, team_id')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
  ])

  if (teamsRes.error) console.error('TripTeamsPage teams query failed:', teamsRes.error)
  if (playersRes.error) console.error('TripTeamsPage players query failed:', playersRes.error)

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="border-b border-[#1e3d28] sticky top-0 z-20 bg-[#0a1a0e]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}/setup`} />
          <h1 className="font-[family-name:var(--font-playfair)] text-lg text-white tracking-wide">
            Teams
          </h1>
          <div className="w-[60px]" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <TripTeamsClient
          tripId={trip.id}
          numTeams={trip.num_teams ?? 2}
          teams={teamsRes.data ?? []}
          players={playersRes.data ?? []}
        />
      </div>
    </div>
  )
}
