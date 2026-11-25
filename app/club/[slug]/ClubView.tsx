'use client'

import Stream from '@/app/components/feed/Stream'
import { bookedItems, byWeek, nextItems, plusDays } from '@/lib/clubCalendar'
import { ItemRow, useMemberCalendar } from './calendarParts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import CodeBox from '@/app/components/CodeBox'
import { IconCheck, IconChevronDown, IconChevronRight, IconSettings, IconUser } from '@/app/components/icons'
import Initials from '@/app/components/Initials'
import { ButtonLink, LiveDot, ListGroup, ListRow, PageTitle, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { accountLink } from '@/lib/account'
import {
  clubEventDates, clubEventHref, clubEventLive, groupClubEvents, irishToday, COMPS_DAYS_AHEAD, COMPS_RESULTS,
  type ClubEvent,
} from '@/lib/clubs'
import { credentialLine, type Credentials } from '@/lib/clubMay'
import { reducedMotion } from '@/lib/motion'
import { seasonOf, selfClaimedLine } from '@/lib/cardSummary'
import { tripBase } from '@/lib/tripPaths'
import { irishGreeting } from '@/lib/irishTime'
import { PHASE_WORDS } from '@/lib/compPhase'
import { enteredWithLine, type MyClubMatch } from '@/lib/clubMatchPlay'
import { NO_SEASON, SeasonSummary, SeasonTiles } from '@/app/components/Season'
import { askClub, readAccount } from '@/lib/accountClient'
import { hintClubs, readTierHint, rememberTier, storedAccountSession } from '@/lib/tierHint'
import { CLUB_MEMBER_ATTR, forgetClubHome, keepClubHome, notClubMember, readClubHome } from '@/lib/clubHomeCopy'
import { useClubBar, type ClubMembers } from './ClubBarContext'
import { clubSwitch, compHome, compSectionHref, type ClubSwitch } from '@/lib/clubBar'
import AwardsCard from './AwardsCard'
import ClubTeeTimes, { prefetchTeeDay } from './ClubTeeTimes'
import { NoteRow, NoteSheet, TypeChips } from './ClubNotes'
import { noteTimeLine, noteWhen, typeLabel, type ClubNote, type EventType } from '@/lib/clubEvents'
import { prefetchWhole } from './prefetchWhole'
import { addDays } from '@/lib/clubOverview'

/** What the server hands the page: the club's look and its guests-welcome events — never more. */
export interface ClubFace {
  slug: string
  name: string
  style: Record<string, string>
  crestUrl: string | null
  artUrl: string | null
  artDarkUrl: string | null
  events: ClubEvent[]
}

type Members = ClubMembers

/** A home kept before credentials were (stage (k0)): read as holding nothing. */
const NOTHING_HELD: Credentials = { owner: false, playsHere: true, officer: false, clubhouse: false }

const KIND: Record<ClubEvent['kind'], string> = { trip: 'Trip', tournament: 'Event', run: 'Challenge' }

/**
 * One address, two views (D157), wearing the club's skin (the Pints
 * hand-off, D123–D127). Everybody first sees the public face the server
 * drew; a phone signed in to a Green Dot account then asks whether it is on
 * this club's list, and if so the members area takes its place — Home ·
 * Comps · Stream · Tee times · Stats (D318). A section with nothing in it is not drawn,
 * never an empty heading; "Your next round" waits for booking (stage (d)).
 */
export default function ClubView({ face }: { face: ClubFace }) {
  // The members home and the open tab live with the footer, in the club's
  // layout (D180 amended): coming back from a competition both are already
  // there while the page asks again.
  const { members, setMembers, tab, setTab } = useClubBar()
  const router = useRouter()

  // MO3 (D282): today's casual tee sheet asked for ahead of the Tee times tab.
  const clubIdNow = members?.clubId
  useEffect(() => { if (clubIdNow) prefetchTeeDay(clubIdNow) }, [clubIdNow])

  // D198: the club's competitions still to finish, fetched whole while the
  // member looks at the club, so tapping one is instant (at most four).
  useEffect(() => {
    if (!members) return
    const today = irishToday(new Date())
    members.events
      .filter(e => e.competition && e.competition.phase !== 'certified' && (e.endDate ?? e.startDate ?? today) >= today)
      .slice(0, 4)
      .forEach(e => prefetchWhole(router, clubEventHref(e, face.slug)))
  }, [members, router, face.slug])

  // The tab the address asks for, before paint: Comps from a competition
  // lands on Comps, the dot or Home on Home.
  // Before paint: the tab the address asks for, and — for a phone hinted to
  // this club (D197) — the member mark the head script sets on a full load,
  // set here too for a move from inside the site, and the last club home
  // kept on this phone drawn at once (D193).
  useLayoutEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab')
    // Board's place is Tee times now (Ross, 17 Nov 2026): an old ?tab=board link opens Comps, which carries the live leaderboard.
    // Streams v2 (D319): the Club tab went — an old ?tab=club opens the gear's page.
    if (asked === 'club') { router.replace(`/club/${face.slug}/settings`); return }
    setTab(asked === 'board' ? 'comps' : asked === 'comps' || asked === 'stream' || asked === 'tee' || asked === 'stats' ? asked : 'home')
    // D223: at any club the hint names. A home held for another club (a
    // switch between clubs) is never drawn under this one's face.
    if (hintClubs(readTierHint()).includes(face.slug)) {
      document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '')
      setMembers(m => (m && m.slug === face.slug ? m : readClubHome(face.slug)))
    } else {
      setMembers(m => (m && m.slug === face.slug ? m : null))
    }
    arrived()
  }, [setTab, setMembers, face.slug, router])

  // A signal lost on the way: what is on screen stays, with a way to try again.
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    ;(async () => {
      if (!(await readAccount())) {
        if (!live) return
        // A sign-in kept but not read just now is a lost signal (D192);
        // none kept at all is nobody signed in: the public face.
        if (storedAccountSession()) { setLost(true); return }
        notClubMember()
        setMembers(null)
        return
      }
      const r = await askClub('home', { slug: face.slug })
      if (!live) return
      // D154: on the list, this phone opens on the club. Taken off it, a
      // hint naming this club moves on to the account's next club, else the
      // personal page (D223); a visitor who was never on it sees the public face.
      const clubs = hintClubs(readTierHint())
      if (!r.ok || !r.club) {
        const refused = !r.ok && /not on this club/i.test(r.error)
        if (refused || r.ok) {
          // Not on the list (D193): the kept home goes.
          forgetClubHome(face.slug)
          if (clubs.includes(face.slug)) {
            const rest = clubs.filter(c => c !== face.slug)
            if (rest.length) {
              rememberTier({ kind: 'club', slug: rest[0], others: rest.slice(1) })
              router.replace(`/club/${rest[0]}`)
            } else {
              rememberTier({ kind: 'dot' })
              window.location.replace('/home')
            }
            return
          }
          notClubMember()
          setMembers(null)
          setLost(false)
          return
        }
        // A lost signal keeps what this phone already had.
        setLost(true)
        return
      }
      // This club is now the one last used; the account's others follow it (D223).
      rememberTier({ kind: 'club', slug: face.slug, others: r.myClubs ? r.myClubs.map(c => c.slug) : undefined })
      const fresh: Members = {
        slug: face.slug, myClubs: r.myClubs,
        clubId: r.club.id, homeCourseId: r.club.homeCourseId ?? null, credentials: r.club.credentials, name: r.me?.name ?? '',
        events: r.events ?? [], entries: r.entries ?? [], season: r.season ?? [],
        courses: r.courses ?? {}, outside: r.outside ?? [], tops: r.tops ?? {}, toSign: r.toSign ?? [], more: r.more, indexTrend: r.indexTrend ?? [],
        notes: r.notes ?? [], matches: r.matches ?? [],
      }
      setMembers(fresh)
      keepClubHome(face.slug, fresh)
      setLost(false)
    })()
    return () => { live = false }
  }, [face.slug, setMembers, attempt, router])

  // D218, D223: an account on several clubs moves between them by tapping
  // the header — the next club, the one it is on and how many, and a dot
  // when a card waits at another. The next one is fetched ahead.
  const switcher = useMemo(() => clubSwitch(members?.myClubs, face.slug), [members?.myClubs, face.slug])
  useEffect(() => { switcher?.clubs.filter(c => !c.here).forEach(c => router.prefetch(`/club/${c.slug}`)) }, [switcher, router])

  const home = !members || tab === 'home'
  return (
    <main data-club style={face.style as React.CSSProperties} className={`min-h-dvh paper relative isolate ${members ? 'has-tabbar' : 'club-wait-pad'}`}>
      <Art face={face} home={home} />
      <div className="relative z-10">
        <TripHeader backTo={members ? `/club/${face.slug}` : '/'} />
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10">
          <ClubHeader face={face} members={!!members} switcher={switcher} who={members?.name}
            onPick={switcher ? slug => goToClub(router, slug, switcher.all) : undefined} />
          {/* D197: a phone hinted to this club sees the stand-in from the
              first paint (the head script's mark on <html>), never the
              public face; anybody else sees the public face. */}
          {!members && <div className="club-public-face"><PublicFace face={face} /></div>}
          {!members && <MembersWait />}
          {lost && (
            <div className="mt-6" role="alert">
              <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
              <button type="button" onClick={() => { setLost(false); setAttempt(a => a + 1) }}
                className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
            </div>
          )}
          {members && tab === 'home' && <MembersHome face={face} m={members} />}
          {members && tab === 'comps' && <Comps m={members} slug={face.slug} />}
          {members && tab === 'tee' && <ClubTeeTimes clubId={members.clubId} />}
          {members && tab === 'stats' && <Stats face={face} m={members} />}
          {members && tab === 'stream' && <Stream club={{ slug: face.slug }} settingsPath={`/club/${face.slug}/settings`} />}
        </div>
      </div>
    </main>
  )
}

/** D123–D124, D289: the art behind the page — the same on every club page (Ross, 23 Nov 2026: it shrank off Home). */
export function Art({ face }: { face: ClubFace; home?: boolean }) {
  if (!face.artUrl) return null
  const size = 'club-art-home'
  return (
    <>
      {/* The club's own picture, resized on the server. Decorative: the page says everything it shows. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={face.artUrl} alt="" aria-hidden="true" className={`club-art ${size} ${face.artDarkUrl ? 'club-art-day' : ''}`} />
      {face.artDarkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.artDarkUrl} alt="" aria-hidden="true" className={`club-art club-art-night ${size}`} />
      )}
      <div aria-hidden="true" className="club-grain club-grain-home" />
    </>
  )
}

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => Promise<void>) => unknown }
type ArrivalWindow = Window & { __gdClubArrived?: () => void }

/** The next club's page is on screen: the cross-fade may finish. */
function arrived() {
  const w = window as ArrivalWindow
  w.__gdClubArrived?.()
  delete w.__gdClubArrived
}

/**
 * Off to the next club (D223): the hint first, so its page opens as a
 * member's (its kept home, or the stand-in — D197); then the page cross-
 * fades to its art and colour over 200ms while the header holds still
 * (`.club-switch-fade` in globals.css). Reduce Motion, or a browser without
 * view transitions: an immediate swap.
 */
function goToClub(router: ReturnType<typeof useRouter>, slug: string, all: string[]) {
  rememberTier({ kind: 'club', slug, others: all.filter(s => s !== slug) })
  const go = () => router.push(`/club/${slug}`)
  const doc = document as ViewTransitionDoc
  if (!doc.startViewTransition || reducedMotion()) { go(); return }
  doc.documentElement.classList.add('club-switch-fade')
  const done = doc.startViewTransition(() => new Promise<void>(resolve => {
    ;(window as ArrivalWindow).__gdClubArrived = resolve
    setTimeout(resolve, 1200)
    go()
  })) as { finished?: Promise<void> } | undefined
  void (done?.finished ?? Promise.resolve()).catch(() => undefined).then(() => doc.documentElement.classList.remove('club-switch-fade'))
}

/** The frosted header: crest in the club's ring, the name, "Members", and the account button. */
export function ClubHeader({ face, members, switcher = null, onPick, who }: {
  face: ClubFace
  members: boolean
  /** The member's name, for the profile circle's initial (D319). */
  who?: string
  /** D223, D280: an account on several clubs — the name opens a list of them to choose from. */
  switcher?: ClubSwitch | null
  onPick?: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const crest = (url: string | null, dot: boolean, size: 'lg' | 'sm' = 'lg') => (
    <span className="relative flex-shrink-0">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={size === 'lg' ? 44 : 32} height={size === 'lg' ? 44 : 32}
          className={`${size === 'lg' ? 'w-11 h-11 ring-2' : 'w-8 h-8 ring-1'} rounded-full object-contain bg-surface ring-club block`} />
      ) : (
        <span aria-hidden="true" className={`${size === 'lg' ? 'w-11 h-11 ring-2' : 'w-8 h-8 ring-1'} rounded-full ring-club bg-club-tint block`} />
      )}
      {dot && (
        <span aria-hidden="true" className="absolute top-0 right-0 w-2 h-2 rounded-full bg-accent ring-2 ring-accent-tint" />
      )}
    </span>
  )
  const words = (
    <span className="flex-1 min-w-0 text-left">
      <span className="flex items-center gap-1 t-card text-ink leading-tight break-words">
        {face.name}
        {switcher && <IconChevronDown size={18} className={`flex-shrink-0 text-ink/65 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </span>
      {members
        ? <span className="block text-[13px] font-semibold text-club-deep leading-tight">Members</span>
        : <span className="t-cap text-ink/65 inline-flex items-center gap-1"><IconCheck size={14} /> Verified club</span>}
    </span>
  )
  return (
    // D287: under the sticky header (z-30), never over it as the page scrolls.
    <div ref={box} className="relative z-20">
      <header className="club-frost club-header rounded-card p-2 flex items-center gap-3">
        {switcher && onPick ? (
          <button type="button" onClick={() => setOpen(o => !o)} className="club-switch flex-1 min-w-0 flex items-center gap-3 text-left rounded-tile"
            aria-haspopup="listbox" aria-expanded={open}
            aria-label={`${face.name}. Choose a club${switcher.dot ? '. A card waits for you at another club' : ''}`}>
            {crest(face.crestUrl, switcher.dot)}{words}
          </button>
        ) : (
          <>{crest(face.crestUrl, false)}{words}</>
        )}
        {/* D319: the profile circle opens your page; the gear, the settings (what the Club tab held). */}
        {members ? (
          <span className="flex items-center gap-1 flex-shrink-0">
            <Link href={`/club/${face.slug}/settings`} aria-label="Settings"
              className="w-12 h-12 rounded-full flex items-center justify-center text-ink/80 press ch-focus">
              <IconSettings size={22} />
            </Link>
            <Link href={`/club/${face.slug}/me`} aria-label="Your page" className="w-12 h-12 flex items-center justify-center press ch-focus rounded-full">
              <Initials name={who ?? ''} />
            </Link>
          </span>
        ) : (
          <Link href={accountLink(`/club/${face.slug}`)} aria-label={`${face.name} members: sign in`}
            className="w-12 h-12 flex-shrink-0 rounded-full bg-surface border border-line flex items-center justify-center text-ink press">
            <IconUser size={22} />
          </Link>
        )}
      </header>
      {/* MO1, M1 (D280): the account's clubs, a list under the header — the one here ticked. */}
      {open && switcher && onPick && (
        <ul role="listbox" aria-label="Your clubs" className={`${cardClass('floating')} absolute left-0 right-0 top-full mt-2 p-1 paper`}>
          {switcher.clubs.map(c => (
            <li key={c.slug}>
              <button type="button" role="option" aria-selected={c.here}
                onClick={() => { setOpen(false); if (!c.here) onPick(c.slug) }}
                className="w-full flex items-center gap-3 px-2 py-2 min-h-12 rounded-tile text-left ch-focus press">
                {crest(c.crestUrl, c.dot, 'sm')}
                <span className="flex-1 min-w-0 text-[16px] font-medium text-ink truncate">
                  {c.name}{c.dot && <span className="sr-only"> — a card waits for you</span>}
                </span>
                {c.here && <IconCheck size={18} className="text-club-deep flex-shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** D158: the art, the crest, the name, the tick, the way in, and the guests-welcome events — nothing else. */
function PublicFace({ face }: { face: ClubFace }) {
  return (
    <>
      <div className="h-[168px]" aria-hidden="true" />
      <ButtonLink href={accountLink(`/club/${face.slug}`)}>{face.name} members: sign in</ButtonLink>
      <section className="mt-6">
        <h2 className="t-h2 text-ink">Guests welcome</h2>
        {face.events.length > 0 ? (
          <>
            <p className="text-ink/65 text-sm mt-1">Open to anybody with the code — tap one to follow it live.</p>
            <EventRows events={face.events} slug={face.slug} />
          </>
        ) : (
          <p className="text-ink/65 text-[15px] mt-2">No public events right now.</p>
        )}
      </section>
      <LegalLinks className="mt-12" />
    </>
  )
}

/** "You’re in" — or, on a pairs match play, "Entered with Dave Byrne" / "Entered — looking for a partner" (stage 4). */
function inWords(partners: Members['partners'], code: string): string {
  return partners && code in partners ? enteredWithLine(partners[code]) : 'You’re in'
}

function EventRows({ events, slug, entries = [], tops = {}, partners }: { events: ClubEvent[]; slug: string; entries?: string[]; tops?: Members['tops']; partners?: Members['partners'] }) {
  return (
    <ListGroup className="mt-4">
      {events.map(e => <EventRow key={e.code} e={e} slug={slug} entries={entries} tops={tops} partners={partners} />)}
    </ListGroup>
  )
}

function EventRow({ e, slug, entries, tops, partners }: { e: ClubEvent; slug: string; entries: string[]; tops: Members['tops']; partners?: Members['partners'] }) {
  return (
        <ListRow
          href={clubEventHref(e, slug)}
          // D288, D292: its label's colour down the row's left edge.
          accent={e.colour}
          label={e.name}
          hint={
            <>
              {[clubEventDates(e.startDate, e.endDate), e.competition ? PHASE_WORDS[e.competition.phase] : KIND[e.kind]].filter(Boolean).join(' · ')}
              {entries.includes(e.code) && <span className="text-club-deep font-semibold"> · {inWords(partners, e.code)}</span>}
              {tops[e.code] && (
                <span className="block text-gold-deep font-semibold">
                  Top score: <span className="t-data">{tops[e.code].name} {tops[e.code].points}</span> pts
                </span>
              )}
            </>
          }
          trailing={e.competition ? undefined : <CodePill code={e.code} />}
        />
  )
}

/** D292: a card's left edge in its label's colour — the motif every card carries in the members app. */
function labelEdge(colour: string | null | undefined): React.CSSProperties | undefined {
  return colour ? { borderLeft: `6px solid ${colour}` } : undefined
}

/** An event's board: a competition's inside the club area, any other event's own. */
function boardHref(e: ClubEvent, slug: string): string {
  return e.competition ? compSectionHref(slug, e.code, 'board') : `${tripBase(e.code, e.kind)}/leaderboard`
}

/** D125, D278: the one pill in the club's colour — an outside event's code. Club competitions wear none. */
function CodePill({ code }: { code: string }) {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-tag text-[13px] font-semibold leading-none whitespace-nowrap bg-club-tint text-club-deep t-code">{code}</span>
}

function useGroups(events: ClubEvent[]) {
  return useMemo(() => groupClubEvents(events, irishToday(new Date())), [events])
}

/** A golf event's type on the members' chips: a competition, a run challenge's Other sport, any other Golf. */
function eventType(e: ClubEvent): EventType {
  return e.competition ? 'COMP' : e.kind === 'run' ? 'SPORT' : 'GOLF'
}

/** The club's events and its own events still on or to come, in date order (stage c1). */
type CalItem = { key: string; day: string; e?: ClubEvent; n?: ClubNote }
function calendarItems(events: ClubEvent[], notes: ClubNote[], today: string): CalItem[] {
  const items: CalItem[] = [
    ...events.map(e => ({ key: e.code, day: e.startDate ?? '9999', e })),
    ...notes.filter(n => noteWhen(n, today) !== 'past').map(n => ({ key: `n-${n.id}`, day: n.startsOn, n })),
  ]
  return items.sort((a, b) => a.day.localeCompare(b.day) || (a.e?.name ?? a.n!.title).localeCompare(b.e?.name ?? b.n!.title))
}

/**
 * The members home's stand-in (D197, the hand-off of 16 Nov): the first
 * time a hinted phone opens its club, with no copy kept yet — the club
 * header above it and the footer below, placeholders the size of what they
 * stand for, breathing as every skeleton does (still under Reduce Motion).
 * Hidden unless the head script marked this phone a member here.
 */
function MembersWait() {
  return (
    <div className="club-member-wait" aria-busy="true" aria-label="Loading your club">
      <div className="h-[168px]" aria-hidden="true" />
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-4 w-1/2 mt-2" />
      <div className="skeleton h-24 rounded-card mt-6" />
      <div className="skeleton h-24 rounded-card mt-3" />
      <div className="skeleton h-14 rounded-card mt-6" />
      <div className="skeleton h-14 rounded-card mt-3" />
      <div className="skeleton h-14 rounded-card mt-3" />
    </div>
  )
}

function MembersHome({ face, m }: { face: ClubFace; m: Members }) {
  const g = useGroups(m.events)
  const now = new Date()
  const first = m.name.trim().split(/\s+/)[0]
  const season = seasonOf(m.season)
  // Stage c1, M6: the club's own events sit on the calendar with its golf.
  const calendar = calendarItems(g.upcoming, m.notes ?? [], irishToday(now)).slice(0, 5)
  const [opened, setOpened] = useState<ClubNote | null>(null)
  // Live now is something happening (D281): never a season-long event or a
  // match play (D266) — a competition in play, any other event from its first tee.
  const live = g.now.filter(e => clubEventLive(e, now))
  const { choose } = useClubBar()
  const others = useGroups(m.outside)
  const otherUp = [...others.now, ...others.upcoming]
  const otherPast = [...others.past].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
  const [showAllPast, setShowAllPast] = useState(false)
  // D286: what this member is booked into, and the next few things on — one read of the next four weeks.
  const today = irishToday(now)
  const cal = useMemberCalendar(m.clubId, today, plusDays(today, 28))
  const booked = cal.items ? bookedItems(cal.items, today) : []
  const nextMatches = (m.matches ?? []).filter(x => x.state === 'next')
  const upNext = cal.items ? nextItems(cal.items, today) : null
  return (
    <>
      <div className="h-[168px]" aria-hidden="true" />
      <h1 className="t-h1 text-ink">{irishGreeting(now)}{first ? `, ${first}` : ''}</h1>
      <p className="t-cap text-ink/65 mt-1">
        {new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
        {' · '}{credentialLine(m.credentials ?? NOTHING_HELD, face.name)}
      </p>

      {/* Stage (d3): a card waiting on this member leads Home (D177). */}
      {m.toSign.length > 0 && (
        <section className="mt-6 club-fresh-in">
          <h2 className="t-h2 text-ink">Cards to sign</h2>
          <div className="mt-3 space-y-3">
            {m.toSign.map(c => (
              <Link key={c.code} href={compSectionHref(face.slug, c.code, 'scoring')} className={`${cardClass('floating', true)} block p-4`}>
                <p className="t-card text-ink">{c.name}</p>
                <p className="t-cap mt-1 text-club-deep font-semibold">
                  {c.count === 1 ? 'A card waits for your signature' : `${c.count} cards wait for your signature`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* D286: everything this member is booked into leads Home — competitions, casual tee times, their next matches. */}
      {(booked.length > 0 || nextMatches.length > 0) && (
        <section className="mt-6 club-fresh-in">
          <h2 className="t-h2 text-ink">Your bookings</h2>
          <ul className="mt-3 space-y-2">
            {booked.map(i => <ItemRow key={i.key} i={i} />)}
            {nextMatches.map(x => (
              <li key={`match:${x.code}`}>
                <Link href={matchHref(x, face.slug)} className={`${cardClass('raised', true)} flex items-center gap-3 p-3`} style={labelEdge(m.events.find(e => e.code === x.code)?.colour)}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[17px] font-medium leading-snug text-ink">{x.name}</span>
                    <span className="block t-cap text-ink/65">Match play · {x.roundName}</span>
                    <span className="block t-cap text-club-deep font-semibold mt-0.5">{x.opponent ? `v ${x.opponent}` : 'Opponent to be decided'}{x.playBy ? ` · play by ${clubEventDates(x.playBy, x.playBy)}` : ''}</span>
                  </span>
                  <IconChevronRight size={20} className="text-ink/50 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Never from the copy (D194): Live now waits for the fresh answer. */}
      {!m.fromCopy && live.length > 0 && (
        <section className="mt-6 club-fresh-in">
          <h2 className="t-h2 text-ink flex items-center gap-2"><LiveDot /> Live now</h2>
          <div className="mt-3 space-y-3">
            {live.map(e => (
              <Link key={e.code} href={boardHref(e, face.slug)} className={`${cardClass('floating', true)} block p-4`} style={labelEdge(e.colour)}>
                <p className="t-card text-ink">{e.name}</p>
                <p className={`t-cap mt-1 ${m.entries.includes(e.code) ? 'text-club-deep font-semibold' : 'text-ink/65'}`}>
                  {m.entries.includes(e.code) ? 'You’re playing · ' : ''}Open the leaderboard
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* D286: the Calendar — the next few things on, then the whole calendar on its own page.
          Always drawn (Ross, 25 Nov 2026: Home lost its way to the Calendar whenever
          nothing was coming up), saying so when the next four weeks are empty. */}
      {(
        <section className="mt-6">
          {/* D287: the title is the way in, its chevron saying so. */}
          <Link href={`/club/${face.slug}/calendar`} className="block press ch-focus rounded-tile">
            <h2 className="t-h2 text-ink flex items-center justify-between">Calendar <IconChevronRight size={20} className="text-ink/50" /></h2>
          </Link>
          {(upNext ? upNext.length === 0 : calendar.length === 0) && (
            <p className="t-cap text-ink/65 mt-2">Nothing on in the next four weeks — open the calendar for the whole season.</p>
          )}
          <ul className="mt-3 space-y-2">
            {upNext
              ? upNext.map(i => <ItemRow key={i.key} i={i} onNote={x => x.note && setOpened(x.note)} />)
              : calendar.slice(0, 3).map(x => x.e
                ? <CalendarRow key={x.key} e={x.e} slug={face.slug} mine={m.entries.includes(x.e.code) ? inWords(m.partners, x.e.code) : null} />
                : <NoteRow key={x.key} n={x.n!} onOpen={() => setOpened(x.n!)} />)}
          </ul>
        </section>
      )}

      {m.season.length > 0 && (
        <section className="mt-6">
          {/* M6 (D278): a heads-up; a tap opens Stats. */}
          <button type="button" onClick={() => choose('stats')} className="block w-full text-left press ch-focus rounded-card">
            <h2 className="t-h2 text-ink flex items-center justify-between">Your season <IconChevronRight size={20} className="text-ink/50" /></h2>
            <SeasonTiles rows={m.season} />
            {selfClaimedLine(season, face.name) && <p className="t-cap text-ink/65 mt-2">{selfClaimedLine(season, face.name)}</p>}
          </button>
        </section>
      )}

      {(otherUp.length > 0 || otherPast.length > 0) && (
        <section className="mt-6">
          <h2 className="t-h2 text-ink">Other events</h2>
          {otherUp.length > 0 && (<>
            <h3 className="t-label text-ink/65 mt-3">Upcoming</h3>
            <EventRows events={otherUp} slug={face.slug} />
          </>)}
          {otherPast.length > 0 && (<>
            <h3 className="t-label text-ink/65 mt-5">Previous</h3>
            <EventRows events={showAllPast ? otherPast : otherPast.slice(0, 3)} slug={face.slug} />
            {otherPast.length > 3 && !showAllPast && (
              <button type="button" onClick={() => setShowAllPast(true)} className={`${buttonClass('quiet', false, true)} ch-focus mt-2`}>Show all {otherPast.length}</button>
            )}
          </>)}
        </section>
      )}

      {live.length === 0 && booked.length === 0 && nextMatches.length === 0 && calendar.length === 0 && m.season.length === 0 && m.outside.length === 0 && (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-6">
          {face.name}’s events show here once its admins put them under the club.
        </p>
      )}

      {/* M1 (D278): the way into an outside event and making one, last and quiet. */}
      <section className="mt-10 pt-6 border-t border-line">
        <h2 className="t-cap text-ink/65 mb-2">Joining something else?</h2>
        <CodeBox />
        <Link href="/create" className="t-label text-ink/65 underline underline-offset-2 inline-block mt-3 ch-focus">Make an event</Link>
      </section>
      {opened && <NoteSheet n={opened} onClose={() => setOpened(null)} />}
    </>
  )
}

/** A date tile, 52×56, and the event beside it. */
function CalendarRow({ e, slug, mine }: { e: ClubEvent; slug: string; mine: string | null }) {
  const d = e.startDate ? new Date(`${e.startDate}T12:00:00Z`) : null
  return (
    <li>
      <Link href={clubEventHref(e, slug)} className={`${cardClass('raised', true)} flex items-center gap-3 p-2 pr-3 overflow-hidden`}>
        {e.colour && <span aria-hidden="true" className="w-1.5 self-stretch -my-2 -ml-2 rounded-l-card flex-shrink-0" style={{ background: e.colour }} />}
        <span className="w-[52px] h-14 flex-shrink-0 rounded-tile bg-club-tint flex flex-col items-center justify-center">
          <span className="t-data text-[20px] leading-none text-ink">{d ? d.getUTCDate() : '–'}</span>
          <span className="text-[13px] leading-none text-ink/65 mt-1">
            {d ? new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' }).format(d) : 'TBC'}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-medium leading-snug text-ink">{e.name}</span>
          <span className="block t-cap text-ink/65">
            {KIND[e.kind]}{mine && <span className="text-club-deep font-semibold"> · {mine}</span>}
          </span>
        </span>
        {e.competition ? <IconChevronRight size={20} className="text-ink/50" /> : <CodePill code={e.code} />}
      </Link>
    </li>
  )
}

type CompsView = 'upcoming' | 'mine' | 'matchplay' | 'results'

/** A club match play (Ross, 25 Nov 2026: they live in their own menu, never in Upcoming, My entries or Results). */
const isMatchPlay = (e: Pick<ClubEvent, 'competition'>) => !!e.competition?.matchPlay

/** D159: Competitions — Upcoming, Entries, Match play (D344), Results — a featured card and the rest in rows. No booking until (d). */
function Comps({ m, slug }: { m: Members; slug: string }) {
  const g = useGroups(m.events)
  const [view, setView] = useState<CompsView>('upcoming')
  // MO3 (D282): the next two weeks; the whole season on its own page. Results
  // ten at a time, the rest asked for only when wanted.
  const [whole, setWhole] = useState<{ events: ClubEvent[]; tops: Members['tops'] } | null>(null)
  const [resultsShown, setResultsShown] = useState(COMPS_RESULTS)
  const [moreBusy, setMoreBusy] = useState(false)
  // Stage c1, M6: Upcoming holds the club's own events too, narrowed by type.
  const [type, setType] = useState<EventType | 'all'>('all')
  const [opened, setOpened] = useState<ClubNote | null>(null)
  const today = irishToday(new Date())
  const last = addDays(today, COMPS_DAYS_AHEAD - 1)
  const soon = (d: string | null | undefined) => !!d && d <= last
  const allNotes = (m.notes ?? []).filter(n => noteWhen(n, today) !== 'past')
  const notes = allNotes.filter(n => soon(n.startsOn) || noteWhen(n, today) === 'now')
  const past = whole ? groupClubEvents(whole.events, today).past : g.past
  const tops = whole ? { ...m.tops, ...whole.tops } : m.tops
  // Match plays are all carried by the home answer (club.ts keeps every one), so they are counted out of the rest here.
  const plain = (list: ClubEvent[]) => list.filter(e => !isMatchPlay(e))
  const mpUpcoming = g.upcoming.filter(isMatchPlay).length
  const mpPast = g.past.filter(isMatchPlay).length
  const pastPlain = plain(past)
  const lists: Record<CompsView, ClubEvent[]> = {
    upcoming: plain([...g.now, ...g.upcoming.filter(e => soon(e.startDate))]),
    mine: plain([...g.now, ...g.upcoming, ...g.past]).filter(e => m.entries.includes(e.code)),
    matchplay: [],
    results: pastPlain.slice(0, resultsShown),
  }
  const laterUpcoming = (m.more?.upcoming ?? g.upcoming.length) - mpUpcoming > plain(g.upcoming).filter(e => soon(e.startDate)).length || allNotes.length > notes.length
  const morePast = (whole ? pastPlain.length : (m.more?.past ?? g.past.length) - mpPast) > resultsShown
  const hasMatchPlay = m.events.some(isMatchPlay) || (m.matches ?? []).length > 0
  async function moreResults() {
    if (!whole) {
      setMoreBusy(true)
      const r = await askClub('home', { slug, whole: true })
      setMoreBusy(false)
      if (r.ok && r.events) setWhole({ events: r.events, tops: (r.tops ?? {}) as Members['tops'] })
    }
    setResultsShown(n => n + COMPS_RESULTS)
  }
  const upcomingTypes = [...new Set<EventType>([...lists.upcoming.map(eventType), ...notes.map(n => n.type)])]
  const list = view === 'upcoming' && type !== 'all' ? lists.upcoming.filter(e => eventType(e) === type) : lists[view]
  const shownNotes = view === 'upcoming' ? notes.filter(n => type === 'all' || n.type === type) : []
  const [featured, ...rest] = list
  const liveHere = g.now.find(e => clubEventLive(e, new Date()))
  // The featured card is a golf event; the rest run in date order with the club's own events among them.
  const restItems = view === 'upcoming' ? calendarItems(rest, shownNotes, today) : rest.map(e => ({ key: e.code, day: e.startDate ?? '', e }) as CalItem)
  return (
    <>
      <div className="h-6" aria-hidden="true" />
      <PageTitle sub="The club’s events — tap one to open it."
        below={<Segmented className="mt-3" dense label="Which competitions" value={view} onChange={setView}
          options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'mine', label: 'Entries' },
            // D344: every match play, in its own menu beside Results.
            ...(hasMatchPlay ? [{ value: 'matchplay' as const, label: 'Match play' }] : []),
            { value: 'results', label: 'Results' }]} />}>Competitions</PageTitle>
      {liveHere && (
        // Board's job, here since Tee times took its tab (Ross, 17 Nov 2026): the event in play, straight to its leaderboard.
        <Link href={boardHref(liveHere, slug)} className={`${cardClass('floating', true)} block p-4 mt-4`} style={labelEdge(liveHere.colour)}>
          <p className="t-cap text-ink/65">Live now</p>
          <p className="t-card text-ink mt-1 break-words">{liveHere.name}</p>
          <p className="t-label text-club-deep mt-2">Open the leaderboard</p>
        </Link>
      )}
      {view === 'matchplay' && <MatchPlayTab m={m} slug={slug} />}
      {/* Stage 6 (P14): Golfer of the Year, this member's line, at the head of Results. */}
      {view === 'results' && !m.fromCopy && <AwardsCard clubId={m.clubId} slug={slug} />}
      {view === 'upcoming' && <TypeChips types={upcomingTypes} value={type} onChange={setType} />}
      {view !== 'matchplay' && (<>
      {!featured && restItems.length > 0 ? (
        <ListGroup className="mt-5">
          {restItems.map(x => <NoteListRow key={x.key} n={x.n!} onOpen={() => setOpened(x.n!)} />)}
        </ListGroup>
      ) : !featured ? (
        <p className="text-ink/65 text-[15px] mt-6">
          {view === 'mine' ? 'Nothing you’re in yet.' : view === 'results' ? 'No results yet.' : 'Nothing coming up yet.'}
        </p>
      ) : (
        <>
          <Link href={clubEventHref(featured, slug)} className={`${cardClass('floating', true)} block p-4 mt-5`} style={labelEdge(featured.colour)}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="t-cap text-ink/65">{clubEventDates(featured.startDate, featured.endDate) || KIND[featured.kind]}</p>
                <p className="t-h2 text-ink mt-1 break-words">{featured.name}</p>
              </div>
            </div>
            {m.entries.includes(featured.code) && <p className="t-cap text-club-deep font-semibold mt-2">{inWords(m.partners, featured.code)}</p>}
            {tops[featured.code] && (
              <p className="t-cap text-gold-deep font-semibold mt-2">
                Top score: <span className="t-data">{tops[featured.code].name} {tops[featured.code].points}</span> pts
              </p>
            )}
          </Link>
          {restItems.length > 0 && (
            <section className="mt-6">
              {view === 'results' && <h2 className="t-h2 text-ink">Recent results</h2>}
              {restItems.some(x => x.n) ? (
                <ListGroup className="mt-4">
                  {restItems.map(x => x.e
                    ? <EventRow key={x.key} e={x.e} slug={slug} entries={m.entries} tops={{}} partners={m.partners} />
                    : <NoteListRow key={x.key} n={x.n!} onOpen={() => setOpened(x.n!)} />)}
                </ListGroup>
              ) : (
                <EventRows events={rest} slug={slug} entries={m.entries} tops={view === 'results' ? tops : {}} partners={m.partners} />
              )}
            </section>
          )}
        </>
      )}
      {view === 'upcoming' && laterUpcoming && (
        <Link href={`/club/${slug}/comps`} className={`${buttonClass('quiet', false)} ch-focus mt-4`}>See all</Link>
      )}
      {view === 'results' && morePast && (
        <button type="button" disabled={moreBusy} onClick={() => void moreResults()} className={`${buttonClass('quiet', false)} ch-focus mt-4`}>
          {moreBusy ? 'Loading…' : 'More results'}
        </button>
      )}
      </>)}
      {opened && <NoteSheet n={opened} onClose={() => setOpened(null)} />}
    </>
  )
}

/**
 * Comps' See all (MO3, D282): the whole season still to come, the club's own
 * events among it, asked for only when this page is opened.
 */
export function SeasonList({ slug, club }: { slug: string; club: string }) {
  const [got, setGot] = useState<{ events: ClubEvent[]; notes: ClubNote[]; entries: string[]; partners?: Members['partners'] } | null>(null)
  const [lost, setLost] = useState(false)
  const [opened, setOpened] = useState<ClubNote | null>(null)
  const [attempt, setAttempt] = useState(0)
  // D291: Comps' own page — the footer lights Comps.
  const { setTab } = useClubBar()
  useEffect(() => { setTab('comps') }, [setTab])
  useEffect(() => {
    let live = true
    void askClub('home', { slug, whole: true }).then(r => {
      if (!live) return
      if (!r.ok) { setLost(true); return }
      // A member answered: the footer may show for this club (D197's mark).
      document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '')
      setLost(false)
      setGot({ events: r.events ?? [], notes: (r.notes ?? []) as ClubNote[], entries: r.entries ?? [], partners: r.partners as Members['partners'] })
    })
    return () => { live = false }
  }, [slug, attempt])
  const today = irishToday(new Date())
  const g = got ? groupClubEvents(got.events, today) : null
  // D344: match plays live in Comps' Match play, never in the season's list.
  const items = got && g ? calendarItems([...g.now, ...g.upcoming].filter(e => !isMatchPlay(e)), got.notes, today) : []
  return (
    <section>
      <PageTitle back={{ href: `/club/${slug}?tab=comps`, label: 'Comps' }} className="mt-5"
        sub={<>Everything coming up at {club}.</>}>The season</PageTitle>
      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={() => setAttempt(a => a + 1)} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!got && !lost && <div className="skeleton h-64 rounded-card mt-6" />}
      {got && (items.length === 0
        ? <p className="text-ink/65 text-[15px] mt-6">Nothing coming up yet.</p>
        : (
          // D290: by the week, so a long season reads in order.
          <div className="mt-5 space-y-5">
            {byWeek(items, today).map(w => (
              <section key={w.heading}>
                <h2 className="t-card text-ink mb-2">{w.heading}</h2>
                <ListGroup>
                  {w.items.map(x => x.e
                    ? <EventRow key={x.key} e={x.e} slug={slug} entries={got.entries} tops={{}} partners={got.partners} />
                    : <NoteListRow key={x.key} n={x.n!} onOpen={() => setOpened(x.n!)} />)}
                </ListGroup>
              </section>
            ))}
          </div>
        ))}
      {opened && <NoteSheet n={opened} onClose={() => setOpened(null)} />}
    </section>
  )
}

/**
 * Comps' Match play (D344, Ross, 25 Nov 2026: "add matchplay as a separate
 * menu in Comps beside results and keep all the matchplays there"): every
 * club match play, in sections — the ones you are part of (your next match,
 * soonest due first, shown on the row); the ones you can still enter; the
 * ones under way that you are not in (never entered, or knocked out); and
 * the finished ones, by year. An ongoing match play you are no longer part
 * of is never in Upcoming (`isMatchPlay` keeps all of them out of it).
 */
function MatchPlayTab({ m, slug }: { m: Members; slug: string }) {
  const all = m.events.filter(isMatchPlay)
  const mine = new Map((m.matches ?? []).map(x => [x.code, x]))
  const finished = (e: ClubEvent) => e.competition?.phase === 'finished'
  const entered = (e: ClubEvent) => m.entries.includes(e.code)
  const out = (e: ClubEvent) => mine.get(e.code)?.state === 'out'
  const byStart = (a: ClubEvent, b: ClubEvent) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.name.localeCompare(b.name)
  // A member's own: the next match due first, then those waiting on a draw.
  const due = (e: ClubEvent) => { const x = mine.get(e.code); return x?.state === 'next' ? x.playBy ?? '9998' : '9999' }
  const yours = all.filter(e => !finished(e) && entered(e) && !out(e)).sort((a, b) => due(a).localeCompare(due(b)) || byStart(a, b))
  const open = all.filter(e => e.competition?.phase === 'entries' && !entered(e)).sort(byStart)
  const ongoing = all.filter(e => !finished(e) && !yours.includes(e) && !open.includes(e)).sort(byStart)
  const years = new Map<string, ClubEvent[]>()
  for (const e of all.filter(finished).sort((a, b) => (b.endDate ?? b.startDate ?? '').localeCompare(a.endDate ?? a.startDate ?? ''))) {
    const y = (e.endDate ?? e.startDate ?? '').slice(0, 4) || 'Undated'
    years.set(y, [...(years.get(y) ?? []), e])
  }
  const section = (title: string, hint: string | null, list: ClubEvent[], row: (e: ClubEvent) => React.ReactNode) => list.length === 0 ? null : (
    <section className="mt-6" aria-label={title}>
      <h2 className="t-h2 text-ink">{title}</h2>
      {hint && <p className="t-cap text-ink/65 mt-1">{hint}</p>}
      <ListGroup className="mt-3">{list.map(row)}</ListGroup>
    </section>
  )
  const plain = (e: ClubEvent) => <EventRow key={e.code} e={e} slug={slug} entries={m.entries} tops={{}} partners={m.partners} />
  if (all.length === 0) return <p className="text-ink/65 text-[15px] mt-6">No match play at this club yet.</p>
  return (
    <>
      {section('Yours', 'The ones you’re in.', yours, e => {
        const x = mine.get(e.code)
        return x
          ? <ListRow key={e.code} href={matchHref(x, slug)} label={e.name} accent={e.colour}
              hint={x.state === 'next'
                ? [x.roundName, x.opponent ? `v ${x.opponent}` : 'opponent to be decided', x.playBy ? `play by ${clubEventDates(x.playBy, x.playBy)}` : null].filter(Boolean).join(' · ')
                : `Won the ${x.roundName}${x.opponent ? ` against ${x.opponent}` : ''}`} />
          : plain(e)
      })}
      {section('Open for entry', 'You can still put your name down.', open, plain)}
      {section('Ongoing', 'Under way, and you’re not in.', ongoing, e => {
        const x = mine.get(e.code)
        return x?.state === 'out'
          ? <ListRow key={e.code} href={clubEventHref(e, slug)} label={e.name} accent={e.colour}
              hint={`Out in the ${x.roundName}${x.opponent ? ` to ${x.opponent}` : ''}${x.result ? `, ${x.result}` : ''}`} />
          : plain(e)
      })}
      {[...years].map(([year, list]) => section(year === 'Undated' ? 'Results' : `Results ${year}`, null, list, plain))}
      {yours.length + open.length + ongoing.length === 0 && years.size > 0 && (
        <p className="text-ink/65 text-[15px] mt-6">Nothing under way — the finished ones are below.</p>
      )}
    </>
  )
}

/** Where a match play row goes: the match's own page once the opponent is known, else the competition. */
function matchHref(x: MyClubMatch, slug: string): string {
  return x.state === 'next' && x.opponent ? `${compHome(slug, x.code)}/match/${x.matchId}` : clubEventHref({ code: x.code, competition: { phase: 'in_play', membersOnly: true } }, slug)
}

/** One of the club's own events as a row of Upcoming: its type, day and time; it opens a sheet. */
function NoteListRow({ n, onOpen }: { n: ClubNote; onOpen: () => void }) {
  return (
    <ListRow label={n.title} onClick={onOpen} accent={n.colour}
      hint={[typeLabel(n.type), clubEventDates(n.startsOn, n.endsOn ?? n.startsOn), noteTimeLine(n)].filter(Boolean).join(' · ')} />
  )
}

/** Stage (f): your own rounds this year, from the signed cards' summaries. */
function Stats({ face, m }: { face: ClubFace; m: Members }) {
  const season = seasonOf(m.season)
  return (
    <section className="mt-6">
      <PageTitle sub={m.season.length === 0 ? NO_SEASON : undefined}>Your season</PageTitle>
      {m.season.length === 0 ? null : (
        <>
          <SeasonSummary rows={m.season} courses={m.courses} index={m.indexTrend ?? []}
            footer={selfClaimedLine(season, face.name) ? <p className="t-cap text-ink/65 mt-2">{selfClaimedLine(season, face.name)}</p> : null} />
        </>
      )}
    </section>
  )
}
