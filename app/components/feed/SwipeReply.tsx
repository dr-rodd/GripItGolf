'use client'

import { useRef } from 'react'
import { HOLD_MS, REPLY_AT, REPLY_BACK_MS, REPLY_EDGE, REPLY_SLOP, backFrames, swipeOffset, swipeStarts } from '@/lib/swipeReply'
import { reducedMotion } from '@/lib/motion'
import { IconReply } from '../icons'

/**
 * A message that replies when swiped right (D346): it follows the finger on
 * a rubber band, clicks on past the reply point (the reply arrow filling in
 * emerald, a tick of the phone's vibration where it has one) and springs
 * home when let go — `lib/swipeReply.ts` is the feel. Up and down stay the
 * page's (`touch-action: pan-y`); a touch at the very left edge is left to
 * the browser's back gesture. A swipe never also counts as a tap.
 *
 * **Held still** (`HOLD_MS`, D348) it opens the reactions over itself, as
 * WhatsApp does — a right click or Android's long-press menu too — and the
 * tap that ends a hold is swallowed. Its words are not selectable while it
 * can be held, so the phone's own copy menu never fights the bar (Copy is in it).
 */
export default function SwipeReply({ onReply, onHold, children, className = '' }: {
  onReply?: () => void
  /** Held: the message's own element, for the bar to sit over. */
  onHold?: (el: HTMLElement) => void
  children: React.ReactNode
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLSpanElement>(null)
  const g = useRef<{ id: number; x0: number; y0: number; mode: 'swipe' | null; x: number; armed: boolean } | null>(null)
  const swallow = useRef(false)
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  const held = useRef(0)
  const stopHold = () => { if (hold.current) { window.clearTimeout(hold.current.timer); hold.current = null } }
  const fireHold = () => {
    stopHold()
    if (!onHold || !row.current || Date.now() - held.current < 700) return
    held.current = Date.now()
    swallow.current = true
    window.setTimeout(() => { swallow.current = false }, 700)
    try { navigator.vibrate?.(10) } catch { /* not every phone */ }
    onHold(row.current)
  }

  const draw = (x: number, armed: boolean) => {
    const el = row.current, h = hint.current
    if (el) el.style.transform = x ? `translateX(${x}px)` : ''
    if (h) {
      const p = Math.min(1, x / REPLY_AT)
      h.style.opacity = String(p)
      h.style.transform = `scale(${armed ? 1 : 0.5 + 0.4 * p})`
      h.classList.toggle('is-armed', armed)
    }
  }
  const home = (s: { x: number }) => {
    const el = row.current
    draw(0, false)
    if (!el || !el.animate || reducedMotion() || s.x <= 0) return
    el.animate(backFrames(s.x), { duration: REPLY_BACK_MS, easing: 'linear' })
  }

  if (!onReply && !onHold) return <div className={className}>{children}</div>
  return (
    <div className={`relative ${className}`}
      onClickCapture={e => { if (swallow.current) { e.preventDefault(); e.stopPropagation(); swallow.current = false } }}>
      <span ref={hint} aria-hidden="true" style={{ opacity: 0 }}
        className="swipe-reply-hint absolute left-1 top-1/2 -mt-4 w-8 h-8 rounded-full flex items-center justify-center pointer-events-none">
        <IconReply size={18} />
      </span>
      <div ref={row} style={{ touchAction: 'pan-y', ...(onHold ? { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } : {}) }}
        onContextMenu={onHold ? e => { e.preventDefault(); fireHold() } : undefined}
        onPointerDown={e => {
          if ((e.pointerType === 'mouse' && e.button !== 0)) return
          if ((e.target as HTMLElement).closest('input, textarea, [data-no-swipe]')) return
          if (onHold && e.pointerType !== 'mouse') { stopHold(); hold.current = { timer: window.setTimeout(fireHold, HOLD_MS), x: e.clientX, y: e.clientY } }
          if (!onReply || e.clientX < REPLY_EDGE) return
          g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: null, x: 0, armed: false }
        }}
        onPointerMove={e => {
          // Moving is not holding.
          const h = hold.current
          if (h && (Math.abs(e.clientX - h.x) > REPLY_SLOP || Math.abs(e.clientY - h.y) > REPLY_SLOP)) stopHold()
          const s = g.current
          if (!s || e.pointerId !== s.id) return
          const dx = e.clientX - s.x0, dy = e.clientY - s.y0
          if (!s.mode) {
            const m = swipeStarts(dx, dy)
            if (m === 'scroll') { g.current = null; return }
            if (!m) return
            s.mode = 'swipe'
            row.current?.getAnimations?.().forEach(a => a.cancel())
            try { row.current?.setPointerCapture(e.pointerId) } catch { /* a pointer already gone */ }
          }
          const { x, armed } = swipeOffset(dx - REPLY_SLOP)
          if (armed && !s.armed) { try { navigator.vibrate?.(8) } catch { /* not every phone */ } }
          s.x = x; s.armed = armed
          draw(x, armed)
        }}
        onPointerUp={() => {
          stopHold()
          const s = g.current
          g.current = null
          if (!s || s.mode !== 'swipe') return
          swallow.current = true
          window.setTimeout(() => { swallow.current = false }, 400)
          home(s)
          if (s.armed) onReply?.()
        }}
        onPointerCancel={() => {
          stopHold()
          const s = g.current
          g.current = null
          if (s?.mode === 'swipe') home(s)
        }}>
        {children}
      </div>
    </div>
  )
}
