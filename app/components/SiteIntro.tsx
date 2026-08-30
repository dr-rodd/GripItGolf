'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberIntroSeen } from '@/lib/intro'

/**
 * The site intro — the solid sweep.
 *
 * A first-time visitor lands on the trip hub. After a beat, the emerald
 * dot in the wordmark blooms — one continuous swell on the putt curve —
 * into a huge solid disc of the logo's own emerald, its curved edge
 * sweeping up across the lower half of the screen like a tile. The
 * writing rides the solid green, left-aligned and stationary: a title
 * and one thought at a time, a tap (or a swipe) for each paragraph.
 * Above the sweep, the page being described floats as a small framed
 * card — a miniature of the app screen (hand-drawn SVGs in
 * public/intro, each with its own tab bar and the described tab lit) —
 * and the specific feature each thought talks about is ringed in
 * emerald ON the card. Cards slide sideways between pages, the way a
 * walkthrough swipes; a swipe back goes back. Behind everything sits a
 * solid cream sheet — no blur, no see-through: the card is openly an
 * illustration, which is what keeps it legible. On finishing — or
 * skipping — the disc shrinks back into the logo.
 *
 * ── How things are found ────────────────────────────────────────
 *
 * Only one real element is measured: the logo dot, the `<g
 * fill="#0a9d56">` inside `.gd-mark` — queried fresh on every touch
 * because React re-applies the wordmark's innerHTML once after
 * hydration, replacing the styled node (see fadeLogoDot). If the dot
 * can't be found the disc fades in and out instead of being born.
 * Everything else — the card, the sweep, the ring — is our own
 * geometry, computed from the live viewport each render, so Safari's
 * shifting chrome can never strand anything. Skip and tap-to-advance
 * depend on no measurement at all — the intro must never trap anyone
 * behind a broken overlay.
 *
 * ── The putt curve ──────────────────────────────────────────────
 *
 * Every travel and slide runs on one strong ease-out — quick off the
 * face, long confident deceleration. The durations sit above the 400ms
 * ceiling the design system holds UI motion to — a deliberate,
 * documented exception scoped to this component, noted under Motion in
 * docs/design-system.md. They live here rather than in globals.css so
 * the stylesheet's own ceiling (which test:branding enforces) stays
 * intact; the card keyframes live in the component's own <style> tag
 * for the same reason.
 *
 * Everything animated is transform or opacity — nothing that triggers
 * layout. Under prefers-reduced-motion the choreography collapses: no
 * birth, no slide — each thought simply appears in place.
 */

/** The signature curve. Fast off the face, long deceleration into the hole. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** The beat before anything moves — a page that starts performing the
    instant it appears reads as an ad, not a welcome. */
const BIRTH_DELAY_MS = 600
/** One continuous bloom, logo dot to resting sweep. A single transition
    on a single curve — a staged swell was tried and read as a stutter. */
const BIRTH_MS = 900
const EXIT_MS = 500 // back into the logo
const TEXT_DELAY_MS = 180 // the sweep lands, then speaks
const TEXT_IN_MS = 220
const OUT_MS = 120 // the words fading between thoughts
const SLIDE_MS = 420 // one card sliding out as the next slides in
const CARD_MS = 300 // the card arriving for the first page, leaving at the end
const RING_DELAY_MS = 380 // the feature ring waits out the slide...
const RING_IN_MS = 250 // ...then arrives
const DOT_FADE_MS = 200 // the real logo dot leaving and coming home
const VEIL_MS = 500 // the cream sheet arriving and leaving

/** The artboard the example cards are drawn on — content plus their own
    tab bar. scripts/make-intro-shots.mjs is the other holder of these. */
const ART_W = 360
const ART_H = 728

/** A region of the artboard — the feature a thought points at. */
type Region = { x: number; y: number; w: number; h: number }

type Step = {
  key: string
  title: string
  /** The example card behind each paragraph — public/intro SVGs, one
      entry per para (the last entry carries any overflow). */
  shots?: string[]
  /** The feature each paragraph rings on the card, in artboard
      coordinates — null for a thought that describes the whole page. */
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

/** The example card a given thought shows, or null for none. */
function shotFor(step: Step, para: number): string | null {
  if (!step.shots?.length) return null
  return step.shots[Math.min(para, step.shots.length - 1)]
}

/** The feature a given thought rings, or null. */
function focusFor(step: Step, para: number): Region | null {
  return step.focus?.[para] ?? null
}

type Rects = {
  vw: number
  vh: number
  /** Where the wordmark's emerald dot sits, or null if it can't be found. */
  dot: DOMRect | null
}

function measure(): Rects {
  const dotEl = document.querySelector('.gd-mark [fill="#0a9d56"]')
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    dot: dotEl?.getBoundingClientRect() ?? null,
  }
}

/**
 * The real dot in the wordmark, leaving as the big one departs and coming
 * home as it lands. Styled on the <g>, which React's own props never touch
 * — but queried FRESH on every call rather than cached from the mount
 * measurement, because React re-applies the wordmark's
 * dangerouslySetInnerHTML once on its first update after hydration, which
 * replaces the <g> we styled with an unstyled twin. A cached reference dies
 * with the old node; a fresh query finds whichever one is real. The birth's
 * settle re-asserts the hide for the same reason. Pure DOM, no component
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

/**
 * The typography — Big Dog's pick from the five candidates that were
 * tried on-device: Clash Display titles over Bespoke Serif body, the
 * site's display voice over its reading voice.
 */
const TITLE_FONT = 'var(--font-display)'
const BODY_FONT = 'var(--font-serif)'

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi)

/** The transform that puts an element of size D with its centre at p. */
function placed(p: { x: number; y: number }, s: number, D: number) {
  return `translate3d(${(p.x - D / 2).toFixed(1)}px, ${(p.y - D / 2).toFixed(1)}px, 0) scale(${s.toFixed(5)})`
}

/**
 * The whole composition, from the live viewport — nothing about the
 * screen is assumed, which is what the full-bleed version got wrong
 * about Safari's chrome.
 *
 * Three bands, top to bottom: the floating card, the sweep's curved
 * edge rising left-to-right beneath the card's lower quarter, and the
 * writing on the solid emerald below the edge. The disc is a real
 * circle big enough that its visible arc reads as a gentle sweep — the
 * radius is solved from the drop wanted at the screen's left edge, so
 * wide screens get a huge flat circle rather than a steep one.
 */
function layoutOf(vw: number, vh: number) {
  const drop = Math.min(70, Math.round(Math.min(vw, 520) * 0.17))
  const reserve = clamp(Math.round(vh * 0.28), 170, 235)
  const edgeY = vh - reserve - drop - 18
  const SAFE_TOP = 68
  let cardH = Math.min((edgeY - SAFE_TOP) / 0.84, Math.round(vh * 0.66))
  let cardW = cardH * (ART_W / ART_H)
  const maxW = Math.min(vw * 0.72, 300)
  if (cardW > maxW) {
    cardW = maxW
    cardH = cardW * (ART_H / ART_W)
  }
  cardW = Math.round(cardW)
  cardH = Math.round(cardH)
  const cx = vw / 2 + clamp(vw * 0.18, 40, 80)
  const R = Math.round((cx * cx + drop * drop) / (2 * drop))
  return {
    card: {
      x: Math.round((vw - cardW) / 2),
      y: SAFE_TOP,
      w: cardW,
      h: cardH,
      k: cardW / ART_W,
    },
    disc: { c: { x: cx, y: edgeY + R }, R },
    textTop: edgeY + drop + 16,
  }
}

/** The card slide and ring keyframes — in the component, not globals.css,
    for the same reason as the durations (see the note up top). */
const KEYFRAMES =
  `@keyframes gd-card-in-r { from { transform: translate3d(108%, 0, 0); } }` +
  `@keyframes gd-card-in-l { from { transform: translate3d(-108%, 0, 0); } }` +
  `@keyframes gd-card-out-l { to { transform: translate3d(-108%, 0, 0); } }` +
  `@keyframes gd-card-out-r { to { transform: translate3d(108%, 0, 0); } }` +
  `@keyframes gd-ring-in { from { opacity: 0; transform: scale(1.04); } }`

type Phase = 'birth' | 'run' | 'exit' | 'done'

/** The card currently up, the one sliding out, and which way. `n` bumps
    on every change so a page revisited still re-runs its entrance. */
type Slide = { cur: string | null; prev: string | null; dir: 1 | -1; n: number }

export default function SiteIntro({ tripName }: { tripName: string }) {
  const steps = makeSteps(tripName)

  const [open, setOpen] = useState(true)
  // Nothing renders until the screen has been measured — the whole point
  // is that the sweep is born out of the real logo dot, and that needs
  // the browser. Server-side this returns null and costs the page nothing.
  const [ready, setReady] = useState(false)
  const [pos, setPos] = useState({ step: 0, para: 0 })
  const [veilOn, setVeilOn] = useState(false)
  const [discStyle, setDiscStyle] = useState<React.CSSProperties>({})
  const [textOn, setTextOn] = useState(false)
  const [slide, setSlide] = useState<Slide>({ cur: null, prev: null, dir: 1, n: 0 })
  const [leaving, setLeaving] = useState(false)

  const rects = useRef<Rects | null>(null)
  const phase = useRef<Phase>('birth')
  const timers = useRef<number[]>([])
  const rm = useRef(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }

  /** The shrink back into the logo — reverse of the birth. */
  const exitTravel = useCallback(() => {
    const r = rects.current
    phase.current = 'exit'
    setTextOn(false)
    setLeaving(true)
    setVeilOn(false)
    if (r?.dot) {
      const L = layoutOf(r.vw, r.vh)
      const D = L.disc.R * 2
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.002)
      setDiscStyle({
        transform: placed(c, s, D),
        transition: `transform ${EXIT_MS}ms ${PUTT}`,
      })
      later(Math.max(0, EXIT_MS - DOT_FADE_MS), () => fadeLogoDot(1))
    } else {
      setDiscStyle(st => ({ ...st, opacity: 0, transition: `opacity 250ms ${PUTT}` }))
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

  /** Move to a thought — the next or the previous, cards sliding the
      matching way. */
  const go = useCallback(
    (next: { step: number; para: number }, dir: 1 | -1) => {
      if (phase.current !== 'run') return
      clearTimers()
      const nextShot = shotFor(steps[next.step], next.para)
      setTextOn(false)
      later(rm.current ? 0 : OUT_MS, () => {
        setPos(next)
        setTextOn(true)
      })
      setSlide(s => {
        if (nextShot === s.cur) return s
        return { cur: nextShot, prev: rm.current ? null : s.cur, dir, n: s.n + 1 }
      })
      later(rm.current ? 0 : SLIDE_MS + 80, () =>
        setSlide(s => (s.prev ? { ...s, prev: null } : s)),
      )
      // steps is rebuilt per render but its content is constant per tripName.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

  /** A tap, or a swipe left: the next thought — or the farewell. */
  const advance = useCallback(() => {
    if (phase.current !== 'run') return
    const step = steps[pos.step]
    const next =
      pos.para + 1 < step.paras.length
        ? { step: pos.step, para: pos.para + 1 }
        : pos.step + 1 < steps.length
          ? { step: pos.step + 1, para: 0 }
          : null
    if (!next) finish()
    else go(next, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, finish, go])

  /** A swipe right: the previous thought. At the start, nothing. */
  const back = useCallback(() => {
    if (phase.current !== 'run') return
    const prev =
      pos.para > 0
        ? { step: pos.step, para: pos.para - 1 }
        : pos.step > 0
          ? { step: pos.step - 1, para: steps[pos.step - 1].paras.length - 1 }
          : null
    if (prev) go(prev, -1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, go])

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
    const L = layoutOf(r.vw, r.vh)
    const D = L.disc.R * 2

    if (r.dot && !rm.current) {
      const c = { x: r.dot.left + r.dot.width / 2, y: r.dot.top + r.dot.height / 2 }
      const s = Math.max(r.dot.width / D, 0.002)
      setDiscStyle({ transform: placed(c, s, D), transition: 'none' })
      // A beat of stillness first — the page arrives, then the dot goes.
      later(BIRTH_DELAY_MS, () => {
        fadeLogoDot(0)
        setVeilOn(true)
        setDiscStyle({
          transform: placed(L.disc.c, 1, D),
          transition: `transform ${BIRTH_MS}ms ${PUTT}`,
        })
        later(BIRTH_MS, () => {
          phase.current = 'run'
          // React's first post-hydration update replaces the wordmark's
          // innerHTML, undoing the hide — re-assert it.
          fadeLogoDot(0)
        })
        later(BIRTH_MS + TEXT_DELAY_MS, () => setTextOn(true))
      })
    } else {
      // No dot to be born from (or no motion asked for): appear in place.
      setDiscStyle({ transform: placed(L.disc.c, 1, D), opacity: 0, transition: 'none' })
      fadeLogoDot(0, true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVeilOn(true)
        setDiscStyle(st => ({ ...st, opacity: 1, transition: `opacity 250ms ${PUTT}` }))
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

  // ── Escape skips; the arrow keys walk ──
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') advance()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish, advance, back])

  // ── The screen changed shape: re-measure, re-place without motion ──
  useEffect(() => {
    if (!open) return
    const onResize = () => {
      try {
        rects.current = measure()
      } catch { return }
      const r = rects.current
      if (!r || phase.current !== 'run') return
      const L = layoutOf(r.vw, r.vh)
      setDiscStyle({ transform: placed(L.disc.c, 1, L.disc.R * 2), transition: 'none' })
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
  const L = layoutOf(r.vw, r.vh)
  const D = L.disc.R * 2
  const step = steps[pos.step]
  const reg = focusFor(step, pos.para)
  // No ring while the words are a beat ahead of the card (the text swaps
  // OUT_MS before pos moves the slide on) — a region belongs to a page,
  // never to whichever page happens to be up.
  const showRing = !!reg && slide.cur === shotFor(step, pos.para)
  const k = L.card.k
  const cardOn = !!slide.cur && !leaving
  const inAnim = slide.dir === 1 ? 'gd-card-in-r' : 'gd-card-in-l'
  const outAnim = slide.dir === 1 ? 'gd-card-out-l' : 'gd-card-out-r'

  const allShots = [...new Set(steps.flatMap(s => s.shots ?? []))]

  return (
    <div
      className="fixed inset-0 z-50 cursor-pointer overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Green Dot Golf"
      onClick={() => {
        // A swipe's synthetic click is the swipe again, not a tap.
        if (swiped.current) { swiped.current = false; return }
        advance()
      }}
      onTouchStart={e => {
        const t = e.touches[0]
        touch.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={e => {
        const s = touch.current
        touch.current = null
        if (!s) return
        const t = e.changedTouches[0]
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          swiped.current = true
          // A plain timeout, NOT later(): go() clears the tracked timers,
          // and a cleared reset leaves the flag up to eat the next tap.
          window.setTimeout(() => { swiped.current = false }, 400)
          if (dx < 0) advance()
          else back()
        }
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* The sheet — solid cream, no blur: the stage the card floats on. */}
      <div
        className="intro-veil absolute inset-0"
        style={{
          opacity: veilOn ? 0.97 : 0,
          transition: `opacity ${VEIL_MS}ms ${PUTT}`,
        }}
      />

      {/* Every card is fetched before it is needed. */}
      <div aria-hidden="true" className="absolute w-0 h-0 overflow-hidden">
        {allShots.map(src => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" />
        ))}
      </div>

      {/* The sweep — one huge solid disc of the logo's emerald, its arc
          rising left-to-right across the lower screen. Born from the
          wordmark's dot; the writing rides it further down. */}
      <div
        className="intro-dot absolute left-0 top-0 rounded-full"
        style={{ width: D, height: D, willChange: 'transform', ...discStyle }}
      />

      {/* The floating card — the page this thought describes, openly a
          miniature, its own tab bar lit on the tab in question. Pages
          slide sideways through the frame. */}
      <div
        className="intro-card absolute overflow-hidden pointer-events-none"
        style={{
          left: L.card.x,
          top: L.card.y,
          width: L.card.w,
          height: L.card.h,
          borderRadius: Math.max(12, Math.round(18 * k)),
          opacity: cardOn ? 1 : 0,
          transform: cardOn ? 'none' : 'translateY(10px) scale(0.98)',
          transition: `opacity ${CARD_MS}ms ${PUTT}, transform ${CARD_MS}ms ${PUTT}`,
        }}
      >
        {([
          { src: slide.prev, out: true },
          { src: slide.cur, out: false },
        ] as const).map(p =>
          p.src ? (
            <div
              key={(p.out ? 'out' : 'cur') + slide.n}
              className="absolute inset-0"
              style={{
                animation:
                  rm.current || (!p.out && !slide.prev)
                    ? undefined
                    : `${p.out ? outAnim : inAnim} ${SLIDE_MS}ms ${PUTT} both`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full"
              />
              {/* The feature this thought is talking about, ringed on the
                  card itself — plain artboard coordinates, scaled. */}
              {!p.out && showRing && reg && (
                <div
                  key={`${pos.step}-${pos.para}`}
                  className="intro-focus absolute"
                  style={{
                    left: Math.round(reg.x * k),
                    top: Math.round(reg.y * k),
                    width: Math.round(reg.w * k),
                    height: Math.round(reg.h * k),
                    borderRadius: Math.max(8, Math.round(14 * k)),
                    animation: `gd-ring-in ${RING_IN_MS}ms ${PUTT} ${rm.current ? 0 : RING_DELAY_MS}ms both`,
                  }}
                />
              )}
            </div>
          ) : null,
        )}
      </div>

      {/* The writing — on the solid green, left-aligned, stationary. */}
      <div
        className="absolute"
        style={{
          left: 26,
          right: 26,
          top: L.textTop,
          color: '#F6F4F0',
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
            fontSize: 'clamp(25px, 7vw, 31px)',
            lineHeight: 1.12,
          }}
        >
          {step.title}
        </p>
        <p
          className="mt-2"
          style={{
            fontFamily: BODY_FONT,
            fontSize: 'clamp(17px, 4.9vw, 20px)',
            lineHeight: 1.38,
          }}
        >
          {step.paras[pos.para]}
        </p>
        {pos.step === 0 && (
          <p
            className="mt-3 opacity-80"
            style={{ fontFamily: BODY_FONT, fontSize: 15 }}
          >
            Tap or swipe to look around
          </p>
        )}
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
