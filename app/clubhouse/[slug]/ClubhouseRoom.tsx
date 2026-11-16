'use client'

import { useEffect, useState } from 'react'
import { accountLink } from '@/lib/account'
import { askClub } from '@/lib/accountClient'
import { clubMay } from '@/lib/clubMay'
import { buttonClass } from '@/app/components/ui'
import ClubScreen from '@/app/account/club/ClubScreen'
import NoAccess from '../NoAccess'
import { knock, rememberClubhouse } from '../clubhouseClient'

type State = 'checking' | 'in' | 'none' | 'lost'

/**
 * The door again, at one club: signed out goes to sign in and back; without
 * Clubhouse here, the one card (also what a phone sees the moment access is
 * taken away, on its next ask); with it, the club's list, numbers in full.
 */
export default function ClubhouseRoom({ clubId, slug, name }: { clubId: string; slug: string; name: string }) {
  const [state, setState] = useState<State>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const d = await knock()
      if (!live) return
      if (d.kind === 'signedOut') { window.location.replace(accountLink(`/clubhouse/${slug}`)); return }
      if (d.kind === 'lost') { setState('lost'); return }
      const here = d.kind === 'open' ? d.clubs.find(c => c.id === clubId) : null
      if (!here || !clubMay('open_clubhouse', { row: here.credentials })) {
        // Checked once more on its own, so a lost list never reads as no access.
        const r = await askClub('club', { clubId })
        if (!live) return
        if (r.ok && r.club && clubMay('open_clubhouse', { row: r.club.credentials })) { rememberClubhouse(slug); setState('in'); return }
        setState(!r.ok && !/not on this club/i.test(r.error) ? 'lost' : 'none')
        return
      }
      rememberClubhouse(slug)
      setState('in')
    })()
    return () => { live = false }
  }, [clubId, slug, attempt])

  if (state === 'in') return <ClubScreen clubId={clubId} whole back={{ href: `/club/${slug}?tab=club`, label: name }} />
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
