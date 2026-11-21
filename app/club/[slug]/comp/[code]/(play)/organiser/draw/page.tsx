import { redirect } from 'next/navigation'
import { compHome } from '@/lib/clubBar'

/** The old draw address, inside the club (D284): on to the bracket setup, as at the event's own. */

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params
  redirect(`${compHome(slug, code)}/organiser/bracket`)
}
