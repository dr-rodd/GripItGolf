import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { cardClass } from '@/app/components/ui'

/**
 * Create an Event — which sport.
 *
 * The landing page's create button lands here. Each sport has its own way
 * in: golf its doorway (`/golf`, a trip or a tournament), running its one
 * kind of event so far, the team challenge, straight into the create route
 * through its `?type=run` door. A new sport is a new card on this page; the
 * landing page does not change for it.
 *
 * Static on purpose, like /golf and /join: nothing here reads a database,
 * so the landing page can prefetch it whole and the arrival costs nothing.
 */

const CARD = `block p-5 ${cardClass('raised', true)}`

export default function CreatePage() {
  return (
    <main className="min-h-dvh paper">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so this screen needs no back button of its own. */}
      <TripHeader backTo="/" />

      <div className="flex flex-col items-center px-6 py-12 page-enter">
        <div className="w-full max-w-sm">

          <h1 className="t-h1 text-ink mb-2">
            Create an event
          </h1>
          <p className="text-ink/65 text-sm mb-8">
            Which sport?
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/golf" className={CARD}>
              <p className="t-card text-ink">
                Golf
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A trip away with your group, or a tournament.
              </p>
            </Link>

            <Link href="/dashboard/create?type=run" className={CARD}>
              <p className="t-card text-ink">
                Running
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                Runs earn points for your team over weeks or months.
              </p>
            </Link>
          </div>

          <LegalLinks className="mt-10" />

        </div>
      </div>
    </main>
  )
}
