'use client'

import { placeClass } from '@/lib/leaderboardStyle'
import { useState } from 'react'
import { formatPoints } from '@/lib/runChallenge'
import { formatKm } from '@/lib/runBoards'
import PoweredByStrava from '@/app/components/PoweredByStrava'
import { Segmented, cardClass } from '@/app/components/ui'

/**
 * The run leaderboard's boards, one at a time — golf's board, in golf's
 * clothes: the strip of board tabs across the top, then one card of rows,
 * each a place, a coloured dot, a name with a grey line beneath it, and the
 * total on the right.
 *
 * Everything here arrives already decided (lib/runBoards.ts, on the server):
 * places, totals, order. This component only chooses which board to show,
 * which is why it is the one part of the page that runs in the browser.
 *
 * Totals only — points, distance, how many runs. No run of anybody else's
 * is ever drawn here (Strava's rules; docs/run.md).
 */

export type RunnerRowView = {
  id: string
  place: number
  name: string
  color: string | null
  points: number
  km: number
  runs: number
  isViewer: boolean
}

export type TeamRowView = {
  id: string
  place: number
  name: string
  color: string
  score: number
  total: number
  average: number
  members: number
  km: number
  isViewer: boolean
}

export type BoardView =
  | { id: string; kind: 'individual'; title: string; rule: string; rows: RunnerRowView[] }
  | { id: string; kind: 'team'; title: string; rule: string; byAverage: boolean; rows: TeamRowView[] }

// A row is the serif by name — the names and numbers on a board are the one
// place it is the point; the headings and tabs around it are sans.
const ROW = 'font-serif flex items-center gap-3 px-3 py-2.5 text-left'
const NAME = 'font-semibold text-[15px] leading-tight text-ink truncate'
const SUB = 'text-ink/65 text-[13px] leading-snug truncate'
const SCORE = 'text-xl font-semibold tabular-nums text-ink flex-shrink-0'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function RunBoardClient({ boards, anyRuns, garmin = false, strava = false }: {
  boards: BoardView[]
  anyRuns: boolean
  /** Some counted runs were recorded on Garmin — Strava's terms ask for the credit. */
  garmin?: boolean
  /** Some counted runs came from Strava — the board carries Strava's logo. */
  strava?: boolean
}) {
  const [activeId, setActiveId] = useState(boards[0]?.id ?? '')
  const board = boards.find(b => b.id === activeId) ?? boards[0]
  if (!board) return null

  return (
    <div>
      {/* ── Which board ── */}
      {boards.length > 1 && (
        <Segmented
          label="Which leaderboard"
          className="mb-4"
          value={board.id}
          onChange={setActiveId}
          options={boards.map(b => ({ value: b.id, label: b.title }))}
        />
      )}

      {board.rule && <p className="t-cap text-ink/65 mb-3">{board.rule}</p>}

      {/* ── The board ── */}
      <div className={`overflow-hidden ${cardClass()}`}>
        <div className="flex items-center gap-3 px-3 py-2 border-b border-line">
          <span className="t-eyebrow text-ink/65 w-6">Pos</span>
          <span className="t-eyebrow text-ink/65 flex-1">{board.kind === 'team' ? 'Team' : 'Runner'}</span>
          <span className="t-eyebrow text-ink/65">
            {board.kind === 'team' && board.byAverage ? 'Avg pts' : 'Pts'}
          </span>
        </div>

        {board.rows.length === 0 && (
          <p className="px-3 py-6 text-center text-ink/65 text-sm">
            {board.kind === 'team' ? 'No teams yet.' : 'Nobody has joined yet.'}
          </p>
        )}

        {board.kind === 'individual' && board.rows.map((r, i) => (
          <div
            key={r.id}
            className={`${ROW} ${i < board.rows.length - 1 ? 'border-b border-line' : ''} ${r.isViewer ? 'bg-accent/[0.06]' : ''}`}
          >
            <span className={`text-[15px] leading-[1.45] tabular-nums w-6 ${placeClass(r.place)}`}>{r.place}</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                {r.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />}
                <span className={NAME}>{r.name}{r.isViewer ? ' (you)' : ''}</span>
              </span>
              <span className={`block ${SUB} ${r.color ? 'pl-3.5' : ''}`}>
                {r.runs > 0 ? `${formatKm(r.km)} · ${plural(r.runs, 'run', 'runs')}` : 'No runs yet'}
              </span>
            </span>
            <span className={SCORE}>{formatPoints(r.points)}</span>
          </div>
        ))}

        {board.kind === 'team' && board.rows.map((r, i) => (
          <div
            key={r.id}
            className={`${ROW} ${i < board.rows.length - 1 ? 'border-b border-line' : ''} ${r.isViewer ? 'bg-accent/[0.06]' : ''}`}
          >
            <span className={`text-[15px] leading-[1.45] tabular-nums w-6 ${placeClass(r.place)}`}>{r.place}</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />
                <span className={NAME}>{r.name}</span>
              </span>
              <span className={`block ${SUB} pl-3.5`}>
                {board.byAverage
                  ? `${formatPoints(r.total)} pts · ${plural(r.members, 'runner', 'runners')}`
                  : `${formatPoints(r.average)} per runner · ${plural(r.members, 'runner', 'runners')}`}
                {r.km > 0 ? ` · ${formatKm(r.km)}` : ''}
              </span>
            </span>
            <span className={SCORE}>{formatPoints(r.score)}</span>
          </div>
        ))}
      </div>

      {!anyRuns && board.rows.length > 0 && (
        <p className="text-ink/65 text-[13px] leading-snug mt-3 text-center">
          No runs yet — log the first on the Add tab.
        </p>
      )}

      {garmin && (
        <p className="text-ink/65 text-[13px] leading-snug mt-3 text-center">
          Includes activities recorded on Garmin devices.
        </p>
      )}

      {strava && (
        <div className="mt-4 flex justify-center">
          <PoweredByStrava />
        </div>
      )}
    </div>
  )
}
