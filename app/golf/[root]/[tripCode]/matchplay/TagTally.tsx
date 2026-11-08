import type { BoardRow } from '@/lib/boardRows'
import { cardClass } from '@/app/components/ui'

/**
 * A match play event's tags, by matches won and lost (Ross, 5 Nov 2026:
 * "start with a basic wins/losses tally by tag") — the secondary
 * leaderboard its field step made, drawn under the bracket because the
 * bracket is the event's leaderboard tab. Rows from `buildRows` (the tally
 * shell in lib/boardRows.ts), so the order and the shared places are any
 * board's.
 */
export default function TagTally({ title, rules, rows }: { title: string; rules: string; rows: BoardRow[] }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-10" aria-label={title}>
      <h2 className="t-h2 text-ink">{title}</h2>
      <p className="t-cap text-ink/65 mt-1 mb-3">{rules}</p>
      <div className={`${cardClass()} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-2 border-b border-line">
          <span className="t-eyebrow text-ink/65 w-6">#</span>
          <span className="t-eyebrow text-ink/65 flex-1">Tag</span>
          <span className="t-eyebrow text-ink/65 w-12 text-right">Won</span>
          <span className="t-eyebrow text-ink/65 w-12 text-right">Lost</span>
        </div>
        <ol className="divide-y divide-line">
          {rows.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-4 min-h-14">
              <span className="font-serif t-data text-ink/65 w-6 tabular-nums">{r.place}</span>
              <span className="flex-1 min-w-0 flex items-center gap-2">
                {r.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />}
                <span className="font-serif text-ink truncate">{r.name}</span>
              </span>
              <span className="font-serif t-data text-ink w-12 text-right tabular-nums">{r.record?.won ?? r.total}</span>
              <span className="font-serif t-data text-ink/65 w-12 text-right tabular-nums">{r.record?.lost ?? 0}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
