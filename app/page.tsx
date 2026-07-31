import Wordmark from "@/app/components/Wordmark"
import { ButtonLink } from "@/app/components/ui"

/**
 * The entry screen.
 *
 * The wordmark is the page. Below it, one sentence saying what to do, and the
 * two things you can do. Nothing else — no feature list, no marketing.
 *
 * This is one of the few screens that gets generous spacing: the guide
 * reserves that for entry screens and keeps it away from anything holding
 * live data. No tab bar either, since there is no trip to navigate yet.
 */
export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6 py-12 page-enter">
      <div className="w-full max-w-sm flex flex-col items-center">

        <Wordmark width={280} priority className="max-w-full" />

        {/* One line saying what to do next. The buttons sit directly below,
            so it can point at them without naming them twice. */}
        <p className="t-body text-ink/65 text-center text-balance mt-10 max-w-[20rem]">
          Live scoring, leaderboards and matchplay for your golf trip.
          Tap below to start one, or to join a trip you have a code for.
        </p>

        <div className="w-full flex flex-col gap-3 mt-12">
          {/* One primary action per screen — creating is the one */}
          <ButtonLink href="/dashboard/create">Create a trip</ButtonLink>
          <ButtonLink href="/join" variant="secondary">Join a trip</ButtonLink>
        </div>

        <p className="t-cap text-ink/40 text-center mt-12 max-w-[19rem] text-balance">
          Your handicap is the best 8 of your last 20 rounds. On the graph,
          those eight are green dots.
        </p>
      </div>
    </main>
  )
}
