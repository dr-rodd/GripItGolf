'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { NO_SEASON, SeasonRounds, SeasonTiles } from '@/app/components/Season'
import { IconChevronRight } from '@/app/components/icons'
import { ButtonLink, FIELD, ListGroup, ListRow, LiveDot, buttonClass, cardClass } from '@/app/components/ui'
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
    const r = await homeData()
    if (!r.ok) {
      if (r.signedOut) { forgetTier(); window.location.replace('/'); return }
      setState({ kind: 'failed', error: r.error })
      return
    }
    if (r.home.club) { window.location.replace(`/club/${r.home.club.slug}`); return }
    setState({ kind: 'ready', home: r.home })
  }, [])

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab')
    if (asked && (HOME_TABS as readonly string[]).includes(asked)) setTab(asked as HomeTab)
    void load()
    router.prefetch('/create')
  }, [load, router])

  function choose(t: HomeTab) {
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
        {state.kind === 'ready' && tab === 'events' && <EventsTab events={state.home.events} onChanged={load} />}
        {state.kind === 'ready' && tab === 'board' && <BoardTab events={state.home.events} />}
        {state.kind === 'ready' && tab === 'stats' && <StatsTab home={state.home} />}
        {tab === 'me' && <MeTab home={state.kind === 'ready' ? state.home : null} />}
      </div>
      <HomeTabBar active={tab} onChoose={choose} />
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
      <h1 className="t-h1 text-ink mt-4">{irishGreeting(now)}{home?.username ? `, ${home.username}` : ''}</h1>
      <p className="t-cap text-ink/65 mt-1">
        {new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
      </p>

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

/** The front page's code box (D147): checked by the server, then off to the event by its short link. */
function CodeBox() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (checking) return
    setError('')
    setChecking(true)
    const entered = code.toUpperCase().trim()
    try {
      const res = await fetch(`/api/event/find?code=${encodeURIComponent(entered)}`, { cache: 'no-store' })
      if (res.status !== 200 && res.status !== 404) throw new Error(`find ${res.status}`)
      const data = await res.json() as { code: string | null }
      if (!data.code) { setError('Event not found — check the code and try again'); setChecking(false); return }
      router.push(`/${data.code}`)
    } catch {
      setError('Could not check the code — try again')
      setChecking(false)
    }
  }

  return (
    <form onSubmit={join} className="w-full flex flex-col gap-3 mt-6">
      <input
        type="text" value={code}
        onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
        maxLength={6} placeholder="EVENT CODE" aria-label="Event code"
        className={`${FIELD} field-code`} autoComplete="off" autoCorrect="off" spellCheck={false}
      />
      {error && <p className="text-rust-deep text-sm text-center leading-snug" role="alert">{error}</p>}
      <button type="submit" disabled={checking || code.trim().length < 6} className={buttonClass('primary')}>
        {checking ? 'Checking…' : 'Join event'}
      </button>
    </form>
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
        <h1 className="t-h1 text-ink">Board</h1>
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
      <h1 className="t-h1 text-ink">Your season</h1>
      {home.season.length === 0 ? (
        <p className="text-ink/65 text-[15px] leading-relaxed mt-2">{NO_SEASON}</p>
      ) : (
        <>
          <SeasonTiles rows={home.season} />
          <SeasonRounds rows={home.season} courses={home.courses} />
        </>
      )}
    </section>
  )
}

/** Me: the account, joining a club by its code, help and privacy. */
function MeTab({ home }: { home: HomeData | null }) {
  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">Me</h1>
      {home?.username && <p className="text-ink/80 text-[15px] mt-2">Signed in as {home.username}.</p>}
      <ListGroup className="mt-6">
        <ListRow href="/account" label="Your account" hint="Username, password, sign out, delete" />
        <ListRow href="/account/clubs" label="Clubs" hint="Join your club with its code, or set one up" />
        <ListRow href="/privacy" label="Privacy" hint="What Green Dot keeps, and for how long" />
        <ListRow href="/terms" label="Terms of use" />
      </ListGroup>
    </section>
  )
}
