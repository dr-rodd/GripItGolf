import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseFormats } from '@/lib/formats'
import { parseLeaderboards } from '@/lib/leaderboards'
import { tripBoards, isLegacy } from '@/lib/leaderboardsCompat'
import { parseTeamScoring } from '@/lib/teamScoring'
import Poller from '@/app/components/Poller'
import TripLeaderboardClient from './TripLeaderboardClient'
import SupportLink from '@/app/components/SupportLink'
import TabBar from '@/app/components/TabBar'
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
    .select('id, name, formats, leaderboards, team_scoring')
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

  const [teamsRes, playersRes, holesRes, scoresRes, liveScoresRes, hcpsRes, openRes] =
    await Promise.all([
      supabase.from('teams').select('id, name, color').eq('trip_id', trip.id).order('created_at'),
      supabase.from('players')
        .select('id, name, handicap, gender, team_id, is_composite')
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
      supabase.from('round_handicaps')
        .select('round_id, player_id, playing_handicap')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      // A round is "in play" when a scorecard is open on it — not merely
      // because a score was once entered against it
      supabase.from('live_rounds')
        .select('round_id')
        .eq('status', 'active')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
    ])

  // What the trip plays for. A stored list wins; a trip created before the
  // column existed has its old flags read as the boards they described, so
  // the client only ever renders one shape.
  const stored = parseLeaderboards(trip.leaderboards)
  const teamScoring = parseTeamScoring(trip.team_scoring)
  const boards = tripBoards(stored, parseFormats(trip.formats), teamScoring)

  const activeRoundIds = [...new Set((openRes.data ?? []).map(r => r.round_id as string))]
  const hasActiveRound =
    activeRoundIds.length > 0 || (rounds ?? []).some((r: any) => r.status === 'active')

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader tripCode={tripCode} />

      <div className="bg-cream border-b border-bark/12">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="t-h2 text-ink truncate">
            {trip.name}
          </h1>
        </div>
      </div>

      <Poller isActive={hasActiveRound} />

      <TripLeaderboardClient
        tripCode={tripCode}
        boards={boards}
        activeRoundIds={activeRoundIds}
        legacyTeamScoring={isLegacy(stored) ? teamScoring : null}
        rounds={(rounds ?? []) as any}
        teams={teamsRes.data ?? []}
        players={playersRes.data ?? []}
        holes={holesRes.data ?? []}
        scores={scoresRes.data ?? []}
        liveScores={liveScoresRes.data ?? []}
        roundHandicaps={hcpsRes.data ?? []}
      />

      {/* Below the board, after everything worth reading */}
      <SupportLink className="px-4 pb-12" />
      <TabBar tripCode={tripCode} />
    </div>
  )
}
