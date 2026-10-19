import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { Pill, cardClass } from '@/app/components/ui'

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

const CARD = `block p-5 ${cardClass('raised', true)}`

export default function GolfPage() {
  return (
    <main className="min-h-dvh paper">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so this screen needs no back button of its own. */}
      <TripHeader backTo="/" />

      <div className="flex flex-col items-center px-6 py-12 page-enter">
        <div className="w-full max-w-sm">

          <h1 className="t-h1 text-ink mb-2">
            Golf
          </h1>
          <p className="text-ink/65 text-sm mb-8">
            What are you running?
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/dashboard/create" className={CARD}>
              <p className="t-card text-ink">
                Golf trip
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A few days away with your group, itinerary included.
              </p>
            </Link>

            <Link href="/dashboard/create?type=tournament" className={CARD}>
              <p className="t-card text-ink">
                Golf tournament
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                An event run by an organiser, who may or may not play.
              </p>
            </Link>

            {/* Named before it is built, so nobody taps into a dead end. */}
            <div className={`block p-5 opacity-60 ${cardClass()}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="t-card text-ink">
                  Personal usage
                </p>
                <Pill className="flex-shrink-0">Coming soon</Pill>
              </div>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                Stat tracking for your own rounds — no group required.
              </p>
            </div>
          </div>

          <LegalLinks className="mt-10" />

        </div>
      </div>
    </main>
  )
}
