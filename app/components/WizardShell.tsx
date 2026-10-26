'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import BackButton from './BackButton'
import { TABBAR_SPACE } from './tabbarMetrics'

/**
 * Every create wizard's frame — trip, league, knockout, run challenge and the
 * bracket setup (refresh plan, 4.3). One component, so the five cannot drift:
 * they were the same header copy-pasted five times, and each copy had the
 * back button hanging out of a row too short for it.
 *
 *   · the progress, one segment a step, filling emerald as you go
 *   · a 56px row: the way back on the left (held in place but hidden and
 *     inert on step 1, so the step label never shifts when it arrives),
 *     "Step 2 of 4" in the middle, and an empty cell keeping it centred
 *   · each step opening on its question as a t-h1 — "Name your challenge" —
 *     with at most one line under it
 *   · the step itself, sliding in from the right on Continue and back from
 *     the left on Back (StepSlider)
 *   · the way forward, in a bar stuck to the bottom of the screen. Sticky
 *     rather than fixed, so it rides above the iPhone keyboard instead of
 *     hiding under it.
 */
export default function WizardShell({
  step, titles, intro, onBack, footer, children, aboveTabBar = false,
}: {
  /** 1-based. */
  step: number
  /** One question per step; their count is the progress bar's. */
  titles: readonly string[]
  /** At most one line under the step's question. */
  intro?: React.ReactNode
  onBack: () => void
  /** The Continue bar's contents. Absent where a step pins its own. */
  footer?: React.ReactNode
  children: React.ReactNode
  /**
   * The wizard sits under a trip's tab bar, so the Continue bar sticks
   * just above it rather than at the foot of the screen, behind it.
   */
  aboveTabBar?: boolean
}) {
  const total = titles.length
  const first = step <= 1

  return (
    <>
      <div className="border-b border-line">
        <div className="max-w-lg mx-auto px-4 pt-4 flex gap-1.5" aria-hidden="true">
          {titles.map((t, i) => (
            <div
              key={t}
              className={`h-1 flex-1 rounded-full transition-colors duration-[340ms] ease-putt ${
                i < step ? 'bg-accent' : 'bg-bark/10'
              }`}
            />
          ))}
        </div>
        {/* Three cells: the way back, the step, and an empty one to keep the
            step centred. The arrow's cell keeps its width on step 1 — hidden
            and inert rather than absent — so nothing moves when it arrives.
            16px above the progress and a 56px row: at 12 and 52 the header
            read as cramped on a phone (Ross, 19 Oct). */}
        <div className="max-w-lg mx-auto px-4 grid grid-cols-[48px_1fr_48px] min-h-14 items-center">
          <div
            className={`transition-opacity duration-200 ease-out motion-reduce:transition-none ${first ? 'opacity-0 pointer-events-none' : ''}`}
            inert={first}
            aria-hidden={first}
          >
            <BackButton onClick={onBack} />
          </div>
          <p className="text-center t-label text-ink/65">
            Step {step} of {total}
          </p>
          <div />
        </div>
      </div>

      <StepSlider stepKey={step}>
        <div className="max-w-lg mx-auto px-4 pt-7 pb-8">
          <h1 tabIndex={-1} data-step-title className="t-h1 text-ink text-balance outline-none">
            {titles[step - 1]}
          </h1>
          {intro && <p className="text-[17px] leading-snug text-ink/65 mt-2">{intro}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </StepSlider>

      {footer && (
        <div
          className="hide-with-keyboard sticky z-20 paper border-t border-line"
          style={{ bottom: aboveTabBar ? TABBAR_SPACE : 0 }}
        >
          <div className={`max-w-lg mx-auto px-4 pt-3 ${aboveTabBar ? 'pb-3' : 'pb-[calc(28px+env(safe-area-inset-bottom))]'}`}>
            {footer}
          </div>
        </div>
      )}
    </>
  )
}

/** How long a step takes to slide — the plan's 340ms, the same figure the CSS carries. */
export const STEP_SLIDE_MS = 340

/**
 * One step sliding out as the next slides in. No library: the outgoing step
 * is the last render's children, kept mounted for the length of the slide
 * and no longer, inert while it goes so nothing in it can take a tap or the
 * focus. Forward, the old step drifts a third of the way left and fades
 * while the new one comes in from the right; back is the mirror. When the
 * slide ends the new step's question takes the focus, so a screen reader
 * hears where it has arrived. Reduce Motion swaps the movement for a short
 * crossfade — the classes in globals.css carry both.
 */
function StepSlider({ stepKey, children }: { stepKey: number; children: React.ReactNode }) {
  // The last render's step, so the one leaving can be drawn as it was.
  const last = useRef<{ key: number; node: React.ReactNode }>({ key: stepKey, node: children })
  const [leaving, setLeaving] = useState<{ key: number; node: React.ReactNode; dir: 'forward' | 'back' } | null>(null)
  // The incoming step alone: the one leaving holds a question too, inert,
  // and is earlier in the document, so a search of the whole box finds it
  // first and the focus goes nowhere.
  const incoming = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Before paint, so there is never a frame with the new step standing
  // still where it is about to slide in from.
  useLayoutEffect(() => {
    const was = last.current
    last.current = { key: stepKey, node: children }
    if (was.key === stepKey) return
    setLeaving({ ...was, dir: stepKey > was.key ? 'forward' : 'back' })
    // A step is read from its top. Instant, not smooth: the slide is the
    // movement, and two at once would be one too many.
    window.scrollTo({ top: 0 })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setLeaving(null)
      incoming.current?.querySelector<HTMLElement>('[data-step-title]')?.focus({ preventScroll: true })
    }, STEP_SLIDE_MS)
  })

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const forward = leaving?.dir !== 'back'
  return (
    <div className="relative overflow-x-clip">
      {leaving && (
        <div
          key={`out-${leaving.key}`}
          inert
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 ${forward ? 'step-out-forward' : 'step-out-back'}`}
        >
          {leaving.node}
        </div>
      )}
      <div key={`in-${stepKey}`} ref={incoming} className={leaving ? (forward ? 'step-in-forward' : 'step-in-back') : ''}>
        {children}
      </div>
    </div>
  )
}
