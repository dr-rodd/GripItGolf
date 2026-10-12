import Link from 'next/link'
import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { describeRange } from '@/lib/confirmationEmail'
import { todayString } from '@/lib/tripStatus'
import { currentPlayer } from '@/lib/currentPlayer'
import { isRunChallenge, describeProgress, challengeFinished } from '@/lib/runChallenge'
import { fetchRunChallenge, rosterOf } from './data'
import { TeamsList, RulesSummary, SectionTitle } from './RunPieces'
import RunShare from './RunShare'

export const dynamic = 'force-dynamic'

/**
 * A run challenge's home — the address the code, the email and the share
 * link all lead to.
 *
 * What the challenge is, when, the code to pass round, the teams and who is
 * on them, and how runs earn points — and, for whoever holds this phone,
 * either the way in (Join the challenge) or where they stand (the team they
 * run for). Logging runs and the leaderboard are the stages that follow, and
 * the page says so rather than offering buttons that go nowhere.
 *
 * Personalised from the cookie, so anything that changes it must
 * `router.refresh()` before coming back here (lib/currentPlayer.ts).
 *
 * Golf trips are sent to their own hub — this route only ever renders a
 * run challenge — and `/trip/[code]` sends run challenges here, so either
 * address reaches the right page.
 */
export default async function RunHubPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)

  if (!challenge) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
          Challenge not found
        </p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}`)

  const today = todayString(new Date())
  const dates = describeRange(challenge.startDate, challenge.endDate)
  const progress = describeProgress(challenge.startDate, challenge.endDate, today)
  const roster = rosterOf(challenge)
  const runners = roster.length
  const viewer = await currentPlayer(challenge.code, roster)
  const viewerTeam = challenge.teams.find(t => t.id === viewer?.teamId) ?? null
  const finished = challengeFinished(challenge.endDate, today)

  return (
    <main className="min-h-dvh bg-cream">
      <TripHeader backTo="/" />

      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter space-y-8">

        <div>
          <p className="t-cap uppercase tracking-[0.12em] text-accent-deep mb-1.5">Green Dot Run</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink leading-tight">
            {challenge.name}
          </h1>
          <p className="text-ink/65 text-sm mt-1.5">
            {[dates, progress].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* Who this phone is — or the way in. */}
        {viewer ? (
          <div className="bg-surface border border-bark/12 rounded-2xl p-5">
            <p className="text-ink text-base font-medium">You&apos;re in, {viewer.name}.</p>
            <p className="text-ink/80 text-sm mt-1 flex items-center gap-2">
              {viewerTeam ? (
                <>
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: viewerTeam.color }}
                    aria-hidden="true"
                  />
                  Running for {viewerTeam.name}
                </>
              ) : (
                'No team yet — ask the organiser to put you on one.'
              )}
            </p>
            <Link
              href={`/run/${challenge.code}/join`}
              className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-3"
            >
              Not you?
            </Link>
          </div>
        ) : !finished ? (
          <Link
            href={`/run/${challenge.code}/join`}
            className="block w-full py-4 bg-accent-deep text-white text-center text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors"
          >
            Join the challenge
          </Link>
        ) : null}

        <RunShare code={challenge.code} name={challenge.name} />

        <section>
          <SectionTitle>
            Teams · {runners === 1 ? '1 runner' : `${runners} runners`}
          </SectionTitle>
          <TeamsList teams={challenge.teams} unassigned={challenge.unassigned} viewerId={viewer?.id ?? null} />
        </section>

        <section>
          <SectionTitle>How points work</SectionTitle>
          <RulesSummary setup={challenge.setup} />
        </section>

        <div className="px-4 py-3.5 bg-accent/[0.08] border border-accent/30 rounded-xl">
          <p className="text-ink text-sm font-medium">Coming next</p>
          <p className="text-ink/80 text-[13px] mt-0.5 leading-snug">
            Logging runs by hand or from Strava, and the leaderboard.
          </p>
        </div>

        <div className="text-center">
          <Link
            href={`/run/${challenge.code}/organiser`}
            className="t-cap text-accent-deep hover:text-accent transition-colors"
          >
            Organiser area →
          </Link>
        </div>
      </div>
    </main>
  )
}
