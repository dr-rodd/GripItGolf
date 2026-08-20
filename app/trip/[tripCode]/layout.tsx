import { cache } from 'react'
import TabBar from '@/app/components/TabBar'
import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'

/**
 * Everything under `/trip/[tripCode]`, with the bottom bar around it.
 *
 * The bar used to be the last line of all ten pages. Ten copies was the
 * smaller half of the problem: a component rendered *by* a page unmounts
 * when that page does, so tapping a tab tore the bar off the screen and drew
 * a new one once the next page was ready. On a slow query that is the bar
 * disappearing for a second or two, on the one screen element that is meant
 * to be nailed down. Rendered here it is drawn once and never again, and a
 * navigation swaps only what is above it.
 *
 * That is also what lets `loading.tsx` be worth having. A loading file
 * replaces the page, not the layout, so the skeleton appears *inside* the
 * chrome rather than instead of it.
 *
 * It fetches exactly one thing, and the budget for that was argued over:
 * this layout used to fetch nothing at all, so that no tab prefetch paid
 * for it. What the bar draws now depends on the trip's kind — an event
 * hides Trip Setup from the field — and the layout is the only place that
 * knows before the bar first paints. The query is one indexed column, it
 * runs in parallel with the page's own queries on the render they share,
 * and the layout persists across tab navigations, so a tab press inside
 * the trip never re-pays it. Nothing heavier belongs here.
 */

/** The kind, once per request — and fail-soft: no column, no kind, a trip. */
const fetchKind = cache(async (tripCode: string): Promise<string | null> => {
  const { data } = await supabase
    .from('trips')
    .select('kind')
    .eq('trip_code', tripCode)
    .single()
  return (data as { kind?: string } | null)?.kind ?? null
})

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const kind = await fetchKind(tripCode)

  return (
    <>
      {children}
      <TabBar tripCode={tripCode} isEvent={isEvent(kind)} />
    </>
  )
}
