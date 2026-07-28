import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CourseDashboardClient from '@/app/scoring/[slug]/CourseDashboardClient'

export const dynamic = 'force-dynamic'

export default async function TripCoursePage({
  params,
}: {
  params: Promise<{ tripCode: string; roundNumber: string }>
}) {
  const { tripCode, roundNumber } = await params
  const roundNum = parseInt(roundNumber)
  if (isNaN(roundNum)) notFound()

  // Look up trip
  const { data: trip } = await supabase
    .from('trips')
    .select('id, name')
    .eq('trip_code', tripCode)
    .single()
  if (!trip) notFound()

  // All rounds for this trip (needed for CourseDashboardClient + round_handicaps scope)
  const { data: allRounds } = await supabase
    .from('rounds')
    .select('id, round_number, status, courses(id, name)')
    .eq('trip_id', trip.id)
    .order('round_number')

  const thisRound = (allRounds ?? []).find(r => r.round_number === roundNum)
  if (!thisRound || !(thisRound.courses as any)?.id) notFound()

  const courseId = (thisRound.courses as any).id as string
  const roundIds = (allRounds ?? []).map(r => r.id)

  const [playersRes, holesRes, teesRes, hcpsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, role, handicap, gender, is_composite, teams(name, color)')
      .eq('trip_id', trip.id)
      .order('name'),
    supabase
      .from('holes')
      .select(
        'id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies, ' +
        'yardage_black, yardage_blue, yardage_white, yardage_red, ' +
        'yardage_sandstone, yardage_slate, yardage_granite, yardage_claret'
      )
      .eq('course_id', courseId)
      .order('hole_number'),
    supabase
      .from('tees')
      .select('id, course_id, name, gender, par, course_rating, slope')
      .eq('course_id', courseId),
    supabase
      .from('round_handicaps')
      .select('round_id, player_id, playing_handicap')
      .in('round_id', roundIds.length > 0 ? roundIds : ['00000000-0000-0000-0000-000000000000']),
  ])

  return (
    <CourseDashboardClient
      courseName={(thisRound.courses as any).name}
      courseId={courseId}
      players={(playersRes.data ?? []) as any}
      rounds={(allRounds ?? []) as any}
      holes={(holesRes.data ?? []) as any}
      tees={(teesRes.data ?? []) as any}
      roundHandicaps={hcpsRes.data ?? []}
      backHref={`/trip/${tripCode}/course`}
      roundId={thisRound.id}
    />
  )
}
