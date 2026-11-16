import { boardFacts } from '@/lib/leaderboards'
import { buildRows } from '@/lib/boardRows'
import { buildRowContext, liveRoundPresence, type OpenCard } from '@/lib/rowContext'
import { boardNames } from '@/lib/displayNames'
import { boardCopy } from '@/app/golf/[root]/[tripCode]/leaderboard/boardCopy'

export interface SummaryRow { id: string; place: number; name: string; total: number }

/**
 * What the Summary shows of the board (D186): its format as facts
 * ("Stableford · 95% handicap") and, while there are cards, the top three —
 * from the board's shared server copy (D91), the same rows the leaderboard
 * ranks, never a second ordering. A failed read costs the Summary these
 * lines, never the page.
 */
export async function summaryBoard(code: string, withRows: boolean): Promise<{
  format: string | null; unit: string; rows: SummaryRow[]
}> {
  const copy = await boardCopy(code).catch(() => null)
  const board = copy && !copy.bracket ? copy.boards[0] ?? null : null
  if (!copy || copy.bracket || !board) return { format: null, unit: '', rows: [] }
  const facts = boardFacts(board)
  const format = [facts[0], facts.find(f => f.includes('%'))].filter(Boolean).join(' · ') || null
  const unit = board.scoring === 'stableford' ? 'pts' : ''
  if (!withRows) return { format, unit, rows: [] }

  const { activeRoundIds, livePlayerIds } = liveRoundPresence(copy.open as unknown as OpenCard[])
  const ctx = buildRowContext({
    players: copy.players, teams: copy.teams, memberships: copy.memberships, holes: copy.holes, rounds: copy.rounds,
    courseByRound: new Map(copy.rounds.map(r => [r.id, r.courses?.id ?? ''])),
    scores: copy.scores, liveScores: copy.liveScores, roundHandicaps: copy.hcps, tees: copy.tees,
    activeRoundIds, livePlayerIds, legacyTeamScoring: null,
  })
  const names = boardNames(copy.players as { id: string; name: string }[])
  const rows = buildRows(board, ctx)
    .filter(r => r.playedRounds.length > 0)
    .slice(0, 3)
    .map(r => ({ id: r.id, place: r.place, name: names.get(r.id) ?? r.name, total: r.total }))
  return { format, unit, rows }
}
