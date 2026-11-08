'use client'

import { useSyncExternalStore } from 'react'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import {
  choiceSearch, parentChoice, parseChoice, type TournamentChoice,
} from '@/lib/createChoice'
import CreateTripForm from './CreateTripForm'
import CreateLeagueForm from './CreateLeagueForm'
import CreateKnockoutForm from './CreateKnockoutForm'
import CreateRunForm from './CreateRunForm'
import { cardClass } from '@/app/components/ui'

/**
 * Which form the create route shows.
 *
 * A trip goes straight to the trip wizard, as ever. A tournament is asked
 * when it happens, then what it is (Ross, 8 Nov 2026 — docs/event-use-cases.md):
 *
 *   Standalone — one day, or a few days together
 *     League      → the league wizard, standalone.
 *     Match play  → the event wizard made with the bracket on.
 *   Ongoing — over weeks or a season
 *     Series      → the league wizard, series: rounds played together on
 *                   set days, adding up to an overall.
 *     Continuous  → the league wizard, continuous: rounds are periods of
 *                   time, and players hand in a card any time in each
 *                   (lib/leagueSetup.ts `periods`).
 *     Match play  → the lean knockout door, paced by the deadlines.
 *
 * The top answer is "Ongoing", not "Continuous", so the league type keeps
 * its name. Stored values are unchanged: a knockout's `schedule:
 * 'continuous'` still reads "Ongoing".
 *
 * A run challenge (`?type=run`, from the sport chooser at /create) is a
 * different sport altogether and goes straight to its own wizard.
 *
 * The answers ride in the address (lib/createChoice.ts), each tap a history
 * entry, so the phone's back gesture and a wizard's step-1 arrow both land on
 * the chooser it came from. Read the same hydration way as `?type`: the
 * server has no URL, so it renders the trip form and the browser corrects on
 * arrival — which keeps this route static, and a dynamic route cannot be
 * prefetched whole.
 */

const subscribe = () => () => {}
type CreateType = 'trip' | 'tournament' | 'run'
const readType = (): CreateType => {
  const t = new URLSearchParams(window.location.search).get('type')
  return t === 'tournament' || t === 'run' ? t : 'trip'
}
const readOnServer = (): CreateType => 'trip'

/** Heard by the chooser's own pushes; popstate covers the back gesture. */
const CHOICE_EVENT = 'gd-create-choice'
const subscribeChoice = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  window.addEventListener(CHOICE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(CHOICE_EVENT, onChange)
  }
}
const readSearch = () => window.location.search
const readSearchOnServer = () => ''

/** Marks a history entry as one the chooser pushed, so going back stays on this page. */
const PUSHED = 'gdCreateChoice'

function go(choice: TournamentChoice) {
  const url = window.location.pathname + choiceSearch(window.location.search, choice)
  // A fresh object, never the current state spread: Next's router copies its
  // own markers in only when they are absent, and skips a push that already
  // carries them.
  window.history.pushState({ [PUSHED]: true }, '', url)
  window.dispatchEvent(new Event(CHOICE_EVENT))
}

/**
 * Back up one question. Through history when the chooser made this entry —
 * so back and the gesture are the same thing — and otherwise (a reload, a
 * shared link) in place, never off the site.
 */
function exit() {
  if (window.history.state?.[PUSHED]) {
    window.history.back()
    return
  }
  const here = parseChoice(window.location.search)
  const url = window.location.pathname + choiceSearch(window.location.search, parentChoice(here))
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new Event(CHOICE_EVENT))
}

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

function Choice({ title, line, onClick }: { title: string; line: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={CARD}>
      <p className="t-card text-ink">{title}</p>
      <p className="text-ink/65 text-sm mt-1 leading-snug">{line}</p>
    </button>
  )
}

export default function CreateFlow() {
  const type = useSyncExternalStore(subscribe, readType, readOnServer)
  const search = useSyncExternalStore(subscribeChoice, readSearch, readSearchOnServer)

  if (type === 'run') return <CreateRunForm />
  if (type !== 'tournament') return <CreateTripForm />

  const { when, format } = parseChoice(search)

  // ── The wizards, each handed exactly what it was before ──
  if (when === 'standalone' && format === 'league') return <CreateLeagueForm schedule="standalone" onExit={exit} />
  if (when === 'standalone' && format === 'match_play') return <CreateTripForm matchPlay onExit={exit} />
  if (when === 'ongoing' && format === 'series') return <CreateLeagueForm schedule="series" onExit={exit} />
  if (when === 'ongoing' && format === 'continuous') return <CreateLeagueForm schedule="continuous" onExit={exit} />
  if (when === 'ongoing' && format === 'match_play') return <CreateKnockoutForm onExit={exit} />

  // ── Second question: what format ──
  if (when === 'standalone') {
    return (
      <Chooser title="Standalone" sub="What format?" onBack={exit}>
        <Choice title="League" line="Everyone plays, and a leaderboard ranks them."
          onClick={() => go({ when, format: 'league' })} />
        <Choice title="Match play" line="A knockout bracket, played out on the day."
          onClick={() => go({ when, format: 'match_play' })} />
      </Chooser>
    )
  }

  if (when === 'ongoing') {
    return (
      <Chooser title="Ongoing" sub="What kind of event?" onBack={exit}>
        <Choice title="Series"
          line="Rounds played together on set days, adding up to an overall. A society season or Golfer of the Year."
          onClick={() => go({ when, format: 'series' })} />
        <Choice title="Continuous"
          line="Rounds are periods. Players hand in a card any time in each one."
          onClick={() => go({ when, format: 'continuous' })} />
        <Choice title="Match play"
          line="Players arrange their own matches, with a date to play each round by."
          onClick={() => go({ when, format: 'match_play' })} />
      </Chooser>
    )
  }

  // ── First question: when it happens ──
  return (
    <Chooser title="Golf tournament" sub="When does it happen?">
      <Choice title="Standalone" line="One day, or a few days together."
        onClick={() => go({ when: 'standalone', format: null })} />
      <Choice title="Ongoing" line="Over weeks or a season."
        onClick={() => go({ when: 'ongoing', format: null })} />
    </Chooser>
  )
}
