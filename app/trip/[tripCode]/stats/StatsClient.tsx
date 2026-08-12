'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  playerStats, statsFor, holeDifficulty, gainedOnField,
  netGainedOnField, longGameGained,
  formatGained, formatRate, formatAverage,
  MIN_HOLE_SAMPLE,
  type HoleStat, type PuttShareMode,
} from '@/lib/holeStats'
import { tripAwards } from '@/lib/tripAwards'
import { HEADER_H } from '@/app/components/headerMetrics'
import { IconChevronLeft } from '@/app/components/icons'
import { PlayerPanels, EveryonePanels } from './panels'
import {
  GainedByRoundChart, DifficultyProfileChart, PentagonChart,
  type GainedBar,
} from './charts'
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

/** The five ways strokes gained splits, in spoke and chip order. */
const SG_COMPONENTS = [
  ['total', 'Total'],
  ['toGreen', 'Tee to green'],
  ['driving', 'Driving'],
  ['approach', 'Approach'],
  ['putting', 'Putting'],
] as const
type SgKey = (typeof SG_COMPONENTS)[number][0]

/** Where the putt-share choice lives between visits. Device-local on purpose. */
const PUTT_SHARE_KEY = 'gd-stats-putt-share'

export default function StatsClient({
  stats, holes, players, rounds, courseByRound, courseNames, meId, thin,
  tripCode,
  tripOver = false,
}: {
  tripCode: string
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
   * Which courses the figures are read over — additive, by request.
   *
   * This control has now been round the houses: a row of tick chips, then a
   * choose-one dropdown, and now a choose-many dropdown, because the real
   * question turned out to be "everything except the course where the
   * putting went wrong" — which a choice of one cannot say. Exclusions
   * rather than inclusions, so a course added to the trip mid-visit is in
   * by default; empty means every course. The last course standing cannot
   * be switched off — a stats page over no holes is not a state anybody
   * means.
   */
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [basis, setBasis] = useState<'gross' | 'net'>('gross')

  /**
   * The advanced setting: how much of the handicap allocation putting
   * carries. It moves only how the net figure divides between putting and
   * the long game — never a total, which the lib pins. Device-local, read
   * after mount so the server render never guesses at a localStorage.
   */
  const [shareMode, setShareMode] = useState<PuttShareMode>('fixed')
  useEffect(() => {
    if (window.localStorage.getItem(PUTT_SHARE_KEY) === 'by-par') setShareMode('by-par')
  }, [])
  const chooseShare = (m: PuttShareMode) => {
    setShareMode(m)
    try { window.localStorage.setItem(PUTT_SHARE_KEY, m) } catch { /* private mode */ }
  }

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

  const toggleCourse = (id: string) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (playedCourseIds.length - next.size > 1) next.add(id)
      return next
    })
  }
  const field = useMemo(() => playerStats(filtered, shareMode), [filtered, shareMode])
  const mine = useMemo(
    () => (who === 'everyone' ? null : statsFor(filtered, who, shareMode)),
    [filtered, who, shareMode],
  )
  const awards = useMemo(() => tripAwards(field), [field])
  const difficulty = useMemo(() => holeDifficulty(stats, holes), [stats, holes])

  // ── The hero graph: finalised holes only ──
  //
  // An open card moves under the reader, and the pentagon and the trend
  // should not — they redraw when a round is signed. The panels keep
  // counting a live card, which is the in-play banter; this is the analysis.
  const finalised = useMemo(() => filtered.filter(s => !s.live), [filtered])
  const [heroView, setHeroView] = useState<'pentagon' | 'trend'>('pentagon')
  const [trendKey, setTrendKey] = useState<SgKey>('total')

  // The five spokes, per 18 holes so a nine-hole evening compares honestly.
  // Gross on purpose — the original is field-relative gross, and the net
  // answer lives in the panel below with its own toggle.
  const hero = useMemo(() => {
    if (who === 'everyone') return null
    const g = gainedOnField(finalised).get(who)
    if (!g || g.holes === 0) return null
    const l = longGameGained(finalised).get(who)
    const per18 = (v: number) => (v / g.holes) * 18
    return {
      holes: g.holes,
      axes: [
        { key: 'total', label: 'Total', value: per18(g.total) },
        { key: 'toGreen', label: 'Tee to green', value: per18(g.toGreen) },
        { key: 'driving', label: 'Driving', value: per18(l?.driving ?? 0) },
        { key: 'approach', label: 'Approach', value: per18(l?.approach ?? g.toGreen) },
        { key: 'putting', label: 'Putting', value: per18(g.putting) },
      ],
    }
  }, [finalised, who])

  // The trend: one component across the finalised rounds, per 18. The
  // rule holds here too — each round's field is that round's holes, and
  // the driving pools learn from the whole trip so one round's chart does
  // not relearn the course from six cards.
  const trend = useMemo<GainedBar[]>(() => {
    if (who === 'everyone') return []
    return rounds.flatMap(r => {
      const rs = finalised.filter(s => s.roundId === r.id)
      if (rs.length === 0) return []
      const g = gainedOnField(rs).get(who)
      if (!g || g.holes === 0) return []
      const l = longGameGained(rs, finalised).get(who)
      const v = trendKey === 'total' ? g.total
        : trendKey === 'toGreen' ? g.toGreen
        : trendKey === 'putting' ? g.putting
        : trendKey === 'driving' ? (l?.driving ?? 0)
        : (l?.approach ?? g.toGreen)
      return [{
        label: `R${r.round_number}`,
        value: (v / g.holes) * 18,
        detail: `${g.holes} holes`,
      }]
    })
  }, [finalised, rounds, who, trendKey])

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

  /**
   * Whether the controls have scrolled up out of the way.
   *
   * Watched with an observer on the controls themselves rather than a scroll
   * handler: a scroll listener fires on every frame of a flick and has to
   * measure to answer, where this fires twice — once crossing out, once
   * crossing back. `rootMargin` pulls the viewport's top edge down to the
   * bottom of the site header, so "off screen" means off the part of the
   * screen the reader can actually see.
   */
  const controls = useRef<HTMLDivElement>(null)
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const el = controls.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting),
      { rootMargin: `-${HEADER_H}px 0px 0px 0px`, threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // What the collapsed line says. Named here rather than in the bar so the
  // chips above and the line below cannot come to call the same player two
  // different things.
  const whoLabel = view === 'courses'
    ? ''
    : who === 'everyone'
      ? 'Everyone'
      : who === meId ? 'You' : (nameOf.get(who) ?? 'Player').split(' ')[0]
  const includedIds = playedCourseIds.filter(id => !excluded.has(id))
  const whereLabel = view === 'courses'
    ? (shownCourse ? courseName.get(shownCourse) ?? 'Course' : '')
    : excluded.size === 0 ? 'All courses'
    : includedIds.length === 1 ? courseName.get(includedIds[0]) ?? 'Course'
    : `${includedIds.length} of ${playedCourseIds.length} courses`

  const chip = (on: boolean) =>
    `flex-shrink-0 inline-flex items-center px-4 py-2.5 t-label rounded-xl border transition-colors duration-150 ${
      on
        ? 'bg-accent-deep text-white font-bold border-accent-deep'
        : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
    }`

  return (
    <div>
      {/* ── The instrument's controls ──
          They scroll away. Pinned, they held a third of a phone screen for
          the whole page — three rows of chooser above every figure you came
          to read. What pins instead is the one line they collapse into,
          below. */}
      <div ref={controls} className="-mx-4 px-4 pb-3 border-b border-bark/12 mb-4">
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

            {/* Where — only when there is a genuine choice. Additive: any
                set of courses, so "everything except the bad putting round"
                is one tap. */}
            {playedCourseIds.length > 1 && (
              <div className="mt-2">
                <CoursePicker
                  ids={playedCourseIds}
                  nameOf={courseName}
                  roundsOn={roundsOn}
                  selected={new Set(includedIds)}
                  label={whereLabel}
                  onPick={toggleCourse}
                  onAll={() => setExcluded(new Set())}
                />
              </div>
            )}
          </>
        ) : (
          /* Which course. One at a time here — this view reads one card, so
             the same picker with a single selection and no all-courses row. */
          playedCourseIds.length > 1 && (
            <div className="mt-3">
              <CoursePicker
                ids={playedCourseIds}
                nameOf={courseName}
                roundsOn={roundsOn}
                selected={new Set(shownCourse ? [shownCourse] : [])}
                label={shownCourse ? courseName.get(shownCourse) ?? 'Course' : ''}
                onPick={id => setCourseId(id)}
              />
            </div>
          )
        )}
      </div>

      {/* The line the controls become. Fixed rather than sticky, so it costs
          the layout nothing until it is wanted and nothing shifts when it
          arrives — a sticky element holds its space in the flow whether it
          is stuck or not, which would leave a band of empty cream under the
          controls for the whole page. */}
      <CondensedBar
        show={condensed}
        who={whoLabel}
        where={whereLabel}
        onOpen={() => {
          const top = (controls.current?.offsetTop ?? 0) - HEADER_H
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        }}
      />

      {thin && (
        <p className="t-cap text-ink/65 mb-4 leading-snug">
          A few holes in. These settle as more cards come in.
        </p>
      )}

      {/* ── The hero: one player's skill profile ──
          First under the choosers, before any table — the draw-you-in
          moment. Gross, per round, finalised rounds only. */}
      {view === 'players' && hero && (
        <div className="bg-surface border border-bark/12 rounded-2xl px-4 pt-3 pb-1 mb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="t-card text-ink">Skill Profile</h2>
            <div className="flex gap-1 flex-shrink-0" role="group" aria-label="Chart style">
              {([['pentagon', 'Shape'], ['trend', 'Trend']] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={heroView === v}
                  onClick={() => setHeroView(v)}
                  className={`px-3 py-1.5 rounded-lg border text-[13px] tracking-wider uppercase transition-colors duration-150 ${
                    heroView === v
                      ? 'bg-accent-deep text-white border-accent-deep font-bold'
                      : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {heroView === 'pentagon' ? (
            <PentagonChart
              axes={hero.axes}
              hint={`Strokes gained a round, over ${hero.holes} finalised holes — tap a corner.`}
            />
          ) : (
            <>
              <div className="flex gap-1.5 mt-2 overflow-x-auto -mx-1 px-1 pb-1">
                {SG_COMPONENTS.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={trendKey === key}
                    onClick={() => setTrendKey(key)}
                    className={`flex-shrink-0 px-3 py-1.5 t-cap rounded-xl border transition-colors duration-150 ${
                      trendKey === key
                        ? 'border-accent bg-accent/[0.12] text-accent-deep'
                        : 'border-bark/12 text-ink/50 hover:border-bark/25'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              {/* The bars that used to sit inside the Strokes gained panel,
                  promoted here whole — above-and-below-the-line reads better
                  than a line joining the points, and the panel's chart was
                  this same picture in a smaller frame. One copy. */}
              {trend.length >= 2 ? (
                <GainedByRoundChart bars={trend} hint="Finalised rounds only — tap a bar." />
              ) : (
                <p className="t-cap text-ink/65 py-3">
                  One finalised round so far — the trend starts at the second.
                </p>
              )}
            </>
          )}
        </div>
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

      {view === 'players' && (
        <AdvancedSettings mode={shareMode} onMode={chooseShare} />
      )}

      {/* The manual, for anyone who wants the equations — which is why the
          panels themselves carry no explainers. */}
      <Link
        href={`/trip/${tripCode}/stats/guide`}
        className="block text-center mt-6 t-cap uppercase tracking-[0.18em] text-accent-deep hover:text-accent transition-colors"
      >
        How the numbers work
      </Link>

      {/* The course alone. The who-owns-this-course ranking that used to
          lead was another leaderboard, and the leaderboard has a tab. */}
      {view === 'courses' && shownCourse && (
        <Course
          rows={difficulty.filter(r => r.courseId === shownCourse)}
          title={courseName.get(shownCourse) ?? 'The course'}
        />
      )}
    </div>
  )
}

// ─── Advanced settings ─────────────────────────────────────────

/**
 * The one advanced setting: how much of the handicap allocation putting
 * carries in the net split. Both schemes ship because both are defensible —
 * a fifth matches measured scoring (the gap between handicaps lives mostly
 * in the long game), by-par reads naturally off the card. It moves only the
 * split; the lib pins that it can never move a total.
 *
 * A quiet disclosure at the foot rather than a gear in the controls: a
 * setting that most readers never need should not stand where the
 * instrument's own controls do.
 */
function AdvancedSettings({ mode, onMode }: {
  mode: PuttShareMode
  onMode: (m: PuttShareMode) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6 border-t border-bark/12 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-1 text-left"
      >
        <span className="text-[13px] tracking-wider uppercase text-ink/50">
          Advanced settings
        </span>
        <span className={`flex-shrink-0 text-ink/50 transition-transform duration-300 ease-out ${
          open ? '' : '-rotate-90'
        }`}>
          <IconChevronLeft size={16} />
        </span>
      </button>

      {open && (
        <div className="pt-2 pb-1">
          <p className="t-cap text-ink/80">Handicap share given to putting</p>
          <p className="t-cap text-ink/50 leading-snug mt-0.5">
            How the net figures divide your handicap between the green and
            everything before it. Splits only — no total moves.
          </p>
          <div className="flex gap-1.5 mt-2" role="group" aria-label="Putting share">
            {([
              ['fixed', 'A fifth'],
              ['by-par', 'By par'],
            ] as const).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={`px-3.5 py-2 t-cap rounded-xl border transition-colors duration-150 ${
                  mode === m
                    ? 'border-accent bg-accent/[0.12] text-accent-deep font-semibold'
                    : 'border-bark/12 text-ink/65 hover:border-bark/25'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <p className="t-cap text-ink/50 leading-snug mt-2">
            {mode === 'fixed'
              ? 'A fifth, whatever the par — measured scoring says the gap between handicaps lives mostly in the long game.'
              : 'Two shots of par — half on a par 4, two fifths on a par 5. Reads naturally, credits putting generously.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── The line the controls become ──────────────────────────────

/**
 * Who and where, on one line, once the choosers have scrolled away.
 *
 * The two categories arrive from the two sides — the player from the left,
 * where the chip row sat, the course from the right — and meet in the
 * middle. That is the whole animation and it is doing a job rather than
 * decorating: it says these two words *are* the two rows above, folded up,
 * rather than a new thing that appeared.
 *
 * Tapping it takes you back to them. Nothing else on the line is tappable,
 * because a bar that scrolls the page and also holds a control is a bar
 * where half the taps do the wrong thing.
 *
 * Fixed rather than sticky, and `-mx-4 px-4` has no meaning here: it spans
 * the viewport and re-establishes the page's own column inside itself, so
 * the words line up with the panels below whatever the screen is doing.
 */
function CondensedBar({
  show, who, where, onOpen,
}: {
  show: boolean
  /** Empty on the Courses view, which has no player to name. */
  who: string
  where: string
  onOpen: () => void
}) {
  return (
    <div
      className={`fixed left-0 right-0 z-30 bg-cream border-b border-bark/12 transition-[opacity,transform] duration-200 ease-out ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
      style={{ top: HEADER_H }}
      aria-hidden={!show}
    >
      <button
        type="button"
        onClick={onOpen}
        tabIndex={show ? 0 : -1}
        className="w-full max-w-lg mx-auto px-4 py-2.5 flex items-center gap-2 text-left transition-opacity duration-150 active:opacity-70"
      >
        {who && (
          <span
            className={`t-card text-ink truncate transition-transform duration-300 ease-out ${
              show ? 'translate-x-0' : '-translate-x-4'
            }`}
          >
            {who}
          </span>
        )}
        {who && where && (
          <span className="flex-shrink-0 w-1 h-1 rounded-full bg-bark/30" aria-hidden="true" />
        )}
        {where && (
          <span
            className={`t-cap text-ink/65 truncate transition-transform duration-300 ease-out ${
              show ? 'translate-x-0' : 'translate-x-4'
            }`}
          >
            {where}
          </span>
        )}
        {/* Up, to the choosers. Rotated rather than a second icon, for the
            same reason the picker's chevron is one icon turned. */}
        <span className="flex-1" />
        <span className="flex-shrink-0 text-ink/50 rotate-90" aria-hidden="true">
          <IconChevronLeft size={16} />
        </span>
      </button>
    </div>
  )
}

// ─── Which courses ─────────────────────────────────────────────

/**
 * The course selector: one line saying what you are reading, opening into
 * the list of what else you could.
 *
 * It replaced a row of tick chips that grew a column each time the trip
 * played somewhere new; the dropdown holds any number of courses in the
 * same footprint.
 *
 * **Additive, by request.** Tapping a course toggles it in or out, so any
 * set can be read — including "everything except the course where the
 * putting went wrong", which a choice of one cannot say. The All courses
 * row (where offered) puts everything back with one tap; the last course
 * standing cannot be switched off, because a stats page over no holes is
 * not a state anybody means. The Courses view passes no `onAll` and drives
 * it as a choice of one, since that view reads one card at a time.
 *
 * The panel does not close when a course is picked, and that is the point of
 * the chevron: the figures below are already redrawn behind the open list,
 * so you can build the set and watch the numbers move without the control
 * folding away between taps. The `<` puts it away when you are done.
 */
function CoursePicker({
  ids, nameOf, roundsOn, selected, label: headline, onPick, onAll,
}: {
  ids: string[]
  nameOf: Map<string, string>
  roundsOn: Map<string, number>
  /** The courses currently in — the dots down the list. */
  selected: ReadonlySet<string>
  /** What the closed line says. The caller owns the wording. */
  label: string
  onPick: (id: string) => void
  /** Everything back in, one tap. Absent, there is no All courses row. */
  onAll?: () => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const rounds = (id: string) => roundsOn.get(id) ?? 0
  const allOn = selected.size === ids.length
  const count = ids.filter(id => selected.has(id)).reduce((n, c) => n + rounds(c), 0)

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
          <span className="block t-card text-ink truncate mt-1">{headline}</span>
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
          <ul
            role="listbox"
            aria-label="Courses"
            aria-multiselectable={onAll ? true : undefined}
            className="border-t border-bark/12"
          >
            {onAll && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={allOn}
                  tabIndex={open ? 0 : -1}
                  onClick={onAll}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-bark/[0.08] transition-colors duration-150 ${
                    allOn ? 'bg-accent/[0.06]' : 'active:bg-bark/[0.04]'
                  }`}
                >
                  <span className={`flex-1 min-w-0 truncate t-cap ${
                    allOn ? 'text-accent-deep font-semibold' : 'text-ink'
                  }`}>
                    All courses
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${allOn ? 'bg-accent' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                </button>
              </li>
            )}
            {ids.map(id => {
              const on = selected.has(id)
              const n = rounds(id)
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    tabIndex={open ? 0 : -1}
                    onClick={() => onPick(id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-bark/[0.08] last:border-b-0 transition-colors duration-150 ${
                      on ? 'bg-accent/[0.06]' : 'active:bg-bark/[0.04]'
                    }`}
                  >
                    <span className={`flex-1 min-w-0 truncate t-cap ${
                      on ? 'text-accent-deep font-semibold' : 'text-ink'
                    }`}>
                      {nameOf.get(id) ?? 'Course'}
                    </span>
                    <span className="flex-shrink-0 t-cap text-ink/50 tabular-nums">
                      {n} {n === 1 ? 'round' : 'rounds'}
                    </span>
                    {/* The green dot marks each course that is in. */}
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
    </section>
  )
}
