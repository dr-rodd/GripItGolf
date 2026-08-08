import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseFormats } from '@/lib/formats'
import { parseLeaderboards } from '@/lib/leaderboards'
import { tripBoards, isLegacy } from '@/lib/leaderboardsCompat'
import { parseTeamScoring } from '@/lib/teamScoring'
import { fetchMemberships } from '@/lib/teamMembers'
import Poller from '@/app/components/Poller'
import TripLeaderboardClient from './TripLeaderboardClient'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'

export const dynamic = 'force-dynamic'

export default async function TripLeaderboardPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode)
    .single()
  if (!trip) notFound()

  // Rounds first so we can scope holes, scores and handicaps by round/course
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, status, courses(id, name)')
    .eq('trip_id', trip.id)
    .order('round_number')

  const roundIds  = (rounds ?? []).map(r => r.id)
  const courseIds = (rounds ?? []).map(r => (r.courses as any)?.id).filter(Boolean)
  const nilId     = '00000000-0000-0000-0000-000000000000'

  const [teamsRes, playersRes, holesRes, scoresRes, liveScoresRes, hcpsRes, teesRes, openRes,
         memberships] =
    await Promise.all([
      supabase.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
      supabase.from('players')
        .select('id, name, handicap, gender, is_composite')
        .eq('trip_id', trip.id).eq('is_composite', false).order('name'),
      supabase.from('holes')
        .select('id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId])
        .order('hole_number'),
      supabase.from('scores')
        .select('player_id, hole_id, gross_score, stableford_points, no_return, round_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      // In-progress scores — merged client-side so the board moves during play
      supabase.from('live_scores')
        .select('player_id, round_id, hole_number, gross_score, stableford_points')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      // `tee_id` comes with them: a board playing off a percentage needs the
      // course handicap before it was rounded, and that can only be worked out
      // again from the tee it was played off.
      supabase.from('round_handicaps')
        .select('round_id, player_id, playing_handicap, tee_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      // The ratings behind those tees, so the unrounded course handicap can be
      // rebuilt. Only a board playing off a percentage reads it.
      supabase.from('tees')
        .select('id, slope, course_rating, par')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId]),
      // A round is "in play" when a scorecard is open on it — not merely
      // because a score was once entered against it. The locks come with it:
      // who is on that card is what decides which rows wear the live dot, and
      // it has to be per player — not everybody plays every round, and a
      // signed card is not live however busy the rest of the trip is.
      supabase.from('live_rounds')
        .select('id, round_id, live_player_locks(player_id)')
        .eq('status', 'active')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      // Who is in which team, on every sheet. A trip can run a league between
      // fours and a knockout between pairings, so this cannot be a field on
      // the player — see lib/teamSets.ts.
      fetchMemberships(trip.id),
    ])

  // What the trip plays for. A stored list wins; a trip created before the
  // column existed has its old flags read as the boards they described, so
  // the client only ever renders one shape.
  const stored = parseLeaderboards(trip.leaderboards)
  const teamScoring = parseTeamScoring(trip.team_scoring)
  const boards = tripBoards(stored, parseFormats(trip.formats), teamScoring)

  type OpenRound = {
    round_id: string
    live_player_locks: { player_id: string }[] | null
  }
  const openRounds = (openRes.data ?? []) as unknown as OpenRound[]
  const activeRoundIds = [...new Set(openRounds.map(r => r.round_id))]
  const livePlayerIds = [...new Set(
    openRounds.flatMap(r => (r.live_player_locks ?? []).map(l => l.player_id))
  )]
  const hasActiveRound =
    activeRoundIds.length > 0 || (rounds ?? []).some((r: any) => r.status === 'active')

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      {/* The trip's own name used to sit in a band under this, which cost a
          fixed slice of the screen on the one page that is all table. The
          header names the page, and you arrived here from the trip. */}
      <TripHeader backTo={`/trip/${tripCode}`} title="leaderboard" />

      <Poller isActive={hasActiveRound} />

      <TripLeaderboardClient
        tripCode={tripCode}
        boards={boards}
        activeRoundIds={activeRoundIds}
        livePlayerIds={livePlayerIds}
        legacyTeamScoring={isLegacy(stored) ? teamScoring : null}
        rounds={(rounds ?? []) as any}
        teams={teamsRes.data ?? []}
        memberships={memberships}
        players={playersRes.data ?? []}
        holes={holesRes.data ?? []}
        scores={scoresRes.data ?? []}
        liveScores={liveScoresRes.data ?? []}
        roundHandicaps={hcpsRes.data ?? []}
        tees={teesRes.data ?? []}
        showStats={trip.track_stats === true}
      />

      {/* Below the board, after everything worth reading */}
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
