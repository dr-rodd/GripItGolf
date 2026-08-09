'use client'

import { useMemo, useState } from 'react'
import {
  playerStats, statsFor, holeDifficulty, gainedOnField, pointsVsField,
  formatGained, formatRate, formatAverage,
  MIN_HOLE_SAMPLE,
  type HoleStat,
} from '@/lib/holeStats'
import { tripAwards } from '@/lib/tripAwards'
import { HEADER_H } from '@/app/components/headerMetrics'
import { PlayerPanels, EveryonePanels, CourseField } from './panels'
import { GainedByRoundChart, DifficultyProfileChart, type GainedBar } from './charts'
import type { RowHole, RowRound } from '@/lib/boardRows'

/**
 * The stats hub: an instrument, not a printout.
 *
 * Two facts make the whole thing work. Every figure is a pure function of
 * one `HoleStat[]` fetched once, and every hole already knows its player,
 * its course and its round — so player selection, the course filter and the
 * everyone-vs-one views are client-side filtering with zero further
 * queries, which is why every toggle answers instantly.
 *
 * **The one correctness rule: filter the holes, never the field.** The
 * course filter narrows *which holes* count; the field on those holes is
 * always everybody who played them. A player's gain on one course is
 * measured against the whole field's play of that course, not against
 * whoever happens to be selected.
 *
 * Nothing here works a figure out — `lib/holeStats.ts` derives, panels
 * print.
 */

type View = 'players' | 'courses'

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
  const [view, setView] = useState<View>('players')
  // Somebody this phone knows opens on their own numbers; a stranger opens
  // on the field, because a page about nobody is a page about everybody.
  const [who, setWho] = useState<string>(meId ?? 'everyone')
  // Excluded rather than included, so a course added to the trip mid-visit
  // is in by default rather than silently missing.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [basis, setBasis] = useState<'gross' | 'net'>('gross')

  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const courseName = useMemo(() => new Map(courseNames), [courseNames])
  const courseFor = useMemo(() => new Map(courseByRound), [courseByRound])

  // Courses that actually have play on them, in course-list order.
  const playedCourseIds = useMemo(() => {
    const played = new Set(stats.map(s => s.courseId))
    return courseNames.map(([id]) => id).filter(id => played.has(id))
  }, [stats, courseNames])

  const [courseId, setCourseId] = useState<string | null>(null)
  const shownCourse = courseId ?? playedCourseIds[0] ?? null

  // ── Filter the holes, never the field ──
  const filtered = useMemo(
    () => (excluded.size === 0 ? stats : stats.filter(s => !excluded.has(s.courseId))),
    [stats, excluded],
  )
  const field = useMemo(() => playerStats(filtered), [filtered])
  const mine = useMemo(
    () => (who === 'everyone' ? null : statsFor(filtered, who)),
    [filtered, who],
  )
  const awards = useMemo(() => tripAwards(field), [field])
  const difficulty = useMemo(() => holeDifficulty(stats, holes), [stats, holes])

  // The gained-per-round bars: each round's field computed on that round's
  // holes alone, through the same lib functions as everything else — sliced
  // per round *after* the course filter, so the rule holds: the filter
  // narrows the holes, and the field on those holes is everybody.
  const roundBars = useMemo<GainedBar[]>(() => {
    if (who === 'everyone') return []
    return rounds.flatMap(r => {
      const rs = filtered.filter(s => s.roundId === r.id)
      if (basis === 'gross') {
        const g = gainedOnField(rs).get(who)
        if (!g || g.holes === 0) return []
        return [{
          label: `R${r.round_number}`,
          value: g.total,
          detail: `${formatGained(g.toGreen)} tee · ${formatGained(g.putting)} putt`,
        }]
      }
      const g = pointsVsField(rs).get(who)
      if (!g || g.holes === 0) return []
      return [{
        label: `R${r.round_number}`,
        value: g.points,
        detail: `${g.holes} holes`,
      }]
    })
  }, [filtered, who, basis, rounds])

  const toggleCourse = (id: string) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      // The last course standing cannot be switched off: a stats page over
      // no holes at all is not a state anybody means, and "put them all
      // back" is one tap on each chip that is off.
      else if (playedCourseIds.length - next.size > 1) next.add(id)
      return next
    })
  }

  const chip = (on: boolean) =>
    `flex-shrink-0 inline-flex items-center px-4 py-2.5 t-label rounded-xl border transition-colors duration-150 ${
      on
        ? 'bg-accent-deep text-white font-bold border-accent-deep'
        : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
    }`

  return (
    <div>
      {/* ── The instrument's controls, pinned under the site header ── */}
      <div
        className="sticky z-30 bg-cream -mx-4 px-4 pb-3 border-b border-bark/12 mb-4"
        style={{ top: HEADER_H }}
      >
        {/* The first choice on the page: who, or where. */}
        <div className="flex gap-2 pt-3">
          {([['players', 'Players'], ['courses', 'Courses']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`flex-1 py-3 rounded-xl t-label transition-colors duration-150 ${
                view === v
                  ? 'bg-accent-deep text-white font-bold'
                  : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'players' ? (
          <>
            {/* Who. The device's player first and pre-selected; everyone can
                read everyone — stats are no more private than the board. */}
            <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-1">
              <button type="button" aria-pressed={who === 'everyone'}
                onClick={() => setWho('everyone')} className={chip(who === 'everyone')}>
                Everyone
              </button>
              {[...players].sort((a, b) =>
                a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name),
              ).map(p => (
                <button key={p.id} type="button" aria-pressed={who === p.id}
                  onClick={() => setWho(p.id)} className={chip(who === p.id)}>
                  {p.id === meId ? 'You' : p.name.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Where — only when there is a genuine choice. Tinted is in. */}
            {playedCourseIds.length > 1 && (
              <div className="flex gap-1.5 mt-2 overflow-x-auto -mx-1 px-1 pb-1"
                role="group" aria-label="Courses included">
                {playedCourseIds.map(id => {
                  const on = !excluded.has(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCourse(id)}
                      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 t-cap rounded-xl border transition-colors duration-150 ${
                        on
                          ? 'border-accent bg-accent/[0.12] text-accent-deep'
                          : 'border-bark/12 text-ink/50 hover:border-bark/25'
                      }`}
                    >
                      {on ? '✓ ' : ''}{courseName.get(id) ?? 'Course'}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          /* Which course. One at a time here — this view reads one card. */
          playedCourseIds.length > 1 && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-1">
              {playedCourseIds.map(id => (
                <button key={id} type="button" aria-pressed={shownCourse === id}
                  onClick={() => setCourseId(id)} className={chip(shownCourse === id)}>
                  {courseName.get(id) ?? 'Course'}
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {thin && (
        <p className="t-cap text-ink/65 mb-4 leading-snug">
          A few holes in. These settle as more cards come in.
        </p>
      )}

      {view === 'players' && (
        mine ? (
          <PlayerPanels
            mine={mine}
            stats={filtered}
            playerId={who}
            rounds={rounds}
            courseFor={courseFor}
            courseName={courseName}
            basis={basis}
            onBasis={setBasis}
            chart={
              <GainedByRoundChart
                bars={roundBars}
                hint={basis === 'gross'
                  ? 'Round by round — tap a bar for the split.'
                  : 'Round by round, after handicap — tap a bar.'}
              />
            }
          />
        ) : who === 'everyone' ? (
          <EveryonePanels
            field={field}
            nameOf={nameOf}
            meId={meId}
            basis={basis}
            onBasis={setBasis}
            awards={awards}
            tripOver={tripOver}
          />
        ) : (
          <p className="t-body text-ink/80">
            Nothing tracked for {nameOf.get(who) ?? 'this player'} on the
            selected courses yet.
          </p>
        )
      )}

      {view === 'courses' && shownCourse && (
        <>
          {/* The per-course breakdown: who owns this course, then how the
              course fought back. Full-trip stats, untouched by the Players
              view's course filter — this view has its own selector. */}
          <CourseField
            stats={stats.filter(s => s.courseId === shownCourse)}
            nameOf={nameOf}
            meId={meId}
          />
          <Course
            rows={difficulty.filter(r => r.courseId === shownCourse)}
            title={courseName.get(shownCourse) ?? 'The course'}
          />
        </>
      )}
    </div>
  )
}

// ─── The course, one at a time ─────────────────────────────────

function Course({ rows, title }: {
  rows: ReturnType<typeof holeDifficulty>
  title: string
}) {
  if (rows.length === 0) {
    return <p className="t-body text-ink/80">Nothing scored on {title} yet.</p>
  }
  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3">
      <h2 className="t-card text-ink">{title}</h2>
      <p className="t-cap text-ink/65 mt-0.5 mb-2 leading-snug">
        Hardest first, off what was actually scored. The card&apos;s own
        stroke index is beside it, so the two can be read against each other.
      </p>
      <DifficultyProfileChart holes={rows} />
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
            {rows.map(r => (
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
  )
}
