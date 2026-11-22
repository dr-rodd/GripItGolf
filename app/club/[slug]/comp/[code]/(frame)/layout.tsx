import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art } from '../../../ClubView'
import { readFace } from '../../../face'

/**
 * A competition's frame (MO3, D282): the club's art, the header whose green
 * dot goes to the club's home (D287: the club's frosted card is Home's alone) — drawn once for
 * the Summary and its sections and kept while moving between them, so
 * opening a competition is the footer sliding its tabs out once and the page
 * filling in under a frame that never moves. Only the club's look is read
 * here (shared with the page within a request); the page reads the rest.
 */
export default async function CompFrame({ children, params }: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
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
          {children}
        </div>
      </div>
    </main>
  )
}
