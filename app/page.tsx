import TripHeader, { HeroPin } from "@/app/components/TripHeader"
import { TRAVEL } from "@/app/components/headerMetrics"
import { ButtonLink } from "@/app/components/ui"

/**
 * The entry screen.
 *
 * The wordmark is the page. Below it, one sentence saying what to do, and the
 * two things you can do. Nothing else — no feature list, no marketing.
 *
 * The mark collapses into the header as the page scrolls. This is the one
 * screen where that belongs: it is the only place the mark is the point, and
 * there is nothing here anyone is in a hurry to read past. The trip screens
 * are settled from the first pixel.
 *
 * This is one of the few screens that gets generous spacing: the guide
 * reserves that for entry screens and keeps it away from anything holding
 * live data. No tab bar either, since there is no trip to navigate yet.
 */
export default function Home() {
  return (
    <main
      className="bg-cream page-enter"
      // The page has to stay tall enough to scroll the whole collapse, at
      // every point during it. The spacer HeroPin holds for the mark closes
      // as the mark rises, so a page sized to its content shrinks while it
      // is being scrolled — which caps the scroll, which stalls the
      // animation halfway and strands the mark. A floor of one screen plus
      // the travel cannot do that, and it makes the page's entire scroll
      // range exactly the length of the collapse: you scroll to the end of
      // the animation and the page ends with it.
      style={{ minHeight: `calc(100dvh + ${TRAVEL}px)` }}
    >

      {/* No trip to go back to yet, so the mark is not a link */}
      <TripHeader variant="morph" />

      <HeroPin>
        <div className="px-6 pb-12 flex flex-col items-center">
          <div className="w-full max-w-sm flex flex-col items-center">

            {/* One line saying what to do next. The buttons sit directly below,
                so it can point at them without naming them twice. */}
            <p className="t-body text-ink/65 text-center text-balance max-w-[20rem]">
              Live scoring, leaderboards and matchplay for your golf trip.
              Tap below to start one, or to join a trip you have a code for.
            </p>

            <div className="w-full flex flex-col gap-3 mt-10">
              {/* One primary action per screen — creating is the one */}
              <ButtonLink href="/dashboard/create">Create a trip</ButtonLink>
              <ButtonLink href="/join" variant="secondary">Join a trip</ButtonLink>
            </div>

            <p className="t-cap text-ink/40 text-center mt-12 max-w-[19rem] text-balance">
              Your handicap is the best 8 of your last 20 rounds. On the graph,
              those eight are green dots.
            </p>
          </div>
        </div>
      </HeroPin>
    </main>
  )
}
