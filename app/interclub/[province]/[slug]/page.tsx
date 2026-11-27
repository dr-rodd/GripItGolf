import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { EmptyState, ListGroup, ListRow, PageTitle } from '@/app/components/ui'
import MatchplayBracket, { type BracketMatchRow } from '@/app/golf/[root]/[tripCode]/matchplay/MatchplayBracket'
import { describeShortDate } from '@/lib/itinerary'
import { IRISH_TIME_ZONE } from '@/lib/irishTime'
import { drawStatus, drawToBracket, provinceOf } from '@/lib/interclub'
import { findCompetition, readCompetitionDraw, type CompetitionDraw } from '../../source'

/**
 * One inter-club competition's draw (docs/interclub.md, stage 1): the
 * official draw read off Golf Ireland's Golf Genius site and redrawn as the
 * knockout's own bracket — read only, swiped round by round — with each
 * round's play-by date under it. A draw Golf Ireland shows as a picture, or
 * one this cannot read, says so and links to the original; it is never
 * half read.
 */

// INTERCLUB_SECONDS — test:interclub holds the two in step.
export const revalidate = 900

type Params = { params: Promise<{ province: string; slug: string }> }

async function lookUp(province: string, slug: string) {
  const p = provinceOf(province)
  if (!p) return null
  const c = await findCompetition(p.key, slug)
  return { province: p, competition: c }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { province, slug } = await params
  const found = await lookUp(province, slug)
  const c = found?.competition
  if (!found || !c || c === 'unreachable') return { title: 'Interclub' }
  return { title: c.name, description: `${c.name}, ${found.province.name}: the draw and results as they stand.` }
}

/** Today in Ireland, YYYY-MM-DD — so "Was due" turns over at an Irish midnight. */
function irishToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IRISH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const ELSEWHERE: Record<Exclude<CompetitionDraw['state'], 'read'>, string> = {
  elsewhere: 'Golf Ireland shows this draw in a form Green Dot cannot read — a picture or a results sheet.',
  none: 'This competition has no draw page yet — it may have a stroke-play stage first.',
  unreadable: 'This page isn’t a knockout draw — it may be a qualifying day’s tee times or a final’s match sheet.',
  unreachable: 'Could not reach Golf Ireland’s draws just now — try again shortly.',
}

export default async function CompetitionPage({ params }: Params) {
  const { province, slug } = await params
  const found = await lookUp(province, slug)
  if (!found || found.competition === null) notFound()
  const today = irishToday()
  const c = found.competition
  const read = c === 'unreachable' ? null : await readCompetitionDraw(c, today)

  const title = c === 'unreachable' ? 'Interclub' : c.name
  const draw = read?.state === 'read' ? read.draw : null
  const bracket = draw ? drawToBracket(draw) : null
  const source = read?.source ?? null

  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/" />
      <div className="px-4 pt-4 pb-12 page-enter">
        <div className="w-full max-w-lg mx-auto">
          <PageTitle
            back={{ href: '/interclub', label: 'Interclub' }}
            sub={[found.province.name, draw?.area && draw.area !== found.province.name ? draw.area : null, draw ? drawStatus(draw) : null]
              .filter(Boolean).join(' · ')}
          >
            {title}
          </PageTitle>

          {bracket ? (
            <div className="mt-5">
              <MatchplayBracket
                matches={bracket.matches as unknown as BracketMatchRow[]}
                entrants={bracket.entrants}
                deadlines={bracket.deadlines}
                today={today}
                readOnly
              />
            </div>
          ) : (
            <EmptyState
              className="mt-5"
              message={ELSEWHERE[read?.state === undefined || read.state === 'read' ? 'unreachable' : read.state]}
              actionLabel={source ? 'See it on Golf Ireland’s site' : undefined}
              actionHref={source ?? undefined}
            />
          )}

          {draw && draw.rounds.some(r => r.by || r.notes.length > 0) && (
            <ListGroup className="mt-6">
              {draw.rounds.map(r => (
                <ListRow
                  key={r.name}
                  label={r.name}
                  value={r.by ? `${r.by < today ? 'Played by' : 'Play by'} ${describeShortDate(r.by) ?? r.by}` : undefined}
                  hint={r.notes.length > 0 ? r.notes.join(' · ') : undefined}
                />
              ))}
            </ListGroup>
          )}

          <p className="t-cap text-ink/65 text-center mt-8">
            {source ? (
              <>From the <a href={source} className="underline hover:text-ink/80" target="_blank" rel="noopener noreferrer">official draw</a>, read every 15 minutes.</>
            ) : 'Read from the official draws every 15 minutes.'}{' '}
            Green Dot is independent of Golf Ireland.
          </p>
          <LegalLinks className="mt-4" />
        </div>
      </div>
    </main>
  )
}
