'use client'

import { useMemo, useState } from 'react'
import {
  playerStats, statsFor, holeDifficulty,
  formatGained, formatRate, formatAverage,
  MIN_HOLE_SAMPLE,
  type HoleStat, type PlayerStats,
} from '@/lib/holeStats'
import { ordinal } from '@/lib/playerSummary'
import { tripAwards } from '@/lib/tripAwards'
import type { RowHole, RowRound } from '@/lib/boardRows'

/**
 * The stats lab: you, the field, and the course.
 *
 * Three views of one derivation. Everything printed here comes out of
 * `lib/holeStats.ts` — nothing is worked out in this file, so a figure on
 * the hub and the same figure here cannot disagree.
 *
 * A client component only because the tabs are state. The rows are computed
 * once with `useMemo` and shared by all three.
 */

type Tab = 'you' | 'field' | 'course' | 'awards'

export default function StatsClient({
  stats, holes, players, rounds, courseByRound, courseNames, meId, thin,
  tripOver = false,
}: {
  stats: HoleStat[]
  holes: RowHole[]
  players: { id: string; name: string }[]
  rounds: RowRound[]
  /** Entries rather than a Map: this crosses the server/client boundary. */
  courseByRound: [string, string][]
  courseNames: [string, string][]
  meId: string | null
  /** Few enough holes that the figures are still moving. */
  thin: boolean
  /** Past its end date, so the honours read as final rather than as it stands. */
  tripOver?: boolean
}) {
  // Somebody this phone knows opens on their own numbers; a stranger opens
  // on the field, because "you" would be a screen about nobody.
  const [tab, setTab] = useState<Tab>(meId ? 'you' : 'field')

  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const courseName = useMemo(() => new Map(courseNames), [courseNames])
  const field = useMemo(() => playerStats(stats), [stats])
  const mine = useMemo(() => (meId ? statsFor(stats, meId) : null), [stats, meId])
  const difficulty = useMemo(() => holeDifficulty(stats, holes), [stats, holes])
  const awards = useMemo(() => tripAwards(field), [field])

  const tabs: [Tab, string][] = [
    ...(meId ? [['you', 'You'] as [Tab, string]] : []),
    ['field', 'The field'],
    ['course', 'The course'],
    // No tab until somebody has qualified for something: an empty honours
    // board is a promise, and this screen does not make those.
    ...(awards.length > 0 ? [['awards', 'Awards'] as [Tab, string]] : []),
  ]

  return (
    <div>
      {/* The same chip strip the leaderboard uses. */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex-shrink-0 inline-flex items-center px-4 py-2.5 t-label rounded-xl border transition-colors duration-150 ${
              tab === key
                ? 'bg-accent-deep text-white font-bold border-accent-deep'
                : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {thin && (
        <p className="t-cap text-ink/65 mb-4 leading-snug">
          A few holes in. These settle as more cards come in.
        </p>
      )}

      {tab === 'you' && mine && (
        <You mine={mine} stats={stats} meId={meId!} rounds={rounds}
          courseByRound={courseByRound} courseName={courseName} />
      )}
      {tab === 'field' && <Field rows={field} nameOf={nameOf} meId={meId} />}
      {tab === 'course' && (
        <Course rows={difficulty} courseName={courseName} />
      )}
      {tab === 'awards' && (
        <Awards awards={awards} nameOf={nameOf} meId={meId} tripOver={tripOver} />
      )}
    </div>
  )
}

// ─── Awards ────────────────────────────────────────────────────

/**
 * The honours board.
 *
 * Live while the trip runs — "as it stands", moving the way a leaderboard
 * moves — and a final board once the end date has passed. Awards nobody has
 * qualified for are simply absent, decided in lib/tripAwards.ts; ties share
 * the line.
 */
function Awards({ awards, nameOf, meId, tripOver }: {
  awards: ReturnType<typeof tripAwards>
  nameOf: Map<string, string>
  meId: string | null
  tripOver: boolean
}) {
  return (
    <div>
      <p className="t-cap text-ink/65 mb-4 leading-snug">
        {tripOver
          ? 'Final honours.'
          : 'As it stands — these move while the trip is being played.'}
      </p>
      {awards.map(a => {
        const mineToo = meId != null && a.winnerIds.includes(meId)
        return (
          <section
            key={a.key}
            className={`bg-surface border rounded-2xl px-4 py-3 mb-3 ${
              mineToo ? 'border-accent/50' : 'border-bark/12'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-card text-ink">{a.title}</h2>
              <span className="t-data t-num text-accent-deep flex-shrink-0">{a.figure}</span>
            </div>
            <p className="t-cap text-ink/65 mt-0.5 leading-snug">{a.line}</p>
            <p className="t-body text-ink mt-2">
              {a.winnerIds.map(id => nameOf.get(id) ?? 'Unknown').join(' · ')}
            </p>
          </section>
        )
      })}
    </div>
  )
}

// ─── Furniture ─────────────────────────────────────────────────

/** A label and a figure on one line — the status block's own idiom. */
function Line({ label, value, tone = 'ink' }: {
  label: string
  value: string
  tone?: 'ink' | 'accent' | 'rust'
}) {
  const colour = tone === 'accent' ? 'text-accent-deep'
    : tone === 'rust' ? 'text-rust-deep'
    : 'text-ink'
  return (
    <div className="flex items-baseline justify-between py-2.5 border-b border-bark/[0.08] last:border-b-0">
      <span className="t-cap uppercase tracking-[0.12em] text-ink/50">{label}</span>
      <span className={`t-data t-num ${colour}`}>{value}</span>
    </div>
  )
}

function Panel({ title, hint, children }: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3">
      <h2 className="t-card text-ink">{title}</h2>
      {hint && <p className="t-cap text-ink/65 mt-0.5 mb-1 leading-snug">{hint}</p>}
      <div className="mt-1">{children}</div>
    </section>
  )
}

/**
 * A gain is emerald when it is one and rust when it is not.
 *
 * The one sanctioned use of rust: losing shots to the field is a loss. Level
 * is neither, and prints in ink.
 */
const gainTone = (n: number) =>
  Math.round(n * 10) === 0 ? 'ink' : n > 0 ? 'accent' : 'rust'

// ─── You ───────────────────────────────────────────────────────

function You({ mine, stats, meId, rounds, courseByRound, courseName }: {
  mine: PlayerStats
  stats: HoleStat[]
  meId: string
  rounds: RowRound[]
  courseByRound: [string, string][]
  courseName: Map<string, string>
}) {
  const { fairways: f, putting: p, gained: g, scoring: sc, scrambling: scr, approach: a } = mine
  const courseFor = new Map(courseByRound)

  const missNote = f.missBias
    ? `${f.missedLeft} left, ${f.missedRight} right — leaning ${f.missBias}`
    : `${f.missedLeft} left, ${f.missedRight} right`

  // Positive leak is shots given away, so it carries its sign the way a
  // score to par does — never through formatGained, whose green would call
  // a leak a gain.
  const leak = (n: number | null) =>
    n == null ? '—' : `${n >= 0.05 ? '+' : ''}${formatAverage(n)} a hole`

  return (
    <div>
      <Panel title="Scoring" hint="Every scored hole, against your own par.">
        {sc.eaglesOrBetter > 0 && (
          <Line label="Eagles or better" value={String(sc.eaglesOrBetter)} tone="accent" />
        )}
        <Line label="Birdies" value={String(sc.birdies)}
          tone={sc.birdies > 0 ? 'accent' : 'ink'} />
        <Line label="Pars" value={String(sc.pars)} />
        <Line label="Bogeys" value={String(sc.bogeys)} />
        <Line label="Doubles or worse" value={String(sc.doublesOrWorse)} />
        {sc.bounceBackChances > 0 && (
          <Line
            label="Bounced back"
            value={`${sc.bounceBacks} of ${sc.bounceBackChances}`}
          />
        )}
      </Panel>

      <Panel title="Off the tee" hint={`${f.counted} par 4s and 5s answered`}>
        <Line label="Fairways hit" value={`${f.hit} of ${f.counted}`} />
        <Line label="Hit rate" value={formatRate(f.hitRate)} />
        <Line label="Misses" value={missNote} />
      </Panel>

      <Panel
        title="Approach"
        hint="Greens found, split by where the tee shot finished — the gap is what a miss costs."
      >
        <Line label="From the fairway" value={
          a.fromFairway.holes === 0 ? '—'
            : `${a.fromFairway.greensHit} of ${a.fromFairway.holes} · ${formatRate(a.fromFairway.girRate)}`
        } />
        <Line label="From a miss" value={
          a.fromMiss.holes === 0 ? '—'
            : `${a.fromMiss.greensHit} of ${a.fromMiss.holes} · ${formatRate(a.fromMiss.girRate)}`
        } />
        {/* Regulation is par minus two putts, so level here is finding
            greens on schedule and the figure is long-game leakage alone —
            putting cannot touch it. */}
        <Line label="Leak to the green" value={leak(a.vsRegulation)} />
      </Panel>

      <Panel title="Greens and putting" hint={`${p.holes} holes with a putt count`}>
        <Line label="Greens in regulation" value={`${p.greensHit} of ${p.greenHoles}`} />
        <Line label="Hit rate" value={formatRate(p.girRate)} />
        <Line label="Putts a round" value={formatAverage(p.puttsPer18)} />
        <Line label="Putts a green hit" value={formatAverage(p.puttsPerGreenHit)} />
        <Line label="One-putts" value={`${p.onePutts} · ${formatRate(p.onePuttRate)}`} />
        <Line label="Three-putts or worse" value={`${p.threePuttsOrWorse} · ${formatRate(p.threePuttRate)}`} />
        <Line label="Scrambling" value={
          scr.chances === 0 ? '—'
            : `${scr.saves} of ${scr.chances} · ${formatRate(scr.rate)}`
        } />
      </Panel>

      <Panel
        title="Gained on the field"
        hint="Against everyone else's cards on the same holes, on the shots played rather than the shots allowed."
      >
        <Line label="To the green" value={formatGained(g.toGreen)} tone={gainTone(g.toGreen)} />
        <Line label="Putting" value={formatGained(g.putting)} tone={gainTone(g.putting)} />
        <Line label="Total" value={formatGained(g.total)} tone={gainTone(g.total)} />
        <Line label="Holes counted" value={String(g.holes)} />
      </Panel>

      {mine.splits.length > 1 && <Splits splits={mine.splits} />}

      <Rounds stats={stats} meId={meId} rounds={rounds}
        courseFor={courseFor} courseName={courseName} />
    </div>
  )
}

/**
 * The same figures, par by par. Only shown once more than one kind of hole
 * has been played — a table with one row is a sentence wearing a grid.
 */
function Splits({ splits }: { splits: PlayerStats['splits'] }) {
  return (
    <Panel
      title="By par"
      hint="The par-3 greens column is the iron play on its own — no fairway is involved in it."
    >
      <div className="overflow-x-auto">
        <table className="w-full t-cap">
          <thead>
            <tr className="text-ink/50 uppercase tracking-[0.12em]">
              <th className="text-left font-normal py-2">Par</th>
              <th className="text-right font-normal py-2">Holes</th>
              <th className="text-right font-normal py-2 whitespace-nowrap">To par</th>
              <th className="text-right font-normal py-2">GIR</th>
              <th className="text-right font-normal py-2">Putts</th>
            </tr>
          </thead>
          <tbody>
            {splits.map(row => (
              <tr key={row.par} className="border-t border-bark/[0.08]">
                <td className="py-2.5 t-num text-ink">{row.par}</td>
                <td className="py-2.5 text-right t-num text-ink">{row.holes}</td>
                <td className="py-2.5 text-right t-num text-ink">
                  {row.averageToPar >= 0.05 ? '+' : ''}{formatAverage(row.averageToPar)}
                </td>
                <td className="py-2.5 text-right t-num text-ink">{formatRate(row.girRate)}</td>
                <td className="py-2.5 text-right t-num text-ink">{formatAverage(row.averagePutts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Rounds({ stats, meId, rounds, courseFor, courseName }: {
  stats: HoleStat[]
  meId: string
  rounds: RowRound[]
  courseFor: Map<string, string>
  courseName: Map<string, string>
}) {
  const played = rounds
    .map(r => ({ round: r, mine: stats.filter(s => s.playerId === meId && s.roundId === r.id) }))
    .filter(x => x.mine.length > 0)

  if (played.length < 2) return null

  return (
    <Panel title="Round by round">
      <div className="overflow-x-auto">
        <table className="w-full t-cap">
          <thead>
            <tr className="text-ink/50 uppercase tracking-[0.12em]">
              <th className="text-left font-normal py-2">Round</th>
              <th className="text-right font-normal py-2">FW</th>
              <th className="text-right font-normal py-2">GIR</th>
              <th className="text-right font-normal py-2">Putts</th>
            </tr>
          </thead>
          <tbody>
            {played.map(({ round, mine }) => {
              const line = statsFor(mine, meId)!
              const course = courseName.get(courseFor.get(round.id) ?? '')
              return (
                <tr key={round.id} className="border-t border-bark/[0.08]">
                  <td className="py-2.5 text-ink">
                    <span className="t-num">{round.round_number}</span>
                    {course && <span className="text-ink/50"> · {course}</span>}
                  </td>
                  <td className="py-2.5 text-right t-num text-ink">
                    {formatRate(line.fairways.hitRate)}
                  </td>
                  <td className="py-2.5 text-right t-num text-ink">
                    {formatRate(line.putting.girRate)}
                  </td>
                  <td className="py-2.5 text-right t-num text-ink">
                    {line.putting.putts || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ─── The field ─────────────────────────────────────────────────

function Field({ rows, nameOf, meId }: {
  rows: PlayerStats[]
  nameOf: Map<string, string>
  meId: string | null
}) {
  // By what they gained, best first. Ties by name, the way the board breaks
  // them — see sortRows in lib/boardRows.ts.
  const ordered = [...rows].sort((a, b) =>
    b.gained.total - a.gained.total
    || (nameOf.get(a.playerId) ?? '').localeCompare(nameOf.get(b.playerId) ?? ''))

  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-3">
      <h2 className="t-card text-ink">The field</h2>
      <p className="t-cap text-ink/65 mt-0.5 mb-2 leading-snug">
        Gained is against everyone else&apos;s cards on the same holes, on the
        shots played rather than the shots allowed.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full t-cap">
          <thead>
            <tr className="text-ink/50 uppercase tracking-[0.12em]">
              {/* No scrambling column, and it was tried rather than assumed:
                  a sixth column pushes this table into sideways scrolling at
                  360px, which hides the Gained column — the one the table is
                  sorted by. Scrambling reads on the You tab and the awards. */}
              <th className="text-left font-normal py-2">Player</th>
              <th className="text-right font-normal py-2">FW</th>
              <th className="text-right font-normal py-2">GIR</th>
              <th className="text-right font-normal py-2 whitespace-nowrap">Putts/18</th>
              <th className="text-right font-normal py-2">Gained</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => (
              <tr
                key={r.playerId}
                className={`border-t border-bark/[0.08] ${
                  r.playerId === meId ? 'bg-accent/[0.06]' : ''
                }`}
              >
                <td className="py-2.5 text-ink whitespace-nowrap">
                  <span className="text-ink/50 t-num mr-1.5">{ordinal(i + 1)}</span>
                  {nameOf.get(r.playerId) ?? 'Unknown'}
                </td>
                <td className="py-2.5 text-right t-num text-ink">{formatRate(r.fairways.hitRate)}</td>
                <td className="py-2.5 text-right t-num text-ink">{formatRate(r.putting.girRate)}</td>
                <td className="py-2.5 text-right t-num text-ink">{formatAverage(r.putting.puttsPer18)}</td>
                <td className={`py-2.5 text-right t-num ${
                  gainTone(r.gained.total) === 'accent' ? 'text-accent-deep'
                  : gainTone(r.gained.total) === 'rust' ? 'text-rust-deep'
                  : 'text-ink'
                }`}>
                  {r.gained.holes === 0 ? '—' : formatGained(r.gained.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-cap text-ink/65 mt-3 leading-snug">
        A dash means no hole has had enough cards on it yet to compare.
      </p>
    </section>
  )
}

// ─── The course ────────────────────────────────────────────────

function Course({ rows, courseName }: {
  rows: ReturnType<typeof holeDifficulty>
  courseName: Map<string, string>
}) {
  const courses = [...new Set(rows.map(r => r.courseId))]

  return (
    <div>
      {courses.map(courseId => (
        <section key={courseId} className="bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3">
          <h2 className="t-card text-ink">{courseName.get(courseId) ?? 'The course'}</h2>
          <p className="t-cap text-ink/65 mt-0.5 mb-2 leading-snug">
            Hardest first, off what was actually scored. The card&apos;s own
            stroke index is beside it, so the two can be read against each other.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full t-cap">
              <thead>
                <tr className="text-ink/50 uppercase tracking-[0.12em]">
                  <th className="text-left font-normal py-2">Hole</th>
                  <th className="text-right font-normal py-2">Par</th>
                  <th className="text-right font-normal py-2">SI</th>
                  <th className="text-right font-normal py-2 whitespace-nowrap">To par</th>
                  <th className="text-right font-normal py-2">FW</th>
                  <th className="text-right font-normal py-2">GIR</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(r => r.courseId === courseId).map(r => (
                  <tr
                    key={r.holeNumber}
                    className={`border-t border-bark/[0.08] ${r.settled ? '' : 'text-ink/50'}`}
                  >
                    <td className="py-2.5 whitespace-nowrap">
                      <span className="t-num">{r.holeNumber}</span>
                      {!r.settled && (
                        <span className="text-ink/50"> · {r.cards} card{r.cards === 1 ? '' : 's'}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right t-num">{r.par}</td>
                    <td className="py-2.5 text-right t-num">{r.strokeIndex}</td>
                    <td className="py-2.5 text-right t-num">
                      {r.averageToPar >= 0 ? '+' : ''}{formatAverage(r.averageToPar)}
                    </td>
                    <td className="py-2.5 text-right t-num">
                      {r.fairwaysCounted === 0 ? '—' : formatRate(r.fairwaysHit / r.fairwaysCounted)}
                    </td>
                    <td className="py-2.5 text-right t-num">
                      {r.greenHoles === 0 ? '—' : formatRate(r.greensHit / r.greenHoles)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-cap text-ink/65 mt-3 leading-snug">
            A hole under {MIN_HOLE_SAMPLE} cards is dimmed — its place in the
            order is still moving.
          </p>
        </section>
      ))}
    </div>
  )
}
