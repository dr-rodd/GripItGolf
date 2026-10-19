import CountUp from '@/app/components/CountUp'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { currentPlayer } from '@/lib/currentPlayer'
import { isRunChallenge, runPoints, closesOn } from '@/lib/runChallenge'
import { todayString } from '@/lib/tripStatus'
import { ordinal, formatKm } from '@/lib/runBoards'
import { fetchRunChallenge, rosterOf } from '../data'
import { outcomeMessage, isGarmin } from '@/lib/strava'
import { fetchBoardRuns, runsUnavailableMessage, fetchStravaStatus } from '../runs'
import { standingsOf } from '../standings'
import { ChallengeNotFound, Notice } from '../RunPieces'
import StravaCard from '../StravaCard'
import RunAddClient from './RunAddClient'
import { buttonClass, cardClass } from '@/app/components/ui'

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
  // The viewer first — the cookie alone, no database — so their own runs are
  // read fresh: the list below is theirs, whole, and their total moves the
  // moment they log a run, whatever the server's copy of everybody else's
  // says (../runs.ts).
  const viewer = await currentPlayer(challenge.code, roster)
  const [read, stravaStatus] = await Promise.all([
    fetchBoardRuns(challenge.id, viewer?.id ?? null),
    fetchStravaStatus(challenge.id, viewer?.id ?? null),
  ])

  // Past the last day for late runs — or frozen — nothing new comes in:
  // the runs route and the connect route refuse on the same test.
  const today = todayString(new Date())
  const closed = !!challenge.final || (!!challenge.endDate && today > closesOn(challenge.endDate))

  const mine = read.mine
  const me = viewer ? standingsOf(challenge, read.runs).individuals.find(l => l.playerId === viewer.id) : null

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} />
      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter space-y-6">

        {!viewer ? (
          <div>
            <h1 className="t-h1 text-ink mb-2">Log a run</h1>
            <p className="text-[17px] leading-snug text-ink/65 mb-8">
              Join the challenge first. A run belongs to someone on a team.
            </p>
            <Link
              href={`/run/${challenge.code}/join`}
              className={buttonClass('primary')}
            >
              Join the challenge
            </Link>
          </div>
        ) : !read.ready ? (
          <Notice>{runsUnavailableMessage(read.reason)}</Notice>
        ) : (
          <>
            {me && !challenge.final?.stravaRemoved && (
              <div className={`p-5 flex items-center justify-between gap-4 ${cardClass()}`}>
                <div className="min-w-0">
                  <p className="t-cap text-ink/65">Your total</p>
                  <p className="text-ink/80 text-sm mt-1">
                    {me.runs > 0
                      ? `${formatKm(me.km)} · ${ordinal(me.place)} of ${roster.length}`
                      : 'No runs yet'}
                  </p>
                </div>
                <p className="font-serif text-3xl font-semibold tabular-nums text-ink">
                  {/* Counts up after a run is logged, never on a board (D10). */}
                  <CountUp value={me.points} decimals={1} />
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
