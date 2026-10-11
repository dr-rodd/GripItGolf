import Link from 'next/link'
import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { describeRange } from '@/lib/confirmationEmail'
import { todayString } from '@/lib/tripStatus'
import { isRunChallenge, describeProgress } from '@/lib/runChallenge'
import { fetchRunChallenge } from './data'
import { TeamsList, RulesSummary, SectionTitle } from './RunPieces'
import RunShare from './RunShare'

export const dynamic = 'force-dynamic'

/**
 * A run challenge's home — the address the code, the email and the share
 * link all lead to.
 *
 * The first stage of Green Dot Run: what the challenge is, when, the code
 * to pass round, the teams and who is on them, and how runs earn points.
 * Joining, logging runs and the leaderboard are the stages that follow, and
 * the page says so rather than offering buttons that go nowhere.
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

  const dates = describeRange(challenge.startDate, challenge.endDate)
  const progress = describeProgress(challenge.startDate, challenge.endDate, todayString(new Date()))
  const runners = challenge.teams.reduce((n, t) => n + t.members.length, 0) + challenge.unassigned.length

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

        <RunShare code={challenge.code} name={challenge.name} />

        <section>
          <SectionTitle>
            Teams · {runners === 1 ? '1 runner' : `${runners} runners`}
          </SectionTitle>
          <TeamsList teams={challenge.teams} unassigned={challenge.unassigned} />
        </section>

        <section>
          <SectionTitle>How points work</SectionTitle>
          <RulesSummary setup={challenge.setup} />
        </section>

        <div className="px-4 py-3.5 bg-accent/[0.08] border border-accent/30 rounded-xl">
          <p className="text-ink text-sm font-medium">Coming next</p>
          <p className="text-ink/80 text-[13px] mt-0.5 leading-snug">
            Joining a team, logging runs by hand or from Strava, and the
            leaderboard.
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
