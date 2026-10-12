import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { currentPlayer } from '@/lib/currentPlayer'
import { isRunChallenge, describeRules, describeTeamScore } from '@/lib/runChallenge'
import { fetchRunChallenge, rosterOf } from '../data'
import { fetchRuns, runsUnavailableMessage } from '../runs'
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
 */
export default async function RunLeaderboardPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)
  if (!challenge) return <ChallengeNotFound />
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}/leaderboard`)

  const [read, viewer] = await Promise.all([
    fetchRuns(challenge.id),
    currentPlayer(challenge.code, rosterOf(challenge)),
  ])

  const s = standingsOf(challenge, read.runs)
  const colorOf = new Map(challenge.teams.map(t => [t.id, t.color]))
  const pointsRule = describeRules(challenge.setup.rules).slice(0, 2).join(' ')

  const boards: BoardView[] = challenge.setup.boards.map(b => b.audience === 'team'
    ? {
        id: b.id, kind: 'team', title: 'Teams', byAverage: s.teamScore === 'average',
        rule: describeTeamScore(s.teamScore),
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

  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} title="leaderboard" />
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16 page-enter">
        {read.ready
          ? <RunBoardClient boards={boards} anyRuns={read.runs.length > 0} />
          : <Notice>{runsUnavailableMessage(read.reason)}</Notice>}
      </div>
    </main>
  )
}
