import Link from 'next/link'
import { ListGroup, ListRow, cardClass } from '@/app/components/ui'
import { indexTrend, seasonDepth, seasonOf, type IndexPoint, type SeasonRow } from '@/lib/cardSummary'
import { indexLabel } from '@/lib/handicapIndex'
import { clubEventDates } from '@/lib/clubs'
import { courseLabel } from '@/lib/courseDirectory'

/**
 * A golfer's season, the one drawing (D143): three tiles — rounds, average
 * and best Stableford — and the rounds under them. The club area and the
 * personal page both draw it; neither wears a club's colour here.
 */
export function SeasonTiles({ rows }: { rows: SeasonRow[] }) {
  const s = seasonOf(rows)
  const tiles = [
    { label: 'Rounds', value: String(s.rounds) },
    { label: 'Average points', value: s.averagePoints != null ? String(s.averagePoints) : '–' },
    { label: 'Best', value: s.bestPoints != null ? String(s.bestPoints) : '–' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {tiles.map(t => (
        <div key={t.label} className={`${cardClass('raised')} rounded-tile p-3`}>
          <p className="t-data text-[24px] leading-none text-ink">{t.value}</p>
          <p className="t-cap text-ink/65 mt-1">{t.label}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * The Stats tab's season (MO4, D283): the tiles, the best round, the index
 * this year, the rounds by name, then the fixed in-depth set — each only
 * where there is something to say. `footer` is any line the page adds (the
 * self-claimed one).
 */
export function SeasonSummary({ rows, courses, index = [], footer = null }: {
  rows: SeasonRow[]; courses: Record<string, string>; index?: IndexPoint[]; footer?: React.ReactNode
}) {
  const s = seasonOf(rows)
  const trend = indexTrend(index)
  const tiles = [
    { label: 'Rounds', value: String(s.rounds) },
    { label: 'Average points', value: s.averagePoints != null ? String(s.averagePoints) : '–' },
    { label: 'Best points', value: s.bestPoints != null ? String(s.bestPoints) : '–' },
    { label: 'Average gross', value: s.averageGross != null ? String(s.averageGross) : '–' },
  ]
  return (
    <>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {tiles.map(t => (
          <div key={t.label} className={`${cardClass('raised')} rounded-tile p-3`}>
            <p className="t-data text-[24px] leading-none text-ink">{t.value}</p>
            <p className="t-cap text-ink/65 mt-1">{t.label}</p>
          </div>
        ))}
      </div>
      {footer}
      {s.best && (
        <section className="mt-6">
          <h2 className="t-card text-ink">Best round</h2>
          <RoundCard r={s.best} courses={courses} />
        </section>
      )}
      {trend && (
        <section className="mt-6">
          <h2 className="t-card text-ink">Handicap index</h2>
          <div className={`${cardClass('raised')} p-4 mt-2`}>
            <p className="t-data text-[20px] text-ink">{indexLabel(trend.from)} → {indexLabel(trend.to)}</p>
            <p className="t-cap text-ink/65 mt-1">This year, {trend.points.length - 1} change{trend.points.length === 2 ? '' : 's'}</p>
            <IndexLine points={trend.points} />
          </div>
        </section>
      )}
      <h2 className="t-card text-ink mt-6">Rounds</h2>
      <SeasonRounds rows={rows} courses={courses} />
      <SeasonDepthCard rows={rows} />
    </>
  )
}

function RoundCard({ r, courses }: { r: SeasonRow; courses: Record<string, string> }) {
  const course = courses[r.course_id ?? ''] ? courseLabel(courses[r.course_id ?? '']) : null
  const inner = (
    <>
      <p className="t-cap text-ink/65">{[r.played_on ? clubEventDates(r.played_on, r.played_on) : null, course].filter(Boolean).join(' · ')}</p>
      <p className="t-card text-ink mt-1 break-words">{r.event_name ?? course ?? 'A round'}</p>
      <p className="t-data text-[17px] text-ink mt-1">{r.points} pts{r.gross != null ? ` · ${r.gross}` : ''}</p>
    </>
  )
  return r.event_code
    ? <Link href={`/${r.event_code}`} className={`${cardClass('floating', true)} block p-4 mt-2`}>{inner}</Link>
    : <div className={`${cardClass('raised')} p-4 mt-2`}>{inner}</div>
}

/** The index's steps as one quiet line — lower is better, so the line is drawn as it reads. */
function IndexLine({ points }: { points: IndexPoint[] }) {
  const W = 280, H = 48, pad = 4
  const vals = points.map(p => p.index)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || 1
  const d = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (W - pad * 2)
    const y = pad + ((p.index - lo) / span) * (H - pad * 2)
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12 mt-3" role="img" aria-label={`Index from ${indexLabel(points[0].index)} to ${indexLabel(points[points.length - 1].index)}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-deep" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** In depth (D283), a fixed set: fairways, greens, putts and the scoring mix, each from the rounds that recorded it. */
function SeasonDepthCard({ rows }: { rows: SeasonRow[] }) {
  const d = seasonDepth(rows)
  const from = (n: number) => `from ${n} round${n === 1 ? '' : 's'}`
  const lines = [
    d.fairways && { label: 'Fairways hit', value: `${d.fairways.pct}%`, hint: from(d.fairways.rounds) },
    d.greens && { label: 'Greens in regulation', value: `${d.greens.pct}%`, hint: from(d.greens.rounds) },
    d.putts && { label: 'Putts a round', value: String(d.putts.perRound), hint: from(d.putts.rounds) },
  ].filter((x): x is { label: string; value: string; hint: string } => !!x)
  return (
    <section className="mt-8">
      <h2 className="t-h2 text-ink">In depth</h2>
      {lines.length === 0 && !d.mix ? (
        <p className="text-ink/65 text-[15px] mt-2">Turn on stats in an event to see fairways, greens and putts here.</p>
      ) : (
        <>
          {lines.length > 0 && (
            <ListGroup className="mt-3">
              {lines.map(l => <ListRow key={l.label} label={l.label} hint={l.hint} value={<span className="t-data text-[17px] text-ink">{l.value}</span>} />)}
            </ListGroup>
          )}
          {d.mix && (
            <>
              <h3 className="t-label text-ink mt-5">Scoring a round</h3>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[['Birdies or better', d.mix.birdiesOrBetter], ['Pars', d.mix.pars], ['Bogeys', d.mix.bogeys], ['Doubles or worse', d.mix.doublesOrWorse]].map(([l, v]) => (
                  <div key={l as string} className={`${cardClass('raised')} rounded-tile p-2`}>
                    <p className="t-data text-[19px] leading-none text-ink">{v as number}</p>
                    <p className="t-cap text-ink/65 mt-1 leading-tight">{l as string}</p>
                  </div>
                ))}
              </div>
              <p className="t-cap text-ink/65 mt-2">{from(d.mix.rounds)}</p>
            </>
          )}
        </>
      )}
    </section>
  )
}

/** Each signed round this year, newest first: the event, the course, the day, the points and the gross. */
export function SeasonRounds({ rows, courses }: { rows: SeasonRow[]; courses: Record<string, string> }) {
  return (
    <ListGroup className="mt-3">
      {rows.map(r => (
        <ListRow
          key={r.round_id}
          label={r.event_name ?? (courses[r.course_id ?? ''] ? courseLabel(courses[r.course_id ?? '']) : 'A round')}
          href={r.event_code ? `/${r.event_code}` : undefined}
          hint={[r.event_name && courses[r.course_id ?? ''] ? courseLabel(courses[r.course_id ?? '']) : null, r.played_on ? clubEventDates(r.played_on, r.played_on) : null, r.holes < 18 ? `${r.holes} holes` : null,
            r.origin === 'club' ? 'Club round' : 'Open event'].filter(Boolean).join(' · ')}
          value={<span className="t-data text-[17px] text-ink">{r.points} pts{r.gross != null ? ` · ${r.gross}` : ''}</span>}
        />
      ))}
    </ListGroup>
  )
}

/** Said where there is no season yet. */
export const NO_SEASON = 'Your rounds show here once you’ve signed a card on a name linked to your account — claim your name in an event while signed in.'
