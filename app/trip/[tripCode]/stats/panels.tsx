'use client'

/**
 * The category boxes — every panel the stats hub shows, in one idiom.
 *
 * Two arrangements of the same boxes: one player's numbers down the page
 * (the layout the review called the best), and the field's numbers as one
 * ranked box per category. Both are pure views over `PlayerStats` — nothing
 * in this file works a figure out, and everything prints through the shared
 * formatters, so a number cannot read two ways in two places.
 */

import {
  statsFor, playerStats,
  formatGained, formatRate, formatAverage,
  type HoleStat, type PlayerStats,
} from '@/lib/holeStats'
import { ordinal } from '@/lib/playerSummary'
import type { RowRound } from '@/lib/boardRows'
import type { Award } from '@/lib/tripAwards'

// ─── Furniture ─────────────────────────────────────────────────

/** A label and a figure on one line — the status block's own idiom. */
export function Line({ label, value, tone = 'ink' }: {
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

export function Panel({ title, hint, aside, children }: {
  title: string
  hint?: string
  /** Right-aligned in the heading row — the gained panel's basis toggle. */
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-card text-ink">{title}</h2>
        {aside}
      </div>
      {hint && <p className="t-cap text-ink/65 mt-0.5 mb-1 leading-snug">{hint}</p>}
      <div className="mt-1">{children}</div>
    </section>
  )
}

/**
 * A gain is emerald when it is one and rust when it is not — the one
 * sanctioned use of rust on these screens. Level is neither, and prints in
 * ink.
 */
export const gainTone = (n: number) =>
  Math.round(n * 10) === 0 ? 'ink' as const : n > 0 ? 'accent' as const : 'rust' as const

/**
 * The Gross / Net switch on a gained box.
 *
 * Gross is the shots as played; Net is the Stableford points against the
 * field, handicaps already inside every stored point. A toggle rather than
 * two boxes, because they are one question asked two ways.
 */
export function BasisToggle({ basis, onBasis }: {
  basis: 'gross' | 'net'
  onBasis: (b: 'gross' | 'net') => void
}) {
  return (
    <div className="flex gap-1 flex-shrink-0" role="group" aria-label="Gained basis">
      {(['gross', 'net'] as const).map(b => (
        <button
          key={b}
          type="button"
          aria-pressed={basis === b}
          onClick={() => onBasis(b)}
          className={`px-3 py-1.5 rounded-xl border t-cap transition-colors duration-150 ${
            basis === b
              ? 'border-accent bg-accent/[0.12] text-accent-deep font-semibold'
              : 'border-bark/12 text-ink/65 hover:border-bark/25'
          }`}
        >
          {b === 'gross' ? 'Gross' : 'Net'}
        </button>
      ))}
    </div>
  )
}

// ─── One player, down the page ─────────────────────────────────

export function PlayerPanels({
  mine, stats, playerId, rounds, courseFor, courseName, basis, onBasis, chart,
}: {
  mine: PlayerStats
  /** Already course-filtered — every panel below reads only this. */
  stats: HoleStat[]
  playerId: string
  rounds: RowRound[]
  courseFor: Map<string, string>
  courseName: Map<string, string>
  basis: 'gross' | 'net'
  onBasis: (b: 'gross' | 'net') => void
  /** The gained-per-round chart, mounted by the shell so panels stay pure. */
  chart?: React.ReactNode
}) {
  const { fairways: f, putting: p, gained: g, scoring: sc, scrambling: scr, approach: a, misc: m } = mine
  const vsHandicap = mine.form.reduce((n, r) => n + r.vsHandicap, 0)

  const missNote = f.missBias
    ? `${f.missedLeft} left, ${f.missedRight} right — leaning ${f.missBias}`
    : `${f.missedLeft} left, ${f.missedRight} right`

  // Positive leak is shots given away, so it carries its sign the way a
  // score to par does — never through formatGained, whose green would call
  // a leak a gain.
  const leak = (n: number | null) =>
    n == null ? '—' : `${n >= 0.05 ? '+' : ''}${formatAverage(n)} a hole`
  const toPar = (n: number) => `${n >= 0.05 ? '+' : ''}${formatAverage(n)}`

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
      </Panel>

      {/* Elevated to second, by request: after the basic card, the headline
          analysis. Gross keeps the putting / tee-to-green split; Net is the
          points answer, and points carry the handicap in, so it has no split
          to offer — the strokes were given before the comparison started. */}
      <Panel
        title="Strokes gained"
        aside={<BasisToggle basis={basis} onBasis={onBasis} />}
        hint={basis === 'gross'
          ? "Against everyone else's cards on the same holes, on the shots played."
          : 'Stableford points against the field on the same holes — handicaps included.'}
      >
        {basis === 'gross' ? (
          <>
            <Line label="To the green" value={formatGained(g.toGreen)} tone={gainTone(g.toGreen)} />
            <Line label="Putting" value={formatGained(g.putting)} tone={gainTone(g.putting)} />
            <Line label="Total" value={formatGained(g.total)} tone={gainTone(g.total)} />
            <Line label="Holes counted" value={String(g.holes)} />
          </>
        ) : (
          <>
            <Line label="Points on the field"
              value={formatGained(mine.pointsGained.points)}
              tone={gainTone(mine.pointsGained.points)} />
            <Line label="Holes counted" value={String(mine.pointsGained.holes)} />
            <Line label="Vs your handicap"
              value={`${formatGained(vsHandicap)}${mine.form.length > 1 ? ` over ${mine.form.length} rounds` : ''}`}
              tone={gainTone(vsHandicap)} />
          </>
        )}
        {chart}
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

      {mine.splits.length > 1 && <Splits splits={mine.splits} />}

      {/* The demoted and the niche, together. Bounce-back was a headline for
          one release; a good figure, not a front-rank one. */}
      <Panel title="Miscellaneous" hint="The figures that earned a box, not a headline.">
        {sc.bounceBackChances > 0 && (
          <Line label="Bounced back" value={`${sc.bounceBacks} of ${sc.bounceBackChances}`} />
        )}
        {m.siBands.length > 1 && m.siBands.map(b => (
          <Line key={b.band} label={`SI ${b.band}`} value={toPar(b.averageToPar)} />
        ))}
        {m.frontNine && m.backNine && (
          <Line label="Front nine · back nine"
            value={`${toPar(m.frontNine.averageToPar)} · ${toPar(m.backNine.averageToPar)}`} />
        )}
        <Line label="Blow-ups a round" value={formatAverage(m.blowUpsPer18)} />
        {m.longestParRun > 1 && (
          <Line label="Longest par-or-better run" value={String(m.longestParRun)}
            tone="accent" />
        )}
      </Panel>

      <Rounds stats={stats} playerId={playerId} rounds={rounds}
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

function Rounds({ stats, playerId, rounds, courseFor, courseName }: {
  stats: HoleStat[]
  playerId: string
  rounds: RowRound[]
  courseFor: Map<string, string>
  courseName: Map<string, string>
}) {
  const played = rounds
    .map(r => ({ round: r, mine: stats.filter(s => s.playerId === playerId && s.roundId === r.id) }))
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
              <th className="text-right font-normal py-2 whitespace-nowrap">Vs HC</th>
            </tr>
          </thead>
          <tbody>
            {played.map(({ round, mine }) => {
              const line = statsFor(mine, playerId)!
              const vs = line.form[0]?.vsHandicap ?? 0
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
                  <td className={`py-2.5 text-right t-num ${
                    gainTone(vs) === 'accent' ? 'text-accent-deep'
                    : gainTone(vs) === 'rust' ? 'text-rust-deep'
                    : 'text-ink'
                  }`}>
                    {formatGained(vs)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="t-cap text-ink/65 mt-3 leading-snug">
        Vs HC is Stableford points against two a hole — level means the round
        played exactly to handicap.
      </p>
    </Panel>
  )
}

// ─── Everyone: the field as ranked boxes ───────────────────────

/**
 * One ranked category. `better` orders it; null scores sit out.
 *
 * A row with a `share` draws a thin diverging bar under it — the field's
 * gained figures at a glance, without a chart panel restating the list it
 * sits beside. Position either side of the centre line is the encoding;
 * the emerald/rust only agrees with it, because that pair is exactly the
 * red/green a colour-blind reader cannot split.
 */
export function RankedBox({ title, hint, rows, meId, aside }: {
  title: string
  hint?: string
  rows: {
    id: string; name: string; note?: string; figure: string
    tone?: 'ink' | 'accent' | 'rust'
    /** −1..1 of the box's largest magnitude. Omit for no bar. */
    share?: number
  }[]
  meId: string | null
  aside?: React.ReactNode
}) {
  if (rows.length === 0) return null
  return (
    <Panel title={title} hint={hint} aside={aside}>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`py-2.5 border-b border-bark/[0.08] last:border-b-0 ${
            r.id === meId ? 'bg-accent/[0.06] -mx-4 px-4' : ''
          }`}
        >
          <div className="flex items-baseline gap-2">
            <span className="t-cap t-num text-ink/50 w-8 flex-shrink-0">{ordinal(i + 1)}</span>
            <span className="t-body text-ink flex-1 min-w-0 truncate">{r.name}</span>
            {r.note && <span className="t-cap text-ink/50 flex-shrink-0">{r.note}</span>}
            <span className={`t-data t-num flex-shrink-0 ${
              r.tone === 'accent' ? 'text-accent-deep'
              : r.tone === 'rust' ? 'text-rust-deep'
              : 'text-ink'
            }`}>
              {r.figure}
            </span>
          </div>
          {r.share != null && (
            // The track lives to the right of the names, not under them: its
            // left edge is the edge of the player column, and the zero line
            // sits at its centre — well right of the page's own middle — so
            // a loss can reach left without running beneath anybody's name.
            <div className="relative h-1 mt-1.5 ml-[45%]" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/2 w-px bg-bark/25" />
              <div
                className={`absolute inset-y-0 rounded-full ${
                  r.share >= 0 ? 'left-1/2 bg-accent' : 'right-1/2 bg-rust'
                }`}
                style={{ width: `${Math.min(50, Math.abs(r.share) * 50)}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </Panel>
  )
}

/**
 * Who owns a course — the per-course breakdown of the field.
 *
 * Stableford points a round rather than gross to par, because the field
 * spans every handicap on the trip and points are the one figure that
 * reads fair across it. Per eighteen holes, so a player who came back for
 * a second round is compared by rate rather than rewarded for volume.
 */
export function CourseField({ stats, nameOf, meId }: {
  /** Already narrowed to the one course. */
  stats: HoleStat[]
  nameOf: Map<string, string>
  meId: string | null
}) {
  const field = playerStats(stats)
  const name = (id: string) => nameOf.get(id) ?? 'Unknown'
  const raw = field
    .filter(p => p.holes > 0)
    .map(p => ({
      p,
      per18: (p.form.reduce((n, r) => n + r.points, 0) / p.holes) * 18,
    }))
    .sort((a, b) => b.per18 - a.per18 || name(a.p.playerId).localeCompare(name(b.p.playerId)))
  if (raw.length === 0) return null

  return (
    <RankedBox
      title="The field here"
      hint="Stableford points a round on this course — handicaps included, so it reads fair across the field."
      rows={raw.map(({ p, per18 }) => ({
        id: p.playerId,
        name: name(p.playerId),
        note: `${p.holes} holes`,
        figure: formatAverage(per18),
      }))}
      meId={meId}
    />
  )
}

export function EveryonePanels({
  field, nameOf, meId, basis, onBasis, awards, tripOver, chart,
}: {
  field: PlayerStats[]
  nameOf: Map<string, string>
  meId: string | null
  basis: 'gross' | 'net'
  onBasis: (b: 'gross' | 'net') => void
  awards: Award[]
  tripOver: boolean
  /** The field-ranking chart, mounted by the shell. */
  chart?: React.ReactNode
}) {
  const name = (id: string) => nameOf.get(id) ?? 'Unknown'
  const by = <T,>(score: (p: PlayerStats) => T | null, better: (a: T, b: T) => number) =>
    field
      .map(p => ({ p, s: score(p) }))
      .filter((x): x is { p: PlayerStats; s: T } => x.s != null)
      .sort((a, b) => better(a.s, b.s) || name(a.p.playerId).localeCompare(name(b.p.playerId)))

  const gainedRaw = basis === 'gross'
    ? by(p => (p.gained.holes > 0 ? p.gained.total : null), (a, b) => b - a)
    : by(p => (p.pointsGained.holes > 0 ? p.pointsGained.points : null), (a, b) => b - a)
  const gainedMax = Math.max(1e-9, ...gainedRaw.map(({ s }) => Math.abs(s)))
  const gained = gainedRaw.map(({ p, s }) => ({
    id: p.playerId, name: name(p.playerId),
    note: basis === 'gross'
      ? `${formatGained(p.gained.toGreen)} tee · ${formatGained(p.gained.putting)} putt`
      : `${p.pointsGained.holes} holes`,
    figure: formatGained(s), tone: gainTone(s),
    share: s / gainedMax,
  }))

  return (
    <div>
      <RankedBox
        title="Strokes gained"
        hint={basis === 'gross'
          ? 'Shots on the field, everyone against everyone, on the same holes.'
          : 'Stableford points on the field — handicaps included, so this is the fair fight.'}
        aside={<BasisToggle basis={basis} onBasis={onBasis} />}
        rows={gained}
        meId={meId}
      />
      {chart}

      <RankedBox
        title="Vs handicap"
        hint="Stableford points against two a hole. Ahead of your handicap is ahead of the trip."
        rows={(() => {
          const raw = by(p => (p.form.length > 0 ? p.form.reduce((n, r) => n + r.vsHandicap, 0) : null), (a, b) => b - a)
          const max = Math.max(1e-9, ...raw.map(({ s }) => Math.abs(s)))
          return raw.map(({ p, s }) => ({
            id: p.playerId, name: name(p.playerId),
            note: `${p.form.length} round${p.form.length === 1 ? '' : 's'}`,
            figure: formatGained(s), tone: gainTone(s),
            share: s / max,
          }))
        })()}
        meId={meId}
      />

      <RankedBox
        title="Off the tee"
        rows={by(p => p.fairways.hitRate, (a, b) => b - a)
          .map(({ p, s }) => ({
            id: p.playerId, name: name(p.playerId),
            note: `${p.fairways.hit} of ${p.fairways.counted}`,
            figure: formatRate(s),
          }))}
        meId={meId}
      />

      <RankedBox
        title="Greens in regulation"
        rows={by(p => p.putting.girRate, (a, b) => b - a)
          .map(({ p, s }) => ({
            id: p.playerId, name: name(p.playerId),
            note: `${p.putting.greensHit} of ${p.putting.greenHoles}`,
            figure: formatRate(s),
          }))}
        meId={meId}
      />

      <RankedBox
        title="Putting"
        hint="Fewest putts a round first."
        rows={by(p => p.putting.puttsPer18, (a, b) => a - b)
          .map(({ p, s }) => ({
            id: p.playerId, name: name(p.playerId),
            note: `${p.putting.holes} holes`,
            figure: formatAverage(s),
          }))}
        meId={meId}
      />

      <RankedBox
        title="Scrambling"
        rows={by(p => (p.scrambling.chances > 0 ? p.scrambling.rate : null), (a, b) => b - a)
          .map(({ p, s }) => ({
            id: p.playerId, name: name(p.playerId),
            note: `${p.scrambling.saves} of ${p.scrambling.chances}`,
            figure: formatRate(s),
          }))}
        meId={meId}
      />

      {/* The honours, at the foot of the view that already ranks everyone. */}
      {awards.length > 0 && (
        <div className="mt-6">
          <p className="t-cap text-ink/65 mb-3 leading-snug">
            {tripOver
              ? 'Final honours.'
              : 'Honours as they stand — these move while the trip is being played.'}
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
                  {a.winnerIds.map(id => name(id)).join(' · ')}
                </p>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
