import TripHeader from '@/app/components/TripHeader'

/**
 * The leaderboard, before it has any scores in it.
 *
 * Worth its own file rather than the generic one above it: this page is the
 * slowest in the app — nine queries behind one screen — and it is the one
 * whose shape is entirely predictable. A tab strip, then rows. Committing to
 * that means the real board arrives into the outline it was already drawing,
 * rather than replacing something differently shaped.
 *
 * Eight rows because that is roughly a phone's worth. The count does not have
 * to match the field: the list is obviously a placeholder while it pulses,
 * and a skeleton that guesses the exact number of players would be right by
 * accident.
 */
export default function LeaderboardLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar text-ink">
      <TripHeader title="leaderboard" />

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading the leaderboard"
      >
        {/* The board tabs */}
        <div className="flex gap-2 mb-6">
          <div className="skeleton h-9 w-28 rounded-full" />
          <div className="skeleton h-9 w-24 rounded-full" />
          <div className="skeleton h-9 w-20 rounded-full" />
        </div>

        {/* The rows */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-5 w-5 rounded-full flex-shrink-0" />
              <div className="skeleton h-5 flex-1" />
              <div className="skeleton h-5 w-10 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
