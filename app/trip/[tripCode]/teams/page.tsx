import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { MAIN_SET } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import BackButton from '@/app/components/BackButton'
import TripTeamsClient from './TripTeamsClient'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import PasscodeGate from '../setup/PasscodeGate'
import { isLocked } from '@/lib/passcode'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../kind'

export const dynamic = 'force-dynamic'

/**
 * Team selection.
 *
 * The screen is about apportioning teams to the leaderboards that need them,
 * so it is handed every team board, every team on the trip and every
 * membership — not one sheet chosen by a query string. Which sheet is being
 * edited is a decision the organiser makes on the screen by picking boards,
 * not something a link has to carry.
 */
export default async function TripTeamsPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  // The kind alongside, not inside: a named `kind` would fail this select
  // on an un-migrated database — the note on fetchTripKind.
  const [kind, { data: trip, error: tripError }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, trip_code, name, formats, leaderboards, team_scoring, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
  ])
  const event = isEvent(kind)

  if (tripError) console.error('TripTeamsPage trip query failed:', tripError)
  if (!trip) notFound()

  const boards = boardsForTrip(trip)

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

  const teams = (teamsRes.data ?? []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    color: t.color as string,
    team_set: (t.team_set as string | null) ?? MAIN_SET,
  }))

  const screen = (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="bg-cream border-b border-bark/12">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}/setup`} />
          <div className="min-w-0 text-center">
            <h1 className="font-[family-name:var(--font-display)] text-lg text-ink tracking-wide">
              Teams
            </h1>
          </div>
          <div className="w-[60px]" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <TripTeamsClient
          tripId={trip.id}
          tripCode={tripCode}
          boards={boards}
          teams={teams}
          players={(playersRes.data ?? []) as {
            id: string; name: string; handicap: number | null; gender: string
          }[]}
          memberships={memberships}
        />
      </div>
      <SupportLink className="px-4 pb-12" />
    </div>
  )

  // On a trip, teams are the group's to argue over. On an event they are
  // the organiser's — the whole screen assigns people to sheets — so it
  // stands behind the same PIN as the rest of the running of the event.
  // Unlocking any organiser screen unlocks them all for the session.
  if (event && isLocked(trip.settings_passcode_hash as string | null)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="Organisers only"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {screen}
      </PasscodeGate>
    )
  }

  return screen
}
