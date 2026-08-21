'use client'

import { useState, useSyncExternalStore } from 'react'
import TripHeader from '@/app/components/TripHeader'
import CreateTripForm from './CreateTripForm'
import CreateLeagueForm from './CreateLeagueForm'

/**
 * Which form the create route shows.
 *
 * A trip goes straight to the trip wizard, as ever. A tournament now
 * answers one question first — league or match play — because the two are
 * different builds: a league is created whole through its own form
 * (CreateLeagueForm), while a match play tournament is created by the
 * event wizard and gets its bracket set up afterwards in the organiser
 * area, where a knockout's remaining questions live.
 *
 * The `?type` read is the same hydration trick the wizard itself uses: the
 * server has no URL, so it renders the trip form and the browser corrects
 * on arrival — which keeps this route static, and a dynamic route cannot
 * be prefetched whole.
 */

const subscribe = () => () => {}
const readTournament = () =>
  new URLSearchParams(window.location.search).get('type') === 'tournament'
const readOnServer = () => false

const CARD = [
  'block w-full text-left bg-surface border border-bark/12 rounded-2xl p-5',
  'press hover:border-bark/25',
].join(' ')

export default function CreateFlow() {
  const isTournament = useSyncExternalStore(subscribe, readTournament, readOnServer)
  const [format, setFormat] = useState<'match_play' | 'league' | null>(null)

  if (!isTournament) return <CreateTripForm />
  if (format === 'league') return <CreateLeagueForm />
  if (format === 'match_play') return <CreateTripForm />

  return (
    <main className="min-h-dvh bg-cream">
      <TripHeader backTo="/golf" />

      <div className="flex flex-col items-center px-6 py-12 page-enter">
        <div className="w-full max-w-sm">

          <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink mb-2">
            Golf Tournament
          </h1>
          <p className="text-ink/65 text-sm mb-8">
            What kind of competition?
          </p>

          <div className="flex flex-col gap-3">
            <button onClick={() => setFormat('league')} className={CARD}>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                League
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A day, or a run of days, on a leaderboard — live scoring from
                the first tee.
              </p>
            </button>

            <button onClick={() => setFormat('match_play')} className={CARD}>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink">
                Match Play
              </p>
              <p className="text-ink/65 text-sm mt-1 leading-snug">
                A knockout bracket — win and go through. Create the event
                here, then set the bracket up from your Event Hub.
              </p>
            </button>
          </div>

        </div>
      </div>
    </main>
  )
}
