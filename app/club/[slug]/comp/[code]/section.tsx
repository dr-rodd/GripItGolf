import { sectionLive, sectionWaitLine, type CompSection } from '@/lib/compPhase'
import { compHome } from '@/lib/clubBar'
import { PageTitle, cardClass } from '@/app/components/ui'
import Poller from '@/app/components/Poller'
import CompTeeSheet from './CompTeeSheet'
import CompBoard from './CompBoard'
import { CardsToSign, CompPlay } from './CompSigning'
import CompAdmin from './CompAdmin'
import CompShell, { SectionTitle } from './CompShell'
import { readCompPage } from './read'
import MatchPlaySection from './MatchPlaySection'

/**
 * One of a competition's three sections (D186, D181) — Tee times, Scoring
 * or Leaderboard, each its own page under the Summary, sharing this body.
 * A section not yet live is one line saying when it starts.
 */
export default async function CompSectionPage({ params, section }: {
  params: Promise<{ slug: string; code: string }>
  section: CompSection
}) {
  const { slug, code: rawCode } = await params
  const page = await readCompPage(slug, rawCode)
  if (page.door) return <CompShell page={page} />
  // A club match play's own three: Field, Matches, Draw (stage 3).
  if (page.kind === 'matchplay') return <MatchPlaySection page={page} section={section} />

  const { code, sheet, phase, slots, bookingOpensAt, firstTeeAt, sun } = page
  const live = sectionLive(section, phase)

  return (
    <CompShell page={page}>
      <SectionTitle page={page} />

      {!live && (
        <p className="text-ink/80 text-[15px] leading-relaxed mt-8">
          {sectionWaitLine(section, section === 'tee' ? bookingOpensAt : firstTeeAt)}
        </p>
      )}
      {live && section === 'tee' && (
        <CompTeeSheet code={code} slots={slots} sun={sun}
          bookingOpen={phase === 'booking'}
          waitLine={phase === 'booking' ? null : phase === 'announced' ? sectionWaitLine('tee', bookingOpensAt) : 'The tee times have gone.'} />
      )}
      {!live && section === 'tee' && phase === 'announced' && (
        // Before booking opens the club's admins may place people already.
        <CompTeeSheet code={code} slots={slots} sun={sun} bookingOpen={false} waitLine={null} />
      )}
      {live && section === 'scoring' && (
        <section className="mt-6">
          <Poller isActive={phase === 'in_play' || phase === 'awaiting'} />
          <PageTitle>Scoring</PageTitle>
          <CompPlay code={code} href={`${compHome(slug, code)}/scoring/1`} closed={phase === 'certified'} />
          <CardsToSign code={code} />
          <CompAdmin code={code} />
          <ul className="mt-6 space-y-2">
            {slots.filter(s => s.seats.length > 0).map(s => (
              <li key={s.index} className={`${cardClass()} p-3 flex gap-3`}>
                <span className="t-data text-[17px] text-ink w-14 flex-shrink-0">{s.clock}</span>
                <span className="flex-1 min-w-0">
                  {s.seats.map(x => (
                    <span key={x.playerId} className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] text-ink truncate">{x.name}</span>
                      <span className="t-cap text-ink/65 whitespace-nowrap">
                        {sheet.noReturns.includes(x.playerId) ? 'No return'
                          : sheet.final.includes(x.playerId) ? 'Signed'
                          : sheet.waiting.includes(x.playerId) ? 'To be signed'
                          : sheet.onCourse.includes(x.playerId) ? 'On the course' : 'Not started'}
                      </span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {live && section === 'board' && (
        <>
          {/* Stage (d4): certified, the board is the Results — gold for the winner (D171). */}
          {phase === 'certified' && <PageTitle className="mt-6">Results</PageTitle>}
          <CompBoard slug={slug} code={code} provisional={phase !== 'certified'} active={phase === 'in_play'}
            notes={Object.fromEntries(sheet.waiting.map(id => [id, 'To be signed']))} />
          {sheet.noReturns.length > 0 && (
            // A No return is off the board, listed under it, with no place.
            <p className="t-cap text-ink/65 mt-3">
              No return: {sheet.seats.filter(x => sheet.noReturns.includes(x.playerId)).map(x => x.name).join(', ')}
            </p>
          )}
        </>
      )}
    </CompShell>
  )
}
