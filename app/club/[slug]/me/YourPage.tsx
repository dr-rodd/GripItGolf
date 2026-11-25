'use client'

import Link from 'next/link'
import HandicapIndexCard from '@/app/components/HandicapIndexCard'
import YourDetailsCard from '@/app/components/YourDetailsCard'
import LegalLinks from '@/app/components/LegalLinks'
import { IconChevronLeft } from '@/app/components/icons'
import { ListGroup, ListRow, PageTitle } from '@/app/components/ui'

/**
 * Your page (D280; the profile circle — D319): handicap, your details, your
 * events and your account — back to the club. What you see, your streams and
 * friends are the gear's (Settings).
 */
export default function YourPage({ slug, club }: { slug: string; club: string }) {
  return (
    <section>
      <PageTitle back={{ href: `/club/${slug}`, label: club }} className="mt-5">Your page</PageTitle>
      <HandicapIndexCard className="mt-6" />
      <YourDetailsCard club={club} className="mt-4" />
      <h2 className="t-h2 text-ink mt-8">Account</h2>
      <ListGroup className="mt-3">
        <ListRow href="/home?tab=events" label="Your events" hint="Every event you’re in or run, and the players linked to you" />
        <ListRow href="/account" label="Username, password, sign out" />
        <ListRow href={`/club/${slug}/settings`} label="Settings" hint="What you see, your streams, who sees your cards, friends" />
      </ListGroup>
      <LegalLinks className="mt-12" />
    </section>
  )
}
