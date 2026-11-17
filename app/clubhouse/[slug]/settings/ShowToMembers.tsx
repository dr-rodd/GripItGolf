'use client'

import { useState } from 'react'
import { IconCheck } from '@/app/components/icons'
import { askClub } from '@/lib/accountClient'
import { GOLF_TYPES, OFFICE_TYPES, typeLabel, type ClubEventType } from '@/lib/clubEvents'
import { useSeason } from '../useSeason'

/**
 * "Show to members" (stage c1, M4): per type of the club's own events,
 * whether the members app shows it — on by default. Competitions, Golf and
 * Course are always shown (Ross, 17 Nov 2026: anything that touches the
 * golf is the members'), so they are said, not offered. Saved on each tick.
 */
export default function ShowToMembers({ clubId }: { clubId: string }) {
  const { hiddenTypes, notesReady, events } = useSeason(clubId)
  const [hidden, setHidden] = useState<ClubEventType[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = hidden ?? hiddenTypes

  async function flip(t: ClubEventType) {
    const next = now.includes(t) ? now.filter(x => x !== t) : [...now, t]
    setBusy(true); setError('')
    const r = await askClub('event-types', { clubId, hidden: next })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setHidden(r.hiddenTypes ?? next)
  }

  return (
    <section>
      <h2 className="t-h2 text-ink">Show to members</h2>
      <p className="t-cap text-ink/65 mt-1">Which of the club’s events the members app shows. An Office only event never shows there.</p>
      {!events ? <div className="skeleton h-40 rounded-tile mt-4" /> : !notesReady ? (
        <p className="text-ink/80 text-[15px] mt-4">The club’s calendar isn’t set up yet — try again later.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {GOLF_TYPES.map(t => (
            <li key={t} className="flex items-center gap-3 min-h-12">
              <span className="flex-1 text-ink text-[15px]">{t === 'COMP' ? 'Competitions' : typeLabel(t)}</span>
              <span className="t-cap text-ink/65">Always shown</span>
            </li>
          ))}
          {OFFICE_TYPES.map(t => {
            const on = !now.includes(t)
            return (
              <li key={t}>
                <button type="button" role="checkbox" aria-checked={on} disabled={busy} onClick={() => void flip(t)}
                  className="ch-hover ch-focus w-full flex items-center gap-3 min-h-12 text-left rounded-tile -mx-2 px-2">
                  <span className="flex-1 text-ink text-[15px]">{typeLabel(t)}</span>
                  <span aria-hidden="true" className={`inline-flex items-center justify-center w-6 h-6 rounded-[6px] border ${on ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'}`}>
                    {on && <IconCheck size={16} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
    </section>
  )
}
