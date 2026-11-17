'use client'

import { useEffect, useState } from 'react'
import { IconCheck } from './icons'
import { cardClass } from './ui'
import { accountEventTypes } from '@/lib/accountClient'
import { MEMBER_FILTER_TYPES, typeLabel, type ClubEventType } from '@/lib/clubEvents'

/**
 * "From my clubs, show me" (stage c1, M5): a tick for each kind of club
 * event, for the club home and Upcoming — every one on to start with.
 * Competitions always show, so they are said, not offered. Kept on the
 * account (095), so every phone signed in to it agrees. Saved on each tick;
 * drawn only for somebody on a club's list, and only once it can be kept.
 */
export default function ClubEventTypesCard({ className = '' }: { className?: string }) {
  const [hidden, setHidden] = useState<ClubEventType[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    accountEventTypes().then(r => { if (live && r.ok && r.ready) setHidden(r.hidden) })
    return () => { live = false }
  }, [])

  if (!hidden) return null

  async function flip(t: ClubEventType) {
    const next = hidden!.includes(t) ? hidden!.filter(x => x !== t) : [...hidden!, t]
    setBusy(true); setError('')
    const r = await accountEventTypes(next)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setHidden(r.hidden)
  }

  return (
    <div className={`${cardClass()} px-4 py-4 ${className}`}>
      <p className="t-label text-ink">From my clubs, show me</p>
      <p className="t-cap text-ink/65">On your club’s home and Upcoming. Competitions always show.</p>
      <ul className="mt-2">
        {MEMBER_FILTER_TYPES.map(t => {
          const on = !hidden.includes(t)
          return (
            <li key={t}>
              <button type="button" role="checkbox" aria-checked={on} disabled={busy} onClick={() => void flip(t)}
                className="w-full flex items-center gap-3 min-h-11 text-left press">
                <span className="flex-1 text-ink text-[15px]">{typeLabel(t)}</span>
                <span aria-hidden="true" className={`inline-flex items-center justify-center w-6 h-6 rounded-[6px] border ${on ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'}`}>
                  {on && <IconCheck size={16} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
    </div>
  )
}
