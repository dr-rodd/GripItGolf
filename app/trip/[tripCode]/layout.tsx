import TabBar from '@/app/components/TabBar'

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
 * Deliberately not a client component and deliberately not fetching
 * anything: this layout is on the prefetch path for every tab, so anything
 * it awaits beyond `params` is a round trip added to all four of them.
 */
export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  return (
    <>
      {children}
      <TabBar tripCode={tripCode} />
    </>
  )
}
