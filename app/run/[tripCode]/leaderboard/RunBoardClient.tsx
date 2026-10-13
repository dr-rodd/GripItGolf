'use client'

import { useState } from 'react'
import { formatPoints } from '@/lib/runChallenge'
import { formatKm } from '@/lib/runBoards'

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

const ROW = 'flex items-center gap-3 px-3 py-2.5 text-left'
const NAME = 'font-[family-name:var(--font-display)] font-semibold text-[15px] leading-tight text-ink truncate'
const SUB = 'text-ink/65 text-[13px] leading-snug truncate'
const SCORE = 'font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-ink flex-shrink-0'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function RunBoardClient({ boards, anyRuns, garmin = false }: {
  boards: BoardView[]
  anyRuns: boolean
  /** Some counted runs were recorded on Garmin — Strava's terms ask for the credit. */
  garmin?: boolean
}) {
  const [activeId, setActiveId] = useState(boards[0]?.id ?? '')
  const board = boards.find(b => b.id === activeId) ?? boards[0]
  if (!board) return null

  return (
    <div>
      {/* ── Which board ── */}
      {boards.length > 1 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
          {boards.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveId(b.id)}
              aria-pressed={b.id === board.id}
              className={`flex-shrink-0 px-4 py-2.5 t-label transition-colors duration-150 rounded-xl border ${
                b.id === board.id
                  ? 'bg-accent-deep text-white font-bold border-accent-deep'
                  : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>
      )}

      <p className="text-ink/65 text-[13px] leading-snug mb-3">{board.rule}</p>

      {/* ── The board ── */}
      <div className="bg-surface border border-bark/12 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-bark/12">
          <span className="t-cap text-ink/65 w-6">Pos</span>
          <span className="t-cap text-ink/65 flex-1">{board.kind === 'team' ? 'Team' : 'Runner'}</span>
          <span className="t-cap text-ink/65">
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
            className={`${ROW} ${i < board.rows.length - 1 ? 'border-b border-bark/12' : ''} ${r.isViewer ? 'bg-accent/[0.06]' : ''}`}
          >
            <span className="t-cap text-ink/65 tabular-nums w-6">{r.place}</span>
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
            className={`${ROW} ${i < board.rows.length - 1 ? 'border-b border-bark/12' : ''} ${r.isViewer ? 'bg-accent/[0.06]' : ''}`}
          >
            <span className="t-cap text-ink/65 tabular-nums w-6">{r.place}</span>
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
    </div>
  )
}
