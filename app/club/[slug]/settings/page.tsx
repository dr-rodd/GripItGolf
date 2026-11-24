import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art } from '../ClubView'
import { NoBar } from '../ClubBarContext'
import { readFace } from '../face'
import ClubSettings from './ClubSettings'

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } }

/**
 * The gear's page (Streams v2, D319): what the member sees, their streams and
 * who sees their cards, friends, and what the Club tab held (where they stand
 * on the list, the Clubhouse for its holders). Framed on the server; every
 * card asks for its own after paint. Back is always the club's home.
 */
export default async function ClubSettingsRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const face = await readFace(slug, { events: false })
  if (!face) notFound()
  const { id: _id, ...clubFace } = face
  return (
    <main data-club style={clubFace.style as React.CSSProperties} className="min-h-dvh paper relative isolate">
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pt-1 pb-10">
          <NoBar />
          <ClubSettings slug={slug} club={clubFace.name} />
        </div>
      </div>
    </main>
  )
}
