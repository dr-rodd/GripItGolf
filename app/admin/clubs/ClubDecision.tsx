'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass } from '@/app/components/ui'
import { setClubVerified } from './actions'

/** Verify or refuse one club; a verified club can be un-verified the same way. */
export default function ClubDecision({ clubId, verified }: { clubId: string; verified: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = (v: boolean) => {
    setError(null)
    start(async () => {
      const r = await setClubVerified(clubId, v)
      setError(r.error)
      if (!r.error) router.refresh()
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {!verified && (
          <button type="button" disabled={pending} onClick={() => run(true)} className={buttonClass('secondary', false)}>
            Verify
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(false)} className={buttonClass('quiet', false)}>
          {verified ? 'Take verification away' : 'Refuse'}
        </button>
      </div>
      {error && <p className="t-cap text-rust-deep">{error}</p>}
    </div>
  )
}
