import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'

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

const CARD = [
  'block bg-surface border border-bark/12 rounded-2xl p-5',
  'press hover:border-bark/25',
].join(' ')

export default function CreatePage() {
  return (
    <main className="min-h-dvh bg-cream">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so this screen needs no back button of its own. */}
      <TripHeader backTo="/" />

      <div className="flex flex-col items-center px-6 py-12 page-enter">
        <div className="w-full max-w-sm">

          <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink mb-2">
            Create an Event
          </h1>
          <p className="text-ink/65 text-sm mb-8">
            Which sport?
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/golf" className={CARD}>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                Golf
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A trip away with your group, or a tournament — live scoring
                and leaderboards.
              </p>
            </Link>

            <Link href="/dashboard/create?type=run" className={CARD}>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                Running
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A team running challenge over weeks or months — runs earn
                points, teams climb the leaderboard.
              </p>
            </Link>
          </div>

          <LegalLinks className="mt-10" />

        </div>
      </div>
    </main>
  )
}
