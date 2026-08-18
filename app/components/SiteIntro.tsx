'use client'

import { useCallback, useEffect, useState } from 'react'
import { rememberIntroSeen } from '@/lib/intro'

/**
 * The site intro — a newcomer's guided lap of the app, run on the trip hub.
 *
 * Six green dots, one at a time: a welcome, then one for each tab, with a
 * friendly brown arrow pointing down at the tab it is talking about. The dot
 * is the brand doing the talking — the wordmark's full stop, blown up large
 * enough to write on — and this screen is the one place it is allowed to be
 * a large fill, because here it IS the subject rather than decoration.
 *
 * Mounted by the trip hub only when the `gg_intro` cookie is absent
 * (lib/intro.ts), so the server decides and the intro is in the first paint
 * — no fetch, no flash, nothing pops in after hydration. Skippable from the
 * first frame, and a skip counts as seen: the cookie is written on skip and
 * finish alike.
 *
 * The arrows never measure the tab bar. The bar is `max-w-lg mx-auto
 * grid-cols-5` (TabBar.tsx), so each tab's centre is a fixed fraction of the
 * same centred column this overlay draws — a fifth per tab, centre at the
 * odd tenths. Mirroring the geometry instead of reading the DOM means there
 * is nothing to go stale a resize would have to fix.
 *
 * The scrim stops above the tab bar, deliberately: the tabs are what the
 * arrows point at, so they stay lit while the page behind dims. Taps on the
 * bar are caught by the overlay and advance the tour rather than navigating
 * out of it mid-sentence.
 */

type Step = {
  key: string
  title: string
  body: string
  /** Which tab the arrow points at — the tab bar's own order, left to right. */
  tab?: number
}

/** The tab bar's five columns: a fifth each, centres on the odd tenths. */
const tabCentre = (index: number) => `${index * 20 + 10}%`

function steps(tripName: string): Step[] {
  return [
    {
      key: 'welcome',
      title: 'Bang! Welcome to Green Dot Golf.',
      body: `“${tripName}” is going to be one hell of a trip. ` +
        'Here’s a quick lap of the app — tap anywhere to move on.',
    },
    {
      key: 'hub',
      tab: 0,
      title: 'Trip Hub',
      body: 'The front page of the app. Check out your itinerary, golf tee ' +
        'times and everything else on the schedule — tap a round for the ' +
        'weather and course details.',
    },
    {
      key: 'scoring',
      tab: 1,
      title: 'Scoring',
      body: 'Enter your scores as you play — we do the rest. Pick the course ' +
        'of the day, create your group’s scorecard and elect your tees. ' +
        'Course handicaps, team scorecards and stats are all generated ' +
        'automatically.',
    },
    {
      key: 'setup',
      tab: 4,
      title: 'Trip Setup',
      body: 'The lead player has set up your contests. Drop in here to tweak ' +
        'a setting, add an activity or squeeze in an impromptu extra round.',
    },
    {
      key: 'stats',
      tab: 3,
      title: 'Stats Hub',
      body: 'Your personal numbers. How do you compare to the field? Where ' +
        'are you gaining and losing shots? Which courses and holes tripped ' +
        'you up? There’s nowhere to hide.',
    },
    {
      key: 'leaderboard',
      tab: 2,
      title: 'Leaderboard',
      body: 'This is what it’s all about. You set the rules; we crunch the ' +
        'numbers. The boards fill in live as scores land, and any team ' +
        'events get boards of their own. Check in to see where you stand.',
    },
  ]
}

/**
 * The friendly brown arrow — drawn by hand rather than a glyph, so it can
 * wobble on its way down the way a marker pen would. Points at whatever it
 * is placed over; the tip lands just above the tab's icon.
 */
function Arrow() {
  return (
    <svg viewBox="0 0 60 96" width="44" height="72" fill="none" aria-hidden="true">
      <path
        d="M30 6 C 20 32, 40 58, 30 82"
        stroke="currentColor" strokeWidth="5" strokeLinecap="round"
      />
      <path
        d="M19 72 L30 86 L41 72"
        stroke="currentColor" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/** Clears the tab bar plus the iPhone home indicator, like `.has-tabbar`. */
const ABOVE_TABBAR = 'calc(64px + env(safe-area-inset-bottom))'

export default function SiteIntro({ tripName }: { tripName: string }) {
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)

  const all = steps(tripName)
  const current = all[step]
  const last = step === all.length - 1

  // Skip and finish are the same exit: the cookie is written either way, so
  // neither path re-invites the device next visit.
  const close = useCallback(() => {
    rememberIntroSeen()
    setOpen(false)
  }, [])

  const next = () => {
    setStep(s => {
      if (s >= all.length - 1) {
        rememberIntroSeen()
        setOpen(false)
        return s
      }
      return s + 1
    })
  }

  // The page behind must hold still while the tour runs over it.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Escape is a skip, for anyone on a keyboard.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Green Dot Golf"
      onClick={next}
    >
      {/* The dimmed page — warm dark, never grey — stopping above the tab
          bar so the tabs the arrows point at stay in view. The overlay
          itself still covers the bar, so a tap there advances the tour
          rather than navigating out of it. */}
      <div
        className="intro-scrim absolute left-0 right-0 top-0"
        style={{ bottom: ABOVE_TABBAR }}
      />

      {/* Always on offer, from the first frame. */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); close() }}
        className="intro-cream press absolute right-4 z-10 t-label uppercase tracking-[0.18em] opacity-80 hover:opacity-100 px-3 py-2"
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        Skip intro
      </button>

      {/* The dot, its progress, and the button — centred in what is left
          above the arrow zone. Re-keyed per step so each dot pops in
          rather than the last one's text swapping in place. */}
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center px-6"
        style={{ bottom: `calc(${ABOVE_TABBAR} + 88px)` }}
      >
        <div
          key={current.key}
          className="intro-dot intro-pop rounded-full aspect-square w-[min(88vw,340px)] flex flex-col items-center justify-center text-center px-9"
        >
          <p className="font-[family-name:var(--font-display)] font-semibold text-[22px] leading-[1.2] text-balance">
            {current.title}
          </p>
          <p className="font-[family-name:var(--font-ui)] text-[15px] leading-[1.45] mt-2.5">
            {current.body}
          </p>
        </div>

        {/* Where you are in the lap — green dots, of course. */}
        <div className="mt-6 flex items-center gap-2" aria-hidden="true">
          {all.map((s, i) => (
            <span
              key={s.key}
              className={`w-2 h-2 rounded-full ${i === step ? 'intro-step-on' : 'intro-step'}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={e => { e.stopPropagation(); next() }}
          className="intro-cream press mt-5 t-label uppercase tracking-[0.18em] border border-current rounded-full px-6 py-2.5"
        >
          {last ? 'Let’s play' : 'Next'}
        </button>
      </div>

      {/* The arrow, over the tab it is talking about. Re-keyed per step so
          it fades in fresh at each stop rather than sliding sideways. */}
      {current.tab != null && (
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ bottom: `calc(${ABOVE_TABBAR} + 4px)` }}
        >
          <div className="max-w-lg mx-auto relative">
            <div
              key={current.key}
              className="intro-arrow intro-arrow-in absolute bottom-0 -translate-x-1/2"
              style={{ left: tabCentre(current.tab) }}
            >
              <Arrow />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
