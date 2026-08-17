import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import ShareTrip from '../ShareTrip'
import TripQr from './TripQr'

export const dynamic = 'force-dynamic'

/**
 * The trip, held up to be scanned.
 *
 * One job: the lead player opens this and the table joins off it. So it is
 * the trip's name, the code as a QR, the six characters for anyone whose
 * camera will not play, and the share button for sending the same link
 * instead. Nothing else — a screen being photographed across a table has no
 * room for furniture.
 *
 * Reached from the hub's small QR link beside Share trip; deliberately not
 * on the tab bar.
 */
export default async function SharePage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, name')
    .eq('trip_code', tripCode)
    .single()

  if (error) console.error('SharePage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Trip not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-lg mx-auto px-4 pt-6 pb-10 flex flex-col items-center text-center">

        <h1 className="t-h1 text-ink text-balance" style={{ fontSize: 'clamp(26px, 8vw, 34px)' }}>
          {trip.name}<span className="t-title-dot" aria-hidden="true" />
        </h1>

        <p className="t-cap text-ink/65 mt-2">Scan to join the trip</p>

        <div className="mt-6 w-full">
          <TripQr tripCode={tripCode} />
        </div>

        {/* The manual door, spelled out under the scannable one. The code in
            the accent so an eye across a table finds the six characters. */}
        <p className="t-card text-ink/80 mt-6">
          or enter code{' '}
          <span className="t-num text-accent-deep tracking-[0.12em]">{tripCode}</span>
        </p>

        <div className="mt-8">
          <ShareTrip tripCode={tripCode} tripName={trip.name} qrLink={false} />
        </div>

      </div>
    </main>
  )
}
