import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art, ClubHeader } from '../ClubView'
import { NoBar } from '../ClubBarContext'
import { readFace } from '../face'
import YourPage from './YourPage'

export const metadata: Metadata = { title: 'Your page', robots: { index: false, follow: false } }

/**
 * A member's own page inside their club (MO1, M2 — D280, Ross, 21 Nov
 * 2026): the account icon opens it, never the generic personal page. Its way
 * back is always this club's home. The frame is drawn on the server; every
 * card asks for its own after paint (the server cannot see who is holding the phone).
 */
export default async function YourPageRoute({ params }: { params: Promise<{ slug: string }> }) {
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
          <YourPage slug={slug} club={clubFace.name} />
        </div>
      </div>
    </main>
  )
}
