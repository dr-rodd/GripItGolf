import TripHeader from '@/app/components/TripHeader'

/**
 * The round picker, before it knows which rounds there are.
 *
 * Three tiles at the height the real ones come in at. This is the screen a
 * group hits walking to the first tee, so it is the one where a tap that
 * appears to do nothing is most likely to be tapped again — which opens the
 * scorecard twice.
 *
 * Only this screen, despite a loading file normally covering the segments
 * below it too: the scorecard at `/scoring/[roundNumber]` keeps its own, or
 * tapping a tile here would draw three more tiles on the way to something
 * shaped nothing like them.
 */
export default function ScoringLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar text-ink">
      <TripHeader title="scoring" />

      <div
        className="max-w-lg mx-auto px-4 py-6"
        role="status"
        aria-busy="true"
        aria-label="Loading the rounds"
      >
        <div className="skeleton h-4 w-32 mb-4" />

        <div className="flex flex-col gap-3">
          <div className="skeleton h-[92px] rounded-2xl" />
          <div className="skeleton h-[92px] rounded-2xl" />
          <div className="skeleton h-[92px] rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
