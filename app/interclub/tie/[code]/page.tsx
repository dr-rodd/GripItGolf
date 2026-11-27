import type { Metadata } from 'next'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import TieClient from './TieClient'

/**
 * An interclub tie, run by the clubs' team captains (docs/interclub.md,
 * stages 2 and 3): each club's players and their interclub index, who plays
 * whom, a match or the whole tie settled by hand, and the playoff. Static —
 * everything is asked after it paints, with the captain's account; the
 * matches themselves are scored on the event's own pages by anybody with its
 * link. Not indexed.
 */

export const metadata: Metadata = { title: 'Interclub match', robots: { index: false, follow: false } }

export default async function TiePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/" />
      <div className="px-4 pt-4 pb-12 page-enter">
        <div className="w-full max-w-lg mx-auto">
          <TieClient code={code.toUpperCase()} />
          <LegalLinks className="mt-10" />
        </div>
      </div>
    </main>
  )
}
