'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DateField from '@/app/components/DateField'
import { type LeaguePeriod, describePeriod, periodsIssue } from '@/lib/leagueSetup'
import { setLeaguePeriods } from '@/lib/leagueRoundStore'
import { buttonClass, cardClass } from '@/app/components/ui'

/**
 * A league of periods' dates, from the organiser area (Ross, 8 Nov 2026) —
 * each period's start and finish, moved by hand and saved whole. A card is
 * filed into a period by its date every time it is read, so moving one
 * re-files its cards; nothing else is written.
 */
export default function LeaguePeriods({ tripId, periods: initial }: {
  tripId: string
  periods: LeaguePeriod[]
}) {
  const router = useRouter()
  const [periods, setPeriods] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const issue = periodsIssue(periods)
  const changed = JSON.stringify(periods) !== JSON.stringify(initial)

  function setDate(i: number, end: 'start' | 'end', value: string) {
    setPeriods(prev => prev.map((p, idx) => (idx === i ? { ...p, [end]: value } : p)))
    setNote(null)
  }

  async function save() {
    setBusy(true)
    setNote(null)
    const result = await setLeaguePeriods({ tripId, periods })
    setBusy(false)
    setNote(result.ok ? { ok: true, text: 'Periods saved.' } : { ok: false, text: result.error })
    if (result.ok) router.refresh()
  }

  return (
    <section className="mt-8">
      <h2 className="t-h2 text-ink mb-1">Periods</h2>
      <p className="t-cap text-ink/65 mb-4">
        A card counts in the period its day falls in. Moving a period moves its cards with it.
      </p>
      <div className="space-y-3">
        {periods.map((p, i) => (
          <div key={p.key} className={`p-4 ${cardClass()}`}>
            <p className="text-ink text-sm font-medium mb-2">
              Period {i + 1}<span className="text-ink/65 font-normal"> · {describePeriod(p)}</span>
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <DateField label="Starts" value={p.start} onChange={v => setDate(i, 'start', v)} />
              <DateField label="Finishes" value={p.end} onChange={v => setDate(i, 'end', v)} />
            </div>
          </div>
        ))}
      </div>
      {issue && <p className="text-rust-deep text-[13px] mt-3 leading-snug">{issue}</p>}
      <button type="button" onClick={save} disabled={busy || !!issue || !changed} className={`${buttonClass('primary')} mt-5`}>
        {busy ? 'Saving…' : 'Save periods'}
      </button>
      {note && <p className={`t-cap mt-2 ${note.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>{note.text}</p>}
    </section>
  )
}
