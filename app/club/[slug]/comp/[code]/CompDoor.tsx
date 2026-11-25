'use client'

import { useEffect, useState } from 'react'
import { ButtonLink, PageTitle } from '@/app/components/ui'
import { accountLink } from '@/lib/account'
import { askBooking, askMatchPlay, readAccount } from '@/lib/accountClient'

/**
 * A members-only competition's door (D164): the club's list. A phone signed
 * in to an account on it is let through by the server — which sets the
 * door's cookie — and the page reloads with the competition. Anybody else
 * is asked to sign in, and is never shown a PIN box.
 */
export default function CompDoor({ code, clubName, here, matchPlay = false }: {
  code: string; clubName: string; here: string
  /** A club match play has no tee sheet: its own route opens the same door (/api/club/matchplay). */
  matchPlay?: boolean
}) {
  const [state, setState] = useState<'checking' | 'out' | 'refused'>('checking')
  const [why, setWhy] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      if (!(await readAccount())) { if (live) setState('out'); return }
      const r = matchPlay ? await askMatchPlay('state', { code }) : await askBooking('state', { code })
      if (!live) return
      if (r.ok) { window.location.reload(); return }
      setWhy(r.error); setState('refused')
    })()
    return () => { live = false }
  }, [code, matchPlay])

  return (
    <section className="mt-6" aria-busy={state === 'checking'}>
      <PageTitle>Members’ competition</PageTitle>
      {state === 'out' && (
        <>
          <p className="text-ink/80 text-[15px] leading-relaxed mt-2">This competition is for {clubName}’s members. Sign in with the account on the club’s list.</p>
          <ButtonLink href={accountLink(here)} className="mt-6">{clubName} members: sign in</ButtonLink>
        </>
      )}
      {state === 'refused' && <p className="text-ink/80 text-[15px] leading-relaxed mt-2">{why}</p>}
    </section>
  )
}
