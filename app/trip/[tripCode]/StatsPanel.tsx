import Link from 'next/link'
import {
  formatGained, formatRate, formatAverage, type PlayerStats,
} from '@/lib/holeStats'

/**
 * The player's own trip, at a glance, on the hub.
 *
 * A headline — how the trip stands against their handicap, which is the
 * figure a golfer actually carries around — then four lines, and a way
 * through to the stats hub. Nothing is worked out here — every number
 * comes off `lib/holeStats.ts` through the same formatters the stats hub
 * uses, so the two cannot print the same figure two ways. The vs-handicap
 * total is a sum of derived per-round figures, which is arithmetic on the
 * derivation, not a second derivation.
 *
 * The section this sits in only renders when the trip has stats switched on
 * **and** something has been recorded. `docs/features.md` has kept the hub
 * clear of a heading with nothing behind it since the old stat tiles were
 * deleted, and that rule is unchanged — it is now enforced on the gate
 * rather than by the word "stats" being absent from the page.
 *
 * Server component. No state.
 */
export default function StatsPanel({
  mine, tripCode, thin,
}: {
  /** Null when this player has a card but nothing tracked on it yet. */
  mine: PlayerStats | null
  tripCode: string
  thin: boolean
}) {
  return (
    <div>
      {mine ? (
        <div className="rounded-2xl border border-bark/12 bg-surface px-4 py-1">
          {/* The headline. Stableford points against two a hole: level means
              the trip is being played exactly to handicap, and the sign is
              the one every golfer already reads off a board. */}
          {mine.form.length > 0 && (() => {
            const vs = mine.form.reduce((n, r) => n + r.vsHandicap, 0)
            const tone = Math.round(vs * 10) === 0 ? 'text-ink'
              : vs > 0 ? 'text-accent-deep' : 'text-rust-deep'
            return (
              <div className="pt-3 pb-2.5 border-b border-bark/[0.08]">
                <span className="t-cap uppercase tracking-[0.12em] text-ink/50">
                  Vs your handicap
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className={`font-[family-name:var(--font-display)] text-3xl t-num ${tone}`}>
                    {formatGained(vs)}
                  </span>
                  <span className="t-cap text-ink/65">
                    over {mine.form.length} round{mine.form.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            )
          })()}
          <Figure label="Fairways" value={formatRate(mine.fairways.hitRate)}
            note={`${mine.fairways.hit} of ${mine.fairways.counted}`} />
          <Figure label="Greens" value={formatRate(mine.putting.girRate)}
            note={`${mine.putting.greensHit} of ${mine.putting.greenHoles}`} />
          <Figure label="Putts a round" value={formatAverage(mine.putting.puttsPer18)} />
          {/* No note when there is nothing to compare against yet. The
              longest label on the panel plus a note pushed it onto two lines
              and truncated the note anyway, which explained less than the
              dash does on its own — and the line below already says why. */}
          <Figure
            label="Gained on the field"
            value={mine.gained.holes === 0 ? '—' : formatGained(mine.gained.total)}
            // Rust is for a loss, and shots lost to the field are one. Level
            // is neither, so it stays in ink.
            tone={
              mine.gained.holes === 0 || Math.round(mine.gained.total * 10) === 0 ? 'ink'
              : mine.gained.total > 0 ? 'accent'
              : 'rust'
            }
          />
        </div>
      ) : (
        <p className="t-body text-ink/80">
          Nothing tracked on your card yet. Putts and fairways start filling in
          from the next hole.
        </p>
      )}

      {(thin || (mine != null && mine.gained.holes === 0)) && (
        <p className="t-cap text-ink/65 mt-3 leading-snug">
          {mine != null && mine.gained.holes === 0
            ? 'No hole has had enough cards on it yet to compare against the field.'
            : 'A few holes in. These settle as more cards come in.'}
        </p>
      )}

      {/* A link, not a button. The hub already has its one emerald action. */}
      <Link
        href={`/trip/${tripCode}/stats`}
        className="inline-block mt-4 t-label text-accent-deep hover:text-accent transition-colors duration-150"
      >
        Open the stats hub →
      </Link>
    </div>
  )
}

/** A label, a figure, and what the figure is out of. */
function Figure({ label, value, note, tone = 'ink' }: {
  label: string
  value: string
  note?: string
  tone?: 'ink' | 'accent' | 'rust'
}) {
  const colour = tone === 'accent' ? 'text-accent-deep'
    : tone === 'rust' ? 'text-rust-deep'
    : 'text-ink'
  return (
    <div className="flex items-baseline justify-between gap-3 py-3 border-b border-bark/[0.08] last:border-b-0">
      <span className="t-cap uppercase tracking-[0.12em] text-ink/50">{label}</span>
      <span className="flex items-baseline gap-2 min-w-0">
        {note && <span className="t-cap text-ink/50 truncate">{note}</span>}
        <span className={`t-data t-num ${colour}`}>{value}</span>
      </span>
    </div>
  )
}
