'use client'

import { useEffect, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { ButtonLink } from '@/app/components/ui'
import { CREATE_NEEDS_ACCOUNT, accountLink } from '@/lib/account'
import { readAccount, watchAccount } from '@/lib/accountClient'

type Gate = 'checking' | 'signedIn' | 'phone'

/**
 * Only a Green Dot member makes an event (Ross, 15 Nov 2026, D135). Every
 * create wizard is drawn inside this: a phone signed in to an account goes
 * straight through; any other phone is asked to sign in or join, and comes
 * back to exactly this address once it has (`?next=`, `safeNext` in
 * lib/account.ts). `/api/trip/create` refuses a phone without an account
 * whatever this says — this only saves somebody filling in a wizard for
 * nothing.
 *
 * **Joining, playing, scoring and watching never come through here** (D94)
 * — the screen says so, so nobody invited to an event thinks they need one.
 */
export default function MemberGate({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>(CREATE_NEEDS_ACCOUNT ? 'checking' : 'signedIn')
  const [here, setHere] = useState<string | null>(null)

  useEffect(() => {
    if (!CREATE_NEEDS_ACCOUNT) return
    let live = true
    const check = () => { readAccount().then(a => { if (live) setGate(a ? 'signedIn' : 'phone') }) }
    setHere(window.location.pathname + window.location.search)
    check()
    const stop = watchAccount(check)
    return () => { live = false; stop() }
  }, [])

  if (gate === 'signedIn') return <>{children}</>

  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/create" />
      <div className="flex flex-col items-center px-6 py-12 page-enter" aria-busy={gate === 'checking'}>
        {gate === 'phone' && (
          <div className="w-full max-w-sm">
            <h1 className="t-h1 text-ink mb-2">Sign in to make an event</h1>
            <p className="text-ink/80 text-[15px] leading-relaxed">
              Events are made by Green Dot members. It’s free: an email, a username and a password.
              The event is then yours on any phone you sign in on.
            </p>
            <p className="text-ink/65 text-sm leading-relaxed mt-3">
              Joining, playing, scoring and watching never need an account. Your players just use the event’s code.
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <ButtonLink href={accountLink(here)}>Sign in</ButtonLink>
              <ButtonLink href={accountLink(here, true)} variant="secondary">Join Green Dot</ButtonLink>
            </div>
            <LegalLinks className="mt-12" />
          </div>
        )}
      </div>
    </main>
  )
}
