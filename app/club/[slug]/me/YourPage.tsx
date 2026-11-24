'use client'

import Link from 'next/link'
import HandicapIndexCard from '@/app/components/HandicapIndexCard'
import YourDetailsCard from '@/app/components/YourDetailsCard'
import ClubEventTypesCard from '@/app/components/ClubEventTypesCard'
import FeedSettings from '@/app/components/feed/FeedSettings'
import LegalLinks from '@/app/components/LegalLinks'
import { IconChevronLeft } from '@/app/components/icons'
import { ListGroup, ListRow } from '@/app/components/ui'

/** Your page (D280): handicap, your details, what you see, the feed and your friends (D296, D297), and your account — back to the club. */
export default function YourPage({ slug, club }: { slug: string; club: string }) {
  return (
    <section>
      <Link href={`/club/${slug}`} className="t-cap text-ink/65 inline-flex items-center gap-1 mt-5 press ch-focus">
        <IconChevronLeft size={16} /> {club}
      </Link>
      <h1 className="t-h1 text-ink mt-2">Your page</h1>
      <HandicapIndexCard className="mt-6" />
      <YourDetailsCard club={club} className="mt-4" />
      <ClubEventTypesCard className="mt-4" />
      {/* D296, D297: the feed's audience, your friends, Find friends. */}
      <FeedSettings className="mt-4" />
      <h2 className="t-h2 text-ink mt-8">Account</h2>
      <ListGroup className="mt-3">
        <ListRow href="/home?tab=events" label="Your events" hint="Every event you’re in or run, and the players linked to you" />
        <ListRow href="/account" label="Username, password, sign out" />
      </ListGroup>
      <LegalLinks className="mt-12" />
    </section>
  )
}
