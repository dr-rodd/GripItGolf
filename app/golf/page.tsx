import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'

/**
 * The golf doorway — what Create an Event opens onto.
 *
 * The platform is Green Dot Live and golf is its first sport, so the landing
 * page's create button lands here rather than straight in the trip wizard:
 * when another sport arrives it gets a doorway beside this one, and the
 * landing page does not change.
 *
 * Three ways in. A trip and a tournament are the same wizard through two
 * doors — the door decides the wording and who is assumed to be playing
 * (see CreateTripForm). Personal rounds are named now and built later, so
 * the card says so instead of pretending.
 *
 * Static on purpose, like /join: nothing here reads a database, so the
 * landing page can prefetch it whole and the arrival costs nothing.
 */

const CARD = [
  'block bg-surface border border-bark/12 rounded-2xl p-5',
  'press hover:border-bark/25',
].join(' ')

export default function GolfPage() {
  return (
    <main className="min-h-dvh bg-cream">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so this screen needs no back button of its own. */}
      <TripHeader backTo="/" />

      <div className="flex flex-col items-center px-6 py-12 page-enter">
        <div className="w-full max-w-sm">

          <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink mb-2">
            Golf
          </h1>
          <p className="text-ink/65 text-sm mb-8">
            What are you running?
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/dashboard/create" className={CARD}>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                Golf Trip
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A few days away with your group — itinerary, live scoring
                and leaderboards.
              </p>
            </Link>

            <Link href="/dashboard/create?type=tournament" className={CARD}>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                Golf Tournament
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A standalone day or a multi-day event, run by an organiser —
                who may or may not be playing.
              </p>
            </Link>

            {/* Named before it is built, so nobody taps into a dead end. */}
            <div className="block bg-surface border border-bark/12 rounded-2xl p-5 opacity-60">
              <div className="flex items-center justify-between gap-3">
                <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                  Personal usage
                </p>
                <span className="t-cap uppercase tracking-[0.12em] text-ink/65 flex-shrink-0">
                  Coming soon
                </span>
              </div>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                Stat tracking for your own rounds — no group required.
              </p>
            </div>
          </div>

        </div>
      </div>
    </main>
  )
}
