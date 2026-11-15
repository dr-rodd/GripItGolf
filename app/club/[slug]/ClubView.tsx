'use client'

import { useEffect, useMemo, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { IconCheck } from '@/app/components/icons'
import { ButtonLink, ListGroup, ListRow } from '@/app/components/ui'
import { accountLink } from '@/lib/account'
import {
  clubEventDates, clubMembersWord, groupClubEvents, irishToday, mayAdminister, roleWord,
  type ClubEvent, type ClubRole,
} from '@/lib/clubs'
import { tripBase } from '@/lib/tripPaths'
import { askClub, readAccount } from '@/lib/accountClient'
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
  events: ClubEvent[]
  entries: string[]
}

const KIND: Record<ClubEvent['kind'], string> = { trip: 'Trip', tournament: 'Event', run: 'Challenge' }

/**
 * One address, two views (D157). Everybody first sees the public face the
 * server drew; a phone signed in to a Green Dot account then asks whether it
 * is on this club's list, and if so the members home takes its place —
 * Home · Comps · Board · Club, in the club's colour (D125, D127). Stats joins
 * them, Board back in the centre, once a golfer's rounds are summarised
 * (stage (f)). A section with nothing in it is not drawn, never an empty
 * heading.
 */
export default function ClubView({ face }: { face: ClubFace }) {
  const [members, setMembers] = useState<Members | null>(null)
  const [tab, setTab] = useState<ClubTab>('home')

  useEffect(() => {
    let live = true
    ;(async () => {
      if (!(await readAccount())) return
      const r = await askClub('home', { slug: face.slug })
      if (!live || !r.ok || !r.club) return
      setMembers({ clubId: r.club.id, role: r.club.role, events: r.events ?? [], entries: r.entries ?? [] })
      const asked = new URLSearchParams(window.location.search).get('tab')
      if (asked === 'comps' || asked === 'board' || asked === 'club') setTab(asked)
    })()
    return () => { live = false }
  }, [face.slug])

  function choose(t: ClubTab) {
    setTab(t)
    const url = t === 'home' ? window.location.pathname : `${window.location.pathname}?tab=${t}`
    window.history.replaceState(window.history.state, '', url)
    window.scrollTo({ top: 0 })
  }

  const artStyle = {
    ...(face.artUrl ? { '--club-art': `url("${face.artUrl}")` } : {}),
    ...(face.artDarkUrl ? { '--club-art-dark': `url("${face.artDarkUrl}")` } : {}),
  } as React.CSSProperties

  const home = !members || tab === 'home'
  return (
    <main data-club style={face.style as React.CSSProperties} className={`min-h-dvh paper relative isolate ${members ? 'has-tabbar' : ''}`}>
      {face.artUrl && (
        <>
          <div aria-hidden="true" style={artStyle}
            className={`club-art ${home ? '' : 'club-art-title'} ${face.artDarkUrl ? 'club-art-own-dark' : ''}`} />
          <div aria-hidden="true" className={`club-grain ${home ? '' : 'club-grain-title'}`} />
        </>
      )}
      <div className="relative z-10">
        <TripHeader backTo="/" />
        <div className="w-full max-w-md mx-auto px-4 pt-6 pb-10">
          <ClubTitle face={face} members={!!members} />
          {!members && <PublicFace face={face} />}
          {members && tab === 'home' && <MembersHome face={face} m={members} />}
          {members && tab === 'comps' && <Comps m={members} />}
          {members && tab === 'board' && <Board m={members} />}
          {members && tab === 'club' && <ClubTabPage face={face} m={members} />}
        </div>
      </div>
      {members && <ClubTabBar active={tab} onChoose={choose} hasBoard={members.events.length > 0} />}
    </main>
  )
}

function ClubTitle({ face, members }: { face: ClubFace; members: boolean }) {
  return (
    <header className="flex items-center gap-4">
      {face.crestUrl && (
        // A club's own crest, already resized to WebP on the server.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.crestUrl} alt="" width={72} height={72}
          className="w-[72px] h-[72px] flex-shrink-0 rounded-full object-contain bg-surface ring-2 ring-club" />
      )}
      <div className="min-w-0">
        {members && <p className="t-label text-club-deep">Members</p>}
        <h1 className="t-h1 text-ink leading-tight">{face.name}</h1>
        <p className="t-cap text-ink/65 mt-1 inline-flex items-center gap-1">
          <IconCheck size={14} /> Verified club
        </p>
      </div>
    </header>
  )
}

/** D158: the art, the crest, the name, the tick, the way in, and the guests-welcome events — nothing else. */
function PublicFace({ face }: { face: ClubFace }) {
  return (
    <>
      <ButtonLink href={accountLink(`/club/${face.slug}`)} className="mt-8">
        {clubMembersWord(face.name)}: sign in
      </ButtonLink>
      {face.events.length > 0 && (
        <section className="mt-10">
          <h2 className="t-h2 text-ink">Guests welcome</h2>
          <p className="text-ink/65 text-sm mt-1">Open to anybody with the code — tap one to follow it live.</p>
          <EventList events={face.events} />
        </section>
      )}
      <LegalLinks className="mt-12" />
    </>
  )
}

function EventList({ events, entries = [] }: { events: ClubEvent[]; entries?: string[] }) {
  return (
    <ListGroup className="mt-4">
      {events.map(e => (
        <ListRow
          key={e.code}
          href={`/${e.code}`}
          label={e.name}
          hint={[clubEventDates(e.startDate, e.endDate), KIND[e.kind], entries.includes(e.code) ? 'You’re in' : null].filter(Boolean).join(' · ')}
          trailing={e.access !== 'anyone'
            ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap bg-club-tint text-club-deep">Members only</span>
            : undefined}
          className={entries.includes(e.code) ? 'bg-club-tint' : ''}
        />
      ))}
    </ListGroup>
  )
}

function useGroups(events: ClubEvent[]) {
  return useMemo(() => groupClubEvents(events, irishToday(new Date())), [events])
}

function MembersHome({ face, m }: { face: ClubFace; m: Members }) {
  const g = useGroups(m.events)
  const soon = g.upcoming.slice(0, 3)
  return (
    <>
      {g.now.length > 0 && (
        <section className="mt-10">
          <h2 className="t-h2 text-ink">On now</h2>
          <EventList events={g.now} entries={m.entries} />
        </section>
      )}
      {soon.length > 0 && (
        <section className="mt-10">
          <h2 className="t-h2 text-ink">Coming up</h2>
          <EventList events={soon} entries={m.entries} />
        </section>
      )}
      {g.now.length === 0 && soon.length === 0 && (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-10">
          {face.name}’s events show here once its admins put them under the club.
        </p>
      )}
    </>
  )
}

/** D159: the club's events — Upcoming, My entries, Results — each opening its event. No booking until (d). */
function Comps({ m }: { m: Members }) {
  const g = useGroups(m.events)
  const upcoming = [...g.now, ...g.upcoming]
  const mine = m.events.filter(e => m.entries.includes(e.code))
  return (
    <>
      <h2 className="t-h2 text-ink mt-8">Comps</h2>
      {upcoming.length > 0 && (
        <section className="mt-6">
          <h3 className="t-card text-ink">Upcoming</h3>
          <EventList events={upcoming} entries={m.entries} />
        </section>
      )}
      {mine.length > 0 && (
        <section className="mt-8">
          <h3 className="t-card text-ink">My entries</h3>
          <EventList events={mine} entries={m.entries} />
        </section>
      )}
      {g.past.length > 0 && (
        <section className="mt-8">
          <h3 className="t-card text-ink">Results</h3>
          <EventList events={g.past} entries={m.entries} />
        </section>
      )}
      {m.events.length === 0 && <p className="text-ink/65 text-[15px] mt-6">No club events yet.</p>}
    </>
  )
}

/** The live event's board, else the latest one played — never empty (D149's rule, the club's own). */
function Board({ m }: { m: Members }) {
  const g = useGroups(m.events)
  const e = g.now[0] ?? g.past[0] ?? g.upcoming[0]
  if (!e) return <p className="text-ink/65 text-[15px] mt-8">No club events yet.</p>
  return (
    <section className="mt-8">
      <h2 className="t-h2 text-ink">{g.now[0] ? 'Live now' : g.past[0] ? 'Latest result' : 'Next up'}</h2>
      <p className="text-ink/80 text-[15px] mt-2">{e.name}</p>
      <p className="t-cap text-ink/65 mt-0.5">{clubEventDates(e.startDate, e.endDate)}</p>
      <ButtonLink href={`${tripBase(e.code, e.kind)}/leaderboard`} variant="secondary" className="mt-6">
        Open the leaderboard
      </ButtonLink>
    </section>
  )
}

function ClubTabPage({ face, m }: { face: ClubFace; m: Members }) {
  return (
    <section className="mt-8">
      <p className="text-ink/80 text-[15px]">You’re on {face.name}’s list as {roleWord(m.role, face.name).replace(/^(Owner|Admin)$/, r => `an ${r.toLowerCase()}`)}.</p>
      <ListGroup className="mt-6">
        {mayAdminister(m.role) && (
          <ListRow href={`/account/club?id=${encodeURIComponent(m.clubId)}`} label="Keep the list and the club’s look"
            hint="Add people, send their codes, the crest, the art and the colour" />
        )}
        <ListRow href="/account" label="Your account" hint="Username, password, sign out" />
      </ListGroup>
      <p className="t-cap text-ink/65 mt-4">Anybody else opening this address sees {face.name}’s public page.</p>
    </section>
  )
}
