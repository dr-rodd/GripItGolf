import EventPage from '@/app/golf/[root]/[tripCode]/organiser/bracket/page'
import { inClub, playMetadata } from '../../inClub'

/** The bracket setup, inside the club (D284): the event's own screen under the club's footer. */

export const dynamic = 'force-dynamic'
export const metadata = playMetadata

export default function Page({ params }: { params: Promise<{ slug: string; code: string }> }) {
  return inClub(params, p => <EventPage params={p} />)
}
