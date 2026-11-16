'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { accountLink } from '@/lib/account'
import { buttonClass } from '@/app/components/ui'
import NoAccess from './NoAccess'
import { doorClub, knock, lastClubhouse } from './clubhouseClient'

/**
 * greendot.live/clubhouse (D212): no page of its own when it works. The
 * site's own sign-in, no second password: signed in with Clubhouse, the
 * club last used opens; signed out, off to sign in and back here; signed in
 * without it anywhere, the one card. Never a blank page or a raw error.
 */
export default function Door() {
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'none' | 'lost'>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void knock().then(d => {
      if (!live) return
      if (d.kind === 'signedOut') { window.location.replace(accountLink('/clubhouse')); return }
      if (d.kind === 'lost') { setState('lost'); return }
      if (d.kind === 'none') { setState('none'); return }
      router.replace(`/clubhouse/${doorClub(d.clubs, lastClubhouse()).slug}`)
    })
    return () => { live = false }
  }, [router, attempt])

  return (
    <main className="min-h-dvh paper flex items-center justify-center px-4 py-12" aria-busy={state === 'checking'}>
      {state === 'none' && <NoAccess />}
      {state === 'lost' && (
        <div role="alert" className="text-center">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={() => { setState('checking'); setAttempt(a => a + 1) }}
            className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
    </main>
  )
}
