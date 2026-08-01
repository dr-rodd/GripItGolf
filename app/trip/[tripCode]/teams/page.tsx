import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseFormats } from '@/lib/formats'
import { teamNoun } from '@/lib/teamLimits'
import BackButton from '@/app/components/BackButton'
import TripTeamsClient from './TripTeamsClient'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'

export const dynamic = 'force-dynamic'

export default async function TripTeamsPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, num_teams, formats')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripTeamsPage trip query failed:', tripError)
  if (!trip) notFound()

  // A pairs draw calls its teams pairings and locks them at two, so the page
  // has to know what the trip is running before it draws anything.
  const formats = parseFormats(trip.formats)
  const noun = teamNoun(formats)

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
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="bg-cream border-b border-bark/12">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}/setup`} />
          <h1 className="font-[family-name:var(--font-display)] text-lg text-ink tracking-wide">
            {noun.Many}
          </h1>
          <div className="w-[60px]" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <TripTeamsClient
          tripId={trip.id}
          numTeams={trip.num_teams ?? 2}
          formats={formats}
          teams={teamsRes.data ?? []}
          players={playersRes.data ?? []}
        />
      </div>
      <TabBar tripCode={tripCode} />
    </div>
  )
}
