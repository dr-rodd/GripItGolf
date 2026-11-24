'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { askClub, askTeeTimes, type ClubAnswer } from '@/lib/accountClient'
import { askFeed } from '@/lib/feedClient'
import { clubhouseHref, eventHref, formatLine, isOfficeOnly, opensOutside, seasonType, type ListCounts, type Need, type SeasonEvent } from '@/lib/clubhouse'
import { NO_YOURS, dayWord, periodRange, quietLine, whatsOn, yoursIn, type On, type Period, type YoursItem } from '@/lib/clubOverview'
import { PHASE_WORDS } from '@/lib/compPhase'
import { noteTimeLine, typeLabel } from '@/lib/clubEvents'
import { irishToday } from '@/lib/clubs'
import { IconChevronRight } from '@/app/components/icons'
import { Pill, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { useShell } from './ShellContext'
import { useSeason } from './useSeason'
import OverviewSearch from './OverviewSearch'

/** At most this many rows a card before "and n more". */
const CARD_ROWS = 8
const PERIOD_KEY = 'gd.clubhouse.overview.period.v1'

type TeeDay = { date: string; booked: number; places: number; overlays: number }

/**
 * The Overview as a control centre (D276, Ross, 21 Nov 2026): a heads-up of
 * the club today or this week for whoever is at the desk. Search at the top
 * (events, competitions, members, a date); Today | This week driving
 * everything under it; Yours — what this account is in; What's on — the
 * competitions, the club's own events and the casual tee sheet; Alerts; and
 * the list's figures in a strip at the foot. Cards sized to what they hold,
 * in two columns that flow like a board of notes, and a card with nothing in
 * it is not drawn. `lib/clubOverview.ts` holds every rule.
 */
export default function Overview() {
  const { face, club, may } = useShell()
  const [data, setData] = useState<Pick<ClubAnswer, 'counts' | 'needs' | 'today' | 'yours'> | null>(null)
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const season = useSeason(club.id)
  const [period, setPeriodState] = useState<Period>('today')
  const [tee, setTee] = useState<TeeDay[] | null>(null)
  const keepsSheet = may('keep_tee_sheet'), keepsCalendar = may('keep_calendar'), keepsList = may('keep_list')

  useEffect(() => {
    try { if (window.localStorage.getItem(PERIOD_KEY) === 'week') setPeriodState('week') } catch { /* the default */ }
  }, [])
  const setPeriod = (p: Period) => {
    setPeriodState(p)
    try { window.localStorage.setItem(PERIOD_KEY, p) } catch { /* not remembered */ }
  }

  useEffect(() => {
    let live = true
    void askClub('overview', { clubId: club.id }).then(r => {
      if (!live) return
      if (r.ok) { setData(r); setLost(false) } else setLost(true)
    })
    return () => { live = false }
  }, [club.id, attempt])

  const today = data?.today ?? irishToday(new Date())
  // D303: feed reports on this club's cards wait in Alerts — asked on their own, fail-soft before 102.
  const [reports, setReports] = useState(0)
  useEffect(() => {
    let live = true
    void askFeed<{ reports: unknown[] }>('reports.club', { clubId: club.id }).then(r => { if (live && r.ok) setReports(r.reports.length) })
    return () => { live = false }
  }, [club.id])
  const needs = data?.needs ? (reports > 0
    ? [...data.needs, { key: 'feed-reports', line: `${reports} ${reports === 1 ? 'report' : 'reports'} on the feed to look at.`, href: `${clubhouseHref(face.slug)}/reports` }]
    : data.needs) : null
  useEffect(() => {
    if (!keepsSheet) return
    let live = true
    void askTeeTimes<{ ready?: boolean; week?: TeeDay[] }>('office.day', { clubId: club.id, date: today }).then(r => {
      if (live && r.ok && r.ready !== false && r.week) setTee(r.week)
    })
    return () => { live = false }
  }, [club.id, today, keepsSheet])

  const { from, to } = periodRange(today, period)
  const week = periodRange(today, 'week')
  const on = useMemo(() => whatsOn(season.events ?? [], from, to), [season.events, from, to])
  const weekCount = useMemo(() => { const w = whatsOn(season.events ?? [], week.from, week.to); return w.comps.length + w.events.length }, [season.events, week.from, week.to])
  const yours = useMemo(() => yoursIn(data?.yours ?? NO_YOURS, season.events ?? [], from, to, clubhouseHref(face.slug)), [data?.yours, season.events, from, to, face.slug])
  const teeShown = tee?.filter(d => d.date >= from && d.date <= to) ?? null
  const loading = !season.events && !season.lost
  const quiet = !loading && on.comps.length === 0 && on.events.length === 0

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="t-h1 text-ink flex-1">Overview</h1>
        <p className="t-label text-ink/65">{longDay(today)}</p>
      </div>
      <div className="mt-4"><OverviewSearch events={season.events} today={today} /></div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented label="Show" value={period} onChange={setPeriod}
          options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }] as const} />
        {period === 'week' && <p className="t-cap text-ink/65">{dayWord(week.from, today)} to {dayWord(week.to, today)}</p>}
      </div>

      {(lost || season.lost) && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={() => { setAttempt(a => a + 1); season.again() }} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}

      {yours.length > 0 && (
        <section className="mt-6" aria-labelledby="ov-yours">
          <h2 id="ov-yours" className="t-eyebrow text-ink/65">Yours</h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {yours.map(y => <YoursCard key={y.key} y={y} today={today} period={period} />)}
          </ul>
        </section>
      )}

      <div className="mt-6 flex items-baseline gap-3">
        <h2 className="t-eyebrow text-ink/65 flex-1">What’s on</h2>
        <Link href={`${clubhouseHref(face.slug, 'settings')}#locations`} className="t-label text-ink/80 underline underline-offset-2 ch-focus rounded-tile">Locations</Link>
      </div>
      <div className="mt-2 columns-1 lg:columns-2 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {loading && <div className={`${cardClass()} p-5`}><Skeleton /></div>}
        {quiet && (
          <section className={`${cardClass()} p-5`}>
            <p className="text-ink/80 text-[15px]">{quietLine(period, weekCount)}</p>
            {period === 'today' && weekCount > 0 && (
              <button type="button" onClick={() => setPeriod('week')} className="t-label text-accent-deep underline underline-offset-2 ch-focus mt-2">See this week</button>
            )}
          </section>
        )}
        {on.comps.length > 0 && (
          <OnCard title="Competitions" id="ov-comps" rows={on.comps} today={today} period={period}
            more={moreHref(face.slug, period, from)} row={o => <CompRow o={o} slug={face.slug} today={today} period={period} linked={keepsCalendar} />} />
        )}
        {on.events.length > 0 && (
          <OnCard title="Club events" id="ov-events" rows={on.events} today={today} period={period}
            more={moreHref(face.slug, period, from)} row={o => <EventRow o={o} slug={face.slug} today={today} period={period} linked={keepsCalendar} />} />
        )}
        {keepsSheet && teeShown && teeShown.length > 0 && <TeeCard days={teeShown} today={today} period={period} slug={face.slug} />}
        <AlertsCard needs={needs} />
      </div>

      {keepsList && data?.counts && <StatsStrip c={data.counts} slug={face.slug} />}
    </>
  )
}

function longDay(day: string): string {
  return new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
}

/** Where "and n more" goes: today's Calendar day, else Events. */
function moreHref(slug: string, p: Period, from: string): string {
  return p === 'today' ? `${clubhouseHref(slug, 'calendar')}/${from}` : clubhouseHref(slug, 'events')
}

function YoursCard({ y, today, period }: { y: YoursItem; today: string; period: Period }) {
  const when = [period === 'week' ? dayWord(y.date, today) : null, y.time].filter(Boolean).join(' · ')
  return (
    <li>
      <Link href={y.href} className={`${cardClass()} ch-hover ch-focus flex items-center gap-3 px-4 py-3 min-h-14`}>
        <span className="min-w-0">
          <span className="block t-cap text-accent-deep">{y.why}</span>
          <span className="block text-ink text-[15px] font-medium leading-snug">{y.title}</span>
          {when && <span className="block t-cap text-ink/65 tabular-nums">{when}</span>}
        </span>
        <IconChevronRight size={18} />
      </Link>
    </li>
  )
}

function OnCard({ title, id, rows, row, more }: { title: string; id: string; rows: On[]; today: string; period: Period; more: string; row: (o: On) => React.ReactNode }) {
  const extra = rows.length - CARD_ROWS
  return (
    <section className={`${cardClass()} p-5`} aria-labelledby={id}>
      <h3 id={id} className="t-card text-ink">{title}</h3>
      <ul className="mt-2 divide-y divide-line">{rows.slice(0, CARD_ROWS).map(o => <li key={o.event.code}>{row(o)}</li>)}</ul>
      {extra > 0 && <Link href={more} className="t-label text-accent-deep underline underline-offset-2 ch-focus mt-2 inline-block">and {extra} more</Link>}
    </section>
  )
}

const rowClass = 'flex items-center gap-3 min-h-12 py-1.5 -mx-2 px-2 rounded-tile'

function CompRow({ o, slug, today, period, linked }: { o: On; slug: string; today: string; period: Period; linked: boolean }) {
  const c = o.event.competition!
  const body = (
    <>
      {period === 'week' && <span className="t-cap text-ink/65 w-20 flex-shrink-0">{dayWord(o.day, today)}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-ink text-[15px] font-medium truncate">{o.event.name}</span>
        <span className="block t-cap text-ink/65 truncate">{formatLine(c)}</span>
      </span>
      <span className="t-cap text-ink/80 tabular-nums whitespace-nowrap">
        {c.matchPlay ? `${c.matchPlay.entered}${c.matchPlay.cap ? ` of ${c.matchPlay.cap}` : ''} in` : c.capacity ? `${c.booked} of ${c.capacity}` : `${c.booked} booked`}
      </span>
      <Pill live={c.phase === 'in_play'}>{PHASE_WORDS[c.phase]}</Pill>
    </>
  )
  const href = eventHref(o.event, slug)
  return linked && href ? <Link href={href} className={`${rowClass} ch-hover ch-focus`}>{body}</Link> : <div className={rowClass}>{body}</div>
}

function EventRow({ o, slug, today, period, linked }: { o: On; slug: string; today: string; period: Period; linked: boolean }) {
  const e: SeasonEvent = o.event
  const when = e.note ? noteTimeLine(e.note) : null
  const body = (
    <>
      {period === 'week' && <span className="t-cap text-ink/65 w-20 flex-shrink-0">{dayWord(o.day, today)}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-ink text-[15px] font-medium truncate">{e.name}</span>
        <span className="block t-cap text-ink/65 truncate">{[typeLabel(seasonType(e)), e.note?.place, when].filter(Boolean).join(' · ')}</span>
      </span>
      {isOfficeOnly(e) && <Pill>Office only</Pill>}
    </>
  )
  if (e.note) {
    return linked
      ? <Link href={`${clubhouseHref(slug, 'events')}?event=${e.note.id}`} className={`${rowClass} ch-hover ch-focus`}>{body}</Link>
      : <div className={rowClass}>{body}</div>
  }
  const href = eventHref(e, slug)
  return href ? <Link href={href} {...(opensOutside(e) ? { target: '_blank', rel: 'noopener' } : {})} className={`${rowClass} ch-hover ch-focus`}>{body}</Link> : <div className={rowClass}>{body}</div>
}

/** The casual tee sheet: today's places booked of all, or the week as seven bars. */
function TeeCard({ days, today, period, slug }: { days: TeeDay[]; today: string; period: Period; slug: string }) {
  const booked = days.reduce((n, d) => n + d.booked, 0), places = days.reduce((n, d) => n + d.places, 0)
  const blocked = days.reduce((n, d) => n + d.overlays, 0)
  const most = Math.max(1, ...days.map(d => d.places))
  return (
    <section className={`${cardClass()} p-5`} aria-labelledby="ov-tee">
      <Link href={clubhouseHref(slug, 'teesheet')} className="ch-focus rounded-tile flex items-center gap-2">
        <h3 id="ov-tee" className="t-card text-ink flex-1">Tee sheet</h3>
        <IconChevronRight size={18} />
      </Link>
      <p className="text-ink text-[15px] mt-2 tabular-nums">
        <span className="font-semibold">{booked}</span> of {places} places booked {period === 'today' ? 'today' : 'this week'}
      </p>
      {blocked > 0 && <p className="t-cap text-ink/65 mt-1">{blocked} {blocked === 1 ? 'competition or block takes' : 'competitions or blocks take'} some of the times.</p>}
      {period === 'week' && (
        <ul className="mt-3 grid grid-cols-7 gap-2" aria-label="Places booked each day">
          {days.map(d => (
            <li key={d.date} className="text-center">
              <Link href={`${clubhouseHref(slug, 'teesheet')}?day=${d.date}`} className="ch-hover ch-focus block rounded-tile py-1" aria-label={`${dayWord(d.date, today)}: ${d.booked} of ${d.places} booked`}>
                <span className="block h-12 relative mx-auto w-4 bg-tint rounded-full overflow-hidden">
                  <span className="absolute bottom-0 left-0 right-0 bg-accent-deep rounded-full" style={{ height: `${Math.round((d.places ? d.booked / most : 0) * 100)}%` }} />
                </span>
                <span className={`block t-cap mt-1 ${d.date === today ? 'text-ink font-semibold' : 'text-ink/65'}`}>{dayWord(d.date, today).slice(0, 3)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Alerts are not dated — a competition still to certify from last week needs doing today — so the toggle leaves them as they are. */
function AlertsCard({ needs }: { needs: Need[] | null }) {
  return (
    <section className={`${cardClass()} p-5`} aria-labelledby="ov-needs">
      <h3 id="ov-needs" className="t-card text-ink">Alerts{needs && needs.length > 0 ? ` (${needs.length})` : ''}</h3>
      {!needs ? <Skeleton /> : needs.length === 0 ? (
        <p className="text-ink/65 text-[15px] mt-2">No alerts.</p>
      ) : (
        <ul className="mt-1">
          {needs.map(n => (
            <li key={n.key}>
              <Link href={n.href} className="ch-hover ch-focus flex items-center gap-3 min-h-12 px-2 -mx-2 rounded-tile">
                <span className="flex-1 text-ink text-[15px] leading-snug">{n.line}</span>
                <IconChevronRight size={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The list's figures, in one line at the foot — each a way into Members (M5: the lookup itself is the search). */
function StatsStrip({ c, slug }: { c: ListCounts; slug: string }) {
  const members = (q: string) => `${clubhouseHref(slug, 'members')}?${q}`
  const figs: { label: string; value: number; href: string }[] = [
    { label: 'On the list', value: c.onList, href: members('filter=all') },
    { label: 'Joined', value: c.joined, href: members('filter=joined') },
    ...(c.invited !== null ? [{ label: 'Invited', value: c.invited, href: members('filter=invited') }] : []),
    { label: 'Officers', value: c.officer, href: members('filter=officer') },
    { label: 'Clubhouse', value: c.clubhouse, href: members('filter=clubhouse') },
    ...Object.entries(c.byCategory ?? {}).map(([name, n]) => ({ label: name, value: n, href: clubhouseHref(slug, 'memberships') })),
    ...(c.noCategory ? [{ label: 'No membership', value: c.noCategory, href: members('category=none') }] : []),
    { label: 'Taken off', value: c.off, href: members('filter=off') },
  ]
  return (
    <nav aria-label="The list" className="mt-6 pt-4 border-t border-line">
      <ul className="flex flex-wrap gap-x-1 gap-y-1">
        {figs.map(f => (
          <li key={f.label}>
            <Link href={f.href} className="ch-hover ch-focus inline-flex items-baseline gap-1.5 rounded-tile px-2 py-1 text-[15px]">
              <span className="text-ink/65">{f.label}</span>
              <span className="text-ink font-semibold tabular-nums">{f.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Skeleton() {
  return <div className="mt-3 space-y-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-8 rounded-tile" />)}</div>
}
