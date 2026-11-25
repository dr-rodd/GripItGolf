'use client'

import { homeHref } from '@/lib/tierHint'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { NO_SEASON, SeasonSummary, SeasonTiles } from '@/app/components/Season'
import { IconChevronRight, IconSettings } from '@/app/components/icons'
import CodeBox from '@/app/components/CodeBox'
import Stream from '@/app/components/feed/Stream'
import Initials from '@/app/components/Initials'
import { ButtonLink, ListGroup, ListRow, LiveDot, PageTitle, buttonClass, cardClass } from '@/app/components/ui'
import { homeData, type HomeData } from '@/lib/accountClient'
import type { MyEvent } from '@/lib/account'
import { clubEventDates, groupClubEvents, irishToday } from '@/lib/clubs'
import { irishGreeting } from '@/lib/irishTime'
import { forgetTier } from '@/lib/tierHint'
import { tripBase } from '@/lib/tripPaths'
import EventsTab from './EventsTab'
import HomeTabBar, { HOME_TABS, type HomeTab } from './HomeTabBar'

type State =
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; home: HomeData }

const KIND: Record<MyEvent['kind'], string> = { trip: 'Trip', tournament: 'Event', run: 'Challenge' }

/** An event's own home: a run challenge lives under /run, golf under /golf. */
function eventHome(e: Pick<MyEvent, 'code' | 'kind'>): string {
  return e.kind === 'run' ? `/run/${e.code}` : tripBase(e.code, e.kind)
}

/**
 * A Dot member's personal page (stage (g); D143, D148, D149, D151). The
 * shell paints at once; who, which home, the events and the season arrive in
 * one ask after it (Q5). A phone that turns out to hold no account is sent
 * to the front page with its hint cleared (D154); a Club member goes on to
 * their club's area, until (h) brings it under /home. No skin: only a club
 * area wears one.
 */
export default function HomeScreen() {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [tab, setTab] = useState<HomeTab>('home')

  const load = useCallback(async () => {
    // A tab asked for by name is the personal page on purpose — the club
    // area's Your events (stage (h)) — so a Club member stays for it.
    const asked = new URLSearchParams(window.location.search).has('tab')
    const r = await homeData()
    if (!r.ok) {
      if (r.signedOut) { forgetTier(); window.location.replace('/'); return }
      setState({ kind: 'failed', error: r.error })
      return
    }
    if (r.home.club && !asked) { window.location.replace(`/club/${r.home.club.slug}`); return }
    setState({ kind: 'ready', home: r.home })
  }, [])

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab')
    // Streams v2 (D319): Me went — an old ?tab=me opens your page.
    if (asked === 'me') { router.replace('/home/me'); return }
    if (asked && (HOME_TABS as readonly string[]).includes(asked)) setTab(asked as HomeTab)
    void load()
    router.prefetch('/create')
  }, [load, router])

  function choose(t: HomeTab) {
    // MO1, M4 (D280): a club member's Home is their club's home.
    if (t === 'home' && homeHref() !== '/') { router.push(homeHref()); return }
    setTab(t)
    window.history.replaceState(window.history.state, '', t === 'home' ? '/home' : `/home?tab=${t}`)
    window.scrollTo({ top: 0 })
  }

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader />
      <div className="w-full max-w-md mx-auto px-4 pt-3 pb-10" aria-busy={state.kind === 'loading'}>
        {state.kind === 'failed' && (
          <div className="mt-6">
            <p className="t-cap text-rust-deep" role="alert">{state.error}</p>
            <button type="button" onClick={() => { setState({ kind: 'loading' }); void load() }}
              className={`${buttonClass('secondary', false)} mt-4`}>Try again</button>
          </div>
        )}
        {tab === 'home' && <HomeTabPage home={state.kind === 'ready' ? state.home : null} />}
        {state.kind === 'ready' && tab === 'stream' && <Stream settingsPath="/home/settings" />}
        {state.kind === 'ready' && tab === 'events' && <EventsTab events={state.home.events} onChanged={load} />}
        {state.kind === 'ready' && tab === 'board' && <BoardTab events={state.home.events} />}
        {state.kind === 'ready' && tab === 'stats' && <StatsTab home={state.home} />}
      </div>
      <HomeTabBar active={tab} onChoose={choose} signedIn={state.kind === 'ready'} />
    </main>
  )
}

function useGroups(events: MyEvent[]) {
  return useMemo(() => groupClubEvents(events, irishToday(new Date())), [events])
}

/**
 * Home (D143, D146, D147): the greeting, the code box — a member's way into
 * an event is the front page's — making an event, then Live now, Coming up
 * and Your season, each drawn only when it has something in it.
 */
function HomeTabPage({ home }: { home: HomeData | null }) {
  const now = new Date()
  const events = home?.events ?? []
  const g = useGroups(events)
  const coming = g.upcoming.slice(0, 5)
  return (
    <>
      <div className="flex items-start gap-2 mt-4">
        <div className="flex-1 min-w-0">
          <h1 className="t-h1 text-ink break-words">{irishGreeting(now)}{home?.username ? `, ${home.username}` : ''}</h1>
          <p className="t-cap text-ink/65 mt-1">
            {new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
          </p>
        </div>
        {/* D319: the gear opens Settings; the profile circle, your page. */}
        <Link href="/home/settings" aria-label="Settings" className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center text-ink/80 press ch-focus">
          <IconSettings size={22} />
        </Link>
        <Link href="/home/me" aria-label="Your page" className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center press ch-focus">
          <Initials name={home?.username ?? ''} />
        </Link>
      </div>

      <CodeBox />
      <ButtonLink href="/create" variant="secondary" className="mt-3">Make an event</ButtonLink>

      {g.now.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h2 text-ink flex items-center gap-2"><LiveDot /> Live now</h2>
          <div className="mt-3 space-y-3">
            {g.now.map(e => (
              <Link key={e.code} href={`${eventHome(e)}/leaderboard`} className={`${cardClass('floating', true)} block p-4`}>
                <p className="t-card text-ink">{e.name}</p>
                <p className={`t-cap mt-1 ${e.player ? 'text-accent-deep font-semibold' : 'text-ink/65'}`}>
                  {e.player ? 'You’re playing · ' : ''}Open the leaderboard
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {coming.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h2 text-ink">Coming up</h2>
          <ul className="mt-3 space-y-2">
            {coming.map(e => <DateRow key={e.code} e={e} />)}
          </ul>
        </section>
      )}

      {home && home.season.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h2 text-ink">Your season</h2>
          <SeasonTiles rows={home.season} />
        </section>
      )}

      {home && events.length === 0 && (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-8">
          Events you make, or join on a phone signed in to your Green Dot account, show here.
        </p>
      )}
      <LegalLinks className="mt-12" />
    </>
  )
}

/** A date tile, 52×56, and the event beside it — the club calendar's row without the club's colour. */
function DateRow({ e }: { e: MyEvent }) {
  const d = e.startDate ? new Date(`${e.startDate}T12:00:00Z`) : null
  return (
    <li>
      <Link href={`/${e.code}`} className={`${cardClass('raised', true)} flex items-center gap-3 p-2 pr-3`}>
        <span className="w-[52px] h-14 flex-shrink-0 rounded-tile bg-tint flex flex-col items-center justify-center">
          <span className="t-data text-[20px] leading-none text-ink">{d ? d.getUTCDate() : '–'}</span>
          <span className="text-[13px] leading-none text-ink/65 mt-1">
            {d ? new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' }).format(d) : 'TBC'}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-medium leading-snug text-ink">{e.name}</span>
          <span className="block t-cap text-ink/65">
            {e.club ?? KIND[e.kind]}{e.owned && ' · Yours'}
          </span>
        </span>
        <IconChevronRight size={20} className="text-ink/50" />
      </Link>
    </li>
  )
}

/** D149: the live event's board, else the latest one played, else the next — never empty. */
function BoardTab({ events }: { events: MyEvent[] }) {
  const g = useGroups(events)
  const e = g.now[0] ?? g.past[0] ?? g.upcoming[0]
  if (!e) {
    return (
      <section className="mt-6">
        <PageTitle>Board</PageTitle>
        <p className="text-ink/65 text-[15px] leading-relaxed mt-2">Your events’ leaderboards open here once you’re in one.</p>
      </section>
    )
  }
  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">{g.now[0] ? 'Live now' : g.past[0] ? 'Latest result' : 'Next up'}</h1>
      <p className="text-ink/80 text-[15px] mt-2">{e.name}</p>
      <p className="t-cap text-ink/65 mt-0.5">{clubEventDates(e.startDate, e.endDate) || KIND[e.kind]}</p>
      <ButtonLink href={`${eventHome(e)}/leaderboard`} variant="secondary" className="mt-6">Open the leaderboard</ButtonLink>
    </section>
  )
}

/** The headline (D143): this year's signed rounds. */
function StatsTab({ home }: { home: HomeData }) {
  return (
    <section className="mt-6">
      <PageTitle>Your season</PageTitle>
      {home.season.length === 0 ? (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-2">{NO_SEASON}</p>
      ) : (
        <>
          <SeasonSummary rows={home.season} courses={home.courses} index={home.indexTrend ?? []} />
        </>
      )}
    </section>
  )
}
