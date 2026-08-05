import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SupportLink from '@/app/components/SupportLink'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'
import { roundTone, ROUND_TILE, ROUND_NOTE, ROUND_NOTE_TONE } from '@/lib/roundState'

export const dynamic = 'force-dynamic'

export default async function TripCoursePortalPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripCoursePortal trip query failed:', tripError)
  if (!trip) notFound()

  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('id, round_number, status, courses(name, location)')
    .eq('trip_id', trip.id)
    .order('round_number')

  if (roundsError) console.error('TripCoursePortal rounds query failed:', roundsError)

  // What has actually happened on each round, rather than what `rounds.status`
  // claims: the status column is set by hand and drifts, and the tile is the
  // one place someone checks before walking to the first tee.
  const roundIds = (rounds ?? []).map(r => r.id)
  const [openRes, scoredRes, liveScoredRes] = roundIds.length > 0
    ? await Promise.all([
        supabase.from('live_rounds').select('round_id')
          .eq('status', 'active').in('round_id', roundIds),
        supabase.from('scores').select('round_id').in('round_id', roundIds),
        supabase.from('live_scores').select('round_id').in('round_id', roundIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]

  if (openRes.error) console.error('TripCoursePortal live rounds query failed:', openRes.error)
  if (scoredRes.error) console.error('TripCoursePortal scores query failed:', scoredRes.error)
  if (liveScoredRes.error) console.error('TripCoursePortal live scores query failed:', liveScoredRes.error)

  const openRounds = new Set((openRes.data ?? []).map(r => r.round_id as string))
  // A round counts as played once anything has been recorded on it, committed
  // or not — a card half-entered and abandoned is still not an empty round.
  const scoredRounds = new Set([
    ...(scoredRes.data ?? []).map(r => r.round_id as string),
    ...(liveScoredRes.data ?? []).map(r => r.round_id as string),
  ])

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">

      <TripHeader backTo={`/trip/${tripCode}`} title="scoring" />

      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-ink/65 text-[13px] tracking-[0.2em] uppercase mb-4">
          Choose a round
        </p>

        {(rounds ?? []).length === 0 && (
          <p className="text-ink/65 text-sm py-8 text-center">
            No rounds set up for this trip yet.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {(rounds ?? []).map(round => {
            const course = round.courses as unknown as { name: string; location: string | null } | null
            const tone = roundTone(scoredRounds.has(round.id), openRounds.has(round.id))
            return (
              <Link
                key={round.id}
                href={`/trip/${tripCode}/course/${round.round_number}`}
                className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl transition-colors duration-150 active:opacity-75 ${ROUND_TILE[tone]}`}
              >
                <div className="min-w-0">
                  <p className="t-cap uppercase tracking-[0.2em] text-ink/65 mb-1">
                    Round {round.round_number}
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-ink text-lg leading-tight truncate">
                    {course?.name ?? `Round ${round.round_number}`}
                  </p>
                  <p className={`t-cap mt-1 truncate ${ROUND_NOTE_TONE[tone]}`}>
                    {course?.location ? `${course.location} · ` : ''}{ROUND_NOTE[tone]}
                  </p>
                </div>
                {/* The whole tile is the link, so "Open →" was a label for
                    something already obvious — and it was taking the width a
                    long course name needs. The live dot stays: it says
                    something the tile does not. */}
                {tone === 'live' && (
                  <span
                    className="flex-shrink-0 ml-4 w-1.5 h-1.5 rounded-full bg-accent dot-live"
                    aria-hidden="true"
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>
      <SupportLink className="px-4 pb-12" />
      <TabBar tripCode={tripCode} />
    </div>
  )
}
