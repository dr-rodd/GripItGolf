'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import HandicapIndexCard from '@/app/components/HandicapIndexCard'
import YourDetailsCard from '@/app/components/YourDetailsCard'
import { IconChevronLeft } from '@/app/components/icons'
import { ListGroup, ListRow, PageTitle, buttonClass } from '@/app/components/ui'
import { homeData, type HomeData } from '@/lib/accountClient'
import { forgetTier } from '@/lib/tierHint'

/**
 * Your page on /home (D319 — what Me held, less the feed's settings, which
 * are the gear's): handicap, your details, your clubs, your account, help
 * and privacy. One ask after it paints.
 */
export default function MePage() {
  const [home, setHome] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    void homeData().then(r => {
      if (!live) return
      if (!r.ok) {
        if (r.signedOut) { forgetTier(); window.location.replace('/'); return }
        setError(r.error)
        return
      }
      setHome(r.home)
    })
    return () => { live = false }
  }, [attempt])

  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/home" />
      <div className="w-full max-w-md mx-auto px-4 pt-1 pb-10" aria-busy={!home && !error}>
        <PageTitle back={{ href: '/home', label: 'Home' }} className="mt-5">Your page</PageTitle>
        {error && (
          <div className="mt-4">
            <p className="t-cap text-rust-deep" role="alert">{error}</p>
            <button type="button" onClick={() => { setError(''); setAttempt(a => a + 1) }} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
          </div>
        )}
        {home?.username && <p className="text-ink/80 text-[15px] mt-2">Signed in as {home.username}.</p>}
        {home && <HandicapIndexCard initial={home.handicapIndex} className="mt-6" />}
        {home && (home.clubs.length > 0 || home.details?.gender || home.details?.birthDate) && <YourDetailsCard initial={home.details} className="mt-4" />}
        <ListGroup className="mt-6">
          {(home?.clubs ?? []).map(c => <ListRow key={c.slug} href={`/club/${c.slug}`} label={c.name} hint="Your club’s area" />)}
          <ListRow href="/home?tab=events" label="Your events" hint="Every event you’re in or run, and the players linked to you" />
          <ListRow href="/account" label="Your account" hint="Username, password, sign out, delete" />
          <ListRow href="/account/clubs" label="Clubs" hint="Join your club with its code" />
          <ListRow href="/home/settings" label="Settings" hint="What you see, your streams, who sees your cards, friends" />
          <ListRow href="/privacy" label="Privacy" hint="What Green Dot keeps, and for how long" />
          <ListRow href="/terms" label="Terms of use" />
        </ListGroup>
        <LegalLinks className="mt-12" />
      </div>
    </main>
  )
}
