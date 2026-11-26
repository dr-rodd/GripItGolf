'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BENCHMARKS, DEFAULT_WINDOW, METRICS, ROLLING_WINDOWS, ROUND_FILTERS, SG_METRICS,
  averageOf, cardValue, chronological, filterRounds, formatSg, heatOf, placeLabel, rollingAverage, skillProfile,
  type Benchmark, type CareerRow, type Metric, type RoundsFilter,
} from '@/lib/careerStats'
import { askCareer } from '@/lib/careerClient'
import { indexLabel } from '@/lib/handicapIndex'
import { courseLabel } from '@/lib/courseDirectory'
import { RESULT_TEXT, signTone } from '@/lib/resultTone'
import { Button, PageTitle, Segmented, cardClass, chipClass } from '@/app/components/ui'
import { PentagonChart } from './PentagonChart'
import RoundCardSheet from './RoundCardSheet'

/**
 * A golfer's stats, the one page (Ross, 26 Nov 2026) — Home's Stats tab and
 * a club's draw it alike. DataGolf's profile page in Green Dot's clothes:
 * the headline figures, the skill pentagon, a rolling average, and every
 * round in a scrollable table with its score, gross and strokes gained, a
 * tap opening the round's scorecard.
 *
 * **Two switches govern the whole page**: which rounds (all, or club
 * competitions — "comps are serious", so they are marked wherever a round
 * is drawn) and what strokes gained is measured against (your handicap, the
 * default, or scratch). Every figure is lib/careerStats.ts's; this file
 * only draws. Asked once, after it paints.
 */

type Period = 'last10' | 'year' | 'all'
const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'last10', label: 'Last 10' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
]
const TABLE_PAGE = 25

/** Where the two switches live between visits, per phone. */
const PREFS_KEY = 'gd.career.v1'

export type CareerAnswer = { rows: CareerRow[]; courses: Record<string, string>; index: number | null }

export const NO_ROUNDS = 'Your rounds show here once you’ve signed a card on a name linked to your account — claim your name in an event while signed in.'

export default function CareerStats() {
  const [data, setData] = useState<CareerAnswer | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    void askCareer<CareerAnswer>('career').then(r => {
      if (!r.ok) { setError(r.error); return }
      setData({ rows: r.rows ?? [], courses: r.courses ?? {}, index: r.index ?? null })
    })
  }
  useEffect(load, [])

  if (error && !data) {
    return (
      <section className="mt-6">
        <PageTitle>Your stats</PageTitle>
        <p className="t-body text-ink/80 mt-4">{error}</p>
        <Button variant="secondary" className="mt-3" onClick={load}>Try again</Button>
      </section>
    )
  }
  if (!data) return <CareerSkeleton />
  return <CareerView data={data} />
}

/** The page once read — split from the asking so it can be drawn from rows handed in. */
export function CareerView({ data }: { data: CareerAnswer }) {
  const [filter, setFilter] = useState<RoundsFilter>('all')
  const [bench, setBench] = useState<Benchmark>('handicap')
  const [period, setPeriod] = useState<Period>('last10')

  useEffect(() => {
    try {
      const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as { filter?: string; bench?: string }
      if (p.filter === 'comps') setFilter('comps')
      if (p.bench === 'scratch') setBench('scratch')
    } catch { /* nothing kept */ }
  }, [])
  const keep = (next: { filter?: RoundsFilter; bench?: Benchmark }) => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ filter, bench, ...next })) } catch { /* private mode */ }
  }

  const rows = useMemo(() => filterRounds(data.rows, filter), [data, filter])

  if (data.rows.length === 0) {
    return (
      <section className="mt-6">
        <PageTitle sub={NO_ROUNDS}>Your stats</PageTitle>
      </section>
    )
  }

  const comps = data.rows.filter(r => r.competition).length
  const since = chronological(data.rows)[0]?.played_on?.slice(0, 4)

  return (
    <section className="mt-6">
      <PageTitle
        sub={`${data.rows.length} round${data.rows.length === 1 ? '' : 's'}${comps ? ` · ${comps} in comps` : ''}${since ? ` · since ${since}` : ''}`}
        below={
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Segmented label="Which rounds" dense value={filter}
              onChange={f => { setFilter(f); keep({ filter: f }) }} options={ROUND_FILTERS} />
            <Segmented label="Strokes gained against" dense value={bench}
              onChange={b => { setBench(b); keep({ bench: b }) }} options={BENCHMARKS} />
          </div>
        }
      >
        Your stats
      </PageTitle>

      {rows.length === 0 ? (
        <p className="t-body text-ink/80 mt-6">No competition rounds yet. A club competition’s cards show here once its results are certified.</p>
      ) : (
        <>
          <Headline rows={rows} bench={bench} period={period} onPeriod={setPeriod} index={data.index} />
          <Profile rows={rows} bench={bench} period={period} />
          <Rolling rows={rows} bench={bench} />
          <RoundsTable rows={rows} bench={bench} courses={data.courses} />
          <HowItWorks bench={bench} />
        </>
      )}
    </section>
  )
}

/** The rows a period reads: the last ten cards, this calendar year, or all of them. */
function inPeriod(rows: CareerRow[], period: Period): CareerRow[] {
  const ordered = chronological(rows)
  if (period === 'last10') return ordered.slice(-10)
  if (period === 'year') {
    const year = String(new Date().getFullYear())
    return ordered.filter(r => r.played_on?.startsWith(year))
  }
  return ordered
}

const benchWord = (b: Benchmark) => (b === 'handicap' ? 'your handicap' : 'scratch')

// ─── The headline ──────────────────────────────────────────────

function Headline({ rows, bench, period, onPeriod, index }: {
  rows: CareerRow[]; bench: Benchmark; period: Period; onPeriod: (p: Period) => void; index: number | null
}) {
  const these = inPeriod(rows, period)
  const sg = averageOf(these, 'total', bench)
  const pts = averageOf(these, 'points', bench)
  const gross = averageOf(these, 'gross', bench)
  const best = these.filter(r => r.holes >= 18).reduce<number | null>((m, r) => (m == null || r.points > m ? r.points : m), null)
  const tiles = [
    { label: `SG total a round`, value: sg ? formatSg(sg.value) : '–', tone: sg ? RESULT_TEXT[signTone(Math.round(sg.value * 100))] : 'text-ink' },
    { label: 'Average points', value: pts ? pts.value.toFixed(1) : '–', tone: 'text-ink' },
    { label: 'Average gross', value: gross ? gross.value.toFixed(1) : '–', tone: 'text-ink' },
    index != null
      ? { label: 'Handicap index', value: indexLabel(index), tone: 'text-ink' }
      : { label: 'Best points', value: best != null ? String(best) : '–', tone: 'text-ink' },
  ]
  return (
    <div className="mt-4">
      <Segmented label="Over which rounds" value={period} onChange={onPeriod} options={PERIODS} />
      <div className="grid grid-cols-2 gap-2 mt-2">
        {tiles.map(t => (
          <div key={t.label} className={`${cardClass('raised')} rounded-tile p-3`}>
            <p className={`t-data text-[26px] leading-none tabular-nums ${t.tone}`}>{t.value}</p>
            <p className="t-cap text-ink/65 mt-1.5">{t.label}</p>
          </div>
        ))}
      </div>
      <p className="t-cap text-ink/50 mt-2">
        {these.length} round{these.length === 1 ? '' : 's'} · strokes gained against {benchWord(bench)}
      </p>
    </div>
  )
}

// ─── The skill profile ─────────────────────────────────────────

function Profile({ rows, bench, period }: { rows: CareerRow[]; bench: Benchmark; period: Period }) {
  const these = inPeriod(rows, period)
  const axes = skillProfile(these, bench, null)
  return (
    <div className={`${cardClass()} px-4 pt-3 pb-2 mt-4`}>
      <h2 className="t-card text-ink">Skill profile</h2>
      {axes ? (
        <PentagonChart
          axes={axes.map(a => ({ key: a.key, label: a.label, value: a.value, detail: `over ${a.rounds} round${a.rounds === 1 ? '' : 's'}` }))}
          hint={`Strokes gained a round against ${benchWord(bench)} — tap a corner.`}
          zeroLabel={bench === 'handicap' ? 'Your handicap' : 'Scratch'}
        />
      ) : (
        <p className="t-cap text-ink/65 py-3 leading-snug">
          The profile needs putts and fairways on the card. Play an event with stats switched on and it fills in — driving needs three others in the round recording theirs too.
        </p>
      )}
    </div>
  )
}

// ─── Rolling stats ─────────────────────────────────────────────

function Rolling({ rows, bench }: { rows: CareerRow[]; bench: Benchmark }) {
  const [metric, setMetric] = useState<Metric>('total')
  const [span, setSpan] = useState<number>(DEFAULT_WINDOW)
  const points = useMemo(() => rollingAverage(rows, metric, bench, span), [rows, metric, bench, span])
  const label = METRICS.find(m => m.value === metric)?.label ?? ''
  return (
    <div className={`${cardClass()} px-4 pt-3 pb-3 mt-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-card text-ink whitespace-nowrap">Rolling stats</h2>
        <label className="flex-shrink-0">
          <span className="sr-only">Moving average over</span>
          <select value={span} onChange={e => setSpan(Number(e.target.value))}
            className="t-label text-ink bg-tint rounded-tile px-2 min-h-10 ch-focus">
            {ROLLING_WINDOWS.map(w => <option key={w} value={w}>{w}-round average</option>)}
          </select>
        </label>
      </div>
      <div className="flex gap-1.5 mt-3 overflow-x-auto scroll-strip -mx-1 px-1 pb-1" role="group" aria-label="What to chart">
        {METRICS.map(m => (
          <button key={m.value} type="button" aria-pressed={metric === m.value}
            onClick={() => setMetric(m.value)} className={`${chipClass(metric === m.value, true)} flex-shrink-0`}>
            {m.label}
          </button>
        ))}
      </div>
      {points.length >= 2
        ? <RollingChart points={points} metric={metric} label={label} />
        : <p className="t-cap text-ink/65 py-4">{points.length === 1 ? 'One round so far — the line starts at the second.' : `No rounds with ${label.toLowerCase()} yet.`}</p>}
    </div>
  )
}

const ACCENT = 'var(--color-accent)'
const ACCENT_DEEP = 'var(--color-accent-deep)'
const INK = 'var(--color-ink)'
const BARK = 'var(--color-bark)'

/**
 * The moving average as one line, oldest on the left — DataGolf's rolling
 * chart. On a strokes-gained figure the line stands on a zero line (the
 * benchmark) and the area between them is washed emerald above, bark below
 * (lib/resultTone.ts, never red); position carries the sign, colour agrees.
 * Each round is a mark on the line, **a club competition's solid** and every
 * other round's open, so a run of comps can be read at a glance. A tap pins
 * the nearest round's readout.
 */
function RollingChart({ points, metric, label }: {
  points: { row: CareerRow; value: number; n: number }[]
  metric: Metric
  label: string
}) {
  const [pinned, setPinned] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const sg = metric !== 'points' && metric !== 'gross'
  const W = 328, H = 168, PAD_L = 34, PAD_R = 8, TOP = 10, BOTTOM = 22
  const vals = points.map(p => p.value)
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (sg) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  const pad = Math.max((hi - lo) * 0.12, sg ? 0.25 : 0.5)
  lo -= pad; hi += pad
  const xOf = (i: number) => PAD_L + (i / (points.length - 1)) * (W - PAD_L - PAD_R)
  const yOf = (v: number) => TOP + ((hi - v) / (hi - lo)) * (H - TOP - BOTTOM)
  const span = hi - lo
  const step = [0.5, 1, 2, 5, 10, 20].find(s => span / s <= 5) ?? 50
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ')
  const zeroY = yOf(0)
  const area = `${line} L${xOf(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L${xOf(0).toFixed(1)} ${zeroY.toFixed(1)} Z`
  // A year's first round carries the year under the axis.
  const years = points.map((p, i) => ({ i, y: p.row.played_on?.slice(0, 4) ?? '' }))
    .filter((p, k, all) => p.y && (k === 0 || all[k - 1].y !== p.y))
  const fmt = (v: number) => (sg ? formatSg(v) : v.toFixed(1))
  const current = pinned != null ? points[pinned] : null
  const clipId = `roll-${metric}`

  const pick = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return
    const x = ((clientX - box.left) / box.width) * W
    const i = Math.round(((x - PAD_L) / (W - PAD_L - PAD_R)) * (points.length - 1))
    setPinned(Math.max(0, Math.min(points.length - 1, i)))
  }

  return (
    <div className="pt-3">
      <p className="t-cap text-ink/65 leading-snug mb-1 min-h-[2.6em]" aria-live="polite">
        {current ? (
          <>
            <span className="text-ink">{current.row.event_name ?? 'A round'}</span>
            {current.row.played_on && <span className="text-ink/50"> · {shortDate(current.row.played_on)}</span>}
            <br />
            <span className="t-num text-ink">{fmt(current.value)}</span>
            <span className="text-ink/50"> over {current.n} round{current.n === 1 ? '' : 's'}</span>
          </>
        ) : (
          <>{label}, the latest {points[points.length - 1].n}-round average <span className="t-num text-ink">{fmt(points[points.length - 1].value)}</span>. Tap the line for any round.</>
        )}
      </p>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto font-serif touch-pan-y" role="img"
        aria-label={`${label}, moving average, from ${fmt(points[0].value)} to ${fmt(points[points.length - 1].value)}`}
        onPointerDown={e => pick(e.clientX)}
        onPointerMove={e => { if (e.buttons) pick(e.clientX) }}>
        <defs>
          <clipPath id={`${clipId}-up`}><rect x="0" y="0" width={W} height={Math.max(0, zeroY)} /></clipPath>
          <clipPath id={`${clipId}-down`}><rect x="0" y={zeroY} width={W} height={Math.max(0, H - zeroY)} /></clipPath>
        </defs>
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yOf(v)} y2={yOf(v)} stroke={BARK} strokeOpacity={sg && v === 0 ? 0.4 : 0.08} strokeWidth="1"
              strokeDasharray={sg && v === 0 ? '3 3' : undefined} />
            <text x={PAD_L - 5} y={yOf(v) + 3.5} textAnchor="end" fontSize="11" fill={INK} fillOpacity="0.5"
              style={{ fontVariantNumeric: 'tabular-nums' }}>
              {sg ? (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0') : v}
            </text>
          </g>
        ))}
        {sg && (
          <>
            <path d={area} fill={ACCENT} fillOpacity="0.14" clipPath={`url(#${clipId}-up)`} />
            <path d={area} fill={BARK} fillOpacity="0.12" clipPath={`url(#${clipId}-down)`} />
          </>
        )}
        <path d={line} fill="none" stroke={ACCENT_DEEP} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 60 && points.map((p, i) => (
          <circle key={p.row.round_id} cx={xOf(i)} cy={yOf(p.value)} r={pinned === i ? 4.5 : p.row.competition ? 3 : 2.5}
            fill={p.row.competition || pinned === i ? ACCENT_DEEP : 'var(--color-surface)'} stroke={ACCENT_DEEP} strokeWidth="1.25" />
        ))}
        {current && pinned != null && (
          <line x1={xOf(pinned)} x2={xOf(pinned)} y1={TOP} y2={H - BOTTOM} stroke={INK} strokeOpacity="0.25" strokeWidth="1" />
        )}
        {years.map(({ i, y }) => (
          <text key={`${y}-${i}`} x={xOf(i)} y={H - 6} textAnchor={i === 0 ? 'start' : 'middle'} fontSize="11" fill={INK} fillOpacity="0.5">{y}</text>
        ))}
      </svg>
      <p className="t-cap text-ink/50 flex items-center gap-3 mt-1">
        <span className="inline-flex items-center gap-1.5"><svg width="8" height="8" aria-hidden="true"><circle cx="4" cy="4" r="3" fill={ACCENT_DEEP} /></svg>Comp</span>
        <span className="inline-flex items-center gap-1.5"><svg width="8" height="8" aria-hidden="true"><circle cx="4" cy="4" r="3" fill="var(--color-surface)" stroke={ACCENT_DEEP} strokeWidth="1.25" /></svg>Other round</span>
      </p>
    </div>
  )
}

// ─── Every round ───────────────────────────────────────────────

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
/** The table's date: the year in two figures, so a Comp tag and the day fit the pinned column. */
const tableDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

/** A strokes-gained cell's wash: emerald for a gain, bark for a loss, stronger the bigger it is. */
function heatStyle(v: number | null): React.CSSProperties | undefined {
  const h = heatOf(v)
  if (!h || v == null) return undefined
  const pct = Math.round(6 + h * 30)
  return { backgroundColor: `color-mix(in srgb, var(${v > 0 ? '--color-accent' : '--color-bark'}) ${pct}%, transparent)` }
}

/**
 * Every round, newest first, in one table that scrolls sideways under its
 * pinned first column — DataGolf's tournament table: the place in the round,
 * the points, the gross, then strokes gained a part of the game at a time,
 * each cell washed by how far it went either way. **A competition round
 * carries a Comp tag and an ink edge.** A tap opens the round's scorecard.
 */
function RoundsTable({ rows, bench, courses }: { rows: CareerRow[]; bench: Benchmark; courses: Record<string, string> }) {
  const [shown, setShown] = useState(TABLE_PAGE)
  const [open, setOpen] = useState<{ row: CareerRow; el: HTMLElement } | null>(null)
  const list = rows.slice(0, shown)
  const courseOf = (r: CareerRow) => (r.course_id && courses[r.course_id] ? courseLabel(courses[r.course_id]) : null)
  const head = 't-eyebrow text-ink/65 font-normal px-2 py-2 whitespace-nowrap'
  const th = `${head} text-right`
  const td = 'px-2 py-2.5 text-right t-data text-[15px] tabular-nums whitespace-nowrap'
  return (
    <div className="mt-6">
      <h2 className="t-h2 text-ink">Every round</h2>
      <p className="t-cap text-ink/65 mt-1">Strokes gained against {benchWord(bench)}, on the card as played. Tap a round for its scorecard.</p>
      <div className={`${cardClass()} mt-3 overflow-x-auto scroll-strip`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface border-r border-line" />
              <th colSpan={3} className="t-eyebrow text-ink/50 font-normal px-2 pt-2 text-center">Card</th>
              <th colSpan={SG_METRICS.length} className="t-eyebrow text-accent-deep font-normal px-2 pt-2 text-center border-l border-line">Strokes gained</th>
            </tr>
            <tr className="border-b border-line">
              <th className={`${head} text-left pl-3 sticky left-0 z-10 bg-surface border-r border-line`}>Round</th>
              <th className={th}>Fin</th>
              <th className={th}>Pts</th>
              <th className={th}>Gross</th>
              {[...SG_METRICS.slice(1).reverse(), SG_METRICS[0]].map((m, k) => (
                <th key={m.value} className={`${th} ${k === 0 ? 'border-l border-line' : ''}`}>{m.short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(r => {
              const course = courseOf(r)
              const name = r.event_name ?? course ?? 'A round'
              return (
                <tr key={r.round_id} tabIndex={0} aria-label={`${name}, open the scorecard`}
                  className="border-b border-line last:border-b-0 cursor-pointer active:bg-tint ch-focus"
                  onClick={e => setOpen({ row: r, el: e.currentTarget })}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen({ row: r, el: e.currentTarget }) } }}>
                  <td className="sticky left-0 z-10 bg-surface border-r border-line px-0 py-2 text-left">
                    <div className="flex items-stretch gap-2 pr-2 w-[150px]">
                      <span className={`w-[3px] rounded-full flex-shrink-0 ${r.competition ? 'bg-ink' : 'bg-transparent'}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-ink truncate leading-tight">{name}</p>
                        <p className="t-cap text-ink/65 truncate mt-0.5 flex items-center gap-1.5">
                          {r.competition && <span className="rounded-tag bg-ink text-surface text-[13px] font-semibold leading-none px-1.5 py-0.5">Comp</span>}
                          <span className="truncate">{r.played_on ? tableDate(r.played_on) : ''}{r.holes < 18 ? ` · ${r.holes}h` : ''}</span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={`${td} text-ink/80`} title={r.sg?.field ? `of ${r.sg.field}` : undefined}>{placeLabel(r.sg)}</td>
                  <td className={`${td} text-ink`}>{r.points}</td>
                  <td className={`${td} text-ink`}>{r.gross ?? '–'}</td>
                  {[...SG_METRICS.slice(1).reverse(), SG_METRICS[0]].map((m, k) => {
                    const v = cardValue(r, m.value, bench)
                    return (
                      <td key={m.value} style={heatStyle(v)}
                        className={`${td} ${k === 0 ? 'border-l border-line' : ''} ${m.value === 'total' ? 'font-semibold' : ''} ${v == null ? 'text-ink/50' : 'text-ink'}`}>
                        {formatSg(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <Button variant="secondary" className="mt-3" onClick={() => setShown(n => n + TABLE_PAGE)}>
          Show {Math.min(TABLE_PAGE, rows.length - shown)} more
        </Button>
      )}
      {open && (
        <RoundCardSheet
          roundId={open.row.round_id}
          title={open.row.event_name ?? courseOf(open.row) ?? 'Your round'}
          line={[open.row.event_name ? courseOf(open.row) : null, open.row.played_on ? shortDate(open.row.played_on) : null].filter(Boolean).join(' · ')}
          origin={open.el}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

// ─── How it is worked out ──────────────────────────────────────

function HowItWorks({ bench }: { bench: Benchmark }) {
  return (
    <details className="mt-6 border-t border-line pt-3 group">
      <summary className="t-label text-ink/80 cursor-pointer min-h-11 flex items-center">How the numbers work</summary>
      <div className="t-cap text-ink/65 leading-relaxed space-y-2 pb-2">
        <p>
          Strokes gained compares each hole with what {bench === 'handicap'
            ? 'your handicap expects: par plus your share of the course handicap, more on the hard holes than the easy ones'
            : 'a scratch golfer expects: par'}. Positive is better.
        </p>
        <p>
          Total needs only the scores. Putting and tee to green need a putt count on every hole: putting is measured against two putts, tee to green against the rest of par. Driving needs three others in the round recording their fairways — a fairway everybody hits earns little, one nobody hits earns a lot — and approach is what is left of tee to green.
        </p>
        <p>Averages are per 18 holes, so a nine sits beside an eighteen honestly. Fin is your place in the round on points.</p>
      </div>
    </details>
  )
}

function CareerSkeleton() {
  return (
    <section className="mt-6" aria-busy="true">
      <div className="skeleton h-28 rounded-card" />
      <div className="grid grid-cols-2 gap-2 mt-4">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-tile" />)}</div>
      <div className="skeleton h-72 rounded-card mt-4" />
    </section>
  )
}
