import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { boardTitle } from '@/lib/leaderboards'
import {
  MAIN_SET, sheetsInUse, boardsOnSheet, sheetSubtitle, teamsOnSheet, teamFor,
} from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { teamNoun } from '@/lib/teamLimits'
import BackButton from '@/app/components/BackButton'
import TripTeamsClient from './TripTeamsClient'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'

export const dynamic = 'force-dynamic'

export default async function TripTeamsPage({
  params, searchParams,
}: {
  params: Promise<{ tripCode: string }>
  searchParams: Promise<{ set?: string }>
}) {
  const { tripCode } = await params
  const { set } = await searchParams

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, formats, leaderboards, team_scoring')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripTeamsPage trip query failed:', tripError)
  if (!trip) notFound()

  // Which sheet is being picked. A trip can run a league between fours and a
  // knockout between pairings — the same players, arranged twice — so the
  // screen has to be told which of the two it is editing. An unknown or
  // missing `?set=` falls back to the trip's first sheet rather than 404ing:
  // a stale link should land somewhere real.
  const boards  = boardsForTrip(trip)
  const sheets  = sheetsInUse(boards)
  const teamSet = set && sheets.includes(set) ? set : sheets[0] ?? MAIN_SET

  // A pairs draw calls its teams pairings and locks them at two — of ITS
  // sheet. A draw running alongside a league has no business resizing the
  // league's teams, which is what a trip-wide rule did.
  const onSheet = boardsOnSheet(boards, teamSet)
  const noun = teamNoun(onSheet)

  const [teamsRes, playersRes, memberships] = await Promise.all([
    supabase.from('teams')
      .select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
    supabase
      .from('players')
      .select('id, name, handicap, gender')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
    fetchMemberships(trip.id),
  ])

  if (teamsRes.error) console.error('TripTeamsPage teams query failed:', teamsRes.error)
  if (playersRes.error) console.error('TripTeamsPage players query failed:', playersRes.error)

  const allTeams = (teamsRes.data ?? []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    color: t.color as string,
    team_set: (t.team_set as string | null) ?? MAIN_SET,
  }))

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="bg-cream border-b border-bark/12">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}/setup`} />
          <div className="min-w-0 text-center">
            <h1 className="font-[family-name:var(--font-display)] text-lg text-ink tracking-wide">
              {noun.Many}
            </h1>
            {/* Which board these teams play for. With one sheet it is
                obvious; with two it is the only thing telling them apart. */}
            {sheets.length > 1 && (
              <p className="t-cap text-ink/65 truncate">
                {sheetSubtitle(boards, teamSet, boardTitle)}
              </p>
            )}
          </div>
          <div className="w-[60px]" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <TripTeamsClient
          tripId={trip.id}
          boards={onSheet}
          teamSet={teamSet}
          teams={teamsOnSheet(allTeams, teamSet) as { id: string; name: string; color: string }[]}
          // `team_id` here is their place on THIS sheet, so the picker works
          // in one shape whichever sheet it is showing.
          players={(playersRes.data ?? []).map(p => ({
            ...p,
            team_id: teamFor(memberships, p.id, teamSet),
          }))}
        />
      </div>
      <TabBar tripCode={tripCode} />
    </div>
  )
}
