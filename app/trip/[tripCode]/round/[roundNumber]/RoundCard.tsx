import { type CardNine, type CourseCard } from '@/lib/courseCard'

/**
 * The width of the out/in column, on both nines.
 *
 * Fixed so the front and the back line up. Wide enough for "Out" and for a
 * three-figure par, which is as much as either can ever hold.
 */
const TOTAL_COL = '2.75rem'

/**
 * The course's card, two nines deep.
 *
 * Eighteen across does not fit a phone and is not how a scorecard has ever
 * been read anyway. Nine at a time, par over stroke index, with the nine's
 * par at the end of it — the shape of every card in every pro shop.
 *
 * Only one set of numbers is ever printed. A course carrying a ladies card
 * shows it to the players who play off it and the men's to everybody else;
 * both at once would be four rows of small figures on a screen with room for
 * two. `lib/courseCard.ts` decides which, and says so on the card itself.
 *
 * No yardage row. Those columns exist in the schema and have never held a
 * value, and an empty column is worse than no column.
 */
export default function RoundCard({ card }: { card: CourseCard }) {
  return (
    <div className="flex flex-col gap-4">
      <Nine label="Out" nine={card.front} />
      <Nine label="In" nine={card.back} />

      <div className="flex items-baseline justify-between border-t border-bark/12 pt-3">
        <span className="t-cap uppercase tracking-[0.18em] text-ink/65">
          Par{card.ladies ? ' · ladies card' : ''}
        </span>
        <span className="t-card text-ink tabular-nums">{card.par}</span>
      </div>
    </div>
  )
}

function Nine({ label, nine }: { label: string; nine: CardNine }) {
  if (nine.holes.length === 0) return null

  return (
    <div className="rounded-xl border border-bark/12 bg-surface overflow-hidden">
      {/* The trailing column is a fixed width, not `auto`. Sized to its
          content it was as wide as the word in it — "Out" being wider than
          "In" — which left the two nines with different hole columns and a
          card that did not line up with itself. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${nine.holes.length}, minmax(0, 1fr)) ${TOTAL_COL}` }}
      >

        <Row cells={nine.holes.map(h => String(h.number))} total={label}
             head className="text-ink/65" />
        <Row cells={nine.holes.map(h => String(h.par))} total={String(nine.par)}
             className="text-ink t-num" />
        <Row cells={nine.holes.map(h => String(h.strokeIndex))} total="SI"
             className="text-ink/50" last />

      </div>
    </div>
  )
}

/**
 * One line of the grid.
 *
 * The trailing cell is the nine's own — its label on the hole row, its par
 * on the par row — so the column that matters sits where the eye lands at the
 * end of a line rather than needing a heading of its own.
 */
function Row({
  cells, total, head = false, last = false, className = '',
}: {
  cells: string[]
  total: string
  head?: boolean
  last?: boolean
  className?: string
}) {
  const base = `py-2 text-center text-[13px] tabular-nums ${className}`
  const border = last ? '' : 'border-b border-bark/[0.08]'
  return (
    <>
      {cells.map((c, i) => (
        <span
          key={i}
          className={`${base} ${border} ${head ? 'uppercase tracking-wider' : ''}`}
        >
          {c}
        </span>
      ))}
      <span
        className={`${base} ${border} bg-bark/[0.04] uppercase tracking-wider ${
          head ? 'text-ink/65' : 'text-ink/80'
        }`}
      >
        {total}
      </span>
    </>
  )
}
