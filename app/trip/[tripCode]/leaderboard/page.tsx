import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseFormats } from '@/lib/formats'
import { parseTeamScoring } from '@/lib/teamScoring'
import Poller from '@/app/components/Poller'
import BackButton from '@/app/components/BackButton'
import TripLeaderboardClient from './TripLeaderboardClient'

export const dynamic = 'force-dynamic'

export default async function TripLeaderboardPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('id, name, formats, team_scoring')
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

  const [teamsRes, playersRes, holesRes, scoresRes, liveScoresRes, hcpsRes] =
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
    ])

  const hasActiveRound = (rounds ?? []).some((r: any) => r.status === 'active')

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="sticky top-0 z-50 bg-[#0a1a0e] border-b border-[#1e3d28]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}`} />
          <h1 className="font-[family-name:var(--font-playfair)] text-xl sm:text-2xl text-white tracking-wide truncate px-2">
            {trip.name}
          </h1>
          <div className="w-11" />
        </div>
      </div>

      <Poller isActive={hasActiveRound} />

      <TripLeaderboardClient
        tripCode={tripCode}
        formats={parseFormats(trip.formats)}
        teamScoring={parseTeamScoring(trip.team_scoring)}
        rounds={(rounds ?? []) as any}
        teams={teamsRes.data ?? []}
        players={playersRes.data ?? []}
        holes={holesRes.data ?? []}
        scores={scoresRes.data ?? []}
        liveScores={liveScoresRes.data ?? []}
        roundHandicaps={hcpsRes.data ?? []}
      />
    </div>
  )
}
