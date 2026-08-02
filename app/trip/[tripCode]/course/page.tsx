import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SupportLink from '@/app/components/SupportLink'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'

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

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">

      <TripHeader backTo={`/trip/${tripCode}`} title="scoring" />

      <div className="border-b border-bark/12 bg-cream">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="t-h2 text-ink">Live scoring</h1>
        </div>
      </div>

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
            return (
              <Link
                key={round.id}
                href={`/trip/${tripCode}/course/${round.round_number}`}
                className="flex items-center justify-between w-full px-5 py-5 border border-bark/12 rounded-xl hover:border-accent/40 hover:bg-surface transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-ink/65 text-[12px] tracking-[0.25em] uppercase mb-1">
                    Round {round.round_number}
                    {round.status === 'completed' && ' · Completed'}
                    {round.status === 'active' && ' · In play'}
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-ink text-lg leading-tight truncate">
                    {course?.name ?? `Round ${round.round_number}`}
                  </p>
                  {course?.location && (
                    <p className="text-ink/50 text-[13px] mt-1 truncate">{course.location}</p>
                  )}
                </div>
                <span className="text-accent text-lg flex-shrink-0 ml-4">→</span>
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
