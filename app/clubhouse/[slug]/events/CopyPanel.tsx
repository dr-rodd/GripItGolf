'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, Segmented, buttonClass } from '@/app/components/ui'
import { MAX_COPIES, weeklyFrom } from '@/lib/clubhouse'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { copyCompetition } from '../../clubhouseClient'

/** Copy to another date, or Repeat weekly (D214) — the dates shown before anything is made. */
export default function CopyPanel({ clubId, slug, event, onClose, onMade }: {
  clubId: string; slug: string; event: { code: string; name: string }; onClose: () => void; onMade: () => void
}) {
  const [mode, setMode] = useState<'once' | 'weekly'>('once')
  const [date, setDate] = useState('')
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ made: { code: string; date: string }[]; refused: { date: string; why: string }[] } | null>(null)
  const dates = useMemo(() => (date ? (mode === 'once' ? [date] : weeklyFrom(date, count)) : []), [date, mode, count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function make() {
    setBusy(true); setError('')
    const r = await copyCompetition(clubId, event.code, dates)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setResult(r)
    if (r.made.length) onMade()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="copy-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="copy-title" className="t-h2 text-ink break-words">Copy {event.name}</h2>
            <p className="t-cap text-ink/65 mt-1">The same course, format, tee times and booking, on another day.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        {result ? (
          <div className="mt-6 space-y-3">
            {result.made.length > 0 && (
              <>
                <p className="t-label text-ink">{result.made.length} made</p>
                <ul className="space-y-1">
                  {result.made.map(m => (
                    <li key={m.code}><Link href={`/clubhouse/${slug}/events/${m.code}`} className="text-ink text-[15px] underline underline-offset-2">{clubEventDates(m.date, m.date)}</Link></li>
                  ))}
                </ul>
              </>
            )}
            {result.refused.length > 0 && (
              <ul className="space-y-1">
                {result.refused.map(r => <li key={r.date} className="t-cap text-rust-deep">{clubEventDates(r.date, r.date)}: {r.why}</li>)}
              </ul>
            )}
            <button type="button" onClick={onClose} className={`${buttonClass('secondary', false)} ch-focus`}>Done</button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <Segmented label="How often" value={mode} onChange={setMode}
              options={[{ value: 'once', label: 'Another date' }, { value: 'weekly', label: 'Repeat weekly' }] as const} />
            <div>
              <label htmlFor="copy-date" className={FIELD_LABEL}>{mode === 'once' ? 'The day' : 'The first day'}</label>
              <input id="copy-date" type="date" value={date} min={irishToday(new Date())} onChange={e => setDate(e.target.value)} className={`${FIELD} ch-focus`} />
            </div>
            {mode === 'weekly' && (
              <div>
                <label htmlFor="copy-count" className={FIELD_LABEL}>How many weeks</label>
                <input id="copy-count" type="number" min={2} max={MAX_COPIES} value={count}
                  onChange={e => setCount(Math.max(2, Math.min(MAX_COPIES, Math.floor(Number(e.target.value) || 2))))} className={`${FIELD} ch-focus`} />
              </div>
            )}
            {dates.length > 1 && (
              <p className="t-cap text-ink/80">{dates.map(d => clubEventDates(d, d)).join(' · ')}</p>
            )}
            {error && <p role="alert" className="t-cap text-rust-deep">{error}</p>}
            <button type="button" disabled={busy || dates.length === 0} onClick={() => void make()} className={`${buttonClass('primary', false)} ch-focus`}>
              {busy ? 'Making…' : dates.length > 1 ? `Make ${dates.length} competitions` : 'Make the copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
