import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { currentPlayer } from '@/lib/currentPlayer'
import { isRunChallenge, ruleFacts, teamScoreFact, describeDay } from '@/lib/runChallenge'
import { fetchRunChallenge, rosterOf } from '../data'
import { fetchBoardRuns, runsUnavailableMessage } from '../runs'
import { standingsOf } from '../standings'
import { ChallengeNotFound, Notice } from '../RunPieces'
import RunBoardClient, { type BoardView } from './RunBoardClient'

export const dynamic = 'force-dynamic'

/**
 * The run challenge's leaderboard — the centre tab.
 *
 * Read and decided on the server: the challenge and its runs (the runs on
 * the service role — the table is closed to the browser), every total and
 * place through lib/runBoards.ts. What reaches the phone is the boards'
 * rows and nothing more: totals for everybody, never anybody's runs.
 *
 * One board per entry in the challenge's setup, in its order — runners and
 * teams to start with, and a sub-leaderboard later is one more entry.
 *
 * **Once final** the team board is the frozen one (`trips.run_results`,
 * app/api/run/finalise.ts), whatever the runs now say — the Strava runs
 * that decided it have been deleted, as the runners agreed when they
 * connected. The runners board survives only when no Strava run was ever
 * part of it; otherwise it would be re-telling the race from the typed-in
 * runs alone, which is a result nobody ran.
 *
 * Strava's API Policy (§4.4) wants Garmin-recorded data credited where it
 * is shown, so a board built partly from Garmin runs says so beneath it.
 */
export default async function RunLeaderboardPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)
  if (!challenge) return <ChallengeNotFound />
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}/leaderboard`)

  // Who is looking first — the cookie alone, no database — so their own runs
  // can be read fresh over the server's few-minutes copy (../runs.ts).
  const viewer = await currentPlayer(challenge.code, rosterOf(challenge))
  const read = await fetchBoardRuns(challenge.id, viewer?.id ?? null)

  const s = standingsOf(challenge, read.runs)
  const colorOf = new Map(challenge.teams.map(t => [t.id, t.color]))
  // A board's line is facts joined by a middle dot, as golf's are.
  const pointsRule = ruleFacts(challenge.setup.rules).join(' · ')

  const live: BoardView[] = challenge.setup.boards.map(b => b.audience === 'team'
    ? {
        id: b.id, kind: 'team', title: 'Teams', byAverage: s.teamScore === 'average',
        rule: teamScoreFact(s.teamScore),
        rows: s.teams.map(t => ({
          id: t.teamId, place: t.place, name: t.name, color: t.color,
          score: t.score, total: t.total, average: t.average, members: t.members, km: t.km,
          isViewer: !!viewer && viewer.teamId === t.teamId,
        })),
      }
    : {
        id: b.id, kind: 'individual', title: 'Runners', rule: pointsRule,
        rows: s.individuals.map(r => ({
          id: r.playerId, place: r.place, name: r.display,
          color: r.teamId ? colorOf.get(r.teamId) ?? null : null,
          points: r.points, km: r.km, runs: r.runs,
          isViewer: viewer?.id === r.playerId,
        })),
      })

  const viewerTeam = challenge.teams.find(t => t.id === viewer?.teamId)?.name ?? null
  const final = challenge.final
  const boards: BoardView[] = final
    ? [
        {
          id: 'final', kind: 'team', title: 'Teams', byAverage: final.teamScore === 'average',
          rule: teamScoreFact(final.teamScore),
          rows: final.teams.map((t, i) => ({
            id: `final-${i}`, place: t.place, name: t.name, color: t.color,
            score: t.score, total: t.total, average: t.average, members: t.members, km: t.km,
            isViewer: viewerTeam === t.name,
          })),
        },
        ...(final.stravaRemoved ? [] : live.filter(b => b.kind === 'individual')),
      ]
    : live
  const garmin = final ? final.garmin : read.garmin
  // A frozen result built partly from Strava runs still came from Strava.
  const strava = final ? final.stravaRemoved : read.runs.some(r => r.source === 'strava')

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} title="leaderboard" />
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16 page-enter">
        {final && (
          <div className="mb-5 px-4 py-3.5 bg-accent/[0.08] border border-accent/30 rounded-xl">
            <p className="text-ink text-sm font-medium">Final</p>
            <p className="text-ink/80 text-[13px] mt-0.5 leading-snug">
              The standings were frozen on {describeDay(final.frozenOn)}.
              {final.stravaRemoved
                ? ' The Strava runs behind them have since been deleted, as agreed when they were connected — so the team totals are kept, and each runner\'s are not.'
                : ''}
            </p>
          </div>
        )}
        {final || read.ready
          ? <RunBoardClient boards={boards} anyRuns={!!final || read.runs.length > 0} garmin={garmin} strava={strava} />
          : <Notice>{runsUnavailableMessage(read.reason)}</Notice>}
      </div>
    </main>
  )
}
