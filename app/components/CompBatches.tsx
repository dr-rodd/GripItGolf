'use client'

import { IconPlus, IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, chipClass } from '@/app/components/ui'
import { MAX_BATCHES, batchLast } from '@/lib/teeSheet'
import { describeTime } from '@/lib/itinerary'
import { nextBatch, type CompBatch } from '@/lib/clubComp'

const INTERVALS = [7, 8, 9, 10, 12, 15] as const

/**
 * A competition's tee times as runs (Ross, 17 Nov 2026): each a first tee
 * time, how many, the minutes between and the players a time — threes at
 * ten minutes until one, then fours at fifteen — up to four runs. The
 * members app's New competition and the Clubhouse's competition panel both
 * draw it; the checks are `compFormIssue`'s.
 */
export default function CompBatches({ batches, onChange, idPrefix = 'comp' }: {
  batches: CompBatch[]
  onChange: (b: CompBatch[]) => void
  idPrefix?: string
}) {
  const set = (i: number, patch: Partial<CompBatch>) => onChange(batches.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  return (
    <div className="space-y-4">
      {batches.map((b, i) => {
        const id = `${idPrefix}-run-${i}`
        const last = /^\d\d:\d\d$/.test(b.start) && b.times > 0 && b.interval > 0 ? batchLast({ start: b.start, interval: b.interval, count: b.times }) : null
        return (
          <div key={i} className={batches.length > 1 ? 'rounded-tile border border-line p-3 space-y-3' : 'space-y-3'}>
            {batches.length > 1 && (
              <div className="flex items-center gap-2">
                <p className="t-label text-ink flex-1">Run {i + 1}</p>
                <button type="button" onClick={() => onChange(batches.filter((_, j) => j !== i))} aria-label={`Take run ${i + 1} off`}
                  className="text-ink/60 hover:text-ink p-1 -m-1 press"><IconX size={18} /></button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-first`} className={FIELD_LABEL}>First tee time</label>
                <input id={`${id}-first`} type="time" className={FIELD} value={b.start} onChange={e => set(i, { start: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`${id}-times`} className={FIELD_LABEL}>How many</label>
                <input id={`${id}-times`} className={FIELD} inputMode="numeric" value={String(b.times)}
                  onChange={e => set(i, { times: Number(e.target.value.replace(/\D/g, '') || 0) })} />
              </div>
            </div>
            <div>
              <p className={FIELD_LABEL}>Minutes between</p>
              <div className="flex flex-wrap gap-2">
                {INTERVALS.map(n => (
                  <button key={n} type="button" aria-pressed={b.interval === n} className={chipClass(b.interval === n)} onClick={() => set(i, { interval: n })}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <p className={FIELD_LABEL}>Players a tee time</p>
              <div className="flex flex-wrap gap-2">
                {[2, 3, 4].map(n => (
                  <button key={n} type="button" aria-pressed={b.perTime === n} className={chipClass(b.perTime === n)} onClick={() => set(i, { perTime: n })}>{n}</button>
                ))}
              </div>
            </div>
            {last && <p className="t-cap text-ink/65">{b.times === 1 ? describeTime(b.start) : `${describeTime(b.start)} to ${describeTime(last)}`} · {b.times * b.perTime} places</p>}
          </div>
        )
      })}
      {batches.length < MAX_BATCHES && batches.length > 0 && (
        <button type="button" onClick={() => onChange([...batches, nextBatch(batches[batches.length - 1])])}
          className="t-label text-accent-deep inline-flex items-center gap-1 press">
          <IconPlus size={16} /> Add another run of times
        </button>
      )}
    </div>
  )
}
