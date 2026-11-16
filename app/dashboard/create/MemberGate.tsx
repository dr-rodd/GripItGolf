'use client'

import { useEffect, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { ButtonLink, optionClass } from '@/app/components/ui'
import { CREATE_NEEDS_ACCOUNT, accountLink } from '@/lib/account'
import { askClub, readAccount, watchAccount } from '@/lib/accountClient'
import { clubMay } from '@/lib/clubMay'
import { EventClubContext, type EventClub } from './EventClub'

type Gate = 'checking' | 'signedIn' | 'phone'

/** Whose event: not asked yet, being asked (the clubs this account runs), or answered. */
type Whose = { kind: 'unknown' } | { kind: 'ask'; clubs: EventClub[] } | { kind: 'answered'; club: EventClub | null }

/** The verified clubs this account is an Officer of (D218, D219), by name. Fail-soft: none. */
async function clubsRun(): Promise<EventClub[]> {
  const r = await askClub('mine')
  if (!r.ok) return []
  return (r.clubs ?? []).filter(k => k.status === 'verified' && clubMay('run_events', { row: k.credentials }))
    .map(c => ({ id: c.id, name: c.name }))
}

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
  const [whose, setWhose] = useState<Whose>({ kind: 'unknown' })

  useEffect(() => {
    if (!CREATE_NEEDS_ACCOUNT) return
    let live = true
    const check = () => {
      readAccount().then(async a => {
        if (!live) return
        if (!a) { setGate('phone'); return }
        // Q3, D153: a verified club's Officer is asked whose event this is,
        // once, before the wizard — one answer a club they run, and their
        // own; everybody else goes straight in.
        const clubs = await clubsRun()
        if (!live) return
        setWhose(w => (w.kind === 'unknown' ? (clubs.length ? { kind: 'ask', clubs } : { kind: 'answered', club: null }) : w))
        setGate('signedIn')
      })
    }
    setHere(window.location.pathname + window.location.search)
    check()
    const stop = watchAccount(check)
    return () => { live = false; stop() }
  }, [])

  if (gate === 'signedIn' && whose.kind === 'answered') {
    return <EventClubContext.Provider value={whose.club}>{children}</EventClubContext.Provider>
  }
  if (gate === 'signedIn' && !CREATE_NEEDS_ACCOUNT) return <>{children}</>

  if (gate === 'signedIn' && whose.kind === 'ask') {
    const { clubs } = whose
    return (
      <main className="min-h-dvh paper">
        <TripHeader backTo="/create" />
        <div className="flex flex-col items-center px-6 py-12 page-enter">
          <div className="w-full max-w-sm">
            <h1 className="t-h1 text-ink mb-2">Whose event is this?</h1>
            <p className="text-ink/80 text-[15px] leading-relaxed">
              {clubs.length === 1 ? `You run ${clubs[0].name}. Make it the club’s, or your own.` : 'Make it one of your clubs’, or your own.'}
            </p>
            <div className="flex flex-col gap-3 mt-8">
              {clubs.map(club => (
                <button key={club.id} type="button" onClick={() => setWhose({ kind: 'answered', club })} className={optionClass(false)}>
                  <span className="block text-[17px] font-semibold text-ink">{club.name}’s</span>
                  <span className="block t-cap text-ink/65 mt-0.5">
                    On the club’s calendar. The club’s Officers run it; a PIN for helpers is optional.
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => setWhose({ kind: 'answered', club: null })} className={optionClass(false)}>
                <span className="block text-[17px] font-semibold text-ink">Just mine</span>
                <span className="block t-cap text-ink/65 mt-0.5">Yours alone, with a PIN of your own, as any event.</span>
              </button>
            </div>
            <LegalLinks className="mt-12" />
          </div>
        </div>
      </main>
    )
  }

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
