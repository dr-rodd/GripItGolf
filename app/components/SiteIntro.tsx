'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberIntroSeen } from '@/lib/intro'

/**
 * The site intro — the travelling dot.
 *
 * A first-time visitor lands on the trip hub. The page softens behind a
 * gentle blur, the emerald dot in the wordmark swells out of the logo into
 * a large green circle, and a stationary block of writing walks the
 * newcomer round the app one thought at a time — a tap for each paragraph.
 * The tab being talked about is the one part of the page left sharp: a
 * feathered clear hole in the blur, warmed by a soft emerald glow. The
 * circle itself carries no words; it criss-crosses the screen below the
 * writing, side to side on every tap, the brand keeping the reader
 * company. On finishing — or skipping — it shrinks back into the logo.
 *
 * ── How things are found ────────────────────────────────────────
 *
 * Nothing is hardcoded to a coordinate. The tab icons carry
 * `data-intro-tab` (TabBar.tsx) and are measured with
 * getBoundingClientRect at runtime, re-measured on resize and orientation
 * change. The logo dot is the `<g fill="#0a9d56">` inside `.gd-mark` —
 * MorphWordmark renders each word as inline SVG, so the dot is a real
 * element with a real rect. If the dot can't be found the circle fades in
 * and out instead of being born; if a tab can't be found that step simply
 * has no spotlight. Skip and tap-to-advance depend on no measurement at
 * all — the intro must never trap anyone behind a broken overlay.
 *
 * ── The spotlight ───────────────────────────────────────────────
 *
 * One full-screen veil with a backdrop blur, masked by a feathered hole
 * that glides from tab to tab on the putt curve (mask-position is
 * animatable). The mask is an SVG alpha feather carried as a data URI —
 * SVG rather than a CSS gradient function on purpose: the brand's
 * no-gradients rule is about colour decoration, and keeping the feather
 * out of CSS syntax keeps that rule mechanically enforceable exactly as
 * it is. The hole parks below the screen on steps with no tab.
 *
 * ── The putt curve ──────────────────────────────────────────────
 *
 * Every travel and scale runs on one strong ease-out — quick off the face,
 * long confident deceleration. The durations sit above the 400ms ceiling
 * the design system holds UI motion to, and arrivals carry a 2% overshoot
 * where the guide says no bounce. Both are a deliberate, documented
 * exception scoped to this component — the same standing the landing
 * page's collapse has — noted under Motion in docs/design-system.md. The
 * durations live here rather than in globals.css, so the stylesheet's own
 * ceiling (which test:branding enforces) stays intact.
 *
 * Everything animated is transform, opacity, or the veil's mask position —
 * nothing that triggers layout. Under prefers-reduced-motion the
 * choreography collapses: no birth, no travel, no drift, no overshoot —
 * each thought simply appears in place, spotlight already on its tab.
 */

/** The signature curve. Fast off the face, long deceleration into the hole. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

const BIRTH_MS = 550   // logo dot → first resting spot, growing all the way
const TRAVEL_MS = 480  // the circle's criss-cross, and the spotlight's glide
const EXIT_MS = 500    // back into the logo
const SETTLE_MS = 220  // the 2% overshoot easing back
const OVERSHOOT = 1.02
const TEXT_DELAY_MS = 180 // the circle lands, then the writing speaks
const TEXT_IN_MS = 220
const OUT_MS = 120     // the writing fading between thoughts
const PULSE_MS = 300   // the focused icon's single soft acknowledgement
const DOT_FADE_MS = 200 // the real logo dot leaving and coming home
const VEIL_MS = 400    // the blur arriving and leaving

type TabKey = 'home' | 'scoring' | 'leaderboard' | 'stats' | 'settings'

type Step = {
  key: string
  title: string
  /** Which tab the spotlight rests on. The welcome has none. */
  tab?: TabKey
  /** One thought per tap — never the whole spiel at once. */
  paras: string[]
}

/** Steps follow the tab bar left to right; the criss-cross supplies the
    side-to-side, so the tour still reads as one steady lap. */
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

/** A wordless circle now, so it travels lighter than it used to. */
const circleD = (vw: number) => Math.min(Math.round(vw * 0.62), 260)

/** The transform that puts the circle's centre at p, at scale s. */
function placed(p: Pt, s: number, D: number) {
  return `translate3d(${(p.x - D / 2).toFixed(1)}px, ${(p.y - D / 2).toFixed(1)}px, 0) scale(${s.toFixed(4)})`
}

/**
 * Where the circle rests after hop number `h`: alternate sides of the
 * screen — the criss-cross — hanging well off the edge, at a height that
 * wanders the lane between the writing and the tab bar without covering
 * either.
 */
function crissCross(h: number, r: Rects, textBottom: number): Pt {
  const D = circleD(r.vw)
  const side = h % 2 === 0 ? 1 : -1
  const x = side === 1 ? r.vw - D * 0.3 : D * 0.3
  const tabTop = Math.min(
    ...TAB_KEYS.map(k => r.tabs[k]?.rect.top ?? Infinity),
    r.vh - 88,
  )
  const lo = textBottom + D / 2 + 12
  const hi = tabTop - D / 2 - 10
  const fr = [0.72, 0.18, 0.95, 0.45, 0.05, 0.62][h % 6]
  const y = hi <= lo ? (lo + hi) / 2 : lo + (hi - lo) * fr
  return { x, y }
}

/**
 * The spotlight's feathered hole, as an SVG alpha mask in a data URI. The
 * clear centre is 40px of a 2000px radius (offset 0.02), feathering to
 * fully veiled at 80px — sharp icon and label, soft shoulder. SVG rather
 * than a CSS gradient function, deliberately: the brand's no-gradients
 * rule is about colour decoration and is enforced by grepping for the CSS
 * syntax; an alpha feather is not decoration, and carrying it as SVG keeps
 * the rule's teeth exactly where they are.
 */
const MASK_HALF = 2000
const MASK_URL = (() => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='4000' height='4000'>` +
    `<defs><radialGradient id='h' gradientUnits='userSpaceOnUse' cx='2000' cy='2000' r='2000'>` +
    `<stop offset='0' stop-color='#000' stop-opacity='0'/>` +
    `<stop offset='0.02' stop-color='#000' stop-opacity='0'/>` +
    `<stop offset='0.04' stop-color='#000' stop-opacity='1'/>` +
    `<stop offset='1' stop-color='#000' stop-opacity='1'/>` +
    `</radialGradient></defs>` +
    `<rect width='4000' height='4000' fill='url(#h)'/>` +
    `</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
})()

type Phase = 'birth' | 'run' | 'exit' | 'done'

export default function SiteIntro({ tripName }: { tripName: string }) {
  const steps = makeSteps(tripName)

  const [open, setOpen] = useState(true)
  // Nothing renders until the screen has been measured — the whole point
  // is that the circle is born out of the real logo dot, and that needs
  // the browser. Server-side this returns null and costs the page nothing.
  const [ready, setReady] = useState(false)
  const [pos, setPos] = useState({ step: 0, para: 0 })
  const [veilOn, setVeilOn] = useState(false)
  const [circleStyle, setCircleStyle] = useState<React.CSSProperties>({})
  const [textOn, setTextOn] = useState(false)
  const [drifting, setDrifting] = useState(false)

  const rects = useRef<Rects | null>(null)
  const phase = useRef<Phase>('birth')
  const hop = useRef(0)
  const timers = useRef<number[]>([])
  const rm = useRef(false)
  const textRef = useRef<HTMLDivElement | null>(null)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }

  const textBottom = () =>
    textRef.current?.getBoundingClientRect().bottom ??
    (rects.current ? rects.current.vh * 0.42 : 360)

  /** One criss-cross: out on the putt curve, 2% over, settle. */
  const moveCircle = useCallback((h: number) => {
    const r = rects.current
    if (!r) return
    const D = circleD(r.vw)
    const p = crissCross(h, r, textBottom())
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
      circle criss-crosses on every one of them. */
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
    moveCircle(hop.current)
    if (next.step !== cur.step) {
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
    const p0 = crissCross(0, r, r.vh * 0.42)

    if (r.dot && !rm.current) {
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.015)
      setCircleStyle({ transform: placed(c, s, D), transition: 'none' })
      fadeLogoDot(0)
      requestAnimationFrame(() => requestAnimationFrame(() => {
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
        })
        later(BIRTH_MS + TEXT_DELAY_MS, () => setTextOn(true))
      }))
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
      const p = crissCross(hop.current, r, textBottom())
      setCircleStyle(s => ({ ...s, transform: placed(p, 1, D), transition: 'none' }))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [open])

  if (!open || !ready || !rects.current) return null

  const r = rects.current
  const D = circleD(r.vw)
  const step = steps[pos.step]

  // Where the spotlight rests: the focused tab's icon, or parked well
  // below the screen when no tab is being talked about — mask-position is
  // animatable, so the hole glides between the two on the putt curve.
  const focus = step.tab ? r.tabs[step.tab]?.rect : undefined
  const hole: Pt = focus
    ? { x: focus.left + focus.width / 2, y: focus.top + focus.height / 2 }
    : { x: r.vw / 2, y: r.vh + 400 }
  const maskPosition = `${(hole.x - MASK_HALF).toFixed(0)}px ${(hole.y - MASK_HALF).toFixed(0)}px`

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

      {/* The veil: the page softened behind a gentle blur, with a feathered
          clear hole over the tab being talked about — the one part of the
          screen left sharp. It fades in with the birth, and the hole
          glides from tab to tab on the putt curve. */}
      <div
        className="intro-veil absolute inset-0"
        style={{
          opacity: veilOn ? 1 : 0,
          WebkitMaskImage: MASK_URL,
          maskImage: MASK_URL,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: `${MASK_HALF * 2}px ${MASK_HALF * 2}px`,
          maskSize: `${MASK_HALF * 2}px ${MASK_HALF * 2}px`,
          WebkitMaskPosition: maskPosition,
          maskPosition,
          transition:
            `opacity ${VEIL_MS}ms ${PUTT}, ` +
            `mask-position ${TRAVEL_MS}ms ${PUTT}, ` +
            `-webkit-mask-position ${TRAVEL_MS}ms ${PUTT}`,
        }}
      />

      {/* The soft emerald glow warming the focused icon. It rides the same
          curve as the hole, and simply dims when no tab is the subject. */}
      <div
        className="intro-glow absolute left-0 top-0 rounded-full pointer-events-none"
        style={{
          width: 46,
          height: 46,
          transform: `translate3d(${(hole.x - 23).toFixed(0)}px, ${(hole.y - 23).toFixed(0)}px, 0)`,
          opacity: focus && veilOn ? 1 : 0,
          transition:
            `transform ${TRAVEL_MS}ms ${PUTT}, opacity 250ms ${PUTT}`,
        }}
      />

      {/* The circle — wordless now, the brand keeping the reader company.
          The outer element carries the criss-cross; the inner wrapper
          carries the idle drift, so the two never fight over one
          transform. */}
      <div
        className="intro-dot absolute left-0 top-0 rounded-full"
        style={{ width: D, height: D, willChange: 'transform', ...circleStyle }}
      >
        <div
          className={`w-full h-full rounded-full gd-intro-drift ${
            drifting ? '' : 'gd-intro-drift-off'
          }`}
        />
      </div>

      {/* The writing, stationary while everything else moves. One thought
          at a time; a tap brings the next. */}
      <div
        ref={textRef}
        className="absolute inset-x-0 text-center px-8"
        style={{ top: 'calc(env(safe-area-inset-top) + 92px)' }}
      >
        <div
          className="mx-auto max-w-[340px]"
          style={{
            opacity: textOn ? 1 : 0,
            transform: textOn ? 'translateY(0)' : 'translateY(8px)',
            transition: textOn
              ? `opacity ${TEXT_IN_MS}ms ${PUTT}, transform ${TEXT_IN_MS}ms ${PUTT}`
              : `opacity ${OUT_MS}ms ${PUTT}, transform ${OUT_MS}ms ${PUTT}`,
          }}
        >
          <p
            className="font-[family-name:var(--font-display)] font-semibold text-ink text-balance"
            style={{ fontSize: 'clamp(27px, 7.6vw, 33px)', lineHeight: 1.15 }}
          >
            {step.title}
            {step.tab && <span className="t-title-dot" aria-hidden="true" />}
          </p>
          <p
            className="font-[family-name:var(--font-serif)] text-ink/80 mt-3"
            style={{ fontSize: 17, lineHeight: 1.55 }}
          >
            {step.paras[pos.para]}
          </p>

          {/* Where you are in the lap, one dot per stop. */}
          <span
            className="mt-5 flex items-center justify-center gap-2"
            aria-hidden="true"
          >
            {steps.map((s, i) => (
              <span
                key={s.key}
                className={`w-1.5 h-1.5 rounded-full ${
                  i === pos.step ? 'bg-accent' : 'bg-bark/25'
                }`}
              />
            ))}
          </span>

          {pos.step === 0 && (
            <p className="font-[family-name:var(--font-ui)] text-ink/60 mt-3 text-[13px]">
              Tap anywhere to look around
            </p>
          )}
        </div>
      </div>

      {/* Always on offer, from the first frame, dependent on nothing. */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); finish() }}
        className="press absolute right-4 z-10 t-label uppercase tracking-[0.18em] text-ink/70 hover:text-ink px-3 py-2"
        style={{
          top: 'calc(env(safe-area-inset-top) + 12px)',
          opacity: veilOn ? 1 : 0,
          transition: `opacity ${VEIL_MS}ms ${PUTT}`,
        }}
      >
        Skip intro
      </button>
    </div>
  )
}
