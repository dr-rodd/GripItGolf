'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import CodeBox from '@/app/components/CodeBox'
import HandicapIndexCard from '@/app/components/HandicapIndexCard'
import { IconCheck, IconChevronRight, IconUser } from '@/app/components/icons'
import { ButtonLink, LiveDot, ListGroup, ListRow, Segmented, cardClass } from '@/app/components/ui'
import { accountLink } from '@/lib/account'
import {
  clubEventDates, groupClubEvents, irishToday, mayAdminister, roleWord,
  type ClubEvent, type ClubRole,
} from '@/lib/clubs'
import { seasonOf, selfClaimedLine, type SeasonRow } from '@/lib/cardSummary'
import { tripBase } from '@/lib/tripPaths'
import { irishGreeting } from '@/lib/irishTime'
import { NO_SEASON, SeasonRounds, SeasonTiles } from '@/app/components/Season'
import { askClub, readAccount } from '@/lib/accountClient'
import { readTierHint, rememberTier } from '@/lib/tierHint'
import ClubTabBar, { type ClubTab } from './ClubTabBar'

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

interface Members {
  clubId: string
  role: ClubRole
  name: string
  events: ClubEvent[]
  entries: string[]
  season: SeasonRow[]
  courses: Record<string, string>
  outside: ClubEvent[]
  tops: Record<string, { name: string; points: number }>
}

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
  const [members, setMembers] = useState<Members | null>(null)
  const [tab, setTab] = useState<ClubTab>('home')

  useEffect(() => {
    let live = true
    ;(async () => {
      if (!(await readAccount())) return
      const r = await askClub('home', { slug: face.slug })
      if (!live) return
      // D154: on the list, this phone opens on the club; taken off it, a
      // hint naming this club falls back to the personal page.
      const hint = readTierHint()
      if (!r.ok || !r.club) {
        if (!r.ok && /not on this club/i.test(r.error) && hint?.kind === 'club' && hint.slug === face.slug) rememberTier({ kind: 'dot' })
        return
      }
      rememberTier({ kind: 'club', slug: face.slug })
      setMembers({
        clubId: r.club.id, role: r.club.role, name: r.me?.name ?? '',
        events: r.events ?? [], entries: r.entries ?? [], season: r.season ?? [],
        courses: r.courses ?? {}, outside: r.outside ?? [], tops: r.tops ?? {},
      })
      const asked = new URLSearchParams(window.location.search).get('tab')
      if (asked === 'comps' || asked === 'board' || asked === 'stats' || asked === 'club') setTab(asked)
    })()
    return () => { live = false }
  }, [face.slug])

  function choose(t: ClubTab) {
    setTab(t)
    const url = t === 'home' ? window.location.pathname : `${window.location.pathname}?tab=${t}`
    window.history.replaceState(window.history.state, '', url)
    window.scrollTo({ top: 0 })
  }

  const home = !members || tab === 'home'
  return (
    <main data-club style={face.style as React.CSSProperties} className={`min-h-dvh paper relative isolate ${members ? 'has-tabbar' : ''}`}>
      <Art face={face} home={home} />
      <div className="relative z-10">
        <TripHeader backTo="/" />
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10">
          <ClubHeader face={face} members={!!members} />
          {!members && <PublicFace face={face} />}
          {members && tab === 'home' && <MembersHome face={face} m={members} />}
          {members && tab === 'comps' && <Comps m={members} />}
          {members && tab === 'board' && <Board m={members} />}
          {members && tab === 'stats' && <Stats face={face} m={members} />}
          {members && tab === 'club' && <ClubTabPage face={face} m={members} />}
        </div>
      </div>
      {members && <ClubTabBar active={tab} onChoose={choose} hasBoard={members.events.length > 0} />}
    </main>
  )
}

/** D123–D124: the art behind the page — the home's tall and strong, every other page's short and faint. */
function Art({ face, home }: { face: ClubFace; home: boolean }) {
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

/** The frosted header: crest in the club's ring, the name, "Members", and the account button. */
function ClubHeader({ face, members }: { face: ClubFace; members: boolean }) {
  return (
    <header className="club-frost rounded-card p-2 flex items-center gap-3">
      {face.crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.crestUrl} alt="" width={44} height={44}
          className="w-11 h-11 flex-shrink-0 rounded-full object-contain bg-surface ring-2 ring-club" />
      ) : (
        <span aria-hidden="true" className="w-11 h-11 flex-shrink-0 rounded-full ring-2 ring-club bg-club-tint" />
      )}
      <div className="flex-1 min-w-0">
        <p className="t-card text-ink leading-tight break-words">{face.name}</p>
        {members
          ? <p className="text-[13px] font-semibold text-club-deep leading-tight">Members</p>
          : <p className="t-cap text-ink/65 inline-flex items-center gap-1"><IconCheck size={14} /> Verified club</p>}
      </div>
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
            <EventRows events={face.events} />
          </>
        ) : (
          <p className="text-ink/65 text-[15px] mt-2">No public events right now.</p>
        )}
      </section>
      <LegalLinks className="mt-12" />
    </>
  )
}

function EventRows({ events, entries = [], tops = {} }: { events: ClubEvent[]; entries?: string[]; tops?: Members['tops'] }) {
  return (
    <ListGroup className="mt-4">
      {events.map(e => (
        <ListRow
          key={e.code}
          href={`/${e.code}`}
          label={e.name}
          hint={
            <>
              {[clubEventDates(e.startDate, e.endDate), KIND[e.kind]].filter(Boolean).join(' · ')}
              {entries.includes(e.code) && <span className="text-club-deep font-semibold"> · You’re in</span>}
              {tops[e.code] && (
                <span className="block text-gold-deep font-semibold">
                  Top score: <span className="t-data">{tops[e.code].name} {tops[e.code].points}</span> pts
                </span>
              )}
            </>
          }
          trailing={e.access !== 'anyone' && e.access !== null ? <MembersOnly /> : undefined}
        />
      ))}
    </ListGroup>
  )
}

/** D125: the one pill in the club's colour. */
function MembersOnly() {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap bg-club-tint text-club-deep">Members only</span>
}

function useGroups(events: ClubEvent[]) {
  return useMemo(() => groupClubEvents(events, irishToday(new Date())), [events])
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
        {' · '}{roleWord(m.role, face.name)}
      </p>

      {/* Stage (h): the front page's way into an event, and making one —
          the club's own for its admins, asked at the gate (Q3, D153). */}
      <CodeBox />
      <ButtonLink href="/create" variant="secondary" className="mt-3">Make an event</ButtonLink>

      {g.now.length > 0 && (
        <section className="mt-6">
          <h2 className="t-h2 text-ink flex items-center gap-2"><LiveDot /> Live now</h2>
          <div className="mt-3 space-y-3">
            {g.now.map(e => (
              <Link key={e.code} href={`${tripBase(e.code, e.kind)}/leaderboard`} className={`${cardClass('floating', true)} block p-4`}>
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
            {calendar.map(e => <CalendarRow key={e.code} e={e} mine={m.entries.includes(e.code)} />)}
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
          <EventRows events={m.outside} />
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
function CalendarRow({ e, mine }: { e: ClubEvent; mine: boolean }) {
  const d = e.startDate ? new Date(`${e.startDate}T12:00:00Z`) : null
  return (
    <li>
      <Link href={`/${e.code}`} className={`${cardClass('raised', true)} flex items-center gap-3 p-2 pr-3`}>
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
        {e.access !== 'anyone' && e.access !== null ? <MembersOnly /> : <IconChevronRight size={20} className="text-ink/50" />}
      </Link>
    </li>
  )
}

type CompsView = 'upcoming' | 'mine' | 'results'

/** D159: Competitions — Upcoming, My entries, Results — a featured card and the rest in rows. No booking until (d). */
function Comps({ m }: { m: Members }) {
  const g = useGroups(m.events)
  const [view, setView] = useState<CompsView>('upcoming')
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
      <Segmented className="mt-4" label="Which competitions" value={view} onChange={setView}
        options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'mine', label: 'My entries' }, { value: 'results', label: 'Results' }] as const} />
      {!featured ? (
        <p className="text-ink/65 text-[15px] mt-6">
          {view === 'mine' ? 'Nothing you’re in yet.' : view === 'results' ? 'No results yet.' : 'Nothing coming up yet.'}
        </p>
      ) : (
        <>
          <Link href={`/${featured.code}`} className={`${cardClass('floating', true)} block p-4 mt-5`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="t-cap text-ink/65">{clubEventDates(featured.startDate, featured.endDate) || KIND[featured.kind]}</p>
                <p className="t-h2 text-ink mt-1 break-words">{featured.name}</p>
              </div>
              {featured.access !== 'anyone' && featured.access !== null && <MembersOnly />}
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
              <EventRows events={rest} entries={m.entries} tops={view === 'results' ? m.tops : {}} />
            </section>
          )}
        </>
      )}
    </>
  )
}

/** The live event's board, else the latest one played — never empty (D149's rule, the club's own). */
function Board({ m }: { m: Members }) {
  const g = useGroups(m.events)
  const e = g.now[0] ?? g.past[0] ?? g.upcoming[0]
  if (!e) return <p className="text-ink/65 text-[15px] mt-8">No club events yet.</p>
  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">{g.now[0] ? 'Live now' : g.past[0] ? 'Latest result' : 'Next up'}</h1>
      <p className="text-ink/80 text-[15px] mt-2">{e.name}</p>
      <p className="t-cap text-ink/65 mt-0.5">{clubEventDates(e.startDate, e.endDate)}</p>
      <ButtonLink href={`${tripBase(e.code, e.kind)}/leaderboard`} variant="secondary" className="mt-6">
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
      <p className="text-ink/80 text-[15px] mt-2">You’re on {face.name}’s list as {roleWord(m.role, face.name).replace(/^(Owner|Admin)$/, r => `an ${r.toLowerCase()}`)}.</p>
      <HandicapIndexCard className="mt-6" />
      <ListGroup className="mt-6">
        {mayAdminister(m.role) && (
          <ListRow href={`/club/${face.slug}/list`} label="The club’s list and look"
            hint="Add people, send their codes, the crest, the art and the colour" />
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
