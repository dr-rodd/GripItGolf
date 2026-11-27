import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art } from '../ClubView'
import { readFace } from '../face'
import ClubInterclub from './ClubInterclub'

export const metadata: Metadata = { title: 'Interclub', robots: { index: false, follow: false } }

/**
 * Interclub in the members app (docs/interclub.md, stage 3, D357), opened
 * from Comps: the club's inter-club matches on Green Dot, each to watch and
 * score, a team captain's way to set one up, and every draw in the country.
 * Under the club footer with Comps lit; the frame is drawn on the server,
 * the matches asked for after it paints, for members only.
 */
export default async function InterclubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const face = await readFace(slug, { events: false })
  if (!face) notFound()
  const { id: _id, ...clubFace } = face
  return (
    <main data-club style={clubFace.style as React.CSSProperties} className="min-h-dvh paper relative isolate has-tabbar">
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pt-1 pb-10">
          <ClubInterclub slug={slug} club={clubFace.name} />
        </div>
      </div>
    </main>
  )
}
