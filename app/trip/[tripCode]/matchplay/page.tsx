import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { parseFormats, isPairsMatchplay, matchplayOn } from '@/lib/formats'
import { playerEntrant, pairEntrant, type Entrant } from '@/lib/matchplayEntrants'
import BackButton from '@/app/components/BackButton'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'
import MatchplayBracket, {
  type BracketMatchRow, type BracketEntrantRow,
} from './MatchplayBracket'

export const dynamic = 'force-dynamic'

/**
 * The matchplay draw, on its own route.
 *
 * Kept separate from the leaderboard on purpose — the leaderboard links here
 * rather than rendering any of this, so none of the bracket display code is
 * bundled into the leaderboard's page load.
 */
export default async function MatchplayPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, formats')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('MatchplayPage trip query failed:', tripError)
  if (!trip) notFound()

  const formats = parseFormats(trip.formats)
  const enabled = matchplayOn(formats)
  const pairs   = isPairsMatchplay(formats)

  const [matchesRes, playersRes, teamsRes] = await Promise.all([
    supabase
      .from('matchplay_matches')
      .select(
        'id, trip_id, round_number, round_name, slot, player_a_id, player_b_id, ' +
        'player_a_is_bye, player_b_is_bye, seed_a, seed_b, ' +
        'winner_player_id, result, next_match_id, next_slot, ' +
        'entrant_type, team_a_id, team_b_id, winner_team_id'
      )
      .eq('trip_id', trip.id)
      .order('round_number')
      .order('slot'),
    supabase
      .from('players')
      .select('id, name, handicap, team_id')
      .eq('trip_id', trip.id),
    // Only needed for a pairs draw, but asking for it unconditionally keeps
    // this a single round trip rather than a conditional second one.
    supabase
      .from('teams')
      .select('id, name')
      .eq('trip_id', trip.id),
  ])

  if (matchesRes.error) console.error('MatchplayPage matches query failed:', matchesRes.error)
  if (playersRes.error) console.error('MatchplayPage players query failed:', playersRes.error)
  if (teamsRes.error)   console.error('MatchplayPage teams query failed:', teamsRes.error)

  const roster = playersRes.data ?? []

  type RawMatch = Record<string, unknown> & {
    entrant_type?: string | null
    team_a_id?: string | null
    team_b_id?: string | null
    winner_team_id?: string | null
  }
  const rawMatches = (matchesRes.data ?? []) as unknown as RawMatch[]

  // The bracket itself says what it is between, not the settings. A draw made
  // before the format was switched is still a real draw, and reading it
  // against the wrong kind of entrant renders a column of blanks.
  const storedAsPairs = rawMatches.some(m => m.entrant_type === 'pair')

  const entrants: Entrant[] = storedAsPairs
    ? (teamsRes.data ?? []).map(t => pairEntrant(t, roster.filter(p => p.team_id === t.id)))
    : roster.map(playerEntrant)

  // A pairs row keeps its sides in the team columns; everything downstream
  // works in one shape, so they are moved across on the way in.
  const matches = rawMatches.map(m =>
    m.entrant_type === 'pair'
      ? { ...m,
          player_a_id: m.team_a_id ?? null,
          player_b_id: m.team_b_id ?? null,
          winner_player_id: m.winner_team_id ?? null }
      : m)

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="bg-cream border-b border-bark/12">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}/leaderboard`} />
          <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl text-ink tracking-wide truncate px-2">
            Matchplay
          </h1>
          <div className="w-11" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {!enabled ? (
          <EmptyState
            title="Matchplay isn't switched on"
            body="Turn it on in Trip Setup, then draw the bracket."
            tripCode={tripCode}
          />
        ) : matches.length === 0 ? (
          <EmptyState
            title="No bracket has been created for this trip yet"
            body="Open Trip Setup and use Create Matchplay to draw the bracket."
            tripCode={tripCode}
          />
        ) : (
          <MatchplayBracket
            matches={matches as unknown as BracketMatchRow[]}
            entrants={entrants as BracketEntrantRow[]}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState({
  title, body, tripCode,
}: {
  title: string
  body: string
  tripCode: string
}) {
  return (
    <div className="border border-bark/12 rounded-sm px-6 py-14 text-center">
      <p className="font-[family-name:var(--font-display)] text-ink/65 text-lg leading-snug mb-2">
        {title}
      </p>
      <p className="text-ink/40 text-sm leading-relaxed mb-8 max-w-xs mx-auto">{body}</p>
      <Link
        href={`/trip/${tripCode}/setup`}
        className="inline-block px-6 py-3.5 border border-accent/40 text-ink/40 rounded-sm text-xs tracking-[0.2em] uppercase hover:bg-accent/10 transition-colors"
      >
        Trip Setup
      </Link>
      <TabBar tripCode={tripCode} />
    </div>
  )
}
