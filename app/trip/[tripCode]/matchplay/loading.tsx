import TripHeader from '@/app/components/TripHeader'

/**
 * The bracket, before it is read.
 *
 * The slowest page in the trip after the leaderboard, and a nested waterfall:
 * the trip, then four queries, then the linked rounds, then seven more. It
 * had no loading file of its own and fell back to the generic three cards,
 * which promise a list where this draws a titled bar over a column of ties.
 *
 * Deliberately vague below the bar. A bracket's shape is the one thing this
 * screen cannot guess — a field of seven and a field of thirty-two are
 * different heights and different numbers of rounds — so it commits to the
 * title row, which is always there, and one block of roughly a draw's size
 * rather than a fixed number of match tiles that would then be wrong.
 *
 * No `backTo` and no `BackButton` href: a loading file is handed no params.
 */
export default function MatchplayLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar text-ink">
      <TripHeader />

      {/* The title bar, which every state of this page draws */}
      <div className="bg-cream border-b border-bark/12">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-center">
          <div className="skeleton h-6 w-32" />
        </div>
      </div>

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading the bracket"
      >
        <div className="skeleton h-4 w-28 mb-4" />
        <div className="skeleton h-[220px] rounded-2xl" />
      </div>
    </div>
  )
}
