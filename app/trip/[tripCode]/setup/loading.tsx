import TripHeader from '@/app/components/TripHeader'

/**
 * Trip Setup, before it has the trip.
 *
 * Its own file only so the header carries the right word. The screen behind
 * it is a stack of sections whose heights depend on what the trip has in it,
 * so the body stays as vague as the generic skeleton — see the note there on
 * why a wrong shape is worse than a loose one.
 *
 * "settings" is the header's artwork key, not the screen's name: the screen
 * is Trip Setup, and Trip Settings is the drawer inside it. The mark is a
 * fixed piece of artwork and predates that distinction.
 */
export default function SetupLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar text-ink">
      <TripHeader title="settings" />

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading Trip Setup"
      >
        <div className="skeleton h-4 w-40 mb-6" />

        <div className="flex flex-col gap-3">
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-16 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
