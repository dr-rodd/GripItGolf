import { redirect } from 'next/navigation'
import { tripHomeAt } from '@/lib/tripPaths'

/**
 * The draw used to be its own page; it is the first step of the bracket's
 * flow now (organiser/bracket, Ross, 5 Nov 2026). Old links land there.
 */
export default async function DrawPage({ params }: { params: Promise<{ root: string; tripCode: string }> }) {
  const { root, tripCode } = await params
  const tripHome = tripHomeAt(root, tripCode)
  redirect(`${tripHome}/organiser/bracket`)
}
