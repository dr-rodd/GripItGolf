import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function TripPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, trip_code')
    .eq('trip_code', tripCode)
    .single()

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-3">Trip not found</p>
        <p className="text-white/40 text-sm mb-8">Check the code and try again.</p>
        <Link href="/" className="text-[#C9A84C] text-sm tracking-wide hover:text-[#d4b35a] transition-colors">
          ← Back to home
        </Link>
      </main>
    )
  }

  const { data: rounds } = await supabase
    .from('rounds')
    .select('round_number, status, scheduled_date, course_id')
    .eq('trip_id', trip.id)
    .order('round_number')

  const courseIds = (rounds ?? []).map(r => r.course_id).filter(Boolean)
  const { data: courses } = courseIds.length > 0
    ? await supabase.from('courses').select('id, name').in('id', courseIds)
    : { data: [] }

  const courseMap = Object.fromEntries((courses ?? []).map(c => [c.id, c.name]))

  return (
    <main className="min-h-dvh bg-[#0a1a0e] px-6 py-12">
      <div className="max-w-md mx-auto">

        {/* Logo mark */}
        <div className="mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
          <div className="w-3 h-3 rounded-full bg-[#C9A84C]" />
          <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
        </div>

        {/* Trip name */}
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl sm:text-5xl text-white leading-tight mb-2">
          {trip.name}
        </h1>

        {/* Dates */}
        {(trip.start_date || trip.end_date) && (
          <p className="text-white/40 text-sm tracking-wide mb-8">
            {[formatDate(trip.start_date), formatDate(trip.end_date)].filter(Boolean).join(' – ')}
          </p>
        )}

        {/* Enter trip */}
        <Link
          href={`/trip/${tripCode}/players`}
          className="block w-full text-center py-4 mb-10 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors"
        >
          Enter Trip
        </Link>

        {/* Rounds */}
        {rounds && rounds.length > 0 && (
          <div>
            <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-4">Courses</p>
            <div className="flex flex-col gap-3">
              {rounds.map((round) => (
                <Link
                  key={round.round_number}
                  href={`/trip/${tripCode}/course/${round.round_number}`}
                  className="flex items-center justify-between px-5 py-4 border border-white/10 rounded-xl hover:border-[#C9A84C]/40 transition-colors group"
                >
                  <div>
                    <p className="text-white text-sm font-medium">Round {round.round_number}</p>
                    {courseMap[round.course_id] && (
                      <p className="text-white/40 text-xs mt-0.5">{courseMap[round.course_id]}</p>
                    )}
                    {round.scheduled_date && (
                      <p className="text-white/25 text-xs mt-0.5">{formatDate(round.scheduled_date)}</p>
                    )}
                  </div>
                  <span className="text-[#C9A84C] text-lg group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12">
          <Link href="/" className="text-white/25 text-xs tracking-wide hover:text-white/50 transition-colors">
            ← GripItGolf
          </Link>
        </div>

      </div>
    </main>
  )
}
