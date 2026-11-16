import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { showsTopThree, summaryLine } from '@/lib/compPhase'
import { compSectionHref, sectionOfView } from '@/lib/clubBar'
import { cardClass } from '@/app/components/ui'
import CompShell, { PhaseLine, dayAndCourse } from './CompShell'
import CompManage from './CompManage'
import CompSummaryAction from './CompSummaryAction'
import { readCompPage } from './read'
import { summaryBoard } from './summaryBoard'

/**
 * A club competition's Summary (D186; stage (d2), amended 16 Nov 2026) —
 * the competition's own address, the first thing a tapped competition
 * shows: its name, day, course and format, then one card with the phase,
 * a line, and the phase's one action (Book a tee time, Start your card,
 * Certify result for an admin), the top three while there are cards, and
 * Manage competition for owners and admins. Its three sections are pages
 * under it — `/tee-times`, `/scoring`, `/leaderboard` — and the club
 * layout's footer carries them (D180 amended).
 *
 * An old `?view=` (the four-slot bar's, a shared link) goes on to its
 * section. Members only (D164): without the door's cookie only the door.
 */

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CompetitionSummary({ params, searchParams }: {
  params: Promise<{ slug: string; code: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const [{ slug, code: rawCode }, { view }] = await Promise.all([params, searchParams])
  const asked = sectionOfView(view)
  if (asked) redirect(compSectionHref(slug, rawCode, asked))

  const page = await readCompPage(slug, rawCode)
  if (page.door) return <CompShell page={page} />

  const { code, comp, phase, slots, bookingOpensAt, firstTee } = page
  const certified = phase === 'certified'
  const board = await summaryBoard(code, showsTopThree(phase))

  return (
    <CompShell page={page}>
      <h1 className="t-h1 text-ink mt-6 break-words">{comp.name}</h1>
      <p className="t-cap text-ink/65 mt-1">{dayAndCourse(page, [board.format])}</p>

      <section className={`${cardClass('floating')} p-4 mt-6`}>
        <PhaseLine phase={phase} />
        <CompSummaryAction slug={slug} code={code} phase={phase}
          line={summaryLine(phase, { bookingOpensAt, firstTee })}
          slots={slots.map(s => ({ clock: s.clock, players: s.seats.map(x => ({ id: x.playerId, name: x.name })) }))} />
      </section>

      {board.rows.length > 0 && (
        <section className="mt-6">
          <h2 className="t-h2 text-ink">{certified ? 'Results' : 'Top three'}</h2>
          {!certified && <p className="t-cap text-ink/65 mt-1">Provisional until the club certifies the result.</p>}
          <ol className={`${cardClass()} mt-3 divide-y divide-line`}>
            {board.rows.map(r => {
              // Gold is for winning only, and only once it is certified (D171).
              const gold = certified && r.place === 1
              return (
                <li key={r.id} className="flex items-baseline gap-3 px-4 py-3">
                  <span className={`t-data text-[17px] w-6 tabular-nums ${gold ? 'text-gold-deep' : 'text-ink/65'}`}>{r.place}</span>
                  <span className={`t-data text-[17px] flex-1 min-w-0 truncate ${gold ? 'text-gold-deep' : 'text-ink'}`}>{r.name}</span>
                  <span className={`t-data text-[17px] tabular-nums whitespace-nowrap ${gold ? 'text-gold-deep' : 'text-ink'}`}>
                    {r.total}{board.unit && <span className="t-cap text-ink/65"> {board.unit}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <CompManage code={code} />
    </CompShell>
  )
}
