'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberIntroSeen } from '@/lib/intro'

/**
 * The site intro — the travelling dot.
 *
 * A first-time visitor lands on the trip hub. After a beat, the emerald
 * dot in the wordmark blooms — one continuous swell on the putt curve —
 * into a big bubble of the logo's own emerald carrying cream writing: a
 * title and one thought at a time, a tap for each paragraph. Behind it,
 * each stop fills the screen with the real page it describes — hand-
 * traced SVG replicas of live screenshots (public/intro), full-bleed down
 * to the user's own tab bar — and the specific feature each thought is
 * talking about is ringed in a soft emerald highlight. The bubble is
 * stationary by default: it moves only when the page changes or when it
 * would sit on the very feature being shown, and pages crossfade so the
 * hub never peeks through between them. On finishing — or skipping — the
 * bubble shrinks back into the logo.
 *
 * ── How things are found ────────────────────────────────────────
 *
 * Nothing on the REAL page is hardcoded to a coordinate. The tab icons
 * carry `data-intro-tab` (TabBar.tsx) and are measured at runtime,
 * re-measured on resize and orientation change. The logo dot is the
 * `<g fill="#0a9d56">` inside `.gd-mark` — a real element with a real
 * rect. If the dot can't be found the bubble fades in and out instead of
 * being born; if a tab can't be found that step simply has no spotlight.
 * The highlight regions are the one deliberate exception: they are
 * artboard coordinates into our own SVG replicas, fixed by construction,
 * mapped to the screen through the same cover-fit maths the image uses.
 * Skip and tap-to-advance depend on no measurement at all — the intro
 * must never trap anyone behind a broken overlay.
 *
 * ── The veil ────────────────────────────────────────────────────
 *
 * One full-screen backdrop blur, masked to a vignette: clear in the
 * middle, a faint soft frame at the edges, with a feathered clear hole
 * over the focused tab. The mask is an SVG alpha feather rebuilt per step
 * and carried as a data URI — SVG rather than a CSS gradient function on
 * purpose: the brand's no-gradients rule is about colour decoration, and
 * keeping the feather out of CSS syntax keeps that rule mechanically
 * enforceable exactly as it is.
 *
 * ── The putt curve ──────────────────────────────────────────────
 *
 * Every travel and scale runs on one strong ease-out — quick off the
 * face, long confident deceleration. The durations sit above the 400ms
 * ceiling the design system holds UI motion to, and arrivals carry a 2%
 * overshoot where the guide says no bounce. Both are a deliberate,
 * documented exception scoped to this component — the same standing the
 * landing page's collapse has — noted under Motion in
 * docs/design-system.md. The durations live here rather than in
 * globals.css, so the stylesheet's own ceiling (which test:branding
 * enforces) stays intact.
 *
 * Everything animated is transform or opacity — nothing that triggers
 * layout. Under prefers-reduced-motion the choreography collapses: no
 * birth, no travel, no overshoot — each thought simply appears
 * in place, spotlight already on its tab.
 */

/** The signature curve. Fast off the face, long deceleration into the hole. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** The beat before anything moves — a page that starts performing the
    instant it appears reads as an ad, not a welcome. */
const BIRTH_DELAY_MS = 600
/** One continuous bloom, logo dot to resting bubble. A single transition
    on a single curve — a staged swell was tried and read as a stutter. */
const BIRTH_MS = 900
const TRAVEL_MS = 480  // a hop aside, and the glow's glide
const EXIT_MS = 500    // back into the logo
const SETTLE_MS = 220  // the 2% overshoot easing back
const OVERSHOOT = 1.02
const TEXT_DELAY_MS = 180 // the bubble lands, then speaks
const TEXT_IN_MS = 220
const OUT_MS = 120     // the words fading between thoughts
const SHOT_XFADE_MS = 300 // one page dissolving into the next — no gap
const FOCUS_IN_MS = 250 // the feature highlight arriving
const FOCUS_DELAY_MS = 420 // ...after the words have started speaking
const PULSE_MS = 300   // the focused icon's single soft acknowledgement
const DOT_FADE_MS = 200 // the real logo dot leaving and coming home
const VEIL_MS = 500    // the blur arriving and leaving

type TabKey = 'home' | 'scoring' | 'leaderboard' | 'stats' | 'settings'

/** A region of the 360x700 artboard — the feature a thought points at. */
type Region = { x: number; y: number; w: number; h: number }

type Step = {
  key: string
  title: string
  /** Which tab the spotlight rests on. The welcome has none. */
  tab?: TabKey
  /** The example screen behind each paragraph — public/intro SVGs, one
      entry per para (the last entry carries any overflow). */
  shots?: string[]
  /** The feature each paragraph highlights, in artboard coordinates —
      null for a thought that describes the whole page. */
  focus?: (Region | null)[]
  /** One thought per tap — never the whole spiel at once. */
  paras: string[]
}

/** The tour's running order — Big Dog's: hub, settings, scoring, stats,
    and the leaderboard last, because that is what it's all about. */
function makeSteps(tripName: string): Step[] {
  return [
    {
      key: 'welcome',
      title: 'Bang! Welcome to Green Dot Golf!',
      paras: [`${tripName} is going to be one hell of a trip.`],
    },
    {
      key: 'hub',
      tab: 'home',
      shots: ['/intro/hub.svg'],
      focus: [
        { x: 8, y: 336, w: 344, h: 58 },
        { x: 12, y: 434, w: 336, h: 84 },
      ],
      title: 'Trip Hub',
      paras: [
        'The front page of the app. Check out your itinerary, golf tee ' +
          'times and other scheduled activities.',
        'Tap on a round to see weather and course details.',
      ],
    },
    {
      key: 'setup',
      tab: 'settings',
      shots: ['/intro/setup.svg'],
      focus: [
        { x: 24, y: 340, w: 312, h: 144 },
        { x: 12, y: 52, w: 336, h: 78 },
      ],
      title: 'Trip Setup',
      paras: [
        'The lead player has set up your contests.',
        'Drop in here if you need to tweak a setting, add an activity, or ' +
          'slot in an impromptu extra round.',
      ],
    },
    {
      key: 'scoring',
      tab: 'scoring',
      shots: ['/intro/scoring.svg', '/intro/scorecard.svg', '/intro/scorecard.svg'],
      focus: [
        { x: 12, y: 90, w: 336, h: 86 },
        { x: 12, y: 342, w: 336, h: 140 },
        { x: 16, y: 444, w: 220, h: 34 },
      ],
      title: 'Scoring',
      paras: [
        'Enter your scores as you play. We do the rest.',
        'Pick the course of the day, create your group’s scorecard and ' +
          'select your tees.',
        'Course handicaps, team scorecards and stats are all generated ' +
          'automatically.',
      ],
    },
    {
      key: 'stats',
      tab: 'stats',
      shots: ['/intro/stats.svg'],
      focus: [
        { x: 8, y: 94, w: 296, h: 42 },
        { x: 12, y: 374, w: 336, h: 144 },
      ],
      title: 'Stats Hub',
      paras: [
        'Check out your personal statistics. How do you compare to the ' +
          'field?',
        'Where are you losing and gaining shots? Which courses and holes ' +
          'tripped you up? There’s nowhere to hide.',
      ],
    },
    {
      key: 'leaderboard',
      tab: 'leaderboard',
      shots: ['/intro/leaderboard.svg', '/intro/leaderboard.svg', '/intro/matchplay.svg'],
      focus: [
        { x: 12, y: 94, w: 336, h: 86 },
        { x: 10, y: 50, w: 310, h: 44 },
        { x: 10, y: 342, w: 192, h: 98 },
      ],
      title: 'Leaderboard',
      paras: [
        'This is what it’s all about. You set the rules; we crunch the ' +
          'numbers.',
        'The leaderboard populates live as you submit your scores. Any ' +
          'team events get their own board.',
        'Matchplay or league, teams or solo — check the boards to see ' +
          'where you stand.',
      ],
    },
  ]
}

/** The example screen a given thought shows, or null for none. */
function shotFor(step: Step, para: number): string | null {
  if (!step.shots?.length) return null
  return step.shots[Math.min(para, step.shots.length - 1)]
}

/** The feature a given thought rings, or null. */
function focusFor(step: Step, para: number): Region | null {
  return step.focus?.[para] ?? null
}

const TAB_KEYS: TabKey[] = ['home', 'scoring', 'leaderboard', 'stats', 'settings']

type Pt = { x: number; y: number }

type Rects = {
  vw: number
  vh: number
  /** Where the wordmark's emerald dot sits, or null if it can't be found. */
  dot: DOMRect | null
  tabs: Partial<Record<TabKey, { el: Element; rect: DOMRect }>>
}

/** Everything the choreography needs to know about the real screen. */
function measure(): Rects {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const dotEl = document.querySelector('.gd-mark [fill="#0a9d56"]')
  const tabs: Rects['tabs'] = {}
  for (const key of TAB_KEYS) {
    const el = document.querySelector(`[data-intro-tab="${key}"]`)
    if (el) tabs[key] = { el, rect: el.getBoundingClientRect() }
  }
  return { vw, vh, dot: dotEl?.getBoundingClientRect() ?? null, tabs }
}

/**
 * The real dot in the wordmark, leaving as the big one departs and coming
 * home as it lands. Styled on the <g>, which React's own props never touch
 * — but queried FRESH on every call rather than cached from the mount
 * measurement, because React re-applies the wordmark's
 * dangerouslySetInnerHTML once on its first update after hydration, which
 * replaces the <g> we styled with an unstyled twin. A cached reference dies
 * with the old node; a fresh query finds whichever one is real. Each
 * arrival re-asserts the hide for the same reason. Pure DOM, no component
 * state — which is why these live at module scope.
 */
const logoDotEl = () =>
  document.querySelector('.gd-mark [fill="#0a9d56"]') as HTMLElement | null

function fadeLogoDot(to: 0 | 1, instant = false) {
  const el = logoDotEl()
  if (!el?.style) return
  el.style.transition = instant ? '' : `opacity ${DOT_FADE_MS}ms ease-out`
  el.style.opacity = String(to)
}

function restoreLogoDot() {
  const el = logoDotEl()
  if (!el?.style) return
  el.style.transition = ''
  el.style.opacity = ''
}

/** Big enough for the writing to breathe, small enough to dodge — the
    inner padding is tight, so the words use most of the circle. */
const circleD = (vw: number) => Math.min(Math.round(vw * 0.76), 350)

/**
 * The bubble's typography — Big Dog's pick from the five candidates that
 * were tried on-device: Clash Display titles over Bespoke Serif body, the
 * site's display voice over its reading voice.
 */
const TITLE_FONT = 'var(--font-display)'
const BODY_FONT = 'var(--font-serif)'

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi)

/** The transform that puts the bubble's centre at p, at scale s. */
function placed(p: Pt, s: number, D: number) {
  return `translate3d(${(p.x - D / 2).toFixed(1)}px, ${(p.y - D / 2).toFixed(1)}px, 0) scale(${s.toFixed(4)})`
}

/** Where the tab bar begins — the example screens stop there. */
function tabTopOf(r: Rects): number {
  return Math.min(...TAB_KEYS.map(k => r.tabs[k]?.rect.top ?? Infinity), r.vh - 88)
}

/** The cover-fit maths the example <img> uses, shared by the highlight. */
function shotScale(r: Rects) {
  const h = tabTopOf(r)
  const s = Math.max(r.vw / 360, h / 700)
  return { s, ox: (r.vw - 360 * s) / 2, h }
}

/**
 * The bubble's lean: 'L' is the favoured middle-left, 'R' its mirror —
 * alternated on page changes so a new page always brings a move — and
 * 'C' is the welcome's centre-stage.
 */
type Side = 'L' | 'R' | 'C'

/**
 * Where the bubble parks for a thought: fully clear of the ringed
 * feature, worked out against the REAL viewport — Safari's chrome makes
 * a phone's usable height far shorter than the screen, which is what
 * sank the fixed-halves version of this. The bubble takes the far
 * parking spot on whichever side of the ring it actually fits (the
 * artboards keep every ringed feature in a top or a low band, so on any
 * normal phone one side always fits); if some viewport is too short for
 * either, it parks as far from the ring as the glass allows.
 */
function spotFor(side: Side, reg: Region | null, r: Rects): Pt {
  const D = circleD(r.vw)
  if (side === 'C') return { x: r.vw / 2, y: Math.max(r.vh * 0.32, 66 + D / 2) }
  const lean = side === 'L' ? 0.42 : 0.58
  const x = clamp(lean * r.vw, D * 0.34 + 6, r.vw - D * 0.34 - 6)
  const tabTop = tabTopOf(r)
  const topY = 54 + D / 2
  const bottomY = tabTop - 8 - D / 2
  if (!reg) return { x, y: topY }
  const { s } = shotScale(r)
  const ringTop = reg.y * s
  const ringBottom = (reg.y + reg.h) * s
  const GAP = 12
  const above = ringTop - GAP - D / 2
  const below = ringBottom + GAP + D / 2
  const fitsAbove = above >= topY
  const fitsBelow = below <= bottomY
  const preferAbove = (ringTop + ringBottom) / 2 > (54 + tabTop) / 2
  let y: number
  if (preferAbove && fitsAbove) y = topY
  else if (!preferAbove && fitsBelow) y = bottomY
  else if (fitsAbove) y = topY
  else if (fitsBelow) y = bottomY
  else y = clamp(above - topY > bottomY - below ? above : below, topY, bottomY)
  return { x, y }
}

/**
 * The veil's mask: a vignette — clear through the middle, a faint frame
 * at the edges — with a feathered clear hole cut over the focused tab.
 * Rebuilt per step at viewport size; SVG's own camelCase gradients, see
 * the note up top.
 */
function maskFor(vw: number, vh: number, hole: Pt | null): string {
  const cx = vw / 2
  const cy = (vh * 0.44).toFixed(0)
  const R = (Math.max(vw, vh) * 0.62).toFixed(0)
  let defs =
    `<radialGradient id='v' gradientUnits='userSpaceOnUse' cx='${cx}' cy='${cy}' r='${R}'>` +
    `<stop offset='0.5' stop-color='#000' stop-opacity='0'/>` +
    `<stop offset='0.92' stop-color='#000' stop-opacity='1'/>` +
    `</radialGradient>`
  let cut = ''
  if (hole) {
    const hx = hole.x.toFixed(0)
    const hy = hole.y.toFixed(0)
    defs +=
      `<radialGradient id='h' gradientUnits='userSpaceOnUse' cx='${hx}' cy='${hy}' r='78'>` +
      `<stop offset='0.5' stop-color='#000'/>` +
      `<stop offset='1' stop-color='#fff'/>` +
      `</radialGradient>`
    cut =
      `<mask id='c'><rect width='${vw}' height='${vh}' fill='#fff'/>` +
      `<circle cx='${hx}' cy='${hy}' r='78' fill='url(#h)'/></mask>`
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${vw}' height='${vh}'>` +
    `<defs>${defs}</defs>${cut}` +
    `<rect width='${vw}' height='${vh}' fill='url(#v)'${hole ? ` mask='url(#c)'` : ''}/>` +
    `</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

type Phase = 'birth' | 'run' | 'exit' | 'done'

export default function SiteIntro({ tripName }: { tripName: string }) {
  const steps = makeSteps(tripName)

  const [open, setOpen] = useState(true)
  // Nothing renders until the screen has been measured — the whole point
  // is that the bubble is born out of the real logo dot, and that needs
  // the browser. Server-side this returns null and costs the page nothing.
  const [ready, setReady] = useState(false)
  const [pos, setPos] = useState({ step: 0, para: 0 })
  const [veilOn, setVeilOn] = useState(false)
  const [circleStyle, setCircleStyle] = useState<React.CSSProperties>({})
  const [textOn, setTextOn] = useState(false)
  // The example screen currently up, and the one it is replacing. On a
  // page change the NEW image fades in OVER the old one, which holds at
  // full opacity beneath until the fade is done — so the pages' combined
  // cover never dips and the real hub can never peek through the gap.
  const [shotSrc, setShotSrc] = useState<string | null>(null)
  const [prevShot, setPrevShot] = useState<string | null>(null)
  const [shotOn, setShotOn] = useState(false)
  const [focusOn, setFocusOn] = useState(false)

  const rects = useRef<Rects | null>(null)
  const phase = useRef<Phase>('birth')
  const side = useRef<Side>('C')
  const lastSpot = useRef<Pt | null>(null)
  const timers = useRef<number[]>([])
  const rm = useRef(false)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }

  /** Move to a spot — or, if the bubble is already there, don't. */
  const moveCircle = useCallback((p: Pt) => {
    const r = rects.current
    if (!r) return
    const last = lastSpot.current
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 4) return
    lastSpot.current = p
    const D = circleD(r.vw)
    setCircleStyle(s => ({
      ...s,
      transform: placed(p, OVERSHOOT, D),
      transition: `transform ${TRAVEL_MS}ms ${PUTT}`,
    }))
    later(rm.current ? 0 : TRAVEL_MS, () => {
      setCircleStyle(s => ({
        ...s,
        transform: placed(p, 1, D),
        transition: `transform ${SETTLE_MS}ms ${PUTT}`,
      }))
      // Idempotent while the tour is out — see the note on fadeLogoDot.
      fadeLogoDot(0)
    })
  }, [])

  /** The focused icon answering: one soft emerald pulse. */
  const pulse = useCallback((tab: TabKey | undefined) => {
    if (!tab || rm.current) return
    rects.current?.tabs[tab]?.el?.animate?.(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.12)', color: 'var(--color-accent)', offset: 0.5 },
        { transform: 'scale(1)' },
      ],
      { duration: PULSE_MS, easing: 'ease-out' },
    )
  }, [])

  /** The shrink back into the logo — reverse of the birth. */
  const exitTravel = useCallback(() => {
    const r = rects.current
    phase.current = 'exit'
    setTextOn(false)
    setShotOn(false)
    setFocusOn(false)
    setVeilOn(false)
    if (r?.dot) {
      const D = circleD(r.vw)
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.012)
      setCircleStyle(st => ({
        ...st,
        transform: placed(c, s, D),
        transition: `transform ${EXIT_MS}ms ${PUTT}`,
      }))
      later(Math.max(0, EXIT_MS - DOT_FADE_MS), () => fadeLogoDot(1))
    } else {
      setCircleStyle(st => ({ ...st, opacity: 0, transition: `opacity 250ms ${PUTT}` }))
      fadeLogoDot(1)
    }
    later(rm.current ? 0 : EXIT_MS, () => {
      phase.current = 'done'
      restoreLogoDot()
      setOpen(false)
    })
  }, [])

  /** Finishing and skipping are the same exit; the cookie is written at
      once, so even an interrupted farewell counts as seen. */
  const finish = useCallback(() => {
    if (phase.current === 'exit' || phase.current === 'done') return
    rememberIntroSeen()
    clearTimers()
    exitTravel()
  }, [exitTravel])

  /** A tap: the next thought — or the next page, or the farewell. */
  const advance = useCallback(() => {
    if (phase.current !== 'run') return
    const cur = pos
    const step = steps[cur.step]
    const next =
      cur.para + 1 < step.paras.length
        ? { step: cur.step, para: cur.para + 1 }
        : cur.step + 1 < steps.length
          ? { step: cur.step + 1, para: 0 }
          : null
    if (!next) {
      finish()
      return
    }
    clearTimers()
    const r = rects.current
    const nextStep = steps[next.step]
    const stepChanged = next.step !== cur.step
    const nextShot = shotFor(nextStep, next.para)
    const nextFocus = focusFor(nextStep, next.para)

    setTextOn(false)
    setFocusOn(false)
    later(rm.current ? 0 : OUT_MS, () => {
      setPos(next)
      setTextOn(true)
    })

    // The bubble parks on the opposite half of the screen from the
    // feature being ringed — well out of its way. The lean alternates on
    // page changes; within a page the bubble moves only when the next
    // feature actually needs its spot.
    if (r) {
      if (stepChanged) {
        side.current = side.current === 'L' ? 'R' : 'L'
      } else if (side.current === 'C') {
        side.current = 'L'
      }
      moveCircle(spotFor(side.current, nextFocus, r))
    }

    const curShot = shotFor(step, cur.para)
    if (nextShot !== curShot) {
      later(rm.current ? 0 : OUT_MS, () => {
        setPrevShot(curShot)
        setShotSrc(nextShot)
        setShotOn(true)
      })
      // The old page is released only once the new one fully covers it.
      later(rm.current ? 0 : OUT_MS + SHOT_XFADE_MS + 60, () => setPrevShot(null))
    }
    if (nextFocus) {
      later(rm.current ? 0 : FOCUS_DELAY_MS, () => setFocusOn(true))
    }
    if (stepChanged) {
      later(rm.current ? 0 : TRAVEL_MS, () => pulse(nextStep.tab))
    }
    // steps is rebuilt per render but its content is constant per tripName.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, finish, moveCircle, pulse])

  // ── Birth ──
  useEffect(() => {
    if (!open) return
    let r: Rects
    try {
      r = measure()
    } catch {
      // A browser this can't measure is a browser this shouldn't run in.
      rememberIntroSeen()
      setOpen(false)
      return
    }
    rects.current = r
    rm.current =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const D = circleD(r.vw)
    side.current = 'C'
    const p0 = spotFor('C', null, r)
    lastSpot.current = p0

    if (r.dot && !rm.current) {
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.012)
      setCircleStyle({ transform: placed(c, s, D), transition: 'none' })
      // A beat of stillness first — the page arrives, then the dot goes.
      later(BIRTH_DELAY_MS, () => {
        fadeLogoDot(0)
        setVeilOn(true)
        setCircleStyle({
          transform: placed(p0, OVERSHOOT, D),
          transition: `transform ${BIRTH_MS}ms ${PUTT}`,
        })
        later(BIRTH_MS, () => {
          setCircleStyle({
            transform: placed(p0, 1, D),
            transition: `transform ${SETTLE_MS}ms ${PUTT}`,
          })
          phase.current = 'run'
          // React's first post-hydration update replaces the wordmark's
          // innerHTML, undoing the hide — re-assert it.
          fadeLogoDot(0)
        })
        later(BIRTH_MS + TEXT_DELAY_MS, () => setTextOn(true))
      })
    } else {
      // No dot to be born from (or no motion asked for): appear in place.
      setCircleStyle({ transform: placed(p0, 1, D), opacity: 0, transition: 'none' })
      fadeLogoDot(0, true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVeilOn(true)
        setCircleStyle(st => ({ ...st, opacity: 1, transition: `opacity 250ms ${PUTT}` }))
        setTextOn(true)
        phase.current = 'run'
      }))
    }
    setReady(true)

    return () => {
      clearTimers()
      restoreLogoDot()
    }
     
  }, [open])

  // ── The page holds still underneath ──
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // ── Escape skips ──
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  // ── The screen changed shape: re-measure, and re-place without motion ──
  useEffect(() => {
    if (!open) return
    const onResize = () => {
      try {
        rects.current = measure()
      } catch { return }
      const r = rects.current
      if (!r || phase.current !== 'run') return
      const D = circleD(r.vw)
      const p = spotFor(side.current, focusFor(steps[pos.step], pos.para), r)
      lastSpot.current = p
      setCircleStyle(s => ({ ...s, transform: placed(p, 1, D), transition: 'none' }))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
    // steps is rebuilt per render but its content is constant per tripName.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos])

  if (!open || !ready || !rects.current) return null

  const r = rects.current
  const D = circleD(r.vw)
  const step = steps[pos.step]

  // The spotlight: the focused tab's icon, sharp and glowing at the
  // bottom edge. The hole is baked into the vignette mask per step; the
  // glow glides between tabs on the putt curve.
  const tabFocus = step.tab ? r.tabs[step.tab]?.rect : undefined
  const hole: Pt | null = tabFocus
    ? { x: tabFocus.left + tabFocus.width / 2, y: tabFocus.top + tabFocus.height / 2 }
    : null

  // The example screens, full-bleed down to the real tab bar. Every
  // unique screen is mounted from the start so each is loaded before it
  // is needed; the current one shows, and changes crossfade in place.
  const allShots = [...new Set(steps.flatMap(s => s.shots ?? []))]
  const { s: shotS, ox: shotOx, h: shotH } = shotScale(r)

  // The feature this thought is talking about, mapped through the same
  // cover-fit the image uses.
  const reg = focusFor(step, pos.para)

  return (
    <div
      className="fixed inset-0 z-50 cursor-pointer overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Green Dot Golf"
      onClick={advance}
    >
      {/* The example screen — the real page this thought is talking
          about, full-bleed down to the user's own tab bar, which stays
          the footer of the picture. Each image fades on its own, so one
          page dissolves into the next with no gap.

          `isolation: isolate` is load-bearing: the images carry z-indexes
          for their over-fade, and without a stacking context here those
          indexes would count against the overlay's other children — which
          is exactly how the pages came to paint OVER the bubble on every
          step after the welcome. Isolated, the indexes settle their order
          among the images alone and the bubble stays on top. */}
      <div
        className="absolute left-0 top-0 overflow-hidden pointer-events-none"
        style={{
          width: r.vw,
          height: shotH,
          isolation: 'isolate',
          opacity: shotOn && shotSrc ? 1 : 0,
          transition: `opacity ${SHOT_XFADE_MS}ms ${PUTT}`,
        }}
      >
        {allShots.map(src => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={
              src === shotSrc
                ? { opacity: 1, zIndex: 2, transition: `opacity ${SHOT_XFADE_MS}ms ${PUTT}` }
                : src === prevShot
                  ? { opacity: 1, zIndex: 1, transition: 'none' }
                  : { opacity: 0, zIndex: 0, transition: 'none' }
            }
          />
        ))}
      </div>

      {/* The feature this thought describes, ringed in emerald on the
          example itself. Artboard coordinates mapped through the same
          cover-fit as the image. */}
      {reg && (
        <div
          className="intro-focus absolute pointer-events-none"
          style={{
            left: (shotOx + reg.x * shotS).toFixed(0) + 'px',
            top: (reg.y * shotS).toFixed(0) + 'px',
            width: (reg.w * shotS).toFixed(0) + 'px',
            height: (reg.h * shotS).toFixed(0) + 'px',
            opacity: focusOn && shotOn ? 1 : 0,
            transition: `opacity ${FOCUS_IN_MS}ms ${PUTT}`,
          }}
        />
      )}

      {/* The veil: a faint blur framing the edges of whatever is showing
          — the example, and the real page around it — clear through the
          middle, with the focused tab cut sharp at the bottom. */}
      <div
        className="intro-veil absolute inset-0"
        style={{
          opacity: veilOn ? 1 : 0,
          WebkitMaskImage: maskFor(r.vw, r.vh, hole),
          maskImage: maskFor(r.vw, r.vh, hole),
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: `${r.vw}px ${r.vh}px`,
          maskSize: `${r.vw}px ${r.vh}px`,
          transition: `opacity ${VEIL_MS}ms ${PUTT}`,
        }}
      />

      {/* The soft emerald glow warming the focused icon. It glides
          between tabs on the putt curve, and dims when no tab is the
          subject. */}
      <div
        className="intro-glow absolute left-0 top-0 rounded-full pointer-events-none"
        style={{
          width: 46,
          height: 46,
          transform: hole
            ? `translate3d(${(hole.x - 23).toFixed(0)}px, ${(hole.y - 23).toFixed(0)}px, 0)`
            : `translate3d(${(r.vw / 2 - 23).toFixed(0)}px, ${r.vh}px, 0)`,
          opacity: hole && veilOn ? 1 : 0,
          transition: `transform ${TRAVEL_MS}ms ${PUTT}, opacity 250ms ${PUTT}`,
        }}
      />

      {/* The bubble — the logo's own emerald, the writing riding it,
          stationary unless the page changes or a feature needs the space. */}
      <div
        className="intro-dot absolute left-0 top-0 rounded-full"
        style={{ width: D, height: D, willChange: 'transform', ...circleStyle }}
      >
        <div
          className="w-full h-full rounded-full flex flex-col items-center justify-center text-center"
          style={{ padding: `0 ${Math.round(D * 0.12)}px` }}
        >
          <div
            style={{
              opacity: textOn ? 1 : 0,
              transform: textOn ? 'translateY(0)' : 'translateY(8px)',
              transition: textOn
                ? `opacity ${TEXT_IN_MS}ms ${PUTT}, transform ${TEXT_IN_MS}ms ${PUTT}`
                : `opacity ${OUT_MS}ms ${PUTT}, transform ${OUT_MS}ms ${PUTT}`,
            }}
          >
            <p
              className="text-balance"
              style={{
                fontFamily: TITLE_FONT,
                fontWeight: 600,
                fontSize: 'clamp(26px, 7.4vw, 32px)',
                lineHeight: 1.12,
              }}
            >
              {step.title}
            </p>
            <p
              className="mt-3"
              style={{
                fontFamily: BODY_FONT,
                fontSize: 'clamp(18px, 5.1vw, 21px)',
                lineHeight: 1.4,
              }}
            >
              {step.paras[pos.para]}
            </p>

            {pos.step === 0 && (
              <p
                className="mt-3 opacity-80"
                style={{ fontFamily: BODY_FONT, fontSize: 15 }}
              >
                Tap anywhere to look around
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Always on offer, from the first frame, dependent on nothing. */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); finish() }}
        className="press absolute right-4 z-10 t-label uppercase tracking-[0.18em] text-ink/70 hover:text-ink px-3 py-2"
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        Skip intro
      </button>
    </div>
  )
}
