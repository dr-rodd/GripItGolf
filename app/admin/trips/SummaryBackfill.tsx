'use client'

import { useState, useTransition } from 'react'
import { buttonClass } from '@/app/components/ui'
import { backfillSummaries } from './actions'

/**
 * Fills the card summaries for every round signed before stage (f) — tapped
 * until it says none are left. Safe to tap any time: a row is only ever
 * written again from the scores.
 */
export default function SummaryBackfill() {
  const [line, setLine] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} className={buttonClass('quiet', false)}
        onClick={() => start(async () => {
          const r = await backfillSummaries()
          setLine(r.error ?? (r.remaining ? `Filled ${r.filled}; ${r.remaining} rounds left — tap again.` : `Filled ${r.filled}. Every signed round has its summaries.`))
        })}>
        {pending ? 'Filling…' : 'Fill card summaries'}
      </button>
      {line && <p className="t-cap text-ink/80" role="status">{line}</p>}
    </div>
  )
}
