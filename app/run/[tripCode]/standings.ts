import { boardNames } from '@/lib/displayNames'
import {
  type BoardRun, type RunnerLine, type TeamLine,
  runnerTotals, individualBoard, teamBoard,
} from '@/lib/runBoards'
import type { TeamScore } from '@/lib/runChallenge'
import { type RunChallenge, rosterOf } from './data'

/**
 * A challenge and its runs, as standings — the one assembly every run
 * screen uses (the leaderboard, the home page, the Add tab). Deciding is
 * lib/runBoards.ts's; this only hands it the challenge's own pieces, and
 * prints names the way every golf board does (lib/displayNames.ts).
 */
export type Standings = {
  individuals: (RunnerLine & { display: string })[]
  teams: TeamLine[]
  teamScore: TeamScore
}

export function standingsOf(c: RunChallenge, runs: BoardRun[]): Standings {
  const roster = rosterOf(c)
  const names = boardNames(roster)
  const totals = runnerTotals(runs, c.setup.rules, { start: c.startDate, end: c.endDate })
  const teamScore = c.setup.boards.find(b => b.audience === 'team')?.teamScore ?? 'average'

  return {
    individuals: individualBoard(
      roster.map(r => ({ id: r.id, name: r.name, teamId: r.teamId })),
      totals,
    ).map(l => ({ ...l, display: names.get(l.playerId) ?? l.name })),
    teams: teamBoard(
      c.teams.map(t => ({ id: t.id, name: t.name, color: t.color, memberIds: t.members.map(m => m.id) })),
      totals,
      teamScore,
    ),
    teamScore,
  }
}
