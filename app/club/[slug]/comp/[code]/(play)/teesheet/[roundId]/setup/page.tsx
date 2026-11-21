import EventPage from '@/app/golf/[root]/[tripCode]/teesheet/[roundId]/setup/page'
import { inClub, playMetadata } from '../../../inClub'

/** The tee sheet wizard, inside the club (D284): the event's own screen under the club's footer. */

export const dynamic = 'force-dynamic'
export const metadata = playMetadata

export default function Page({ params, searchParams }: { params: Promise<{ slug: string; code: string; roundId: string }>; searchParams: Promise<any> }) {
  return inClub(params, p => <EventPage params={p} searchParams={searchParams} />)
}
