import Link from 'next/link'
import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { describeRange } from '@/lib/confirmationEmail'
import { todayString } from '@/lib/tripStatus'
import { currentPlayer } from '@/lib/currentPlayer'
import {
  isRunChallenge, describeProgress, challengeFinished, formatPoints, challengePhase, closesOn, describeDay,
} from '@/lib/runChallenge'
import { ordinal } from '@/lib/runBoards'
import { fetchRunChallenge, rosterOf } from './data'
import { fetchBoardRuns } from './runs'
import { standingsOf } from './standings'
import { TeamsList, RulesSummary, SectionTitle, ChallengeNotFound } from './RunPieces'
import RunShare from './RunShare'
import LegalLinks from '@/app/components/LegalLinks'

export const dynamic = 'force-dynamic'

/**
 * A run challenge's home — the address the code, the email and the share
 * link all lead to.
 *
 * What the challenge is, when, who is leading, the code to pass round, the
 * teams and how runs earn points — and, for whoever holds this phone,
 * either the way in (Join the challenge) or where they stand (their team,
 * points and place). Standings come through lib/runBoards.ts, the same as
 * the leaderboard's, read on the server from runs the browser never sees.
 *
 * Personalised from the cookie, so anything that changes it must
 * `router.refresh()` before coming back here (lib/currentPlayer.ts).
 *
 * Once the finish has passed it says how long late runs still count; once
 * final, the frozen team standings take the place of the live ones, since
 * the Strava runs behind the live ones have been deleted.
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

  if (!challenge) return <ChallengeNotFound />
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}`)

  const today = todayString(new Date())
  const dates = describeRange(challenge.startDate, challenge.endDate)
  const progress = describeProgress(challenge.startDate, challenge.endDate, today)
  const roster = rosterOf(challenge)
  const runners = roster.length
  // The viewer first — the cookie alone, no database — so their own runs are
  // read fresh over the server's few-minutes copy of everybody's (./runs.ts).
  const viewer = await currentPlayer(challenge.code, roster)
  const read = await fetchBoardRuns(challenge.id, viewer?.id ?? null)
  const viewerTeam = challenge.teams.find(t => t.id === viewer?.teamId) ?? null
  const finished = challengeFinished(challenge.endDate, today)
  const standings = read.ready ? standingsOf(challenge, read.runs) : null
  const me = standings?.individuals.find(l => l.playerId === viewer?.id) ?? null
  const anyRuns = read.runs.length > 0
  const final = challenge.final
  const phase = challengePhase(challenge.startDate, challenge.endDate, today, !!final)

  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo="/" />

      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter space-y-8">

        <div>
          <p className="t-cap uppercase tracking-[0.12em] text-accent-deep mb-1.5">Green Dot Run</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink leading-tight">
            {challenge.name}
          </h1>
          <p className="text-ink/65 text-sm mt-1.5">
            {[dates, final ? 'Final' : progress].filter(Boolean).join(' · ')}
          </p>
          {phase === 'closing' && challenge.endDate && (
            <p className="text-ink/65 text-[13px] mt-1 leading-snug">
              Late runs still count until {describeDay(closesOn(challenge.endDate))}, when the
              standings are frozen.
            </p>
          )}
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
            {/* Not once the Strava runs behind it are gone — it would be wrong. */}
            {me && !final?.stravaRemoved && (
              <p className="text-ink/80 text-sm mt-1">
                {me.runs > 0
                  ? `${formatPoints(me.points)} pts · ${ordinal(me.place)} of ${runners}`
                  : 'No runs yet — log your first on the Add tab.'}
              </p>
            )}
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

        {/* Final: the frozen team standings, the result that stays. */}
        {final && final.teams.length > 0 && (
          <section>
            <SectionTitle>Final standings</SectionTitle>
            <div className="bg-surface border border-bark/12 rounded-2xl p-4 space-y-3">
              {final.teams.map((t, i) => (
                <div key={`${t.name}-${i}`} className="flex items-center gap-3">
                  <span className="t-cap text-ink/65 tabular-nums w-6">{t.place}</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} aria-hidden="true" />
                  <span className="text-ink text-sm flex-1 min-w-0 truncate">{t.name}</span>
                  <span className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-ink">
                    {formatPoints(t.score)}
                  </span>
                </div>
              ))}
              <p className="text-ink/65 text-[13px] pt-3 border-t border-bark/12 leading-snug">
                {final.teamScore === 'average' ? 'Average points per runner. ' : 'Total points. '}
                Frozen on {describeDay(final.frozenOn)}.
              </p>
            </div>
            <Link
              href={`/run/${challenge.code}/leaderboard`}
              className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-2.5"
            >
              Full leaderboard →
            </Link>
          </section>
        )}

        {/* Who is leading — a glance, with the full board a tap away. */}
        {!final && standings && anyRuns && (
          <section>
            <SectionTitle>Leading</SectionTitle>
            <div className="bg-surface border border-bark/12 rounded-2xl p-4 space-y-3">
              {standings.individuals.slice(0, 3).filter(l => l.points > 0).map(l => (
                <div key={l.playerId} className="flex items-center gap-3">
                  <span className="t-cap text-ink/65 tabular-nums w-6">{l.place}</span>
                  <span className="text-ink text-sm flex-1 min-w-0 truncate">{l.display}</span>
                  <span className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-ink">
                    {formatPoints(l.points)}
                  </span>
                </div>
              ))}
              {standings.teams[0] && standings.teams[0].score > 0 && (
                <p className="text-ink/80 text-[13px] pt-3 border-t border-bark/12 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: standings.teams[0].color }} aria-hidden="true" />
                  {standings.teams[0].name} lead the teams
                  {standings.teamScore === 'average'
                    ? ` · ${formatPoints(standings.teams[0].average)} per runner`
                    : ` · ${formatPoints(standings.teams[0].total)} pts`}
                </p>
              )}
            </div>
            <Link
              href={`/run/${challenge.code}/leaderboard`}
              className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-2.5"
            >
              Full leaderboard →
            </Link>
          </section>
        )}

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

        <LegalLinks />

      </div>
    </main>
  )
}
