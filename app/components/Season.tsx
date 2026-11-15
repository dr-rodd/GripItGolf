import { ListGroup, ListRow, cardClass } from '@/app/components/ui'
import { seasonOf, type SeasonRow } from '@/lib/cardSummary'
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

/** Each signed round this year, newest first: the course, the day, the points and the gross. */
export function SeasonRounds({ rows, courses }: { rows: SeasonRow[]; courses: Record<string, string> }) {
  return (
    <ListGroup className="mt-6">
      {rows.map(r => (
        <ListRow
          key={r.round_id}
          label={courses[r.course_id ?? ''] ? courseLabel(courses[r.course_id ?? '']) : 'A round'}
          hint={[r.played_on ? clubEventDates(r.played_on, r.played_on) : null, r.holes < 18 ? `${r.holes} holes` : null,
            r.origin === 'club' ? 'Club round' : 'Open event'].filter(Boolean).join(' · ')}
          value={<span className="t-data text-[17px] text-ink">{r.points} pts{r.gross != null ? ` · ${r.gross}` : ''}</span>}
        />
      ))}
    </ListGroup>
  )
}

/** Said where there is no season yet. */
export const NO_SEASON = 'Your rounds show here once you’ve signed a card on a name linked to your account — claim your name in an event while signed in.'
