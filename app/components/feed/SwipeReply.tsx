'use client'

import { useRef } from 'react'
import { REPLY_AT, REPLY_BACK_MS, REPLY_EDGE, REPLY_SLOP, backFrames, swipeOffset, swipeStarts } from '@/lib/swipeReply'
import { reducedMotion } from '@/lib/motion'
import { IconReply } from '../icons'

/**
 * A message that replies when swiped right (D346): it follows the finger on
 * a rubber band, clicks on past the reply point (the reply arrow filling in
 * emerald, a tick of the phone's vibration where it has one) and springs
 * home when let go — `lib/swipeReply.ts` is the feel. Up and down stay the
 * page's (`touch-action: pan-y`); a touch at the very left edge is left to
 * the browser's back gesture. A swipe never also counts as a tap.
 */
export default function SwipeReply({ onReply, children, className = '' }: {
  onReply?: () => void
  children: React.ReactNode
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLSpanElement>(null)
  const g = useRef<{ id: number; x0: number; y0: number; mode: 'swipe' | null; x: number; armed: boolean } | null>(null)
  const swallow = useRef(false)

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

  if (!onReply) return <div className={className}>{children}</div>
  return (
    <div className={`relative ${className}`}
      onClickCapture={e => { if (swallow.current) { e.preventDefault(); e.stopPropagation(); swallow.current = false } }}>
      <span ref={hint} aria-hidden="true" style={{ opacity: 0 }}
        className="swipe-reply-hint absolute left-1 top-1/2 -mt-4 w-8 h-8 rounded-full flex items-center justify-center pointer-events-none">
        <IconReply size={18} />
      </span>
      <div ref={row} style={{ touchAction: 'pan-y' }}
        onPointerDown={e => {
          if ((e.pointerType === 'mouse' && e.button !== 0) || e.clientX < REPLY_EDGE) return
          if ((e.target as HTMLElement).closest('input, textarea, [data-no-swipe]')) return
          g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: null, x: 0, armed: false }
        }}
        onPointerMove={e => {
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
          const s = g.current
          g.current = null
          if (!s || s.mode !== 'swipe') return
          swallow.current = true
          window.setTimeout(() => { swallow.current = false }, 400)
          home(s)
          if (s.armed) onReply()
        }}
        onPointerCancel={() => {
          const s = g.current
          g.current = null
          if (s?.mode === 'swipe') home(s)
        }}>
        {children}
      </div>
    </div>
  )
}
