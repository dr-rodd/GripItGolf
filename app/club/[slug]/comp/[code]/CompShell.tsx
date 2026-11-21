import Link from 'next/link'
import { clubEventDates } from '@/lib/clubs'
import { courseLabel } from '@/lib/courseDirectory'
import { PHASE_WORDS } from '@/lib/compPhase'
import { compHome } from '@/lib/clubBar'
import { IconChevronLeft } from '@/app/components/icons'
import { LiveDot } from '@/app/components/ui'
import { NoBar } from '../../ClubBarContext'
import CompDoor from './CompDoor'
import CompAhead from './CompAhead'
import type { CompPage, OpenCompPage } from './read'

/**
 * A competition page's own part (D186), inside the frame its layout draws
 * (MO3, D282 — the art and the club's header stay put between pages). The
 * footer is the club layout's; the members-only door shows none.
 */
export default function CompShell({ page, children }: { page: Pick<CompPage, 'slug' | 'code' | 'clubFace' | 'here' | 'door' | 'kind'>; children?: React.ReactNode }) {
  const { slug, code, clubFace, here } = page
  return page.door ? (
    <>
      <NoBar />
      <CompDoor code={code} clubName={clubFace.name} here={here} matchPlay={page.kind === 'matchplay'} />
    </>
  ) : (
    <>
      <CompAhead slug={slug} code={code} renderedAt={Date.now()} />
      {children}
    </>
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
