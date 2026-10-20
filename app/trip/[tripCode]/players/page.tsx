import { supabase } from '@/lib/supabase'
import PlayersClient from './PlayersClient'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import { sortForClaiming, confirmedCount } from '@/lib/roster'
import { fetchTripKind } from '../kind'
import { allowsParticipant } from '@/lib/eventPermissions'
import { isEvent } from '@/lib/eventHub'
import { linkedPlayerId } from '@/lib/currentPlayer'
import { golfIrelandView } from '../golfIreland'
import GolfIrelandLinkCard from './GolfIrelandLinkCard'

export const dynamic = 'force-dynamic'

export default async function PlayersPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  // The kind and the permissions ride alongside the page's own query, each
  // fail-soft in its own request — an un-migrated database simply reads as
  // a trip with open access, which is what it can only hold.
  const [kind, { data: trip, error: tripError }, permsResult, setupResult, cookieId] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, name')
      .eq('trip_code', tripCode)
      .single(),
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('trip_code', tripCode)
      .single(),
    // A league's setup, for its Golf Ireland answer — its own query, fail
    // soft, like the permissions.
    supabase
      .from('trips')
      .select('bracket_setup')
      .eq('trip_code', tripCode)
      .single(),
    linkedPlayerId(tripCode),
  ])

  if (tripError) console.error('players/page trip query failed:', tripError)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center paper px-6">
        <p className="t-h2 text-ink mb-3">Trip not found</p>
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
  // What this screen calls the thing being joined.
  const noun = isEvent(kind) ? 'event' : 'trip'
  const roundIds = (roundsResult.data ?? []).map(r => r.id as string)

  // A league reading Golf Ireland: who is linked (the badge), and this
  // phone's own link card when it has claimed a name here. Null otherwise.
  const me = players.find(p => p.id === cookieId) ?? null
  const gi = await golfIrelandView(
    trip.id,
    (setupResult.data as { bracket_setup?: unknown } | null)?.bracket_setup,
    me?.id ?? null,
  )

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-md mx-auto px-6 py-10">

        <div className="mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-accent" />
          <div className="w-3 h-3 rounded-full bg-accent" />
          <div className="w-3 h-3 rounded-full border-2 border-accent" />
        </div>

        <h1 className="t-h1 text-ink mb-2">
          {trip.name}
        </h1>
        <p className="text-ink/65 text-sm mb-10">Join the {noun}</p>

        {playersResult.error && (
          <p className="text-accent text-sm mb-6">
            Could not load players — refresh to try again.
          </p>
        )}

        {gi?.mine && (
          <div className="mb-10">
            <GolfIrelandLinkCard
              tripCode={tripCode}
              status={gi.mine}
              rulesLine={gi.rulesLine}
              clubNames={gi.clubNames}
              connected={gi.connected}
            />
          </div>
        )}

        <PlayersClient
          linkedIds={gi?.linkedIds}
          tripCode={tripCode}
          tripId={trip.id}
          players={players}
          confirmed={confirmedCount(players)}
          roundIds={roundIds}
          canAddPlayers={allowsParticipant(
            kind,
            (permsResult.data as { event_permissions?: unknown } | null)?.event_permissions,
            'add_players',
          )}
          // A trip's roster is the lead player's recollection of everybody's
          // handicap, so claiming a name stops to check it. An event's is
          // the organiser's own entry — often off a club list — and the
          // field revising it on the way in is their call to make, not this
          // screen's, so an event claims in one tap as before.
          askHandicap={!isEvent(kind)}
          noun={noun}
        />

        <div className="mt-12">
          <BackButton href={`/trip/${tripCode}`} label={noun === 'event' ? 'Event' : 'Trip'} />
        </div>

      </div>

      <SupportLink className="px-6 pb-8" />
    </main>
  )
}
