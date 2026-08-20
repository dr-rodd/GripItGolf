import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { hasMatchplay, needsPairings, tripQuotaScale } from '@/lib/leaderboards'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { MAIN_SET, setOf, teamsOnSheet, membersOf } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { playerEntrant, pairEntrant, type Entrant } from '@/lib/matchplayEntrants'
import { parseTeamScoring } from '@/lib/teamScoring'
import { buildRowContext, liveRoundPresence, type OpenCard } from '@/lib/rowContext'
import { readBracket, type MatchReading } from '@/lib/matchResults'
import { type QuotaScale } from '@/lib/quota'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
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

  // ── The cards, where a bracket round has been linked to one ──
  //
  // Only the linked rounds are fetched. A draw decided by hand — every draw
  // before this existed — asks for none of this, and the page is the two
  // queries it always was.
  const links = draw?.roundLinks ?? []
  const readings = links.length > 0
    ? await readLinkedRounds(trip, links, matches, entrants, memberships,
        tripQuotaScale(boards))
    : []

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
            title="No bracket has been drawn yet"
            body={
              pairs
                ? 'Pick the pairings in Trip Setup, then use Create Matchplay to draw the bracket.'
                : 'Open Trip Setup and use Create Matchplay to draw the bracket.'
            }
            tripCode={tripCode}
          />
        ) : (
          <MatchplayBracket
            matches={matches as unknown as BracketMatchRow[]}
            entrants={entrants as BracketEntrantRow[]}
            readings={readings}
          />
        )}
      </div>
      {/* Rendered once here rather than inside EmptyState, so a drawn bracket
          keeps the tab bar and the footer exactly like every other screen —
          before this, both vanished the moment there was a bracket to show. */}
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}


/**
 * The linked rounds' cards, read into a result per match.
 *
 * Scoped to the rounds actually linked rather than the whole trip: a knockout
 * played over one afternoon should not pull down every scorecard of the week
 * to find out who won a quarter-final.
 *
 * The assembly is `buildRowContext`, the same one the leaderboard goes
 * through — so the handicap a match is played off and the handicap the boards
 * read are the same number by construction, not by two pieces of code
 * agreeing. See lib/matchResults.ts.
 */
async function readLinkedRounds(
  trip: { id: string; team_scoring?: unknown },
  links: readonly { roundId: string }[],
  matches: readonly Record<string, unknown>[],
  entrants: readonly { id: string }[],
  memberships: readonly { team_id: string; player_id: string }[],
  /** What this trip's Quota board plays, which a link may override. */
  quotaScale: QuotaScale,
): Promise<MatchReading[]> {
  const roundIds = [...new Set(links.map(l => l.roundId))]
  const nilId = '00000000-0000-0000-0000-000000000000'

  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, course_id')
    .in('id', roundIds.length > 0 ? roundIds : [nilId])

  const courseIds = [...new Set((rounds ?? []).map(r => r.course_id).filter(Boolean))] as string[]

  const [playersRes, holesRes, scoresRes, liveScoresRes, hcpsRes, teesRes, openRes] =
    await Promise.all([
      supabase.from('players')
        .select('id, name, handicap, gender')
        .eq('trip_id', trip.id).eq('is_composite', false),
      supabase.from('holes')
        .select('id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId]),
      supabase.from('scores')
        .select('player_id, hole_id, gross_score, stableford_points, no_return, round_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('live_scores')
        .select('player_id, round_id, hole_number, gross_score, stableford_points')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('round_handicaps')
        .select('round_id, player_id, playing_handicap, tee_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('tees')
        .select('id, slope, course_rating, par')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId]),
      // Locks embedded: a vacant card puts nothing in play — the rule is
      // liveRoundPresence's, in lib/rowContext.ts, same as every reader.
      supabase.from('live_rounds')
        .select('round_id, live_player_locks(player_id)')
        .eq('status', 'active')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
    ])

  const ctx = buildRowContext({
    players: (playersRes.data ?? []) as never,
    teams: [] as never,
    memberships: memberships as never,
    holes: (holesRes.data ?? []) as never,
    rounds: (rounds ?? []) as never,
    courseByRound: new Map((rounds ?? []).map(r => [r.id as string, r.course_id as string])),
    scores: (scoresRes.data ?? []) as never,
    liveScores: (liveScoresRes.data ?? []) as never,
    roundHandicaps: (hcpsRes.data ?? []) as never,
    tees: (teesRes.data ?? []) as never,
    activeRoundIds:
      liveRoundPresence((openRes.data ?? []) as unknown as OpenCard[]).activeRoundIds,
    livePlayerIds: [],
    // A knockout is never scored on the old single team setting — it reads
    // cards hole by hole, not a team format. Passing the trip's would be
    // handing `buildRowContext` an answer nothing here asks it.
    legacyTeamScoring: parseTeamScoring(undefined),
  })

  // A singles draw seats players, so a side is its own only member. A pairs
  // draw seats teams, and the pairing's two players come off the memberships.
  const entrantIds = new Set(entrants.map(e => e.id))
  const playersOf = (sideId: string): string[] => {
    const members = memberships.filter(m => m.team_id === sideId).map(m => m.player_id)
    if (members.length > 0) return members
    return entrantIds.has(sideId) ? [sideId] : []
  }

  return [...readBracket({
    matches: matches as never,
    links: links as never,
    ctx,
    tripQuotaScale: quotaScale,
    playersOf,
  }).values()]
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
        Trip Setup
      </Link>
    </div>
  )
}
