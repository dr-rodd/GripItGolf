import TripHeader from '@/app/components/TripHeader'

/**
 * What every trip screen shows while its own data is still coming.
 *
 * This file is the whole reason a tab feels instant. Without a `loading.tsx`
 * anywhere under a route, Next holds the page you are looking at — fully
 * painted, fully interactive — until the *next* page has finished rendering
 * on the server. Every screen here is `force-dynamic` with real queries
 * behind it, so that wait was two or three seconds of a screen that gave no
 * sign of having been tapped. With this file the router commits the
 * navigation on the touch: the bar's active tab moves, the header changes,
 * and this stands in until the page lands.
 *
 * It is also what makes prefetch worth anything. A dynamic route cannot be
 * prefetched whole — the note in docs/design-system.md on the landing page's
 * two static destinations is the same fact from the other end — but the
 * loading state *can* be, because it has no data in it. So the tab bar's
 * links warm this, and arriving costs nothing.
 *
 * Deliberately vague about what is coming. A skeleton that promises a
 * specific shape and is wrong about it is worse than one that promises a
 * screen's worth of something: the eye follows the blocks into place, and
 * blocks that jump somewhere else read as a fault. The three screens with a
 * shape worth committing to — the leaderboard, the round list and setup —
 * carry their own `loading.tsx` beside this one.
 *
 * No header title, so the mark stands in the bar exactly as it does on the
 * hub. A page that names itself overrides this file with its own.
 */
export default function TripLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar text-ink">
      {/* No `backTo`: the link is an invisible overlay on the bar, so leaving
          it out looks identical and only costs a tap target for the second
          this is on screen. `loading.tsx` is handed no params, so there is no
          trip code here to build the href from anyway. */}
      <TripHeader />

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="skeleton h-4 w-32 mb-6" />

        <div className="flex flex-col gap-3">
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
