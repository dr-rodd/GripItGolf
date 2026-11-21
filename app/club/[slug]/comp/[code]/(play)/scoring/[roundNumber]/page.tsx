import EventPage from '@/app/golf/[root]/[tripCode]/scoring/[roundNumber]/page'
import { inClub, playMetadata } from '../../inClub'

/** The scorecard, inside the club (D284): the event's own screen under the club's footer. */

export const dynamic = 'force-dynamic'
export const metadata = playMetadata

export default function Page({ params }: { params: Promise<{ slug: string; code: string; roundNumber: string }> }) {
  return inClub(params, p => <EventPage params={p} />)
}
