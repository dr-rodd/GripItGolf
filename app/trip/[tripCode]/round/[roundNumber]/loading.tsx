import TripHeader from '@/app/components/TripHeader'

/**
 * A round summary, before its course is known.
 *
 * Its own file rather than the generic one, because this page's shape is
 * genuinely fixed and the generic one is wrong about it in a way that shows:
 * three cards down the left, where this page is a centred heading over a
 * scorecard. The eye follows blocks into place, and blocks that then jump
 * somewhere else read as a fault.
 *
 * What it promises is only what the page always draws — the round line, the
 * course name, the day, and a card. **Not the result**: that section does not
 * exist at all on a round nobody has played, so drawing a block for it would
 * be a promise broken on exactly the rounds that have no result. It arrives
 * on its own behind a `<Suspense>` in the page — see the note there.
 *
 * No `backTo` on the header: a loading file is handed no params, so there is
 * no trip code to build the href from. The back link is an invisible overlay,
 * so leaving it out looks identical.
 */
export default function RoundSummaryLoading() {
  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader />

      <div
        className="max-w-lg mx-auto px-4 pt-4 pb-6 flex flex-col gap-8"
        role="status"
        aria-busy="true"
        aria-label="Loading the round"
      >
        {/* The course, the day — centred, as the page has it */}
        <header className="flex flex-col items-center gap-2 pt-6">
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-7 w-56" />
          <div className="skeleton h-3.5 w-32" />
        </header>

        {/* The card. One block at a scorecard's height rather than eighteen
            rows: the rows differ by course and a wrong count is a jump. */}
        <div className="skeleton h-[280px] rounded-2xl" />

        {/* The tees */}
        <div className="flex flex-col gap-2">
          <div className="skeleton h-5 w-24 mb-1" />
          <div className="skeleton h-11 rounded-xl" />
          <div className="skeleton h-11 rounded-xl" />
        </div>
      </div>
    </main>
  )
}
