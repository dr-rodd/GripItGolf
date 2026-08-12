import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { allowanceCycle } from '@/lib/handicapAllowance'
import { tripQuotaScale } from '@/lib/leaderboards'
import CourseDashboardClient from '@/app/scoring/[slug]/CourseDashboardClient'
import TripHeader from '@/app/components/TripHeader'
import { HEADER_H } from '@/app/components/headerMetrics'
import { TABBAR_SPACE } from '@/app/components/tabbarMetrics'

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
    .select('*')
    .eq('trip_code', tripCode)
    .single()
  if (!trip) notFound()

  // The handicaps this card has to be able to show. A group can be playing for
  // a four-ball at 85% and a singles board at 95% off the one scorecard, so
  // the number beside a player's name is not one number — see
  // lib/handicapAllowance.ts.
  const boards = boardsForTrip(trip as never)
  const allowances = allowanceCycle(boards)

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
      .select('round_id, player_id, playing_handicap, tee_id')
      .in('round_id', roundIds.length > 0 ? roundIds : ['00000000-0000-0000-0000-000000000000']),
  ])

  return (
    // The mark is the way back from a scorecard, and the bar is the way
    // anywhere else. Score entry used to be the one screen without it — the
    // bottom of it is the last row of a scorecard, and a nav bar under that
    // reads as a mis-tap waiting to happen — but a screen the app's own
    // navigation abandons is worse, so the room for it is reserved inside the
    // card's height instead. The Next button comes to rest just above the bar
    // rather than beneath it.
    <div className="min-h-dvh bg-cream page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} title="scoring" />
      <CourseDashboardClient
        courseName={(thisRound.courses as any).name}
        courseId={courseId}
        players={(playersRes.data ?? []) as any}
        rounds={(allRounds ?? []) as any}
        holes={(holesRes.data ?? []) as any}
        tees={(teesRes.data ?? []) as any}
        roundHandicaps={hcpsRes.data ?? []}
        backHref={`/trip/${tripCode}/scoring`}
        roundId={thisRound.id}
        // For the card check on the pick-player screen: a correction re-scores
        // this trip's committed cards on this course, and nothing outside it.
        tripCode={tripCode}
        allowances={allowances.steps}
        allowanceStart={allowances.startIndex}
        // The live panel only offers its Quota tab when one of this trip's
        // boards is actually scoring it.
        // The scale rather than a yes/no: whether the Quota tab appears and
        // what it counts are the same answer, and two props could disagree.
        quotaScale={boards.some(b => b.competition === 'league' && b.scoring === 'quota')
          ? tripQuotaScale(boards)
          : null}
        // Off unless this trip asked for it. The legacy `/scoring/[slug]`
        // route passes nothing and so gets the default, which is the
        // scorecard exactly as it has always been.
        trackStats={trip.track_stats === true}
        // TripHeader above is sticky too. Without this the scoring shell's own
        // header sticks to the same place and, being the lower z-index, ends
        // up behind it.
        stickyTop={HEADER_H}
        bottomInset={TABBAR_SPACE}
      />
    </div>
  )
}
