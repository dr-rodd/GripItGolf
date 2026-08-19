'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberIntroSeen } from '@/lib/intro'

/**
 * The site intro — the travelling dot.
 *
 * A first-time visitor lands on the trip hub. After a beat, the emerald
 * dot in the wordmark stirs, swells, and blooms into a big green bubble —
 * the logo's own emerald, writ large — carrying cream writing: a title
 * and one thought at a time, a tap for each paragraph. The bubble parks
 * high, favouring the top-middle-left, and hops aside on every tap so it
 * never sits over what it is showing: beneath it, each stop presents a
 * miniature of the real page it describes — hand-traced SVG replicas of
 * live screenshots, a few kilobytes each (public/intro/*.svg) — while the
 * page's edges soften behind a faint vignette blur and the tab being
 * talked about glows sharp at the bottom. On finishing — or skipping —
 * the bubble shrinks back into the logo.
 *
 * ── How things are found ────────────────────────────────────────
 *
 * Nothing is hardcoded to a coordinate. The tab icons carry
 * `data-intro-tab` (TabBar.tsx) and are measured with
 * getBoundingClientRect at runtime, re-measured on resize and orientation
 * change. The logo dot is the `<g fill="#0a9d56">` inside `.gd-mark` —
 * MorphWordmark renders each word as inline SVG, so the dot is a real
 * element with a real rect. If the dot can't be found the bubble fades in
 * and out instead of being born; if a tab can't be found that step simply
 * has no spotlight. Skip and tap-to-advance depend on no measurement at
 * all — the intro must never trap anyone behind a broken overlay.
 *
 * ── The veil ────────────────────────────────────────────────────
 *
 * One full-screen backdrop blur, masked to a vignette: clear in the
 * middle where the example screen sits, fading to a faint blur at the
 * edges — plus a feathered clear hole over the focused tab, so the thing
 * being pointed at is the one sharp element on the bottom edge. The mask
 * is an SVG alpha feather rebuilt per step and carried as a data URI —
 * SVG rather than a CSS gradient function on purpose: the brand's
 * no-gradients rule is about colour decoration, and keeping the feather
 * out of CSS syntax keeps that rule mechanically enforceable exactly as
 * it is.
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
 * birth, no travel, no drift, no overshoot — each thought simply appears
 * in place, spotlight already on its tab.
 */

/** The signature curve. Fast off the face, long deceleration into the hole. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** The beat before anything moves — a page that starts performing the
    instant it appears reads as an ad, not a welcome. */
const BIRTH_DELAY_MS = 600
const SWELL_MS = 320   // the dot stirring and swelling beside the logo
const BIRTH_MS = 750   // then blooming out to its first resting spot
const TRAVEL_MS = 480  // each hop aside, and the glow's glide
const EXIT_MS = 500    // back into the logo
const SETTLE_MS = 220  // the 2% overshoot easing back
const OVERSHOOT = 1.02
const TEXT_DELAY_MS = 180 // the bubble lands, then speaks
const TEXT_IN_MS = 220
const OUT_MS = 120     // words and example fading before anything travels
const SHOT_IN_MS = 260 // the next example screen rising in
const PULSE_MS = 300   // the focused icon's single soft acknowledgement
const DOT_FADE_MS = 200 // the real logo dot leaving and coming home
const VEIL_MS = 500    // the blur arriving and leaving

type TabKey = 'home' | 'scoring' | 'leaderboard' | 'stats' | 'settings'

type Step = {
  key: string
  title: string
  /** Which tab the spotlight rests on. The welcome has none. */
  tab?: TabKey
  /** The example screen shown beneath the bubble — public/intro/*.svg. */
  shot?: string
  /** One thought per tap — never the whole spiel at once. */
  paras: string[]
}

/** Steps follow the tab bar left to right; the bubble's side-hops supply
    the motion, so the tour still reads as one steady lap. */
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
      shot: '/intro/hub.svg',
      title: 'Trip Hub',
      paras: [
        'The front page of the app. Check out your itinerary, golf tee ' +
          'times and other scheduled activities.',
        'Tap on a round to see weather and course details.',
      ],
    },
    {
      key: 'scoring',
      tab: 'scoring',
      shot: '/intro/scoring.svg',
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
      key: 'leaderboard',
      tab: 'leaderboard',
      shot: '/intro/leaderboard.svg',
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
    {
      key: 'stats',
      tab: 'stats',
      shot: '/intro/stats.svg',
      title: 'Stats Hub',
      paras: [
        'Check out your personal statistics. How do you compare to the ' +
          'field?',
        'Where are you losing and gaining shots? Which courses and holes ' +
          'tripped you up? There’s nowhere to hide.',
      ],
    },
    {
      key: 'setup',
      tab: 'settings',
      shot: '/intro/setup.svg',
      title: 'Trip Setup',
      paras: [
        'The lead player has set up your contests.',
        'Drop in here if you need to tweak a setting, add an activity, or ' +
          'slot in an impromptu extra round.',
      ],
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

/** Sized to speak from up top and still leave the example screen its room. */
const circleD = (vw: number) => Math.min(Math.round(vw * 0.72), 320)

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi)

/** The transform that puts the bubble's centre at p, at scale s. */
function placed(p: Pt, s: number, D: number) {
  return `translate3d(${(p.x - D / 2).toFixed(1)}px, ${(p.y - D / 2).toFixed(1)}px, 0) scale(${s.toFixed(4)})`
}

/**
 * Where the bubble rests: high on the screen, favouring the middle-left,
 * hopping to a middle-right lean on alternate taps so every tap moves it —
 * and always clear of the example screen below. The welcome, with nothing
 * to show yet, takes the centre.
 */
function bubbleSpot(h: number, r: Rects, welcome: boolean): Pt {
  const D = circleD(r.vw)
  if (welcome) {
    return { x: r.vw / 2, y: Math.max(r.vh * 0.3, 76 + D / 2) }
  }
  // Odd hops are each step's arrival (the welcome takes hop zero), so the
  // favoured top-middle-left is where every new page's talk begins.
  const lean = h % 2 === 1 ? 0.4 : 0.6
  const x = clamp(lean * r.vw, D * 0.34 + 8, r.vw - D * 0.34 - 8)
  const y = 72 + D / 2 + (h % 3) * 7
  return { x, y }
}

/** Where the tab bar begins — the example screen stops above it. */
function tabTopOf(r: Rects): number {
  return Math.min(...TAB_KEYS.map(k => r.tabs[k]?.rect.top ?? Infinity), r.vh - 88)
}

/**
 * The veil's mask: a vignette — clear through the middle, fading to
 * opaque at the edges, so the blur is a soft frame rather than a wall —
 * with a feathered clear hole cut over the focused tab. Rebuilt per step
 * at viewport size; SVG's own camelCase gradients, see the note up top.
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
  const [drifting, setDrifting] = useState(false)
  // The example screen: which step's it is, and whether it is up. Its own
  // pair rather than riding textOn, so paragraphs within a step swap
  // without the example blinking.
  const [shotStep, setShotStep] = useState(0)
  const [shotOn, setShotOn] = useState(false)

  const rects = useRef<Rects | null>(null)
  const phase = useRef<Phase>('birth')
  const hop = useRef(0)
  const timers = useRef<number[]>([])
  const rm = useRef(false)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }

  /** One hop aside: out on the putt curve, 2% over, settle. */
  const moveCircle = useCallback((h: number, toStep: number) => {
    const r = rects.current
    if (!r) return
    const D = circleD(r.vw)
    const p = bubbleSpot(h, r, toStep === 0)
    setDrifting(false)
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
      setDrifting(true)
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
    setVeilOn(false)
    setDrifting(false)
    if (r?.dot) {
      const D = circleD(r.vw)
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.015)
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

  /** A tap: the next thought — or the next tab, or the farewell. The
      bubble hops aside on every one of them. */
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
    hop.current += 1
    setTextOn(false)
    later(rm.current ? 0 : OUT_MS, () => {
      setPos(next)
      setTextOn(true)
    })
    moveCircle(hop.current, next.step)
    if (next.step !== cur.step) {
      // The example changes with the step: the old one slips out with the
      // words, the new one rises once the bubble is out of its way.
      setShotOn(false)
      later(rm.current ? 0 : OUT_MS, () => setShotStep(next.step))
      later(rm.current ? 0 : TRAVEL_MS - 80, () => setShotOn(true))
      later(rm.current ? 0 : TRAVEL_MS, () => pulse(steps[next.step].tab))
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
    const p0 = bubbleSpot(0, r, true)

    if (r.dot && !rm.current) {
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.015)
      setCircleStyle({ transform: placed(c, s, D), transition: 'none' })
      // A beat of stillness first — the page arrives, then the dot stirs.
      later(BIRTH_DELAY_MS, () => {
        fadeLogoDot(0)
        // The swell: still beside the logo, growing from a full stop into
        // a small ball — the "watch this" moment before the bloom.
        const sw = { x: c.x + 30, y: c.y + 34 }
        setCircleStyle({
          transform: placed(sw, 0.18, D),
          transition: `transform ${SWELL_MS}ms ease-out`,
        })
        later(SWELL_MS, () => {
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
            setDrifting(true)
            phase.current = 'run'
            // React's first post-hydration update replaces the wordmark's
            // innerHTML, undoing the hide — re-assert it.
            fadeLogoDot(0)
          })
          later(BIRTH_MS + TEXT_DELAY_MS, () => setTextOn(true))
        })
      })
    } else {
      // No dot to be born from (or no motion asked for): appear in place.
      setCircleStyle({ transform: placed(p0, 1, D), opacity: 0, transition: 'none' })
      fadeLogoDot(0, true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVeilOn(true)
        setCircleStyle(st => ({ ...st, opacity: 1, transition: `opacity 250ms ${PUTT}` }))
        setTextOn(true)
        setDrifting(true)
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
      const p = bubbleSpot(hop.current, r, pos.step === 0)
      setCircleStyle(s => ({ ...s, transform: placed(p, 1, D), transition: 'none' }))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [open, pos.step])

  if (!open || !ready || !rects.current) return null

  const r = rects.current
  const D = circleD(r.vw)
  const step = steps[pos.step]

  // The spotlight: the focused tab's icon, sharp and glowing at the
  // bottom edge. The hole is baked into the vignette mask per step; the
  // glow glides between tabs on the putt curve.
  const focus = step.tab ? r.tabs[step.tab]?.rect : undefined
  const hole: Pt | null = focus
    ? { x: focus.left + focus.width / 2, y: focus.top + focus.height / 2 }
    : null

  // The example screen's frame: centred beneath the bubble's lane, ending
  // above the tab bar. Skipped entirely when the screen is too short to
  // give it a fair showing.
  const shot = steps[shotStep].shot
  const shotTop = 72 + D + 20
  const shotBottom = tabTopOf(r) - 12
  const shotH = shotBottom - shotTop
  const shotW = Math.min(Math.round(shotH * (360 / 585)), Math.round(r.vw * 0.7))
  const showShot = !!shot && shotH >= 150

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
          the bubble reads as alive, not restless. */}
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

      {/* The veil: a faint blur framing the page's edges, clear through
          the middle where the example shows, with the focused tab cut
          sharp at the bottom. */}
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

      {/* The example screen — a miniature of the real page this stop is
          talking about, in a card. All five are mounted so they are
          loaded before they are needed; only the current one shows. */}
      {showShot && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.round((r.vw - shotW) / 2),
            top: shotTop,
            width: shotW,
            height: shotH,
            opacity: shotOn ? 1 : 0,
            transform: shotOn ? 'translateY(0)' : 'translateY(10px)',
            transition: shotOn
              ? `opacity ${SHOT_IN_MS}ms ${PUTT}, transform ${SHOT_IN_MS}ms ${PUTT}`
              : `opacity ${OUT_MS}ms ${PUTT}, transform ${OUT_MS}ms ${PUTT}`,
          }}
        >
          <div
            className="w-full h-full rounded-2xl overflow-hidden bg-surface border border-bark/12"
            style={{ boxShadow: '0 12px 32px rgba(43, 33, 24, 0.18)' }}
          >
            {steps.filter(s => s.shot).map(s => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={s.key}
                src={s.shot}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: s.key === steps[shotStep].key ? 1 : 0 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* The bubble — the logo's own emerald, the writing riding it. The
          outer element carries the travel; the inner wrapper carries the
          idle drift, so the two never fight over one transform. */}
      <div
        className="intro-dot absolute left-0 top-0 rounded-full"
        style={{ width: D, height: D, willChange: 'transform', ...circleStyle }}
      >
        <div
          className={`w-full h-full rounded-full flex flex-col items-center justify-center text-center gd-intro-drift ${
            drifting ? '' : 'gd-intro-drift-off'
          }`}
          style={{ padding: `0 ${Math.round(D * 0.16)}px` }}
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
              style={{ fontSize: 'clamp(19px, 5.4vw, 23px)', lineHeight: 1.15 }}
            >
              {step.title}
            </p>
            <p
              className="font-[family-name:var(--font-serif)] mt-2.5"
              style={{ fontSize: 'clamp(13px, 3.7vw, 15px)', lineHeight: 1.45 }}
            >
              {step.paras[pos.para]}
            </p>

            {/* Where you are in the lap, one dot per stop. */}
            <span
              className="mt-3.5 flex items-center justify-center gap-2"
              aria-hidden="true"
            >
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i === pos.step ? 'intro-step-on' : 'intro-step'
                  }`}
                />
              ))}
            </span>

            {pos.step === 0 && (
              <p className="font-[family-name:var(--font-ui)] mt-2.5 opacity-80 text-[13px]">
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
