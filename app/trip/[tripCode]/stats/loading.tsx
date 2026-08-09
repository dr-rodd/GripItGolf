import TripHeader from '@/app/components/TripHeader'

/**
 * The stats hub, before its holes arrive.
 *
 * Now that the bar carries a Stats tab, this file is what makes the tap
 * feel instant — without it Next holds the previous page, fully painted,
 * until the stats queries come back. The outline commits only to what is
 * always true of the page: the two-way choice up top, a row of chips, then
 * boxes. Counts and widths are obviously placeholders while they pulse.
 */
export default function StatsLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar text-ink">
      <TripHeader />

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading the stats"
      >
        {/* Players | Courses */}
        <div className="flex gap-2 mb-3">
          <div className="skeleton h-11 flex-1 rounded-xl" />
          <div className="skeleton h-11 flex-1 rounded-xl" />
        </div>

        {/* The chip row */}
        <div className="flex gap-1.5 mb-6">
          <div className="skeleton h-10 w-24 rounded-xl" />
          <div className="skeleton h-10 w-16 rounded-xl" />
          <div className="skeleton h-10 w-16 rounded-xl" />
          <div className="skeleton h-10 w-16 rounded-xl" />
        </div>

        {/* The boxes */}
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-40 rounded-2xl mb-3" />
        ))}
      </div>
    </div>
  )
}
