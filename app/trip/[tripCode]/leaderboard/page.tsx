import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import LeaderboardClient from '@/app/leaderboard/LeaderboardClient'
import Poller from '@/app/components/Poller'
import BackButton from '@/app/components/BackButton'

export const dynamic = 'force-dynamic'

export default async function TripLeaderboardPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('id, name')
    .eq('trip_code', tripCode)
    .single()
  if (!trip) notFound()

  // Get rounds first so we can scope holes, scores, handicaps by round/course IDs
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, status, courses(id, name)')
    .eq('trip_id', trip.id)
    .order('round_number')

  const roundIds   = (rounds ?? []).map(r => r.id)
  const courseIds  = (rounds ?? []).map(r => (r.courses as any)?.id).filter(Boolean)
  const nilId      = '00000000-0000-0000-0000-000000000000'

  const [teamsRes, playersRes, holesRes, scoresRes, hcpsRes, teesRes, compositeHolesRes] =
    await Promise.all([
      supabase.from('teams').select('id, name, color').eq('trip_id', trip.id).order('name'),
      supabase.from('players').select('id, name, role, handicap, is_composite, gender, team_id')
        .eq('trip_id', trip.id).order('name'),
      supabase.from('holes')
        .select('id, hole_number, par, stroke_index, course_id')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId])
        .order('hole_number'),
      supabase.from('scores')
        .select('player_id, hole_id, gross_score, stableford_points, no_return, round_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('round_handicaps')
        .select('round_id, player_id, playing_handicap')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('tees')
        .select('id, course_id, name, gender, par')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId]),
      supabase.from('composite_holes')
        .select('composite_player_id, round_id, hole_id, source_player_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
    ])

  const allPlayers = playersRes.data ?? []
  const teams = (teamsRes.data ?? []).map(team => ({
    ...team,
    players: allPlayers.filter(p => (p as any).team_id === team.id),
  }))

  const hasActiveRound = (rounds ?? []).some((r: any) => r.status === 'active')

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="sticky top-0 z-50 bg-[#0a1a0e] border-b border-[#1e3d28]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}`} />
          <h1 className="font-[family-name:var(--font-playfair)] text-xl sm:text-2xl text-white tracking-wide">
            {trip.name}
          </h1>
          <Link
            href={`/trip/${tripCode}/leaderboard/individual`}
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 text-[#C9A84C] hover:bg-white/15 hover:text-white transition-colors flex-shrink-0 text-[10px] tracking-widest uppercase text-center leading-tight px-1"
          >
            Solo
          </Link>
        </div>
      </div>

      <Poller isActive={hasActiveRound} />
      <div className="max-w-lg mx-auto px-4 py-8">
        <LeaderboardClient
          rounds={(rounds ?? []) as any}
          teams={teams as any}
          holes={holesRes.data ?? []}
          scores={scoresRes.data ?? []}
          roundHandicaps={hcpsRes.data ?? []}
          tees={(teesRes.data ?? []) as any}
          compositeHoles={(compositeHolesRes.data ?? []) as any}
        />
      </div>
    </div>
  )
}
