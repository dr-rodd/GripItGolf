import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { entryCookie } from '@/lib/publicPin'
import { entryAllowed } from '@/lib/pinHash'
import { opensAt, teeClocks } from '@/lib/teeSheet'
import { describeTime } from '@/lib/itinerary'
import { compPhase, PHASE_WORDS, sectionLive, sectionWaitLine, type CompPhase, type CompSection } from '@/lib/compPhase'
import { teeInstant } from '@/lib/clubComp'
import { clubEventDates } from '@/lib/clubs'
import { courseLabel } from '@/lib/courseDirectory'
import { tripBase } from '@/lib/tripPaths'
import { ButtonLink, cardClass } from '@/app/components/ui'
import { IconChevronLeft } from '@/app/components/icons'
import TripHeader from '@/app/components/TripHeader'
import Poller from '@/app/components/Poller'
import { readCompSheet, readCompetition } from '@/app/api/club/bookingStore'
import { Art, ClubHeader } from '../../ClubView'
import { readFace } from '../../face'
import CompBar from './CompBar'
import CompDoor from './CompDoor'
import CompManage from './CompManage'
import CompTeeSheet, { type CompSlot } from './CompTeeSheet'
import CompBoard from './CompBoard'

/**
 * A club competition inside the club area (D167, D180–D181; stage (d2)):
 * the club's header and art, back to Comps, the competition's name, day and
 * one phase line, then one section — Tee sheet, Scoring or Leaderboard — and
 * the competition bar the server draws with the page, Home leading back to
 * the club. A section not yet live says when it starts.
 *
 * **Members only** (D164) is the public PIN door with a PIN nobody holds:
 * without the door's cookie the page draws the club's face and the way in,
 * never the competition — the server cannot see who is signed in, so the
 * door (`CompDoor`) asks, and a member on the list comes back through it.
 * Guests can watch (D184) is no door: anybody with the address reads it.
 */

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

const SECTIONS: readonly CompSection[] = ['tee', 'scoring', 'board']

/** Where the page opens when no section is asked for: the one the phase is about. */
function firstSection(phase: CompPhase): CompSection {
  return phase === 'announced' || phase === 'booking' ? 'tee' : phase === 'in_play' ? 'scoring' : 'board'
}

export default async function CompetitionPage({ params, searchParams }: {
  params: Promise<{ slug: string; code: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const [{ slug, code: rawCode }, { view }, jar] = await Promise.all([params, searchParams, cookies()])
  const code = rawCode.trim().toUpperCase()
  const db = createAdminClient()
  const [face, comp] = await Promise.all([readFace(slug, { events: false }), readCompetition(db, code)])
  if (!face || !comp || comp.clubId !== face.id) notFound()
  const { id: _id, ...clubFace } = face
  const here = `/club/${slug}/comp/${code}`

  const shell = (children: React.ReactNode, bar: React.ReactNode = null) => (
    <main data-club style={clubFace.style as React.CSSProperties} className={`min-h-dvh paper relative isolate ${bar ? 'has-tabbar' : ''}`}>
      <Art face={clubFace} home={false} />
      <div className="relative z-10">
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10">
          <ClubHeader face={clubFace} members />
          {children}
        </div>
      </div>
      {bar}
    </main>
  )

  // The members-only door: nothing of the competition without it.
  if (!entryAllowed(comp.publicHash, jar.get(entryCookie(code))?.value, code)) {
    return shell(<CompDoor code={code} clubName={clubFace.name} here={here} />)
  }

  const sheet = await readCompSheet(db, comp)
  const clocks = teeClocks(comp.rules)
  const now = Date.now()
  const firstTeeAt = clocks[0] ? teeInstant(comp.date, clocks[0]) : null
  const bookingOpensAt = opensAt(comp.rules, comp.date)?.getTime() ?? null
  const booked = new Set(sheet.seats.map(s => s.playerId))
  const phase = compPhase({
    bookingOpensAt, firstTeeAt, booked: booked.size,
    finished: sheet.signed.filter(id => booked.has(id)).length,
    cardsStarted: sheet.onCourse.length + sheet.signed.length > 0,
    certifiedAt: null,
  }, now)
  const section: CompSection = SECTIONS.includes(view as CompSection) ? view as CompSection : firstSection(phase)
  const live = sectionLive(section, phase)

  const slots: CompSlot[] = clocks.map((clock, index) => {
    const at = teeInstant(comp.date, clock)
    return {
      index, clock: describeTime(clock),
      gone: at !== null && now >= at,
      seats: sheet.seats.filter(s => s.slot === index)
        .map(s => ({ rowId: s.rowId, playerId: s.playerId, name: s.name, handicap: s.handicap, bookedBy: s.bookedBy })),
    }
  })

  return shell(
    <>
      <Link href={`/club/${slug}?tab=comps`} className="t-cap text-ink/65 inline-flex items-center gap-1 mt-5 press">
        <IconChevronLeft size={16} /> Competitions
      </Link>
      <h1 className="t-h1 text-ink mt-2 break-words">{comp.name}</h1>
      <p className="t-cap text-ink/65 mt-1">
        {[clubEventDates(comp.date, comp.date), sheet.courseName ? courseLabel(sheet.courseName) : null].filter(Boolean).join(' · ')}
      </p>
      <p className="t-label text-club-deep mt-1">{PHASE_WORDS[phase]}</p>
      <CompManage code={code} />

      {!live && (
        <p className="text-ink/80 text-[15px] leading-relaxed mt-8">
          {sectionWaitLine(section, section === 'tee' ? bookingOpensAt : firstTeeAt)}
        </p>
      )}
      {live && section === 'tee' && (
        <CompTeeSheet code={code} slots={slots} groupSize={comp.rules.groupSize}
          bookingOpen={phase === 'booking'}
          waitLine={phase === 'booking' ? null : phase === 'announced' ? sectionWaitLine('tee', bookingOpensAt) : 'The tee times have gone.'} />
      )}
      {!live && section === 'tee' && phase === 'announced' && (
        // Before booking opens the club's admins may place people already.
        <CompTeeSheet code={code} slots={slots} groupSize={comp.rules.groupSize} bookingOpen={false} waitLine={null} />
      )}
      {live && section === 'scoring' && (
        <section className="mt-6">
          <Poller isActive={phase === 'in_play'} />
          <h1 className="t-h1 text-ink">Scoring</h1>
          <p className="text-ink/80 text-[15px] leading-relaxed mt-2">
            Members score each other’s cards. Start your group’s card, or carry on with it.
          </p>
          <ButtonLink href={`${tripBase(code, 'tournament')}/scoring/1`} className="mt-4">
            Open the card
          </ButtonLink>
          <ul className="mt-6 space-y-2">
            {slots.filter(s => s.seats.length > 0).map(s => (
              <li key={s.index} className={`${cardClass()} p-3 flex gap-3`}>
                <span className="t-data text-[17px] text-ink w-14 flex-shrink-0">{s.clock}</span>
                <span className="flex-1 min-w-0">
                  {s.seats.map(x => (
                    <span key={x.playerId} className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] text-ink truncate">{x.name}</span>
                      <span className="t-cap text-ink/65 whitespace-nowrap">
                        {sheet.signed.includes(x.playerId) ? 'Card signed' : sheet.onCourse.includes(x.playerId) ? 'On the course' : 'Not started'}
                      </span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {live && section === 'board' && <CompBoard code={code} provisional={phase !== 'certified'} active={phase === 'in_play'} />}
    </>,
    <CompBar slug={slug} code={code} active={section} />,
  )
}
