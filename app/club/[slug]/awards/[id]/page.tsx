import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { Art } from '../../ClubView'
import { NoBar } from '../../ClubBarContext'
import { readFace } from '../../face'
import AwardStanding from './AwardStanding'

export const dynamic = 'force-dynamic'

/**
 * An award's own page for the club's members (stage 6, P14): the table,
 * this member's line, and each player's results with what each was worth.
 * The frame is drawn on the server; the table is asked for after it paints
 * (the server cannot see who is holding the phone).
 */
export default async function AwardPage({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ year?: string }>
}) {
  const [{ slug, id }, { year }] = await Promise.all([params, searchParams])
  const face = await readFace(slug, { events: false })
  if (!face) notFound()
  const { id: clubId, ...clubFace } = face
  const y = Number(year)
  return (
    <main data-club style={clubFace.style as React.CSSProperties} className="min-h-dvh paper relative isolate">
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pt-1 pb-10">
          <NoBar />
          <AwardStanding clubId={clubId} id={id} slug={slug} year={Number.isInteger(y) && y >= 2000 ? y : null} />
        </div>
      </div>
    </main>
  )
}
