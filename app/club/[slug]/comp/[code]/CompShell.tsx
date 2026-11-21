import Link from 'next/link'
import { clubEventDates } from '@/lib/clubs'
import { courseLabel } from '@/lib/courseDirectory'
import { PHASE_WORDS } from '@/lib/compPhase'
import { compHome } from '@/lib/clubBar'
import { IconChevronLeft } from '@/app/components/icons'
import TripHeader from '@/app/components/TripHeader'
import { LiveDot } from '@/app/components/ui'
import { Art, ClubHeader } from '../../ClubView'
import { NoBar } from '../../ClubBarContext'
import CompDoor from './CompDoor'
import CompAhead from './CompAhead'
import type { CompPage, OpenCompPage } from './read'

/**
 * The frame of a competition's four pages (D186): the club's art (the short
 * title strip, D123), the header whose green dot goes to the club Home
 * (D187), the club's frosted header — then the page. The footer is the
 * club layout's, never drawn here; the members-only door shows none.
 */
export default function CompShell({ page, children }: { page: Pick<CompPage, 'slug' | 'code' | 'clubFace' | 'here' | 'door' | 'kind'>; children?: React.ReactNode }) {
  const { slug, code, clubFace, here } = page
  return (
    <main data-club style={clubFace.style as React.CSSProperties}
      className={`min-h-dvh paper relative isolate ${page.door ? '' : 'has-tabbar'}`}>
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10">
          <ClubHeader face={clubFace} members />
          {page.door ? (
            <>
              <NoBar />
              <CompDoor code={code} clubName={clubFace.name} here={here} matchPlay={page.kind === 'matchplay'} />
            </>
          ) : (
            <>
              <CompAhead slug={slug} code={code} renderedAt={Date.now()} />
              {children}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

/** The phase as one line in the club's colour, with the live dot while cards are out. */
export function PhaseLine({ phase, className = '' }: { phase: OpenCompPage['phase']; className?: string }) {
  return (
    <p className={`text-[13px] font-semibold text-club-deep inline-flex items-center gap-1.5 ${className}`}>
      {phase === 'in_play' && <LiveDot />}
      {PHASE_WORDS[phase]}
    </p>
  )
}

/** A section's title: back to the Summary, the name, the day and course, the phase. */
export function SectionTitle({ page }: { page: OpenCompPage }) {
  return (
    <>
      <Link href={compHome(page.slug, page.code)} className="t-cap text-ink/65 inline-flex items-center gap-1 mt-5 press">
        <IconChevronLeft size={16} /> Summary
      </Link>
      <h1 className="t-h1 text-ink mt-2 break-words">{page.comp.name}</h1>
      <p className="t-cap text-ink/65 mt-1">{dayAndCourse(page)}</p>
      <PhaseLine phase={page.phase} className="mt-1" />
    </>
  )
}

export function dayAndCourse(page: OpenCompPage, extra: (string | null)[] = []): string {
  return [clubEventDates(page.comp.date, page.comp.date), page.sheet.courseName && !page.oneCourse ? courseLabel(page.sheet.courseName) : null, ...extra]
    .filter(Boolean).join(' · ')
}
