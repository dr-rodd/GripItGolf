'use client'

import { useState, useSyncExternalStore } from 'react'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import type { LeagueSchedule } from '@/lib/leagueSetup'
import CreateTripForm from './CreateTripForm'
import CreateLeagueForm from './CreateLeagueForm'
import CreateKnockoutForm from './CreateKnockoutForm'
import CreateRunForm from './CreateRunForm'
import { cardClass } from '@/app/components/ui'

/**
 * Which form the create route shows.
 *
 * A trip goes straight to the trip wizard, as ever. A tournament answers
 * two questions first — the shape of the event in time, then the format —
 * because those decide which build it is:
 *
 *   Standalone  — a single point in time, one day or a run of days.
 *                 League → the league wizard; Match play → the event
 *                 wizard, bracket set up afterwards in the organiser area.
 *   Continuous  — an ongoing event over a period, like a summer.
 *                 League → the league wizard's continuous branch (picked
 *                 days, or every week on the same day); Match play → the
 *                 lean knockout door: no fixed golf days, the bracket's
 *                 deadlines pace it instead.
 *   Series      — a list of events with no dates, extensible as it goes.
 *                 A league by nature — the days feed leaderboards — so the
 *                 format question is not asked.
 *
 * A run challenge (`?type=run`, from the sport chooser at /create) is a
 * different sport altogether and goes straight to its own wizard.
 *
 * The `?type` read is the same hydration trick the wizard itself uses: the
 * server has no URL, so it renders the trip form and the browser corrects
 * on arrival — which keeps this route static, and a dynamic route cannot
 * be prefetched whole.
 */

const subscribe = () => () => {}
type CreateType = 'trip' | 'tournament' | 'run'
const readType = (): CreateType => {
  const t = new URLSearchParams(window.location.search).get('type')
  return t === 'tournament' || t === 'run' ? t : 'trip'
}
const readOnServer = (): CreateType => 'trip'

const CARD = `block w-full text-left p-5 ${cardClass('raised', true)}`

function Chooser({ title, sub, onBack, children }: {
  title: string
  sub: string
  onBack?: () => void
  children: React.ReactNode
}) {
  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/golf" />
      <div className="flex flex-col items-center px-6 py-12 page-enter">
        <div className="w-full max-w-sm">
          {onBack && (
            <div className="mb-4">
              <BackButton onClick={onBack} />
            </div>
          )}
          <h1 className="t-h1 text-ink mb-2">
            {title}
          </h1>
          <p className="text-ink/65 text-sm mb-8">{sub}</p>
          <div className="flex flex-col gap-3">{children}</div>
        </div>
      </div>
    </main>
  )
}

export default function CreateFlow() {
  const type = useSyncExternalStore(subscribe, readType, readOnServer)
  const [schedule, setSchedule] = useState<LeagueSchedule | null>(null)
  const [format, setFormat] = useState<'match_play' | 'league' | null>(null)

  if (type === 'run') return <CreateRunForm />
  if (type !== 'tournament') return <CreateTripForm />

  // A series is a league by nature, so picking it skips the format question.
  if (schedule === 'series') return <CreateLeagueForm schedule="series" />

  if (schedule && format === 'league') return <CreateLeagueForm schedule={schedule} />
  if (schedule === 'standalone' && format === 'match_play') return <CreateTripForm />
  if (schedule === 'continuous' && format === 'match_play') return <CreateKnockoutForm />

  // ── First question: the shape of the event in time ──
  if (!schedule) {
    return (
      <Chooser title="Golf tournament" sub="What shape is the event?">
        <button onClick={() => setSchedule('standalone')} className={CARD}>
          <p className="t-card text-ink">
            Standalone
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            A single point in time — one day, or a run of days together.
          </p>
        </button>

        <button onClick={() => setSchedule('continuous')} className={CARD}>
          <p className="t-card text-ink">
            Continuous
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            An ongoing event over a period, like a summer — a knockout paced
            by deadlines, or a league on picked days.
          </p>
        </button>

        <button onClick={() => setSchedule('series')} className={CARD}>
          <p className="t-card text-ink">
            Series
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            A run of events with no dates fixed — days need not be in a row,
            and more can be added as you go.
          </p>
        </button>
      </Chooser>
    )
  }

  // ── Second question: the format ──
  return (
    <Chooser
      title={schedule === 'continuous' ? 'Continuous event' : 'Standalone event'}
      sub="What kind of competition?"
      onBack={() => setSchedule(null)}
    >
      <button onClick={() => setFormat('league')} className={CARD}>
        <p className="t-card text-ink">
          League
        </p>
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          {schedule === 'continuous'
            ? 'A leaderboard over the period — playing days picked by hand, or every week on the same day.'
            : 'A day, or a run of days, on a leaderboard — live scoring from the first tee.'}
        </p>
      </button>

      <button onClick={() => setFormat('match_play')} className={CARD}>
        <p className="t-card text-ink">
          Match play
        </p>
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          {schedule === 'continuous'
            ? 'An ongoing knockout — rounds shaped by the field, paced by deadlines, with a qualifying event if you want one.'
            : 'A knockout bracket — win and go through. Create the event here, then set the bracket up from your Event Hub.'}
        </p>
      </button>
    </Chooser>
  )
}
