import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art, ClubHeader, SeasonList } from '../ClubView'
import { NoBar } from '../ClubBarContext'
import { readFace } from '../face'

export const metadata: Metadata = { title: 'The season', robots: { index: false, follow: false } }

/**
 * Comps' See all (MO3, D282): the whole season still to come. The frame is
 * drawn on the server; the list is asked for after it paints, and only here
 * — the members home carries the next two weeks.
 */
export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const face = await readFace(slug, { events: false })
  if (!face) notFound()
  const { id: _id, ...clubFace } = face
  return (
    <main data-club style={clubFace.style as React.CSSProperties} className="min-h-dvh paper relative isolate">
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10">
          <ClubHeader face={clubFace} members />
          <NoBar />
          <SeasonList slug={slug} club={clubFace.name} />
        </div>
      </div>
    </main>
  )
}
