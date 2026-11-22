import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art, ClubHeader } from '../ClubView'
import { readFace } from '../face'
import CalendarScreen from './CalendarScreen'

export const metadata: Metadata = { title: 'Calendar', robots: { index: false, follow: false } }

/**
 * The club's Calendar for its members (D286, Ross, 22 Nov 2026): Month,
 * Week and Day, everything on at the club with each member's own line —
 * booked, Book now, not open yet, not for them. Home's, so the club footer
 * keeps Home lit. The frame is drawn on the server; the calendar asks for
 * its days after paint (the server cannot see who is holding the phone).
 */
export default async function CalendarRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const face = await readFace(slug, { events: false })
  if (!face) notFound()
  const { id, ...clubFace } = face
  return (
    <main data-club style={clubFace.style as React.CSSProperties} className="min-h-dvh paper relative isolate has-tabbar">
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-3xl mx-auto px-4 pt-3 pb-10">
          <div className="max-w-md mx-auto md:max-w-none"><ClubHeader face={clubFace} members /></div>
          <CalendarScreen clubId={id} slug={slug} />
        </div>
      </div>
    </main>
  )
}
