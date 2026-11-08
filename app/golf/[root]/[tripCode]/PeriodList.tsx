import type { ReactNode } from 'react'
import { type PeriodGroup, describePeriod } from '@/lib/leagueSetup'
import { describeShortDate } from '@/lib/itinerary'

/**
 * A league of periods, as the field reads it — the Scoring tab and the hub
 * (Ross, 8 Nov 2026). The order and the states are lib/leagueSetup.ts
 * `periodListing`'s; this only draws them: the open period on top with its
 * cards, the next and later ones pale beneath, the closed ones newest first.
 * Each page draws its own card tile — the Scoring tab's opens the card, the
 * hub's the round's summary.
 *
 * No 'use client': the pages render it on the server, and it holds nothing.
 */
export default function PeriodList<C>({ groups, outside, renderCard, openEmpty }: {
  groups: PeriodGroup<C>[]
  outside: C[]
  renderCard: (card: C) => ReactNode
  /** What an open period with no cards yet says. */
  openEmpty: string
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map(g => (
        <section key={g.period.key} className={g.state === 'later' ? 'opacity-60' : ''}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <p className="t-label text-ink">
              Period {g.number}
              <span className="text-ink/65 font-normal"> · {describePeriod(g.period)}</span>
            </p>
            <p className={`t-cap flex-shrink-0 ${g.state === 'open' ? 'text-accent-deep' : 'text-ink/65'}`}>
              {g.state === 'open' ? `Open until ${describeShortDate(g.period.end) ?? g.period.end}`
                : g.state === 'closed' ? 'Closed'
                : `Opens ${describeShortDate(g.period.start) ?? g.period.start}`}
            </p>
          </div>
          {g.cards.length > 0 ? (
            <div className="flex flex-col gap-3">{g.cards.map(renderCard)}</div>
          ) : (g.state === 'open' || g.state === 'closed') && (
            <p className="t-cap text-ink/65">{g.state === 'open' ? openEmpty : 'No cards were handed in.'}</p>
          )}
        </section>
      ))}

      {outside.length > 0 && (
        <section>
          <div className="mb-2">
            <p className="t-label text-ink">Outside every period</p>
            <p className="t-cap text-ink/65">Played on a day no period covers now, so these count for nothing.</p>
          </div>
          <div className="flex flex-col gap-3">{outside.map(renderCard)}</div>
        </section>
      )}
    </div>
  )
}
