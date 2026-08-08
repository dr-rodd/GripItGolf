import TripHeader from '@/app/components/TripHeader'

/**
 * The scorecard, before it has the card.
 *
 * Without this file the round picker's own skeleton would stand in for this
 * screen — a loading file covers the segments below it as well as its own —
 * and three round tiles is exactly the wrong promise to make about a
 * scorecard. The eye would follow them into place and then have the whole
 * screen replaced.
 *
 * So: the two things every scorecard has in the same place, and nothing
 * else. A player strip across the top, and the hole below it. What fills the
 * hole depends on how many are on the card and whether the trip is tracking
 * stats, and none of that is knowable here — `loading.tsx` is handed no
 * params, so this file does not even know which round it is.
 *
 * This screen has the most to gain from arriving instantly. It is opened
 * walking to a tee, on a phone, on course reception wifi, and a tap that
 * appears to do nothing gets tapped again.
 */
export default function ScorecardLoading() {
  return (
    <div className="min-h-dvh bg-cream text-ink">
      <TripHeader title="scoring" />

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading the scorecard"
      >
        {/* The course, then the players across the card */}
        <div className="skeleton h-6 w-48 mb-5" />
        <div className="flex gap-2 mb-6">
          <div className="skeleton h-10 flex-1 rounded-xl" />
          <div className="skeleton h-10 flex-1 rounded-xl" />
          <div className="skeleton h-10 flex-1 rounded-xl" />
          <div className="skeleton h-10 flex-1 rounded-xl" />
        </div>

        {/* The hole */}
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    </div>
  )
}
