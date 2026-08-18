'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberIntroSeen } from '@/lib/intro'
import { TABBAR_SPACE } from './tabbarMetrics'

/**
 * The site intro — the travelling dot.
 *
 * A first-time visitor lands on the trip hub. The emerald dot in the
 * wordmark swells out of the logo, grows into a large green circle carrying
 * cream text, and travels around the screen: one stop per tab, a brown
 * arrow reaching from the circle to the real icon each stop describes. On
 * finishing — or skipping — it shrinks back into the logo, the way it came.
 *
 * ── How things are found ────────────────────────────────────────
 *
 * Nothing is hardcoded to a coordinate. The tab icons carry
 * `data-intro-tab` (TabBar.tsx) and are measured with
 * getBoundingClientRect at runtime, re-measured on resize and orientation
 * change. The logo dot is the `<g fill="#0a9d56">` inside `.gd-mark` —
 * MorphWordmark renders each word as inline SVG, so the dot is a real
 * element with a real rect; its opacity is faded on the <g>, which React
 * never styles (it styles the <svg> above it), so the two cannot fight.
 *
 * If the dot cannot be found, the circle fades in and out instead of
 * being born; if a tab cannot be found, that stop simply has no arrow.
 * The Skip control and tap-to-advance never depend on any measurement —
 * the intro must never trap anyone behind a broken overlay.
 *
 * ── The putt curve ──────────────────────────────────────────────
 *
 * Every travel and scale runs on one strong ease-out — quick off the face,
 * long confident deceleration. The durations here sit above the 400ms
 * ceiling the design system holds UI motion to, and the arrival carries a
 * 2% overshoot where the guide says no bounce. Both are a deliberate,
 * documented exception scoped to this component — the same standing the
 * landing page's collapse has — noted under Motion in
 * docs/design-system.md. The durations live here rather than in
 * globals.css, so the stylesheet's own ceiling (which test:branding
 * enforces) stays intact.
 *
 * Everything animated is transform, opacity, or the arrow's
 * stroke-dashoffset — nothing that triggers layout. Under
 * prefers-reduced-motion the choreography collapses: no birth, no travel,
 * no drawing, no drift, no overshoot — each step simply appears in place,
 * arrow already drawn.
 */

/** The signature curve. Fast off the face, long deceleration into the hole. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

const BIRTH_MS = 550   // logo dot → first stop, growing all the way
const TRAVEL_MS = 480  // between stops
const EXIT_MS = 500    // last stop → back into the logo
const SETTLE_MS = 220  // the 2% overshoot easing back
const OVERSHOOT = 1.02
const TEXT_DELAY_MS = 180 // after settling begins — the circle lands, then speaks
const TEXT_IN_MS = 220
const OUT_MS = 120     // text and arrow leaving before any travel
const ARROW_MS = 320   // the line drawing itself toward the icon
const HEAD_MS = 120    // the arrowhead arriving at the tip
const PULSE_MS = 300   // the icon's single soft acknowledgement
const DOT_FADE_MS = 200 // the real logo dot leaving and coming home

/**
 * The circle's two greens, and why they are constants here rather than
 * utilities: the birth crossfades from the logo dot's own emerald to the
 * deep emerald the circle rests at — deep, because cream body text on the
 * bright accent misses AA and on the deep it clears it. Same values as
 * globals.css's `.intro-dot` block; lib/theme.ts carries its pair of
 * palette hexes the same way.
 */
const ACCENT_EMERALD = '#0A9D56'
const DEEP_EMERALD = '#0A6B3C'

type TabKey = 'home' | 'scoring' | 'leaderboard' | 'stats' | 'settings'

type Step = {
  key: string
  heading: string
  body: string
  /** Which tab the arrow reaches for. The welcome has none. */
  tab?: TabKey
}

/** Steps 2–6 follow the tab bar left to right, so the circle drifts
    steadily across the screen instead of jumping back and forth. */
function makeSteps(tripName: string): Step[] {
  return [
    {
      key: 'welcome',
      heading: 'Bang! Welcome to Green Dot Golf!',
      body: `${tripName} is going to be one hell of a trip.`,
    },
    {
      key: 'hub',
      tab: 'home',
      heading: 'Trip Hub',
      body: 'The front page of the app. Check out your itinerary, golf tee ' +
        'times and other scheduled activities. Tap on a round to see ' +
        'weather and course details.',
    },
    {
      key: 'scoring',
      tab: 'scoring',
      heading: 'Scoring',
      body: 'Enter your scores as you play. We do the rest. Pick the course ' +
        'of the day, create your group’s scorecard and select your tees. ' +
        'Course handicaps, team scorecards and stats are all generated ' +
        'automatically.',
    },
    {
      key: 'leaderboard',
      tab: 'leaderboard',
      heading: 'Leaderboard',
      body: 'This is what it’s all about. You set the rules; we crunch the ' +
        'numbers. The leaderboard populates live as you submit your scores. ' +
        'Any team events get their own board. Matchplay or league, teams or ' +
        'solo — check the boards to see where you stand.',
    },
    {
      key: 'stats',
      tab: 'stats',
      heading: 'Stats Hub',
      body: 'Check out your personal statistics. How do you compare to the ' +
        'field? Where are you losing and gaining shots? Which courses and ' +
        'holes tripped you up? There’s nowhere to hide.',
    },
    {
      key: 'setup',
      tab: 'settings',
      heading: 'Trip Setup',
      body: 'The lead player has set up your contests. Drop in here if you ' +
        'need to tweak a setting, add an activity, or slot in an impromptu ' +
        'extra round.',
    },
  ]
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

/** Deliberately oversized: 88% of the viewport, allowed off the edge. */
const diameter = (vw: number) => Math.min(Math.round(vw * 0.88), 430)

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi)

/**
 * Where a step's circle rests, as a centre point.
 *
 * A tab stop pulls the circle toward its icon and lets it hang off the
 * screen edge — but only as far as keeps the writing on the glass: the
 * text block is 0.66 of the diameter, so the centre never comes closer to
 * an edge than 0.34 diameters plus a small margin.
 */
function restingCentre(step: Step, r: Rects): Pt {
  const D = diameter(r.vw)
  if (!step.tab) {
    return { x: r.vw / 2, y: Math.max(r.vh * 0.42, D / 2 + 64) }
  }
  const icon = r.tabs[step.tab]?.rect
  const ix = icon ? icon.left + icon.width / 2 : r.vw / 2
  const iy = icon ? icon.top : r.vh - 96
  const pulled = r.vw / 2 + (ix - r.vw / 2) * 0.55
  const x = clamp(pulled, 0.34 * D + 8, r.vw - 0.34 * D - 8)
  // Room below the circle for the arrow to reach, and the header kept clear.
  const y = clamp(iy - 96 - D / 2, 64 + D / 2, r.vh)
  return { x, y }
}

/** The transform that puts the circle's centre at p, at scale s. */
function placed(p: Pt, s: number, D: number) {
  return `translate3d(${(p.x - D / 2).toFixed(1)}px, ${(p.y - D / 2).toFixed(1)}px, 0) scale(${s.toFixed(4)})`
}

type ArrowShape = { d: string; head: string }

/**
 * The arrow's path: a gentle quadratic reach from the circle's edge to
 * just above the icon, bowed perpendicular to the straight line by 18% of
 * its length, plus a chevron head oriented along the arrival tangent.
 */
function arrowShape(centre: Pt, D: number, icon: DOMRect): ArrowShape {
  const end = { x: icon.left + icon.width / 2, y: icon.top - 8 }
  const toEnd = { x: end.x - centre.x, y: end.y - centre.y }
  const dist = Math.hypot(toEnd.x, toEnd.y) || 1
  const u = { x: toEnd.x / dist, y: toEnd.y / dist }
  const start = { x: centre.x + u.x * (D / 2 + 6), y: centre.y + u.y * (D / 2 + 6) }

  const sx = end.x - start.x
  const sy = end.y - start.y
  const len = Math.hypot(sx, sy) || 1
  // Perpendicular bow — toward the side the icon sits on, so the reach
  // curls outward like a sketched arrow rather than a plotted one.
  const side = end.x >= centre.x ? 1 : -1
  const k = 0.18 * len * side
  const ctrl = {
    x: (start.x + end.x) / 2 + (-sy / len) * k,
    y: (start.y + end.y) / 2 + (sx / len) * k,
  }

  // The head follows the curve's arrival direction, not the chord's.
  const tv = { x: end.x - ctrl.x, y: end.y - ctrl.y }
  const tl = Math.hypot(tv.x, tv.y) || 1
  const t = { x: tv.x / tl, y: tv.y / tl }
  const hl = 11
  const ha = 0.46
  const rot = (a: number) => ({
    x: t.x * Math.cos(a) - t.y * Math.sin(a),
    y: t.x * Math.sin(a) + t.y * Math.cos(a),
  })
  const p1 = rot(ha)
  const p2 = rot(-ha)

  const f = (n: number) => n.toFixed(1)
  return {
    d: `M ${f(start.x)} ${f(start.y)} Q ${f(ctrl.x)} ${f(ctrl.y)} ${f(end.x)} ${f(end.y)}`,
    head:
      `M ${f(end.x - p1.x * hl)} ${f(end.y - p1.y * hl)} ` +
      `L ${f(end.x)} ${f(end.y)} ` +
      `L ${f(end.x - p2.x * hl)} ${f(end.y - p2.y * hl)}`,
  }
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

type Phase = 'birth' | 'arriving' | 'idle' | 'leaving' | 'travel' | 'exit' | 'done'

export default function SiteIntro({ tripName }: { tripName: string }) {
  const steps = makeSteps(tripName)

  const [open, setOpen] = useState(true)
  // Nothing renders until the screen has been measured — the whole point
  // is that the circle is born out of the real logo dot, and that needs
  // the browser. Server-side this returns null and costs the page nothing.
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState(0)
  const [scrimOn, setScrimOn] = useState(false)
  const [circleStyle, setCircleStyle] = useState<React.CSSProperties>({})
  const [textOn, setTextOn] = useState(false)
  const [arrow, setArrow] = useState<ArrowShape | null>(null)
  const [arrowOn, setArrowOn] = useState(false)   // drawn to the icon
  const [arrowGone, setArrowGone] = useState(false) // fading out before travel
  const [headOn, setHeadOn] = useState(false)
  const [drifting, setDrifting] = useState(false)

  const rects = useRef<Rects | null>(null)
  const phase = useRef<Phase>('birth')
  const timers = useRef<number[]>([])
  const rm = useRef(false)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }

  /** Arrival at stop `i`: settle, then speak, then point. */
  const arrive = useCallback((i: number) => {
    const r = rects.current
    if (!r) return
    const D = diameter(r.vw)
    const p = restingCentre(steps[i], r)

    phase.current = 'arriving'
    setCircleStyle(s => ({
      ...s,
      transform: placed(p, 1, D),
      transition: `transform ${SETTLE_MS}ms ${PUTT}`,
    }))
    setDrifting(true)
    // Idempotent while the tour is out — see the note on fadeLogoDot.
    fadeLogoDot(0)
    later(SETTLE_MS, () => { phase.current = 'idle' })

    const q = rm.current
    later(q ? 0 : TEXT_DELAY_MS, () => setTextOn(true))

    const tab = steps[i].tab
    const icon = tab ? r.tabs[tab]?.rect : undefined
    if (icon) {
      later(q ? 0 : TEXT_DELAY_MS + TEXT_IN_MS, () => {
        setArrowGone(false)
        setArrow(arrowShape(p, D, icon))
        // Painted un-drawn first, so the dashoffset has somewhere to
        // transition from. Reduced motion skips the wait and the draw.
        if (q) {
          setArrowOn(true)
          setHeadOn(true)
        } else {
          requestAnimationFrame(() => requestAnimationFrame(() => setArrowOn(true)))
          later(ARROW_MS + 40, () => setHeadOn(true))
          later(ARROW_MS + 40 + HEAD_MS, () => {
            const el = tab ? rects.current?.tabs[tab]?.el : undefined
            el?.animate?.(
              [
                { transform: 'scale(1)' },
                { transform: 'scale(1.12)', color: 'var(--color-accent)', offset: 0.5 },
                { transform: 'scale(1)' },
              ],
              { duration: PULSE_MS, easing: 'ease-out' },
            )
          })
        }
      })
    }
    // Awkward dependency-free by design: steps is rebuilt per render but
    // its content is constant for a given tripName.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripName])

  /** The shrink back into the logo — reverse of the birth. */
  const exitTravel = useCallback(() => {
    const r = rects.current
    phase.current = 'exit'
    setScrimOn(false)
    if (r?.dot) {
      const D = diameter(r.vw)
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.012)
      setCircleStyle(st => ({
        ...st,
        transform: placed(c, s, D),
        backgroundColor: ACCENT_EMERALD,
        transition: `transform ${EXIT_MS}ms ${PUTT}, background-color ${EXIT_MS}ms ${PUTT}`,
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

  /** Fade the words and the arrow, then go — to the next stop or home. */
  const leave = useCallback((next: number | 'exit') => {
    clearTimers()
    phase.current = 'leaving'
    setTextOn(false)
    setArrowGone(true)
    setHeadOn(false)
    setDrifting(false)
    later(rm.current ? 0 : OUT_MS, () => {
      setArrow(null)
      setArrowOn(false)
      setArrowGone(false)
      if (next === 'exit') {
        exitTravel()
        return
      }
      const r = rects.current
      if (!r) return
      const D = diameter(r.vw)
      const p = restingCentre(steps[next], r)
      setStep(next)
      phase.current = 'travel'
      setCircleStyle(s => ({
        ...s,
        transform: placed(p, OVERSHOOT, D),
        transition: `transform ${TRAVEL_MS}ms ${PUTT}`,
      }))
      later(rm.current ? 0 : TRAVEL_MS, () => arrive(next))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrive, exitTravel])

  /** Finishing and skipping are the same exit; the cookie is written at
      once, so even an interrupted farewell counts as seen. */
  const finish = useCallback(() => {
    if (phase.current === 'exit' || phase.current === 'done') return
    rememberIntroSeen()
    leave('exit')
  }, [leave])

  const advance = useCallback(() => {
    if (phase.current !== 'idle' && phase.current !== 'arriving') return
    const last = steps.length - 1
    if (step >= last) finish()
    else leave(step + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, finish, leave])

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

    const D = diameter(r.vw)
    const p0 = restingCentre(steps[0], r)

    if (r.dot && !rm.current) {
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.012)
      setCircleStyle({
        transform: placed(c, s, D),
        backgroundColor: ACCENT_EMERALD,
        transition: 'none',
      })
      fadeLogoDot(0)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setScrimOn(true)
        setCircleStyle({
          transform: placed(p0, OVERSHOOT, D),
          backgroundColor: DEEP_EMERALD,
          transition: `transform ${BIRTH_MS}ms ${PUTT}, background-color ${BIRTH_MS}ms ${PUTT}`,
        })
        later(BIRTH_MS, () => arrive(0))
      }))
    } else {
      // No dot to be born from (or no motion asked for): appear in place.
      setCircleStyle({
        transform: placed(p0, 1, D),
        backgroundColor: DEEP_EMERALD,
        opacity: 0,
        transition: 'none',
      })
      fadeLogoDot(0, true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setScrimOn(true)
        setCircleStyle(st => ({ ...st, opacity: 1, transition: `opacity 250ms ${PUTT}` }))
        later(rm.current ? 0 : 250, () => arrive(0))
      }))
    }
    setReady(true)

    return () => {
      clearTimers()
      restoreLogoDot()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!r || (phase.current !== 'idle' && phase.current !== 'arriving')) return
      const D = diameter(r.vw)
      const p = restingCentre(steps[step], r)
      setCircleStyle(s => ({ ...s, transform: placed(p, 1, D), transition: 'none' }))
      const tab = steps[step].tab
      const icon = tab ? r.tabs[tab]?.rect : undefined
      setArrow(icon ? arrowShape(p, D, icon) : null)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  if (!open || !ready || !rects.current) return null

  const r = rects.current
  const D = diameter(r.vw)
  const current = steps[step]

  return (
    <div
      className="fixed inset-0 z-50 cursor-pointer overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Green Dot Golf"
      onClick={advance}
    >
      {/* The idle drift lives here rather than in globals.css: it is a
          six-second loop, and the stylesheet's looping animations are held
          to breath-length by test:branding. Kept beneath 3px and 0.5% so
          the circle reads as alive, not restless. */}
      <style>{`
        @keyframes gdIntroDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          25%      { transform: translate3d(2px, -2px, 0) scale(1.004); }
          50%      { transform: translate3d(-2px, 1px, 0) scale(0.997); }
          75%      { transform: translate3d(1px, 2px, 0) scale(1.002); }
        }
        .gd-intro-drift { animation: gdIntroDrift 6s ease-in-out infinite; }
        .gd-intro-drift-off { animation-play-state: paused; }
      `}</style>

      {/* The dimmed page, stopping above the tab bar: the icons being
          pointed at are never behind the scrim. It fades in with the birth
          so the first frame really is the logo's own dot on an untouched
          page. */}
      <div
        className="intro-scrim absolute left-0 right-0 top-0"
        style={{
          bottom: TABBAR_SPACE,
          opacity: scrimOn ? 1 : 0,
          transition: `opacity ${BIRTH_MS}ms ${PUTT}`,
        }}
      />

      {/* The arrow — a cream halo under a dark brown line, a marker pen on
          paper, so it reads over the dimmed page in either theme. Drawn
          with pathLength-normalised dashes; fades as one before travel. */}
      {arrow && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={r.vw}
          height={r.vh}
          viewBox={`0 0 ${r.vw} ${r.vh}`}
          aria-hidden="true"
        >
          <g
            style={{
              opacity: arrowGone ? 0 : 1,
              transition: `opacity ${OUT_MS}ms ${PUTT}`,
            }}
          >
            {([['intro-arrow-halo', 9], ['intro-arrow-line', 4]] as const).map(
              ([cls, w]) => (
                <path
                  key={cls}
                  className={cls}
                  d={arrow.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={w}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={arrowOn ? 0 : 1}
                  style={{ transition: `stroke-dashoffset ${ARROW_MS}ms ${PUTT}` }}
                />
              ),
            )}
            {([['intro-arrow-halo', 9], ['intro-arrow-line', 4]] as const).map(
              ([cls, w]) => (
                <path
                  key={`${cls}-head`}
                  className={cls}
                  d={arrow.head}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={w}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: headOn ? 1 : 0,
                    transition: `opacity ${HEAD_MS}ms ${PUTT}`,
                  }}
                />
              ),
            )}
          </g>
        </svg>
      )}

      {/* The circle. The outer element carries the journey — transform
          transitions on the putt curve — and the inner wrapper carries the
          idle drift, so the two never fight over one transform. */}
      <div
        className="intro-dot absolute rounded-full"
        style={{
          left: 0,
          top: 0,
          width: D,
          height: D,
          willChange: 'transform',
          ...circleStyle,
        }}
      >
        <div
          className={`w-full h-full rounded-full flex flex-col items-center justify-center text-center gd-intro-drift ${
            drifting ? '' : 'gd-intro-drift-off'
          }`}
          style={{ padding: `0 ${Math.round(D * 0.17)}px` }}
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
              className="font-[family-name:var(--font-display)] font-semibold text-balance"
              style={{ fontSize: 'clamp(19px, 5.5vw, 23px)', lineHeight: 1.2 }}
            >
              {current.heading}
            </p>
            <p
              className="font-[family-name:var(--font-serif)] mt-2.5"
              style={{ fontSize: 'clamp(13.5px, 3.9vw, 16px)', lineHeight: 1.45 }}
            >
              {current.body}
            </p>

            {/* Where you are in the lap — small green dots' cream cousins. */}
            <span
              className="mt-4 flex items-center justify-center gap-2"
              aria-hidden="true"
            >
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i === step ? 'intro-step-on' : 'intro-step'
                  }`}
                />
              ))}
            </span>

            {step === 0 && (
              <p
                className="font-[family-name:var(--font-ui)] mt-3 opacity-75"
                style={{ fontSize: 13 }}
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
        className="intro-cream press absolute right-4 z-10 t-label uppercase tracking-[0.18em] opacity-80 hover:opacity-100 px-3 py-2"
        style={{
          top: 'calc(env(safe-area-inset-top) + 12px)',
          opacity: scrimOn ? undefined : 0,
          transition: `opacity ${BIRTH_MS}ms ${PUTT}`,
        }}
      >
        Skip intro
      </button>
    </div>
  )
}
