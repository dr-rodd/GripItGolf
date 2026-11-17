'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { accountLink } from '@/lib/account'
import { askClub, rememberWhyOut, type ClubSummary } from '@/lib/accountClient'
import { clubhouseHref } from '@/lib/clubhouse'
import { FIELD, buttonClass, cardClass } from '@/app/components/ui'
import NoAccess from './NoAccess'
import { doorClub, knock, lastClubhouse } from './clubhouseClient'

/**
 * greendot.live/clubhouse (D212): no page of its own when it works. The
 * site's own sign-in, no second password: signed in with Clubhouse, the
 * club last used opens; signed out, off to sign in and back here; signed in
 * without it anywhere, the one card. Never a blank page or a raw error.
 * Green Dot staff (D222) find a club by name here (`?find`, or when they are
 * on no club's list themselves).
 */
export default function Door() {
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'none' | 'lost' | 'find'>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const d = await knock()
      if (!live) return
      if (d.kind === 'signedOut') { rememberWhyOut('the Clubhouse door', d.why); window.location.replace(accountLink('/clubhouse')); return }
      if (d.kind === 'lost') { setState('lost'); return }
      const asked = new URLSearchParams(window.location.search).has('find')
      if (d.kind === 'open' && !asked) { router.replace(clubhouseHref(doorClub(d.clubs, lastClubhouse()).slug)); return }
      // Staff? The search answers only them.
      const staff = await askClub('find', { q: '' })
      if (!live) return
      if (staff.ok) { setState('find'); return }
      if (d.kind === 'open') { router.replace(clubhouseHref(doorClub(d.clubs, lastClubhouse()).slug)); return }
      setState('none')
    })()
    return () => { live = false }
  }, [router, attempt])

  return (
    <main className="min-h-dvh paper flex items-center justify-center px-4 py-12" aria-busy={state === 'checking'}>
      {state === 'none' && <NoAccess />}
      {state === 'find' && <FindClub />}
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

/** Green Dot staff find any verified club by its name (D222). */
function FindClub() {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<ClubSummary[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const words = q.trim()
    if (words.length < 2) { setFound(null); return }
    let live = true
    const t = setTimeout(() => {
      void askClub('find', { q: words }).then(r => {
        if (!live) return
        if (r.ok) { setFound(r.clubs ?? []); setError('') } else setError(r.error)
      })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  return (
    <div className={`${cardClass('raised')} w-full max-w-[400px] p-6`}>
      <h1 className="t-h1 text-ink">Clubhouse</h1>
      <p className="t-cap text-ink/65 mt-1">Green Dot staff: find a club by its name.</p>
      <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="The club’s name"
        aria-label="The club’s name" className={`${FIELD} ch-focus mt-4`} />
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
      {found && found.length === 0 && <p className="text-ink/65 text-[15px] mt-3">No verified club by that name.</p>}
      {found && found.length > 0 && (
        <ul className="mt-3">
          {found.map(c => (
            <li key={c.id}>
              <Link href={clubhouseHref(c.slug)} className="ch-hover ch-focus flex items-center min-h-12 px-2 -mx-2 rounded-tile text-ink text-[15px]">{c.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
