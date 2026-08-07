import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { hasMatchplay, needsPairings } from '@/lib/leaderboards'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { MAIN_SET, setOf, teamsOnSheet, membersOf } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { playerEntrant, pairEntrant, type Entrant } from '@/lib/matchplayEntrants'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
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
    .select('id, name, formats, leaderboards, team_scoring')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('MatchplayPage trip query failed:', tripError)
  if (!trip) notFound()

  // Read off what the trip plays for. This used to ask `trips.formats`,
  // which nothing writes any more — so a knockout chosen in settings landed
  // here as "matchplay isn't switched on", with a button back to the
  // settings screen that had just switched it on.
  const boards  = boardsForTrip(trip)
  const enabled = hasMatchplay(boards)
  const pairs   = needsPairings(boards)

  const [matchesRes, playersRes, teamsRes, memberships] = await Promise.all([
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
      .select('id, name, handicap')
      .eq('trip_id', trip.id),
    // Only needed for a pairs draw, but asking for it unconditionally keeps
    // this a single round trip rather than a conditional second one.
    supabase
      .from('teams')
      .select('id, name, team_set')
      .eq('trip_id', trip.id),
    fetchMemberships(trip.id),
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

  // A pairs draw seats ITS sheet's pairings. A trip running a league between
  // fours alongside this knockout has two sheets of teams, and naming the
  // bracket off the wrong one would show four players on a side.
  const draw = boards.find(lb => lb.competition === 'matchplay')
  const sheet = draw ? setOf(draw) : MAIN_SET
  const entrants: Entrant[] = storedAsPairs
    ? teamsOnSheet(
        (teamsRes.data ?? []).map(t => ({ ...t, team_set: t.team_set ?? MAIN_SET })),
        sheet,
      ).map(t => {
        const ids = membersOf(memberships, t.id)
        return pairEntrant(t, roster.filter(p => ids.includes(p.id)))
      })
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
            body="Turn it on in Trip setup, then draw the bracket."
            tripCode={tripCode}
          />
        ) : matches.length === 0 ? (
          <EmptyState
            title="No bracket has been drawn yet"
            body={
              pairs
                ? 'Pick the pairings in Trip setup, then use Create Matchplay to draw the bracket.'
                : 'Open Trip setup and use Create Matchplay to draw the bracket.'
            }
            tripCode={tripCode}
          />
        ) : (
          <MatchplayBracket
            matches={matches as unknown as BracketMatchRow[]}
            entrants={entrants as BracketEntrantRow[]}
          />
        )}
      </div>
      {/* Rendered once here rather than inside EmptyState, so a drawn bracket
          keeps the tab bar and the footer exactly like every other screen —
          before this, both vanished the moment there was a bracket to show. */}
      <SupportLink className="px-4 pb-12" />
      <TabBar tripCode={tripCode} />
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
      <p className="font-[family-name:var(--font-display)] text-ink/80 text-lg leading-snug mb-2">
        {title}
      </p>
      <p className="text-ink/65 text-sm leading-relaxed mb-8 max-w-xs mx-auto">{body}</p>
      <Link
        href={`/trip/${tripCode}/setup`}
        className="inline-block px-6 py-3.5 border border-accent/40 text-ink/65 rounded-sm text-[13px] tracking-[0.2em] uppercase hover:bg-accent/10 transition-colors"
      >
        Trip setup
      </Link>
    </div>
  )
}
