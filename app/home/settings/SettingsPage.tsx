'use client'

import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import ClubEventTypesCard from '@/app/components/ClubEventTypesCard'
import FeedSettings from '@/app/components/feed/FeedSettings'
import StreamsCard from '@/app/components/feed/StreamsCard'
import { IconChevronLeft } from '@/app/components/icons'
import { PageTitle } from '@/app/components/ui'

/**
 * Settings on /home (D319): what you see from your clubs, your streams, who
 * sees your cards, friends. Each card asks for its own after paint and draws
 * nothing it cannot keep (before its migration, or for a junior).
 */
export default function SettingsPage() {
  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/home" />
      <div className="w-full max-w-md mx-auto px-4 pt-1 pb-10">
        <PageTitle back={{ href: '/home', label: 'Home' }} className="mt-5">Settings</PageTitle>
        <ClubEventTypesCard className="mt-6" />
        <h2 className="t-h2 text-ink mt-8">Streams</h2>
        <StreamsCard className="mt-3" />
        {/* D296, D297: who sees your cards, your friends, Find friends. */}
        <FeedSettings className="mt-4" />
        <LegalLinks className="mt-12" />
      </div>
    </main>
  )
}
