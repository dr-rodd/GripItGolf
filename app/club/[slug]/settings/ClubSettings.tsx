'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ClubEventTypesCard from '@/app/components/ClubEventTypesCard'
import FeedSettings from '@/app/components/feed/FeedSettings'
import StreamsCard from '@/app/components/feed/StreamsCard'
import LegalLinks from '@/app/components/LegalLinks'
import { IconChevronLeft } from '@/app/components/icons'
import { ListGroup, ListRow, PageTitle } from '@/app/components/ui'
import { readClubHome } from '@/lib/clubHomeCopy'
import { clubMay, credentialLine, type Credentials } from '@/lib/clubMay'
import { useClubBar } from '../ClubBarContext'

/**
 * Settings (D319): the gear on the club's Home. What the Club tab held —
 * where you stand on the list, the Clubhouse for those who hold it — and the
 * club preferences: what you see, your streams, who sees your cards, friends.
 * Your handicap, details and account are your page's (the profile circle).
 */
export default function ClubSettings({ slug, club }: { slug: string; club: string }) {
  const { members } = useClubBar()
  // The members home this phone already holds — the footer's, else the copy kept here (D193).
  const [credentials, setCredentials] = useState<Credentials | null>(members?.slug === slug ? members.credentials ?? null : null)
  useEffect(() => {
    if (credentials) return
    const kept = readClubHome(slug)
    if (kept?.credentials) setCredentials(kept.credentials)
  }, [slug, credentials])

  return (
    <section>
      <PageTitle back={{ href: `/club/${slug}`, label: club }} className="mt-5"
        sub={credentials ? <>You’re on {club}’s list: {credentialLine(credentials, club)}.</> : undefined}>Settings</PageTitle>

      <h2 className="t-h2 text-ink mt-8">What you see</h2>
      <ClubEventTypesCard className="mt-3" />

      <h2 className="t-h2 text-ink mt-8">Streams</h2>
      <StreamsCard club={slug} className="mt-3" />
      {/* D296, D297: who sees your cards, your friends, Find friends. */}
      <FeedSettings className="mt-4" />

      {credentials && clubMay('open_clubhouse', { row: credentials }) && (
        <>
          <h2 className="t-h2 text-ink mt-8">The office</h2>
          <ListGroup className="mt-3">
            <ListRow href={`/clubhouse/${slug}`} label="The Clubhouse" hint="The club’s list, its look and its season" />
          </ListGroup>
        </>
      )}
      <p className="t-cap text-ink/65 mt-6">Anybody else opening {club}’s address sees its public page.</p>
      <LegalLinks className="mt-12" />
    </section>
  )
}
