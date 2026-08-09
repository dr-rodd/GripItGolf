'use client'

import { useId, useMemo, useState } from 'react'
import {
  playerStats, statsFor, holeDifficulty, gainedOnField, pointsVsField,
  formatGained, formatRate, formatAverage,
  MIN_HOLE_SAMPLE,
  type HoleStat,
} from '@/lib/holeStats'
import { tripAwards } from '@/lib/tripAwards'
import { HEADER_H } from '@/app/components/headerMetrics'
import { IconChevronLeft } from '@/app/components/icons'
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
  /**
   * Which courses the figures are read over: `null` is every one of them.
   *
   * It was a set of exclusions behind a row of tick chips — every course a
   * separate on/off, so "this course only" was a tap on each of the others
   * and the row grew a column per course. One choice at a time is the
   * question people actually ask of it, and a course added to the trip
   * mid-visit is still in by default, because the default is not a list.
   */
  const [only, setOnly] = useState<string | null>(null)
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
    () => (only === null ? stats : stats.filter(s => s.courseId === only)),
    [stats, only],
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

  // How much play each course carries, for the picker's right-hand readout.
  // Rounds rather than holes: `stats` is one row per player per hole, so a
  // hole count reads as 72 where four played eighteen.
  const roundsOn = useMemo(() => {
    const seen = new Map<string, Set<string>>()
    for (const s of stats) {
      const set = seen.get(s.courseId) ?? new Set<string>()
      set.add(s.roundId)
      seen.set(s.courseId, set)
    }
    return new Map([...seen].map(([id, set]) => [id, set.size]))
  }, [stats])

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

            {/* Where — only when there is a genuine choice. */}
            {playedCourseIds.length > 1 && (
              <div className="mt-2">
                <CoursePicker
                  ids={playedCourseIds}
                  nameOf={courseName}
                  roundsOn={roundsOn}
                  value={only}
                  onChange={setOnly}
                  allLabel="All courses"
                />
              </div>
            )}
          </>
        ) : (
          /* Which course. One at a time here — this view reads one card, so
             the same picker with no all-courses row to offer. */
          playedCourseIds.length > 1 && (
            <div className="mt-3">
              <CoursePicker
                ids={playedCourseIds}
                nameOf={courseName}
                roundsOn={roundsOn}
                value={shownCourse}
                onChange={id => id && setCourseId(id)}
              />
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

// ─── Which courses ─────────────────────────────────────────────

/**
 * The course selector: one line saying what you are reading, opening into
 * the list of what else you could.
 *
 * **It replaced a row of tick chips, and the row was the problem rather than
 * the ticks.** Every course was its own on/off switch, so the commonest
 * question — this course on its own — cost a tap on every *other* course,
 * and the control grew a column each time the trip added a round somewhere
 * new. A choice of one is a list, not a set of switches.
 *
 * So: `null` is every course, an id is that course alone, and there is no
 * third state to get into. The old row's rule about never switching the last
 * course off stops existing rather than being enforced — with one choice at
 * a time, no tap can leave the page with no holes on it.
 *
 * Two shapes from one component. The Players view offers the all-courses
 * row; the Courses view reads one card at a time and passes no `allLabel`,
 * so it simply has no such row and `null` can never be chosen.
 *
 * The panel does not close when a course is picked, and that is the point of
 * the chevron: the figures below are already redrawn behind the open list,
 * so you can try a course, see what it did, and try another without the
 * control folding away between each. The `<` puts it away when you are done.
 */
function CoursePicker({
  ids, nameOf, roundsOn, value, onChange, allLabel,
}: {
  ids: string[]
  nameOf: Map<string, string>
  roundsOn: Map<string, number>
  /** null is every course — only reachable where `allLabel` is given. */
  value: string | null
  onChange: (id: string | null) => void
  allLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const rounds = (id: string | null) =>
    id === null
      ? ids.reduce((n, c) => n + (roundsOn.get(c) ?? 0), 0)
      : roundsOn.get(id) ?? 0

  const label = (id: string | null) =>
    id === null ? allLabel ?? '' : nameOf.get(id) ?? 'Course'

  const options: (string | null)[] = allLabel ? [null, ...ids] : ids
  const count = rounds(value)

  return (
    <div className="bg-surface border border-bark/12 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-opacity duration-150 active:opacity-70"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] uppercase tracking-[0.14em] text-ink/50 leading-none">
            Courses
          </span>
          <span className="block t-card text-ink truncate mt-1">{label(value)}</span>
        </span>
        <span className="flex-shrink-0 t-cap text-ink/50 tabular-nums">
          {count} {count === 1 ? 'round' : 'rounds'}
        </span>
        {/* A left chevron, turned down while the list is shut. Open, it is
            the `<` that puts it away — the same control both ways round,
            rather than a caret that means "more" and a cross that means
            "done". */}
        <span
          className={`flex-shrink-0 text-ink/50 transition-transform duration-300 ease-out ${
            open ? '' : '-rotate-90'
          }`}
        >
          <IconChevronLeft size={18} />
        </span>
      </button>

      {/* `0fr → 1fr` so the height animates without anything being measured,
          the same way the hub's sections open. Reduced motion switches it
          off centrally in globals.css. */}
      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <ul role="listbox" aria-label="Courses" className="border-t border-bark/12">
            {options.map(id => {
              const on = id === value
              const n = rounds(id)
              return (
                <li key={id ?? '·all'}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    tabIndex={open ? 0 : -1}
                    onClick={() => onChange(id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-bark/[0.08] last:border-b-0 transition-colors duration-150 ${
                      on ? 'bg-accent/[0.06]' : 'active:bg-bark/[0.04]'
                    }`}
                  >
                    <span className={`flex-1 min-w-0 truncate t-cap ${
                      on ? 'text-accent-deep font-semibold' : 'text-ink'
                    }`}>
                      {label(id)}
                    </span>
                    <span className="flex-shrink-0 t-cap text-ink/50 tabular-nums">
                      {n} {n === 1 ? 'round' : 'rounds'}
                    </span>
                    {/* The green dot, doing what it does on the wordmark:
                        marking the one that counts. Not a tick — a tick in a
                        list of taps reads as a box you have to fill in, and
                        this is a choice of one. */}
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${on ? 'bg-accent' : 'bg-transparent'}`}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
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
