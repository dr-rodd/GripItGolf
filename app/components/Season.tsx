import { cardClass } from '@/app/components/ui'
import { seasonOf, type SeasonRow } from '@/lib/cardSummary'

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

// The Stats tab itself is a golfer's career stats (app/components/stats/
// CareerStats.tsx, Ross, 26 Nov 2026), which replaced the season summary
// that stood here.
