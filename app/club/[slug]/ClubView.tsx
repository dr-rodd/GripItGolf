'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import CodeBox from '@/app/components/CodeBox'
import HandicapIndexCard from '@/app/components/HandicapIndexCard'
import YourDetailsCard from '@/app/components/YourDetailsCard'
import { IconCheck, IconChevronRight, IconUser } from '@/app/components/icons'
import { ButtonLink, LiveDot, ListGroup, ListRow, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { accountLink } from '@/lib/account'
import {
  clubEventDates, clubEventHref, groupClubEvents, irishToday,
  type ClubEvent,
} from '@/lib/clubs'
import { clubMay, credentialLine, type Credentials } from '@/lib/clubMay'
import { reducedMotion } from '@/lib/motion'
import { seasonOf, selfClaimedLine, type SeasonRow } from '@/lib/cardSummary'
import { tripBase } from '@/lib/tripPaths'
import { irishGreeting } from '@/lib/irishTime'
import { PHASE_WORDS } from '@/lib/compPhase'
import { NO_SEASON, SeasonRounds, SeasonTiles } from '@/app/components/Season'
import { askClub, readAccount } from '@/lib/accountClient'
import { hintClubs, readTierHint, rememberTier, storedAccountSession } from '@/lib/tierHint'
import { CLUB_MEMBER_ATTR, forgetClubHome, keepClubHome, notClubMember, readClubHome } from '@/lib/clubHomeCopy'
import { useClubBar, type ClubMembers } from './ClubBarContext'
import { clubSwitch, compSectionHref, type ClubSwitch } from '@/lib/clubBar'
import NewCompetition from './NewCompetition'
import { prefetchWhole } from './prefetchWhole'

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
 * Comps · Board · Stats · Club. A section with nothing in it is not drawn,
 * never an empty heading; "Your next round" waits for booking (stage (d)).
 */
export default function ClubView({ face }: { face: ClubFace }) {
  // The members home and the open tab live with the footer, in the club's
  // layout (D180 amended): coming back from a competition both are already
  // there while the page asks again.
  const { members, setMembers, tab, setTab } = useClubBar()
  const router = useRouter()

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
    setTab(asked === 'comps' || asked === 'board' || asked === 'stats' || asked === 'club' ? asked : 'home')
    // D223: at any club the hint names. A home held for another club (a
    // switch between clubs) is never drawn under this one's face.
    if (hintClubs(readTierHint()).includes(face.slug)) {
      document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '')
      setMembers(m => (m && m.slug === face.slug ? m : readClubHome(face.slug)))
    } else {
      setMembers(m => (m && m.slug === face.slug ? m : null))
    }
    arrived()
  }, [setTab, setMembers, face.slug])

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
        courses: r.courses ?? {}, outside: r.outside ?? [], tops: r.tops ?? {}, toSign: r.toSign ?? [],
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
  useEffect(() => { if (switcher) router.prefetch(`/club/${switcher.next.slug}`) }, [switcher, router])

  const home = !members || tab === 'home'
  return (
    <main data-club style={face.style as React.CSSProperties} className={`min-h-dvh paper relative isolate ${members ? 'has-tabbar' : 'club-wait-pad'}`}>
      <Art face={face} home={home} />
      <div className="relative z-10">
        <TripHeader backTo="/" />
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10">
          <ClubHeader face={face} members={!!members} switcher={switcher}
            onNext={switcher ? () => goToClub(router, switcher.next.slug, switcher.all) : undefined} />
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
          {members && tab === 'board' && <Board m={members} slug={face.slug} />}
          {members && tab === 'stats' && <Stats face={face} m={members} />}
          {members && tab === 'club' && <ClubTabPage face={face} m={members} />}
        </div>
      </div>
    </main>
  )
}

/** D123–D124: the art behind the page — the home's tall and strong, every other page's short and faint. */
export function Art({ face, home }: { face: ClubFace; home: boolean }) {
  if (!face.artUrl) return null
  const size = home ? 'club-art-home' : ''
  return (
    <>
      {/* The club's own picture, resized on the server. Decorative: the page says everything it shows. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={face.artUrl} alt="" aria-hidden="true" className={`club-art ${size} ${face.artDarkUrl ? 'club-art-day' : ''}`} />
      {face.artDarkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.artDarkUrl} alt="" aria-hidden="true" className={`club-art club-art-night ${size}`} />
      )}
      <div aria-hidden="true" className={`club-grain ${home ? 'club-grain-home' : ''}`} />
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
export function ClubHeader({ face, members, switcher = null, onNext }: {
  face: ClubFace
  members: boolean
  /** D223: an account on several clubs — the crest and name move on to the next. */
  switcher?: ClubSwitch | null
  onNext?: () => void
}) {
  const crest = (
    <span className="relative flex-shrink-0">
      {face.crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.crestUrl} alt="" width={44} height={44}
          className="w-11 h-11 rounded-full object-contain bg-surface ring-2 ring-club block" />
      ) : (
        <span aria-hidden="true" className="w-11 h-11 rounded-full ring-2 ring-club bg-club-tint block" />
      )}
      {switcher?.dot && (
        <span aria-hidden="true" className="absolute top-0 right-0 w-2 h-2 rounded-full bg-accent ring-2 ring-accent-tint" />
      )}
    </span>
  )
  const words = (
    <span className="flex-1 min-w-0 text-left">
      <span className="block t-card text-ink leading-tight break-words">{face.name}</span>
      {members
        ? (
          <span className="block text-[13px] font-semibold text-club-deep leading-tight">
            Members{switcher && <span className="t-cap font-normal text-ink/65"> · {switcher.position} of {switcher.count}</span>}
          </span>
        )
        : <span className="t-cap text-ink/65 inline-flex items-center gap-1"><IconCheck size={14} /> Verified club</span>}
    </span>
  )
  return (
    <header className="club-frost club-header rounded-card p-2 flex items-center gap-3">
      {switcher && onNext ? (
        <button type="button" onClick={onNext} className="club-switch flex-1 min-w-0 flex items-center gap-3 text-left rounded-tile"
          aria-label={`${face.name}, ${switcher.position} of ${switcher.count}. Next club: ${switcher.next.name}${switcher.dot ? '. A card waits for you at another club' : ''}`}>
          {crest}{words}
        </button>
      ) : (
        <>{crest}{words}</>
      )}
      <Link href={members ? '/account' : accountLink(`/club/${face.slug}`)}
        aria-label={members ? 'Your account' : `${face.name} members: sign in`}
        className="w-12 h-12 flex-shrink-0 rounded-full bg-surface border border-line flex items-center justify-center text-ink press">
        <IconUser size={22} />
      </Link>
    </header>
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

function EventRows({ events, slug, entries = [], tops = {} }: { events: ClubEvent[]; slug: string; entries?: string[]; tops?: Members['tops'] }) {
  return (
    <ListGroup className="mt-4">
      {events.map(e => (
        <ListRow
          key={e.code}
          href={clubEventHref(e, slug)}
          label={e.name}
          hint={
            <>
              {[clubEventDates(e.startDate, e.endDate), e.competition ? PHASE_WORDS[e.competition.phase] : KIND[e.kind]].filter(Boolean).join(' · ')}
              {entries.includes(e.code) && <span className="text-club-deep font-semibold"> · You’re in</span>}
              {tops[e.code] && (
                <span className="block text-gold-deep font-semibold">
                  Top score: <span className="t-data">{tops[e.code].name} {tops[e.code].points}</span> pts
                </span>
              )}
            </>
          }
          trailing={membersOnly(e) ? <MembersOnly /> : undefined}
        />
      ))}
    </ListGroup>
  )
}

/** Members only (D164, D184): a competition by its door, any other event by who edits it. */
function membersOnly(e: ClubEvent): boolean {
  return e.competition ? e.competition.membersOnly : e.access !== 'anyone' && e.access !== null
}

/** An event's board: a competition's inside the club area, any other event's own. */
function boardHref(e: ClubEvent, slug: string): string {
  return e.competition ? compSectionHref(slug, e.code, 'board') : `${tripBase(e.code, e.kind)}/leaderboard`
}

/** D125: the one pill in the club's colour. */
function MembersOnly() {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap bg-club-tint text-club-deep">Members only</span>
}

function useGroups(events: ClubEvent[]) {
  return useMemo(() => groupClubEvents(events, irishToday(new Date())), [events])
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
  const calendar = g.upcoming.slice(0, 5)
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

      {/* Stage (h): the front page's way into an event, and making one —
          the club's own for its admins, asked at the gate (Q3, D153). */}
      <CodeBox />
      <ButtonLink href="/create" variant="secondary" className="mt-3">Make an event</ButtonLink>

      {/* Never from the copy (D194): Live now waits for the fresh answer. */}
      {!m.fromCopy && g.now.length > 0 && (
        <section className="mt-6 club-fresh-in">
          <h2 className="t-h2 text-ink flex items-center gap-2"><LiveDot /> Live now</h2>
          <div className="mt-3 space-y-3">
            {g.now.map(e => (
              <Link key={e.code} href={boardHref(e, face.slug)} className={`${cardClass('floating', true)} block p-4`}>
                <p className="t-card text-ink">{e.name}</p>
                <p className={`t-cap mt-1 ${m.entries.includes(e.code) ? 'text-club-deep font-semibold' : 'text-ink/65'}`}>
                  {m.entries.includes(e.code) ? 'You’re playing · ' : ''}Open the leaderboard
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {calendar.length > 0 && (
        <section className="mt-6">
          <h2 className="t-h2 text-ink">Club calendar</h2>
          <ul className="mt-3 space-y-2">
            {calendar.map(e => <CalendarRow key={e.code} e={e} slug={face.slug} mine={m.entries.includes(e.code)} />)}
          </ul>
        </section>
      )}

      {m.season.length > 0 && (
        <section className="mt-6">
          <h2 className="t-h2 text-ink">Your season</h2>
          <SeasonTiles rows={m.season} />
          {selfClaimedLine(season, face.name) && <p className="t-cap text-ink/65 mt-2">{selfClaimedLine(season, face.name)}</p>}
        </section>
      )}

      {m.outside.length > 0 && (
        <section className="mt-6">
          <h2 className="t-h2 text-ink">Outside the club</h2>
          <p className="t-cap text-ink/65 mt-1">These open in green dot.</p>
          <EventRows events={m.outside} slug={face.slug} />
        </section>
      )}

      {g.now.length === 0 && calendar.length === 0 && m.season.length === 0 && m.outside.length === 0 && (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-6">
          {face.name}’s events show here once its admins put them under the club.
        </p>
      )}
    </>
  )
}

/** A date tile, 52×56, and the event beside it. */
function CalendarRow({ e, slug, mine }: { e: ClubEvent; slug: string; mine: boolean }) {
  const d = e.startDate ? new Date(`${e.startDate}T12:00:00Z`) : null
  return (
    <li>
      <Link href={clubEventHref(e, slug)} className={`${cardClass('raised', true)} flex items-center gap-3 p-2 pr-3`}>
        <span className="w-[52px] h-14 flex-shrink-0 rounded-tile bg-club-tint flex flex-col items-center justify-center">
          <span className="t-data text-[20px] leading-none text-ink">{d ? d.getUTCDate() : '–'}</span>
          <span className="text-[13px] leading-none text-ink/65 mt-1">
            {d ? new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' }).format(d) : 'TBC'}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-medium leading-snug text-ink">{e.name}</span>
          <span className="block t-cap text-ink/65">
            {KIND[e.kind]}{mine && <span className="text-club-deep font-semibold"> · You’re in</span>}
          </span>
        </span>
        {membersOnly(e) ? <MembersOnly /> : <IconChevronRight size={20} className="text-ink/50" />}
      </Link>
    </li>
  )
}

type CompsView = 'upcoming' | 'mine' | 'results'

/** D159: Competitions — Upcoming, My entries, Results — a featured card and the rest in rows. No booking until (d). */
function Comps({ m, slug }: { m: Members; slug: string }) {
  const g = useGroups(m.events)
  const [view, setView] = useState<CompsView>('upcoming')
  const [making, setMaking] = useState(false)
  if (making) return <NewCompetition clubId={m.clubId} homeCourseId={m.homeCourseId} onCancel={() => setMaking(false)} />
  const lists: Record<CompsView, ClubEvent[]> = {
    upcoming: [...g.now, ...g.upcoming],
    mine: [...g.now, ...g.upcoming, ...g.past].filter(e => m.entries.includes(e.code)),
    results: g.past,
  }
  const list = lists[view]
  const [featured, ...rest] = list
  return (
    <>
      <div className="h-6" aria-hidden="true" />
      <h1 className="t-h1 text-ink">Competitions</h1>
      <p className="text-ink/65 text-sm mt-1">The club’s events — tap one to open it.</p>
      {clubMay('run_events', { row: m.credentials ?? null }) && (
        <button type="button" onClick={() => setMaking(true)} className={`${buttonClass('secondary')} mt-4`}>New competition</button>
      )}
      <Segmented className="mt-4" label="Which competitions" value={view} onChange={setView}
        options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'mine', label: 'My entries' }, { value: 'results', label: 'Results' }] as const} />
      {!featured ? (
        <p className="text-ink/65 text-[15px] mt-6">
          {view === 'mine' ? 'Nothing you’re in yet.' : view === 'results' ? 'No results yet.' : 'Nothing coming up yet.'}
        </p>
      ) : (
        <>
          <Link href={clubEventHref(featured, slug)} className={`${cardClass('floating', true)} block p-4 mt-5`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="t-cap text-ink/65">{clubEventDates(featured.startDate, featured.endDate) || KIND[featured.kind]}</p>
                <p className="t-h2 text-ink mt-1 break-words">{featured.name}</p>
              </div>
              {membersOnly(featured) && <MembersOnly />}
            </div>
            {m.entries.includes(featured.code) && <p className="t-cap text-club-deep font-semibold mt-2">You’re in</p>}
            {m.tops[featured.code] && (
              <p className="t-cap text-gold-deep font-semibold mt-2">
                Top score: <span className="t-data">{m.tops[featured.code].name} {m.tops[featured.code].points}</span> pts
              </p>
            )}
          </Link>
          {rest.length > 0 && (
            <section className="mt-6">
              {view === 'results' && <h2 className="t-h2 text-ink">Recent results</h2>}
              <EventRows events={rest} slug={slug} entries={m.entries} tops={view === 'results' ? m.tops : {}} />
            </section>
          )}
        </>
      )}
    </>
  )
}

/** The live event's board, else the latest one played — never empty (D149's rule, the club's own). */
function Board({ m, slug }: { m: Members; slug: string }) {
  const g = useGroups(m.events)
  const e = g.now[0] ?? g.past[0] ?? g.upcoming[0]
  if (!e) return <p className="text-ink/65 text-[15px] mt-8">No club events yet.</p>
  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">{g.now[0] ? 'Live now' : g.past[0] ? 'Latest result' : 'Next up'}</h1>
      <p className="text-ink/80 text-[15px] mt-2">{e.name}</p>
      <p className="t-cap text-ink/65 mt-0.5">{clubEventDates(e.startDate, e.endDate)}</p>
      <ButtonLink href={boardHref(e, slug)} variant="secondary" className="mt-6">
        Open the leaderboard
      </ButtonLink>
    </section>
  )
}

/** Stage (f): your own rounds this year, from the signed cards' summaries. */
function Stats({ face, m }: { face: ClubFace; m: Members }) {
  const season = seasonOf(m.season)
  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">Your season</h1>
      {m.season.length === 0 ? (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-2">{NO_SEASON}</p>
      ) : (
        <>
          <SeasonTiles rows={m.season} />
          {selfClaimedLine(season, face.name) && <p className="t-cap text-ink/65 mt-2">{selfClaimedLine(season, face.name)}</p>}
          <SeasonRounds rows={m.season} courses={m.courses} />
        </>
      )}
    </section>
  )
}

function ClubTabPage({ face, m }: { face: ClubFace; m: Members }) {
  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">Club</h1>
      <p className="text-ink/80 text-[15px] mt-2">You’re on {face.name}’s list: {credentialLine(m.credentials ?? NOTHING_HELD, face.name)}.</p>
      <HandicapIndexCard className="mt-6" />
      <YourDetailsCard club={face.name} className="mt-4" />
      <ListGroup className="mt-6">
        {clubMay('open_clubhouse', { row: m.credentials ?? null }) && (
          <ListRow href={`/clubhouse/${face.slug}`} label="The Clubhouse"
            hint="The club’s list, its look and its season — best on a computer" />
        )}
        <ListRow href="/home?tab=events" label="Your events"
          hint="Every event you’re in or run, and the players linked to you" />
        <ListRow href="/account" label="Your account" hint="Username, password, sign out" />
      </ListGroup>
      <p className="t-cap text-ink/65 mt-4">Anybody else opening this address sees {face.name}’s public page.</p>
      <LegalLinks className="mt-12" />
    </section>
  )
}
