'use client'

import { useState } from 'react'
import { buttonClass } from '@/app/components/ui'

/**
 * The document, and the choice of what goes in it.
 *
 * Everything is already fetched and scored by the server page; this renders
 * it as one printable document with a control panel on top. The checkboxes
 * are pure client filtering — ticking one shows a section that was there all
 * along — and the Save as PDF button is the browser's own print dialog,
 * where every phone and laptop already knows how to make a PDF. No library,
 * no second rendering path: what is on screen is what lands on paper, minus
 * the panel itself and the tab bar, which are `print:hidden`.
 *
 * Dark mode prints light — globals.css re-points the palette under
 * `@media print`, because paper is always daylight.
 */

export type ExportDay = {
  label: string
  lines: { title: string; detail: string }[]
}

export type ExportPlayer = { name: string; handicap: number | null }

export type ExportTeam = { name: string; members: string[] }

export type ExportBoardRow = {
  place: number
  name: string
  subLabel: string
  total: number
  totalAll?: number
  perRound: Record<string, number>
  playedRounds: string[]
  droppedRounds: string[]
}

export type ExportBoard = {
  id: string
  title: string
  rules: string
  audience: 'individual' | 'team'
  higherIsBetter: boolean
  rows: ExportBoardRow[]
}

export type ExportRound = {
  id: string
  number: number
  courseName: string | null
  date: string | null
  casual: boolean
}

type Sections = {
  itinerary: boolean
  players: boolean
  leaderboards: boolean
  roundByRound: boolean
}

const SECTION_LABELS: { key: keyof Sections; label: string }[] = [
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'players', label: 'Players & teams' },
  { key: 'leaderboards', label: 'Leaderboards' },
  { key: 'roundByRound', label: 'Round by round' },
]

export default function TripExportClient({
  tripName, tripCode, startDate, endDate, days, players, teams, boards, rounds,
}: {
  tripName: string
  tripCode: string
  startDate: string | null
  endDate: string | null
  days: ExportDay[]
  players: ExportPlayer[]
  teams: ExportTeam[]
  boards: ExportBoard[]
  rounds: ExportRound[]
}) {
  const [sections, setSections] = useState<Sections>({
    itinerary: true, players: true, leaderboards: true, roundByRound: true,
  })
  const toggle = (key: keyof Sections) =>
    setSections(s => ({ ...s, [key]: !s[key] }))

  // Casual rounds are scored but on no board, so the tables leave them out —
  // the same rule the leaderboard follows. They still show in the itinerary.
  const counted = rounds.filter(r => !r.casual)

  // Round by round reads off one board: the first individual one, which is
  // the trip's main competition by convention, or the first at all on a trip
  // that only runs team boards.
  const dailyBoard = boards.find(b => b.audience === 'individual') ?? boards[0] ?? null

  const offered = SECTION_LABELS.filter(({ key }) => {
    if (key === 'itinerary') return days.length > 0
    if (key === 'players') return players.length > 0
    if (key === 'leaderboards') return boards.length > 0
    return dailyBoard !== null && counted.length > 0
  })

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-12">
      {/* What goes in — screen only */}
      <div className="print:hidden mb-6 p-4 rounded-2xl bg-surface border border-bark/[0.08]">
        <p className="t-label text-ink mb-3">What goes in</p>
        <div className="space-y-2.5 mb-4">
          {offered.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={() => toggle(key)}
                className="w-4 h-4 accent-[var(--color-accent)]"
              />
              <span className="text-[14px] text-ink">{label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className={`${buttonClass('primary', true)} py-3 text-[14px]`}
        >
          Save as PDF
        </button>
        <p className="t-cap text-ink/65 mt-2">
          Opens your device’s print window — choose “Save as PDF” there. What
          you see below is what it saves.
        </p>
      </div>

      {/* ── The document ── */}

      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink">{tripName}</h1>
        <p className="t-cap text-ink/65 mt-1">
          {dateRange(startDate, endDate)}
          {dateRange(startDate, endDate) ? ' · ' : ''}Trip code {tripCode}
        </p>
      </header>

      {sections.itinerary && days.length > 0 && (
        <section className="mb-8">
          <h2 className="t-h2 text-ink mb-3">Itinerary</h2>
          <div className="space-y-4">
            {days.map(day => (
              <div key={day.label} className="print-avoid-break">
                <p className="t-cap text-ink/65 mb-1">{day.label}</p>
                <ul className="space-y-1">
                  {day.lines.map((line, i) => (
                    <li key={i} className="text-[14px] text-ink">
                      {line.title}
                      {line.detail && <span className="text-ink/65"> — {line.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.players && players.length > 0 && (
        <section className="mb-8 print-avoid-break">
          <h2 className="t-h2 text-ink mb-3">Players</h2>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left t-cap text-ink/65 border-b border-bark/12">
                <th className="py-1.5 font-normal">Name</th>
                <th className="py-1.5 font-normal text-right">Handicap</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.name} className="border-b border-bark/[0.06]">
                  <td className="py-1.5 text-ink">{p.name}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">
                    {p.handicap ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {teams.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="t-cap text-ink/65">Teams</p>
              {teams.map(t => (
                <p key={t.name} className="text-[14px] text-ink">
                  {t.name}
                  <span className="text-ink/65"> — {t.members.join(', ')}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {sections.leaderboards && boards.map(board => (
        <section key={board.id} className="mb-8">
          <h2 className="t-h2 text-ink mb-1">{board.title}</h2>
          {board.rules && <p className="t-cap text-ink/65 mb-3">{board.rules}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left t-cap text-ink/65 border-b border-bark/12">
                  <th className="py-1.5 pr-2 font-normal">Pos</th>
                  <th className="py-1.5 pr-2 font-normal">Name</th>
                  {counted.map(r => (
                    <th key={r.id} className="py-1.5 px-1.5 font-normal text-right">
                      R{r.number}
                    </th>
                  ))}
                  <th className="py-1.5 pl-2 font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map(row => (
                  <tr key={row.name} className="border-b border-bark/[0.06]">
                    <td className="py-1.5 pr-2 tabular-nums text-ink/80">{row.place}</td>
                    <td className="py-1.5 pr-2 text-ink">
                      {row.name}
                      {row.subLabel && <span className="t-cap text-ink/65"> {row.subLabel}</span>}
                    </td>
                    {counted.map(r => {
                      const played = row.playedRounds.includes(r.id)
                      const dropped = row.droppedRounds.includes(r.id)
                      return (
                        <td
                          key={r.id}
                          className={`py-1.5 px-1.5 text-right tabular-nums ${
                            dropped ? 'line-through text-ink/50' : 'text-ink'
                          }`}
                        >
                          {played ? row.perRound[r.id] ?? '—' : ''}
                        </td>
                      )
                    })}
                    <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-ink">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {sections.roundByRound && dailyBoard && counted.length > 0 && (
        <section className="mb-8">
          <h2 className="t-h2 text-ink mb-3">Round by round</h2>
          <p className="t-cap text-ink/65 mb-3">{dailyBoard.title}, per round.</p>
          <div className="space-y-5">
            {counted.map(round => {
              const results = roundResults(dailyBoard, round.id)
              if (results.length === 0) return null
              return (
                <div key={round.id} className="print-avoid-break">
                  <p className="t-label text-ink mb-1.5">
                    Round {round.number}
                    {round.courseName && ` — ${round.courseName}`}
                    {round.date && (
                      <span className="t-cap text-ink/65"> · {longDate(round.date)}</span>
                    )}
                  </p>
                  <table className="w-full text-[14px]">
                    <tbody>
                      {results.map(row => (
                        <tr key={row.name} className="border-b border-bark/[0.06]">
                          <td className="py-1 pr-2 w-8 tabular-nums text-ink/80">{row.place}</td>
                          <td className="py-1 pr-2 text-ink">{row.name}</td>
                          <td className="py-1 text-right tabular-nums text-ink">{row.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <footer className="pt-2 border-t border-bark/12">
        {/* suppressHydrationWarning: the server and the phone can disagree
            about what day it is around midnight, and the date is decoration. */}
        <p className="t-cap text-ink/65" suppressHydrationWarning>
          Green Dot Golf · greendot.live · exported {longDate(todayISO())}
        </p>
      </footer>

      {/* Paper rules. Backgrounds are the browser's business; these only
          keep a day or a round's table from being sliced across two pages,
          and give the sheet its margin. */}
      <style>{`
        @media print {
          .has-tabbar { padding-bottom: 0 !important }
          .print-avoid-break { break-inside: avoid }
          h2 { break-after: avoid }
          tr { break-inside: avoid }
        }
        @page { margin: 14mm }
      `}</style>
    </div>
  )
}

/**
 * One round's results off a board's per-round column — ordered the way that
 * board scores, ties sharing a place the way golf gives places.
 */
function roundResults(
  board: ExportBoard,
  roundId: string,
): { place: number; name: string; score: number }[] {
  const played = board.rows
    .filter(r => r.playedRounds.includes(roundId) && r.perRound[roundId] !== undefined)
    .map(r => ({ name: r.name, score: r.perRound[roundId] }))
    .sort((a, b) => (board.higherIsBetter ? b.score - a.score : a.score - b.score))

  // Golf's places: two level share one, and the next is where counting from
  // one would have put them — 1, 1, 3.
  const out: { place: number; name: string; score: number }[] = []
  for (let i = 0; i < played.length; i++) {
    const level = i > 0 && played[i - 1].score === played[i].score
    out.push({ ...played[i], place: level ? out[i - 1].place : i + 1 })
  }
  return out
}

/** "Fri 12 Sep 2026" from a stored date, or the string as it came. */
function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function dateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  if (!end || end === start) return longDate(start)
  return `${longDate(start)} – ${longDate(end)}`
}
