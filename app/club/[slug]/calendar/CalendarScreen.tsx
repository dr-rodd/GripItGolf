'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@/app/components/icons'
import { Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { irishToday } from '@/lib/clubs'
import { describeTime } from '@/lib/itinerary'
import { lanesOf } from '@/lib/clubDay'
import { CLUB_MEMBER_ATTR } from '@/lib/clubHomeCopy'
import {
  CAL_VIEWS, DEFAULT_CAL_VIEW, clockMinutes, daysFrom, irishParts, onDay, stepView, viewRange,
  type CalItem, type CalView,
} from '@/lib/clubCalendar'
import type { ClubNote } from '@/lib/clubEvents'
import { useClubBar } from '../ClubBarContext'
import { NoteSheet } from '../ClubNotes'
import { ItemRow, KIND_FILL, KIND_WORD, StatusLines, useMemberCalendar, whenLine } from '../calendarParts'

const VIEW_KEY = 'gd.clubcal.view.v1'
const VIEW_WORD: Record<CalView, string> = { month: 'Month', week: 'Week', day: 'Day' }
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const fmt = (day: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', ...o }).format(new Date(`${day}T12:00:00Z`))

/**
 * The Calendar (D286): Month (a grid, Monday first — tap a day for its
 * timeline), Week (seven columns against the hours, like a phone's own
 * calendar app) and Day (one day's timeline: the casual tee sheet's open
 * hours down the left, competitions and the club's events beside it, each
 * with the member's own line). Every line and every tap's address is the
 * server's (lib/clubCalendar.ts).
 */
export default function CalendarScreen({ clubId, slug }: { clubId: string; slug: string }) {
  const today = irishToday(new Date())
  const [view, setViewState] = useState<CalView>(DEFAULT_CAL_VIEW)
  const [day, setDay] = useState(today)
  const [note, setNote] = useState<ClubNote | null>(null)
  const { setTab } = useClubBar()

  // Home's page: the footer keeps Home lit. The view last chosen on this phone.
  useEffect(() => {
    setTab('home')
    try {
      const v = window.localStorage.getItem(VIEW_KEY)
      if (v && (CAL_VIEWS as readonly string[]).includes(v)) setViewState(v as CalView)
    } catch { /* storage closed: Month */ }
  }, [setTab])
  const setView = (v: CalView) => {
    setViewState(v)
    try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* not kept */ }
  }
  const openDay = (d: string) => { setDay(d); setView('day') }

  const range = viewRange(view, day)
  const { items, error, again } = useMemberCalendar(clubId, range.from, range.to)
  // A member answered: the footer may show for this club (D197's mark).
  useEffect(() => { if (items) document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '') }, [items])

  const title = view === 'month' ? fmt(day, { month: 'long', year: 'numeric' })
    : view === 'week' ? `${fmt(range.from, { day: 'numeric', month: 'short' })} to ${fmt(range.to, { day: 'numeric', month: 'short' })}`
    : fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2">
        <h1 className="t-h1 text-ink flex-1 min-w-0 truncate">Calendar</h1>
        {day !== today && (
          <button type="button" onClick={() => setDay(today)} className={`${buttonClass('quiet', false, true)} ch-focus`}>Today</button>
        )}
      </div>
      <Segmented className="mt-4" label="Show" value={view} onChange={setView}
        options={CAL_VIEWS.map(v => ({ value: v, label: VIEW_WORD[v] }))} />
      <div className="flex items-center gap-2 mt-4">
        <button type="button" onClick={() => setDay(stepView(view, day, -1))} aria-label={`Previous ${view}`} className="w-11 h-11 rounded-full inline-flex items-center justify-center text-ink press ch-focus">
          <IconChevronLeft size={22} />
        </button>
        <p className="t-card text-ink flex-1 text-center">{title}</p>
        <button type="button" onClick={() => setDay(stepView(view, day, 1))} aria-label={`Next ${view}`} className="w-11 h-11 rounded-full inline-flex items-center justify-center text-ink press ch-focus">
          <IconChevronRight size={22} />
        </button>
      </div>

      {error && (
        <div className={`${cardClass()} p-4 mt-4`}>
          <p className="text-ink/80 text-[15px]">{error}</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!error && !items && <div className="skeleton h-80 rounded-card mt-4" aria-busy="true" aria-label="Loading" />}
      {items && view === 'month' && <MonthView day={day} today={today} range={range} items={items} onDay={openDay} />}
      {items && view === 'week' && <WeekView range={range} today={today} items={items} onDay={openDay} onNote={i => i.note && setNote(i.note)} />}
      {items && view === 'day' && <DayView day={day} today={today} items={items} onNote={i => i.note && setNote(i.note)} />}
      {note && <NoteSheet n={note} onClose={() => setNote(null)} />}
      <p className="sr-only"><Link href={`/club/${slug}`}>Back to the club</Link></p>
    </section>
  )
}

// ─── Month ───────────────────────────────────────────────────────

const MARK: Record<CalItem['kind'], string> = {
  comp: 'bg-club',
  open: 'border border-club',
  block: 'bg-line-strong',
  event: 'bg-line-strong',
  golf: 'bg-line-strong',
}

function MonthView({ day, today, range, items, onDay: open }: {
  day: string; today: string; range: { from: string; to: string }; items: CalItem[]; onDay: (d: string) => void
}) {
  const days = daysFrom(range.from, range.to)
  const month = day.slice(0, 7)
  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w, i) => <span key={i} className="t-cap text-ink/65 py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const here = items.filter(i => onDay(i, d))
          const kinds = [...new Set(here.map(i => i.kind))].slice(0, 3)
          const booked = here.some(i => i.status?.tone === 'booked')
          const out = d.slice(0, 7) !== month
          const isToday = d === today
          return (
            <button key={d} type="button" onClick={() => open(d)}
              aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}${here.length ? `, ${here.length} on` : ''}${booked ? ', you’re booked' : ''}`}
              className={`ch-focus press rounded-tile min-h-14 flex flex-col items-center pt-1.5 pb-1 gap-1 ${out ? 'opacity-50' : ''} ${booked ? 'bg-club-tint' : ''}`}>
              <span className={`t-data text-[15px] w-7 h-7 leading-7 rounded-full ${isToday ? 'bg-club text-on-club' : booked ? 'text-club-deep font-semibold' : 'text-ink'}`}>
                {Number(d.slice(8))}
              </span>
              <span className="flex gap-1 h-1.5">
                {kinds.map(k => <span key={k} className={`w-1.5 h-1.5 rounded-full ${MARK[k]}`} />)}
              </span>
            </button>
          )
        })}
      </div>
      <p className="t-cap text-ink/65 mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${MARK.comp}`} />Competition</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${MARK.open}`} />Tee sheet open</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${MARK.event}`} />Club event</span>
      </p>
      <p className="t-cap text-ink/65 mt-1">Tap a day to see it hour by hour.</p>
    </div>
  )
}

// ─── The timeline, shared by Week and Day ────────────────────────

/** An item's place on a day's timeline, in minutes — a competition to its last tee and ten minutes on, an untimed end an hour. */
function span(i: CalItem): { from: number; to: number } | null {
  const f = clockMinutes(i.from)
  if (f === null) return null
  const t = clockMinutes(i.to)
  const end = i.kind === 'comp' ? (t ?? f) + 10 : t ?? f + 60
  return { from: f, to: Math.max(end, f + 30) }
}

/** The hours a timeline shows: 7 am to 8 pm at least, stretched to fit what is on. */
function hoursOf(items: CalItem[]): { start: number; end: number } {
  const spans = items.map(span).filter((s): s is { from: number; to: number } => !!s)
  const start = Math.min(7 * 60, ...spans.map(s => Math.floor(s.from / 60) * 60))
  const end = Math.min(24 * 60, Math.max(20 * 60, ...spans.map(s => Math.ceil(s.to / 60) * 60)))
  return { start, end }
}

function useScrollTo(start: number, ppm: number, at: number | null, deps: unknown[]) {
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (box.current && at !== null) box.current.scrollTop = Math.max(0, (at - start - 60) * ppm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return box
}

function HourRail({ start, end, ppm }: { start: number; end: number; ppm: number }) {
  const hours = []
  for (let m = start; m <= end; m += 60) hours.push(m)
  return (
    <>
      {hours.map(m => (
        <div key={m} className="absolute left-0 right-0 border-t border-line" style={{ top: (m - start) * ppm }}>
          <span className="absolute -top-2.5 left-0 w-11 text-right pr-1.5 t-cap text-ink/65 tabular-nums bg-surface">{describeTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`).replace(':00', '')}</span>
        </div>
      ))}
    </>
  )
}

function NowLine({ start, ppm }: { start: number; ppm: number }) {
  const m = clockMinutes(irishParts(Date.now()).clock)
  if (m === null) return null
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: (m - start) * ppm }} aria-hidden="true">
      <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-club" />
      <span className="block border-t-2 border-club" />
    </div>
  )
}

function Block({ i, top, height, left, width, onNote, children }: {
  i: CalItem; top: number; height: number; left: string; width: string; onNote: (i: CalItem) => void; children: React.ReactNode
}) {
  const cls = `absolute rounded-tile overflow-hidden text-left px-1.5 py-1 ${KIND_FILL[i.kind]} ch-focus`
  const style = { top, height, left, width }
  if (i.href) return <Link href={i.href} className={`${cls} press`} style={style} title={i.title}>{children}</Link>
  if (i.note) return <button type="button" onClick={() => onNote(i)} className={`${cls} press`} style={style} title={i.title}>{children}</button>
  return <div className={cls} style={style} title={i.title}>{children}</div>
}

// ─── Week ────────────────────────────────────────────────────────

const WEEK_PPM = 0.8

function WeekView({ range, today, items, onDay: open, onNote }: {
  range: { from: string; to: string }; today: string; items: CalItem[]; onDay: (d: string) => void; onNote: (i: CalItem) => void
}) {
  const days = daysFrom(range.from, range.to)
  const { start, end } = useMemo(() => hoursOf(items), [items])
  const nowMins = days.includes(today) ? clockMinutes(irishParts(Date.now()).clock) : null
  const firstAt = Math.min(...items.map(span).filter(Boolean).map(s => s!.from), 9 * 60)
  const box = useScrollTo(start, WEEK_PPM, nowMins ?? firstAt, [range.from])
  const allDay = (d: string) => items.filter(i => onDay(i, d) && !span(i))
  const anyAllDay = days.some(d => allDay(d).length > 0)
  return (
    <div className={`${cardClass()} mt-3 overflow-hidden`}>
      <div className="grid border-b border-line" style={{ gridTemplateColumns: '2.75rem repeat(7, minmax(0, 1fr))' }}>
        <span />
        {days.map((d, k) => (
          <button key={d} type="button" onClick={() => open(d)} className="flex flex-col items-center py-2 press ch-focus" aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
            <span className={`t-cap ${d === today ? 'text-club-deep font-semibold' : 'text-ink/65'}`}>{WEEKDAYS[k]}</span>
            <span className={`t-data text-[17px] w-8 h-8 leading-8 text-center rounded-full mt-0.5 ${d === today ? 'bg-club text-on-club' : 'text-ink'}`}>{Number(d.slice(8))}</span>
          </button>
        ))}
        {anyAllDay && (<>
          <span />
          {days.map(d => (
            <span key={d} className="px-0.5 pb-1 space-y-0.5 min-w-0">
              {allDay(d).map(i => (
                <button key={i.key} type="button" onClick={() => (i.note ? onNote(i) : open(d))} className={`block w-full truncate rounded-tile px-1 text-[13px] leading-5 text-left ${KIND_FILL[i.kind]}`}>{i.title}</button>
              ))}
            </span>
          ))}
        </>)}
      </div>
      <div ref={box} className="relative overflow-y-auto" style={{ height: 'min(62dvh, 560px)' }}>
        <div className="relative" style={{ height: (end - start) * WEEK_PPM + 8 }}>
          <HourRail start={start} end={end} ppm={WEEK_PPM} />
          <div className="absolute top-0 bottom-0 right-0 grid" style={{ left: '2.75rem', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {days.map(d => {
              const timed = lanesOf(items.filter(i => i.date === d).flatMap(i => {
                const s = span(i)
                return s ? [{ ...s, key: i.key, i }] : []
              }))
              return (
                <div key={d} className="relative border-l border-line">
                  {timed.map(t => (
                    <Block key={t.key} i={t.i} onNote={onNote}
                      top={(t.from - start) * WEEK_PPM} height={(t.to - t.from) * WEEK_PPM - 2}
                      left={`calc(${(t.lane / t.lanes) * 100}% + 1px)`} width={`calc(${100 / t.lanes}% - 2px)`}>
                      <span className="block text-[13px] font-semibold leading-tight break-words">{t.i.kind === 'open' ? 'Open' : t.i.title}</span>
                    </Block>
                  ))}
                  {d === today && <NowLine start={start} ppm={WEEK_PPM} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Day ─────────────────────────────────────────────────────────

const DAY_PPM = 1.1

/**
 * One day hour by hour: the casual tee sheet's open hours down the left in
 * the club's tint, competitions and the club's events beside it, each with
 * the member's own line. A tap goes where the item says — a competition
 * whose booking is live straight into its tee times, the open sheet into
 * Tee times on this day.
 */
function DayView({ day, today, items, onNote }: { day: string; today: string; items: CalItem[]; onNote: (i: CalItem) => void }) {
  const here = items.filter(i => onDay(i, day))
  const { start, end } = useMemo(() => hoursOf(here), [here])
  const open = here.find(i => i.kind === 'open' && i.date === day) ?? null
  const timed = lanesOf(here.filter(i => i.kind !== 'open' && i.date === day).flatMap(i => {
    const s = span(i)
    return s ? [{ ...s, key: i.key, i }] : []
  }))
  const allDay = here.filter(i => !span(i))
  const nowMins = day === today ? clockMinutes(irishParts(Date.now()).clock) : null
  const firstAt = Math.min(...here.map(span).filter(Boolean).map(s => s!.from), 9 * 60)
  const box = useScrollTo(start, DAY_PPM, nowMins ?? firstAt, [day])
  const openSpan = open ? span(open) : null
  const RIGHT = open ? '38%' : '0%'
  return (
    <div className="mt-3">
      {allDay.length > 0 && <ul className="space-y-2 mb-3">{allDay.map(i => <ItemRow key={i.key} i={i} onNote={onNote} />)}</ul>}
      {here.length === 0 && <p className="text-ink/80 text-[15px] mb-3">Nothing on at the club this day.</p>}
      <div className={`${cardClass()} overflow-hidden`}>
        <div ref={box} className="relative overflow-y-auto" style={{ height: 'min(64dvh, 620px)' }}>
          <div className="relative" style={{ height: (end - start) * DAY_PPM + 8 }}>
            <HourRail start={start} end={end} ppm={DAY_PPM} />
            <div className="absolute top-0 bottom-0 right-1" style={{ left: '3rem' }}>
              {open && openSpan && (
                <Block i={open} onNote={onNote} top={(openSpan.from - start) * DAY_PPM} height={(openSpan.to - openSpan.from) * DAY_PPM}
                  left="0" width={`calc(${RIGHT} - 4px)`}>
                  <span className="block t-label">{KIND_WORD.open}</span>
                  <span className="block t-cap opacity-90">{whenLine(open, false)}</span>
                  <StatusLines status={open.status} className="mt-1" />
                </Block>
              )}
              <div className="absolute top-0 bottom-0 right-0" style={{ left: RIGHT }}>
                {timed.map(t => (
                  <Block key={t.key} i={t.i} onNote={onNote}
                    top={(t.from - start) * DAY_PPM} height={(t.to - t.from) * DAY_PPM - 2}
                    left={`calc(${(t.lane / t.lanes) * 100}% + 2px)`} width={`calc(${100 / t.lanes}% - 4px)`}>
                    <span className="block t-label leading-tight">{t.i.title}</span>
                    <span className="block t-cap opacity-90">{[t.i.kind === 'comp' ? null : KIND_WORD[t.i.kind], whenLine(t.i, false)].filter(Boolean).join(' · ')}</span>
                    {t.i.status && <DayStatus i={t.i} />}
                  </Block>
                ))}
              </div>
              {nowMins !== null && <NowLine start={start} ppm={DAY_PPM} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The member's line on a filled block: on the competition's own colour, so it reads in the fill's ink. */
function DayStatus({ i }: { i: CalItem }) {
  const s = i.status!
  return (
    <span className={`block t-cap mt-1 ${s.tone === 'booked' || s.tone === 'open' ? 'font-semibold' : ''}`}>
      {s.line}
      {s.names?.map(n => <span key={n} className="block font-normal">{n}</span>)}
    </span>
  )
}
