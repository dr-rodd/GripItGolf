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
 * A trip goes straight to the trip wizard, as ever. A tournament is asked
 * its shape first, because that decides which build it is
 * (docs/event-use-cases.md):
 *
 *   Standalone  — a league at a single point in time, one day or a run of
 *                 days → the league wizard.
 *   Continuous  — a league over a period, like a summer → its continuous
 *                 branch.
 *   Series      — a league of rounds on separate dates → its series branch.
 *   Match play  — a knockout, its own shape since story 2, then asked when
 *                 the matches are played: One-off (a day or a run of days)
 *                 → the event wizard made with the bracket on; Ongoing (a
 *                 period, paced by the deadlines) → the lean knockout door.
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
  const [shape, setShape] = useState<LeagueSchedule | 'match_play' | null>(null)
  const [knockout, setKnockout] = useState<'standalone' | 'continuous' | null>(null)

  if (type === 'run') return <CreateRunForm />
  if (type !== 'tournament') return <CreateTripForm />

  // Standalone, continuous and series are leagues; match play is its own
  // shape, asked one-off or ongoing next (docs/event-use-cases.md, story 2).
  if (shape && shape !== 'match_play') return <CreateLeagueForm schedule={shape} />
  if (shape === 'match_play' && knockout === 'standalone') return <CreateTripForm matchPlay />
  if (shape === 'match_play' && knockout === 'continuous') return <CreateKnockoutForm />

  // ── First question: the shape of the event ──
  if (!shape) {
    return (
      <Chooser title="Golf tournament" sub="What shape is the event?">
        <button onClick={() => setShape('standalone')} className={CARD}>
          <p className="t-card text-ink">
            Standalone
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            One day, or a run of days together, on a leaderboard.
          </p>
        </button>

        <button onClick={() => setShape('continuous')} className={CARD}>
          <p className="t-card text-ink">
            Continuous
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            An ongoing event over a period, like a summer.
          </p>
        </button>

        <button onClick={() => setShape('series')} className={CARD}>
          <p className="t-card text-ink">
            Series
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            Rounds on separate days feeding one overall league, planned ahead or ad hoc.
          </p>
        </button>

        <button onClick={() => setShape('match_play')} className={CARD}>
          <p className="t-card text-ink">
            Match play
          </p>
          <p className="text-ink/65 text-sm mt-1 leading-snug">
            A knockout bracket, up to 64 players. Win and go through.
          </p>
        </button>
      </Chooser>
    )
  }

  // ── Second question, for match play: when it is played ──
  return (
    <Chooser
      title="Match play"
      sub="When are the matches played?"
      onBack={() => setShape(null)}
    >
      <button onClick={() => setKnockout('standalone')} className={CARD}>
        <p className="t-card text-ink">
          One-off
        </p>
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          A day or a run of days, the golf on the schedule.
        </p>
      </button>

      <button onClick={() => setKnockout('continuous')} className={CARD}>
        <p className="t-card text-ink">
          Ongoing
        </p>
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          Over a period, each round played by a date, wherever the players arrange.
        </p>
      </button>
    </Chooser>
  )
}
