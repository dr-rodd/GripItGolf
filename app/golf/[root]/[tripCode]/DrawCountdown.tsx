'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cardClass } from '@/app/components/ui'

/**
 * The countdown to a match play event's draw (Ross, 5 Nov 2026: "the day
 * of the draw should include a go-live time, plugged in as a countdown on
 * the home page") — on the event's home screen and its bracket while a draw
 * set for a date is still to come.
 *
 * At nought it asks the server to make the draw (/api/match/draw-due — the
 * organiser's own plan, once, whoever asks first) and reads the page again,
 * so the bracket appears where the countdown was. A server whose clock is a
 * moment behind, or a draw another phone is making, is asked once more.
 */
export default function DrawCountdown({ tripCode, liveAt, when }: {
  tripCode: string
  /** The moment it goes live, as an instant. */
  liveAt: string
  /** "Sat 14 Nov at 8:00 pm" — said under the figures. */
  when: string
}) {
  const router = useRouter()
  const [now, setNow] = useState<number | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  // Which ask this is — the first at nought, one more if that made nothing.
  const [ask, setAsk] = useState(0)
  const asked = useRef(-1)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  const left = now === null ? null : Date.parse(liveAt) - now
  const due = left !== null && left <= 0

  useEffect(() => {
    if (!due || asked.current >= ask) return
    asked.current = ask
    fetch('/api/match/draw-due', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripCode }),
    })
      .then(r => r.json().catch(() => null))
      .then((out: { made?: boolean } | null) => {
        if (out?.made) { router.refresh(); return }
        // Not made by this ask: another phone may be making it, or the
        // server's clock is a moment behind. Look again shortly, once.
        setTimeout(() => {
          router.refresh()
          if (ask >= 1) setGaveUp(true)
          else setAsk(1)
        }, 5000)
      })
      .catch(() => setGaveUp(true))
  }, [due, ask, tripCode, router])

  const parts = left === null || due ? null : split(left)

  return (
    <div className={`p-4 ${cardClass()}`} role="timer" aria-live="off">
      <p className="t-cap text-ink/65">{due ? 'The draw' : 'The draw goes live in'}</p>
      {parts ? (
        <p className="font-serif t-num text-ink text-2xl mt-0.5 tabular-nums">
          {parts.map(([n, unit]) => (
            <span key={unit} className="mr-2">{n}<span className="text-ink/50 text-base ml-0.5">{unit}</span></span>
          ))}
        </p>
      ) : (
        <p className="text-ink text-sm font-medium mt-0.5">
          {gaveUp ? 'Being made — it will appear here shortly.' : due ? 'Making the draw…' : ' '}
        </p>
      )}
      <p className="t-cap text-ink/80 mt-1">{when}</p>
    </div>
  )
}

/** Days, hours, minutes and seconds left — all four, so the row never reflows. */
function split(ms: number): [string, string][] {
  const s = Math.floor(ms / 1000)
  return [
    [String(Math.floor(s / 86400)), 'd'],
    [String(Math.floor((s % 86400) / 3600)).padStart(2, '0'), 'h'],
    [String(Math.floor((s % 3600) / 60)).padStart(2, '0'), 'm'],
    [String(s % 60).padStart(2, '0'), 's'],
  ]
}
