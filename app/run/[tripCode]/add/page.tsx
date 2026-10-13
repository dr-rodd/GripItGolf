import Link from 'next/link'
import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { currentPlayer } from '@/lib/currentPlayer'
import { isRunChallenge, runPoints, formatPoints, closesOn } from '@/lib/runChallenge'
import { todayString } from '@/lib/tripStatus'
import { ordinal, formatKm } from '@/lib/runBoards'
import { fetchRunChallenge, rosterOf } from '../data'
import { outcomeMessage, isGarmin } from '@/lib/strava'
import { fetchRuns, runsUnavailableMessage, fetchStravaStatus } from '../runs'
import { standingsOf } from '../standings'
import { ChallengeNotFound, Notice } from '../RunPieces'
import StravaCard from '../StravaCard'
import RunAddClient from './RunAddClient'

export const dynamic = 'force-dynamic'

/**
 * The Add tab — where a runner logs a run, sees their own runs, and
 * where Strava is connected, checked and disconnected (StravaCard). Strava's
 * callback sends the runner back here with `?strava=<outcome>`, said as a
 * sentence on the card.
 *
 * Personalised from the player cookie: a phone that has not joined is sent
 * to join first, because a run has to belong to somebody on a team. The
 * runs are read on the server (the table is closed to the browser) and
 * only this runner's are sent to the phone.
 */
export default async function RunAddPage({ params, searchParams }: {
  params: Promise<{ tripCode: string }>
  searchParams: Promise<{ strava?: string }>
}) {
  const [{ tripCode }, { strava }] = await Promise.all([params, searchParams])
  const challenge = await fetchRunChallenge(tripCode)
  if (!challenge) return <ChallengeNotFound />
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}`)

  const roster = rosterOf(challenge)
  const [read, viewer] = await Promise.all([
    fetchRuns(challenge.id),
    currentPlayer(challenge.code, roster),
  ])
  const stravaStatus = await fetchStravaStatus(challenge.id, viewer?.id ?? null)

  // Past the last day for late runs — or frozen — nothing new comes in:
  // the runs route and the connect route refuse on the same test.
  const today = todayString(new Date())
  const closed = !!challenge.final || (!!challenge.endDate && today > closesOn(challenge.endDate))

  const mine = viewer ? read.runs.filter(r => r.playerId === viewer.id) : []
  const me = viewer ? standingsOf(challenge, read.runs).individuals.find(l => l.playerId === viewer.id) : null

  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} />
      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter space-y-6">

        {!viewer ? (
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-2">Log a run</h1>
            <p className="text-ink/65 text-sm mb-8">
              Join the challenge first — a run has to belong to somebody on a team.
            </p>
            <Link
              href={`/run/${challenge.code}/join`}
              className="block w-full py-4 bg-accent-deep text-white text-center text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors"
            >
              Join the challenge
            </Link>
          </div>
        ) : !read.ready ? (
          <Notice>{runsUnavailableMessage(read.reason)}</Notice>
        ) : (
          <>
            {me && !challenge.final?.stravaRemoved && (
              <div className="bg-surface border border-bark/12 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="t-cap uppercase tracking-[0.12em] text-ink/65">Your total</p>
                  <p className="text-ink/80 text-sm mt-1">
                    {me.runs > 0
                      ? `${formatKm(me.km)} · ${ordinal(me.place)} of ${roster.length}`
                      : 'No runs yet'}
                  </p>
                </div>
                <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums text-ink">
                  {formatPoints(me.points)}
                  <span className="text-ink/65 text-sm font-normal ml-1">pts</span>
                </p>
              </div>
            )}
            {/* Once final every Strava link to it has ended — nothing to show. */}
            {!challenge.final && (
              <StravaCard
                code={challenge.code}
                status={stravaStatus}
                joined={!!viewer}
                outcome={outcomeMessage(strava)}
                end={challenge.endDate}
                closed={closed}
              />
            )}
            <RunAddClient
              code={challenge.code}
              rules={challenge.setup.rules}
              start={challenge.startDate}
              end={challenge.endDate}
              logRuns={challenge.perms.log_runs}
              closed={closed}
              final={challenge.final ? { stravaRemoved: challenge.final.stravaRemoved } : null}
              myRuns={mine.map(r => ({
                id: r.id,
                date: r.date,
                activity: r.activity,
                km: r.distanceM / 1000,
                minutes: r.minutes,
                source: r.source,
                points: runPoints({ km: r.distanceM / 1000, activity: r.activity }, challenge.setup.rules),
                garmin: isGarmin(r.deviceName) ? r.deviceName : null,
                stravaId: r.source === 'strava' ? r.stravaId : null,
              }))}
            />
          </>
        )}
      </div>
    </main>
  )
}
