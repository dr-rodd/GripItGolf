import { redirect } from 'next/navigation'
import { compSectionHref } from '@/lib/clubBar'
import { tripBase } from '@/lib/tripPaths'

/**
 * Any other screen a competition's pages link to (D284): the event's own
 * tee sheet tab is the competition's Tee times; anything the club does not
 * mount — a round summary, the teams, a player's settings — opens at the
 * event's own address, which the club never sends back here, so nothing
 * loops. Read only from the address: the screen it lands on keeps its own door.
 */

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ slug: string; code: string; rest: string[] }> }) {
  const { slug, code, rest } = await params
  if (rest.length === 1 && rest[0] === 'teesheet') redirect(compSectionHref(slug, code, 'tee'))
  redirect(`${tripBase(code.toUpperCase(), 'tournament')}/${rest.map(encodeURIComponent).join('/')}`)
}
