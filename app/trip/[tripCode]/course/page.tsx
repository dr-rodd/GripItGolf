import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'

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
    <div className="min-h-dvh bg-[#0a1a0e] text-white">

      {/* Sticky header */}
      <div className="border-b border-[#1e3d28] sticky top-0 z-20 bg-[#0a1a0e]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}`} />
          <h1 className="font-[family-name:var(--font-playfair)] text-lg text-white tracking-wide">
            Live Scoring
          </h1>
          <div className="w-[60px]" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-white/35 text-xs tracking-[0.2em] uppercase mb-4">
          Choose a round
        </p>

        {(rounds ?? []).length === 0 && (
          <p className="text-white/40 text-sm py-8 text-center">
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
                className="flex items-center justify-between w-full px-5 py-5 border border-white/10 rounded-xl hover:border-[#C9A84C]/40 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[#C9A84C]/70 text-[10px] tracking-[0.25em] uppercase mb-1">
                    Round {round.round_number}
                    {round.status === 'completed' && ' · Completed'}
                    {round.status === 'active' && ' · In play'}
                  </p>
                  <p className="font-[family-name:var(--font-playfair)] text-white text-lg leading-tight truncate">
                    {course?.name ?? `Round ${round.round_number}`}
                  </p>
                  {course?.location && (
                    <p className="text-white/25 text-xs mt-1 truncate">{course.location}</p>
                  )}
                </div>
                <span className="text-[#C9A84C] text-lg flex-shrink-0 ml-4">→</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
