'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass } from '@/app/components/ui'
import { resolveFeedReport } from './actions'

/** Take a reported item down, or leave it up (D303). */
export default function ReportDecision({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = (outcome: 'removed' | 'dismissed') => {
    setError(null)
    start(async () => {
      const r = await resolveFeedReport(itemId, outcome)
      setError(r.error)
      if (!r.error) router.refresh()
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => run('removed')} className={buttonClass('danger', false, true)}>Take it down</button>
        <button type="button" disabled={pending} onClick={() => run('dismissed')} className={buttonClass('secondary', false, true)}>Leave it up</button>
      </div>
      {error && <p className="t-cap text-rust-deep">{error}</p>}
    </div>
  )
}
