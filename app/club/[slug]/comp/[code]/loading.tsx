import TripHeader from '@/app/components/TripHeader'

/**
 * A competition page not fetched ahead (D198): the tap lands at once on
 * this, under the club footer the layout keeps, until the page arrives.
 * Most taps never see it — the club page and every competition page fetch
 * the competition's pages whole beforehand (`CompAhead`, `prefetchWhole`).
 * Deliberately vague, as the trip screens' stand-in is: a screen's worth of
 * something, never a shape that might jump.
 */
export default function CompLoading() {
  return (
    <div className="min-h-dvh paper has-tabbar text-ink">
      <TripHeader />
      <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10" aria-busy="true" aria-label="Loading">
        <div className="skeleton h-14 rounded-card" />
        <div className="skeleton h-8 w-2/3 mt-6" />
        <div className="skeleton h-4 w-1/2 mt-3" />
        <div className="skeleton h-24 rounded-card mt-6" />
        <div className="skeleton h-24 rounded-card mt-3" />
      </div>
    </div>
  )
}
