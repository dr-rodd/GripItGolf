import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { enabledSummary, parseFormats } from '@/lib/formats'
import { isLocked } from '@/lib/passcode'
import TripCountdown from './TripCountdown'

export const dynamic = 'force-dynamic'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Marks a trip whose settings need a passcode. */
function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" className="flex-shrink-0 opacity-70" aria-label="Passcode required">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}

export default async function TripPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripPage trip query failed:', tripError)

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

  const [roundsResult, playersResult] = await Promise.all([
    supabase
      .from('rounds')
      .select('round_number, course_id')
      .eq('trip_id', trip.id)
      .order('round_number'),
    supabase
      .from('players')
      .select('id, name, handicap, claimed')
      .eq('trip_id', trip.id)
      .order('name'),
  ])

  if (roundsResult.error) console.error('TripPage rounds query failed:', roundsResult.error)
  if (playersResult.error) console.error('TripPage players query failed:', playersResult.error)

  const rounds  = roundsResult.data ?? []
  const players = playersResult.data ?? []

  const courseIds = rounds.map(r => r.course_id).filter(Boolean)
  const { data: courses, error: coursesError } = courseIds.length > 0
    ? await supabase.from('courses').select('id, name').in('id', courseIds)
    : { data: [], error: null }

  if (coursesError) console.error('TripPage courses query failed:', coursesError)

  const courseMap   = Object.fromEntries((courses ?? []).map(c => [c.id, c.name]))
  const courseNames = rounds.map(r => courseMap[r.course_id]).filter(Boolean).join(' · ')

  const estYear    = trip.created_at ? new Date(trip.created_at).getFullYear() : null
  const dateRange  = [formatDate(trip.start_date), formatDate(trip.end_date)].filter(Boolean).join(' – ')

  // Trips created before the lifecycle migration have no setup_status — treat as live
  // A player is confirmed once a real person has claimed that slot;
  // organiser-created placeholders stay pending until someone does.
  const confirmedCount = players.filter(p => p.claimed === true).length
  const pendingCount   = players.length - confirmedCount

  const settingsLocked = isLocked(trip.settings_passcode_hash)
  const isDraft = (trip.setup_status ?? 'live') === 'draft'
  const formatLine = enabledSummary(parseFormats(trip.formats)).join(' · ')

  const lockedButton = (label: string) => (
    <div className="w-full py-[18px] border-2 border-white/10 rounded-xl flex items-center justify-center gap-3">
      <span className="text-white/25 text-sm tracking-[0.25em] uppercase">{label}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    </div>
  )

  return (
    <main className="min-h-dvh bg-[#0a1a0e]">

      {/* ── Hero ── */}
      <section className="min-h-dvh flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-xs flex flex-col items-center text-center">

          {/* Est. ornament */}
          {estYear && (
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px w-14 bg-[#C9A84C]/40" />
              <span className="text-[#C9A84C]/60 text-[10px] tracking-[0.3em] uppercase">Est. {estYear}</span>
              <div className="h-px w-14 bg-[#C9A84C]/40" />
            </div>
          )}

          {/* Trip name */}
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl sm:text-5xl text-white leading-tight mb-3">
            {trip.name}
          </h1>

          {/* Dates */}
          {dateRange && (
            <p className="text-white/70 text-sm tracking-[0.15em] mb-1">{dateRange}</p>
          )}

          {/* Course names — venue line */}
          {courseNames && (
            <p className="text-white/30 text-xs tracking-[0.15em] uppercase mb-2">{courseNames}</p>
          )}

          {/* Format line */}
          {formatLine && (
            <p className="text-[#C9A84C]/50 text-[10px] tracking-[0.25em] uppercase mb-8">{formatLine}</p>
          )}

          {/* Setup badge */}
          {isDraft && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
              <span className="text-[#C9A84C] text-[10px] tracking-[0.25em] uppercase">In Setup</span>
            </div>
          )}

          {/* Countdown wrapping nav */}
          <TripCountdown target={trip.start_date ?? null}>
            <nav className="flex flex-col gap-3 w-full">

              {/* Join Trip — claim a slot or add yourself */}
              <Link
                href={`/trip/${tripCode}/players`}
                className="w-full py-[18px] border-2 border-[#C9A84C] text-[#C9A84C] rounded-xl text-sm tracking-[0.25em] uppercase text-center hover:bg-[#C9A84C]/10 transition-colors"
              >
                Join Trip
              </Link>

              {isDraft ? (
                <>
                  {/* Trip Setup — the organiser's home while drafting */}
                  <Link
                    href={`/trip/${tripCode}/setup`}
                    className="w-full py-[18px] bg-[#C9A84C] text-[#0a1a0e] rounded-xl text-sm font-bold tracking-[0.25em] uppercase text-center hover:bg-[#d4b35a] transition-colors inline-flex items-center justify-center gap-2"
                  >
                    Trip Setup
                    {settingsLocked && <LockIcon />}
                  </Link>

                  {lockedButton('Live Scoring')}
                  {lockedButton('Leaderboard')}
                  <p className="text-white/25 text-xs mt-1">
                    Scoring opens when the trip is finalised
                  </p>
                </>
              ) : (
                <>
                  {/* Live Scoring — links to round 1 */}
                  {rounds.length > 0 ? (
                    <Link
                      href={`/trip/${tripCode}/course`}
                      className="w-full py-[18px] border-2 border-white/20 text-white/60 rounded-xl text-sm tracking-[0.25em] uppercase text-center hover:border-white/40 hover:text-white/80 transition-colors"
                    >
                      Live Scoring
                    </Link>
                  ) : (
                    lockedButton('Live Scoring')
                  )}

                  {/* Leaderboard */}
                  <Link
                    href={`/trip/${tripCode}/leaderboard`}
                    className="w-full py-[18px] border-2 border-white/20 text-white/60 rounded-xl text-sm tracking-[0.25em] uppercase text-center hover:border-white/40 hover:text-white/80 transition-colors"
                  >
                    Leaderboard
                  </Link>

                  {/* Settings — leads to setup page with unlock option */}
                  <Link
                    href={`/trip/${tripCode}/setup`}
                    className="text-white/25 text-xs tracking-wide hover:text-white/50 transition-colors mt-1 inline-flex items-center justify-center gap-1.5"
                  >
                    Trip settings
                    {settingsLocked && <LockIcon />}
                  </Link>
                </>
              )}

            </nav>
          </TripCountdown>

        </div>
      </section>

      {/* ── Players ── */}
      {players.length > 0 && (
        <section className="px-6 pb-16">
          <div className="max-w-xs mx-auto">

            <div className="flex items-baseline justify-between mb-3">
              <p className="text-white/30 text-xs tracking-[0.2em] uppercase">Players</p>
              <p className="text-white/25 text-xs tabular-nums">
                {confirmedCount} of {players.length} in
              </p>
            </div>

            {/* Legend — makes the colours mean something at a glance */}
            <div className="flex items-center gap-4 mb-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                <span className="text-white/30 text-[10px] tracking-wider uppercase">Confirmed</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
                <span className="text-white/30 text-[10px] tracking-wider uppercase">Pending</span>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {players.map(p => {
                const confirmed = p.claimed === true
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 border rounded-xl transition-colors ${
                      confirmed
                        ? 'border-emerald-500/50 bg-emerald-500/[0.06] shadow-[0_0_14px_rgba(16,185,129,0.14)]'
                        : 'border-[#C9A84C]/45 bg-[#C9A84C]/[0.04]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        confirmed
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                          : 'bg-[#C9A84C]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-white text-sm truncate">{p.name}</span>
                      <span
                        className={`block text-[10px] tracking-wider uppercase mt-0.5 ${
                          confirmed ? 'text-emerald-400/70' : 'text-[#C9A84C]/70'
                        }`}
                      >
                        {confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </span>
                    {p.handicap != null && (
                      <span className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-base leading-none flex-shrink-0">
                        {p.handicap}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {pendingCount > 0 && (
              <p className="text-white/25 text-xs mt-4 leading-relaxed">
                {pendingCount === 1 ? 'One player has' : `${pendingCount} players have`} still
                to join. Share the code <span className="text-[#C9A84C]">{tripCode}</span> and
                they can claim their spot.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <div className="px-6 pb-10 text-center">
        <Link href="/" className="text-white/20 text-xs tracking-wide hover:text-white/40 transition-colors">
          ← GripItGolf
        </Link>
      </div>

    </main>
  )
}
