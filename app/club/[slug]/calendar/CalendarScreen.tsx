'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight, IconList } from '@/app/components/icons'
import { PageTitle, Segmented, buttonClass, cardClass } from '@/app/components/ui'
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
import { ItemRow, KIND_BAR, KIND_FILL, KIND_WORD, StatusLines, edgeStyle, fillStyle, useMemberCalendar, whenLine, type SunTimes } from '../calendarParts'

const VIEW_KEY = 'gd.clubcal.view.v1'
const VIEW_WORD: Record<CalView, string> = { month: 'Month', week: 'Week', day: 'Day' }
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const fmt = (day: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', ...o }).format(new Date(`${day}T12:00:00Z`))

/**
 * The Calendar (D286): Month (a grid, Monday first — tap a day for its
 * timeline), Week (seven columns against the hours, like a phone's own
 * calendar app — D287: seven rows, a day each) and Day (one day's timeline: the casual tee sheet's open
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
  const { items, sun, error, again } = useMemberCalendar(clubId, range.from, range.to)
  // A member answered: the footer may show for this club (D197's mark).
  useEffect(() => { if (items) document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '') }, [items])

  const title = view === 'month' ? fmt(day, { month: 'long', year: 'numeric' })
    : view === 'week' ? `${fmt(range.from, { day: 'numeric', month: 'short' })} to ${fmt(range.to, { day: 'numeric', month: 'short' })}`
    : fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section className="mt-2">
      {/* D339: the title, the view switch and the arrows in one opaque box. */}
      <PageTitle action={<>
        {day !== today && (
          <button type="button" onClick={() => setDay(today)} className={`${buttonClass('quiet', false, true)} ch-focus`}>Today</button>
        )}
        {/* D290: the same season as a list, by the week. */}
        <Link href={`/club/${slug}/comps`} aria-label="See it as a list" title="See it as a list"
          className="w-11 h-11 rounded-full inline-flex items-center justify-center text-ink press ch-focus">
          <IconList size={22} />
        </Link>
      </>} below={<>
        <Segmented className="mt-3" label="Show" value={view} onChange={setView}
          options={CAL_VIEWS.map(v => ({ value: v, label: VIEW_WORD[v] }))} />
        <div className="flex items-center gap-2 mt-2 -mb-1">
          <button type="button" onClick={() => setDay(stepView(view, day, -1))} aria-label={`Previous ${view}`} className="w-11 h-11 rounded-full inline-flex items-center justify-center text-ink press ch-focus">
            <IconChevronLeft size={22} />
          </button>
          <p className="t-card text-ink flex-1 text-center">{title}</p>
          <button type="button" onClick={() => setDay(stepView(view, day, 1))} aria-label={`Next ${view}`} className="w-11 h-11 rounded-full inline-flex items-center justify-center text-ink press ch-focus">
            <IconChevronRight size={22} />
          </button>
        </div>
      </>}>Calendar</PageTitle>

      {error && (
        <div className={`${cardClass()} p-4 mt-4`}>
          <p className="text-ink/80 text-[15px]">{error}</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!error && !items && <div className="skeleton h-80 rounded-card mt-4" aria-busy="true" aria-label="Loading" />}
      {items && view === 'month' && <MonthView day={day} today={today} range={range} items={items} onDay={openDay} />}
      {items && view === 'week' && <WeekView range={range} today={today} items={items} sun={sun} onDay={openDay} onNote={i => i.note && setNote(i.note)} />}
      {items && view === 'day' && <DayView day={day} today={today} items={items} onNote={i => i.note && setNote(i.note)} />}
      {note && <NoteSheet n={note} onClose={() => setNote(null)} />}
      <p className="sr-only"><Link href={`/club/${slug}`}>Back to the club</Link></p>
    </section>
  )
}

/**
 * D289 (Ross, 23 Nov 2026): the open tee sheet is no event of its own —
 * only the member's own tee time shows; a tap on a free time books.
 */
function shown(items: CalItem[]): CalItem[] {
  return items.filter(i => i.kind !== 'open' || i.status?.tone === 'booked')
}

/** The open tee sheet on a day, where a tap on a free time may book it (open, or booked and may book again). */
function bookable(items: CalItem[], d: string): CalItem | null {
  const o = items.find(i => i.kind === 'open' && i.date === d)
  return o && o.href && (o.status?.tone === 'open' || o.status?.tone === 'booked') ? o : null
}

// ─── Month ───────────────────────────────────────────────────────

const MARK: Record<CalItem['kind'], string> = {
  comp: 'bg-club',
  open: 'border border-club',
  block: 'bg-line-strong',
  event: 'bg-line-strong',
  golf: 'bg-line-strong',
}

/**
 * The month grid — the Calendar's own, and the tee times' day picker's (Ross,
 * 25 Nov 2026), which hands it `chosen` (the day on show, ringed), `open`
 * (only the days with a tee sheet may be picked) and its own `hint`.
 */
export function MonthView({ day, today, range, items, onDay: open, chosen = null, mayOpen, hint = 'Tap a day to see it hour by hour.' }: {
  day: string; today: string; range: { from: string; to: string }; items: CalItem[]; onDay: (d: string) => void
  chosen?: string | null
  mayOpen?: (d: string) => boolean
  hint?: string
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
          const here = shown(items).filter(i => onDay(i, d))
          // D288: a mark a colour on the day — its things' labels, three at most.
          const marks = [...new Map(here.map(i => [i.colour ?? i.kind, i])).values()].slice(0, 3)
          const booked = here.some(i => i.status?.tone === 'booked')
          const out = d.slice(0, 7) !== month
          const isToday = d === today
          const may = mayOpen ? mayOpen(d) : true
          return (
            <button key={d} type="button" onClick={() => open(d)} disabled={!may} aria-current={isToday ? 'date' : undefined} aria-pressed={chosen ? d === chosen : undefined}
              aria-label={`${isToday ? 'Today, ' : ''}${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}${here.length ? `, ${here.length} on` : ''}${booked ? ', you’re booked' : ''}`}
              className={`ch-focus press rounded-tile min-h-14 flex flex-col items-center pt-1.5 pb-1 gap-1 disabled:cursor-default ${out || !may ? 'opacity-40' : ''} ${booked ? 'bg-club-tint' : ''} ${d === chosen ? 'ring-2 ring-inset ring-club-deep' : ''}`}>
              <span className={`t-data text-[15px] w-7 h-7 leading-7 rounded-full ${isToday ? 'bg-club text-on-club font-semibold' : booked ? 'text-club-deep font-semibold' : 'text-ink'}`}>
                {Number(d.slice(8))}
              </span>
              <span className="flex gap-1 h-1.5">
                {marks.map(i => <span key={i.colour ?? i.kind} className={`w-1.5 h-1.5 rounded-full ${i.colour ? '' : MARK[i.kind]}`} style={i.colour ? { background: i.colour } : undefined} />)}
              </span>
            </button>
          )
        })}
      </div>
      <p className="t-cap text-ink/65 mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${MARK.comp}`} />Competition</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${MARK.event}`} />Club event</span>
      </p>
      <p className="t-cap text-ink/65 mt-1">{hint}</p>
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
  // D288: a labelled thing filled softly in its colour, its edge in full; the open sheet keeps the club's tint.
  const cls = `absolute rounded-tile overflow-hidden text-left px-1.5 py-1 ${i.colour ? 'text-ink' : KIND_FILL[i.kind]} ch-focus`
  const style = { top, height, left, width, ...fillStyle(i) }
  if (i.href) return <Link href={i.href} className={`${cls} press`} style={style} title={i.title}>{children}</Link>
  if (i.note) return <button type="button" onClick={() => onNote(i)} className={`${cls} press`} style={style} title={i.title}>{children}</button>
  return <div className={cls} style={style} title={i.title}>{children}</div>
}

// ─── Week ───────────────────────────────────────────────────────

/** Things on a day in the order a member reads them: all day first, then by time. */
function dayOrder(items: CalItem[], d: string): CalItem[] {
  return shown(items).filter(i => onDay(i, d))
    .sort((a, b) => (a.from ? 1 : 0) - (b.from ? 1 : 0) || (a.from ?? '').localeCompare(b.from ?? '') || a.title.localeCompare(b.title))
}

const DAY_COL = 56
/** The narrowest a card is drawn, so its words read — a short thing's card runs past its end. */
const CARD_MIN = 132
const MIDNIGHT = 24 * 60

const hourWord = (m: number) => describeTime(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`).replace(':00', '')

/**
 * A week against a timescale (D289, Ross, 23 Nov 2026): seven rows, a day
 * each, the hours across the top — the phone's width sunrise to sunset,
 * scrolling right to midnight for the evening. Each thing sits at its time
 * in its label's colour; a short one's card runs past its end so its words
 * read, and the row grows a line where two would touch. A tap on a free
 * time books the open tee sheet that day; the day's name opens it hour by
 * hour.
 */
function WeekView({ range, today, items, sun, onDay: open, onNote }: {
  range: { from: string; to: string }; today: string; items: CalItem[]; sun: SunTimes; onDay: (d: string) => void; onNote: (i: CalItem) => void
}) {
  const router = useRouter()
  const days = daysFrom(range.from, range.to)
  const inWeek = shown(items).filter(i => days.some(d => onDay(i, d)))
  const booked = inWeek.filter(i => i.status?.tone === 'booked').length
  const comps = inWeek.filter(i => i.kind === 'comp').length
  const anyBookable = days.some(d => bookable(items, d))

  // Sunrise to sunset across the week fills the phone's width.
  const rises = days.map(d => clockMinutes(sun[d]?.rise ?? null)).filter((m): m is number => m !== null)
  const sets = days.map(d => clockMinutes(sun[d]?.set ?? null)).filter((m): m is number => m !== null)
  const earliest = Math.min(...inWeek.filter(i => i.from).map(i => clockMinutes(i.from) ?? MIDNIGHT))
  const start = Math.floor(Math.min(rises.length ? Math.min(...rises) : 7 * 60, earliest) / 60) * 60
  const dusk = Math.ceil((sets.length ? Math.max(...sets) : 20 * 60) / 60) * 60
  const scroller = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth - DAY_COL)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = 0 }, [range.from])
  const ppm = width > 0 ? width / Math.max(60, dusk - start) : 0
  const track = (MIDNIGHT - start) * ppm
  const x = (m: number) => (m - start) * ppm
  const step = ppm * 60 < 40 ? 120 : 60
  const ticks: number[] = []
  for (let m = start; m < MIDNIGHT; m += step) ticks.push(m)
  const nowMins = clockMinutes(irishParts(Date.now()).clock)

  return (
    <div className={`${cardClass()} mt-3 overflow-hidden`}>
      <div className="px-4 py-3 border-b border-line">
        <p className="t-card text-ink">{fmt(range.from, { day: 'numeric', month: 'short' })} to {fmt(range.to, { day: 'numeric', month: 'short' })}</p>
        {(booked > 0 || comps > 0) && (
          <p className="t-cap text-ink/65">{[booked ? `You’re booked into ${booked}` : null, comps ? `${comps} competition${comps === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</p>
        )}
        {anyBookable && <p className="t-cap text-ink/65">Tap a free time to book a tee time.</p>}
      </div>
      <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
        {ppm > 0 && (
          <div style={{ width: DAY_COL + track }}>
            {/* The timescale. */}
            <div className="flex border-b border-line">
              <div className="sticky left-0 z-20 bg-surface flex-shrink-0" style={{ width: DAY_COL }} />
              <div className="relative h-8 flex-shrink-0" style={{ width: track }}>
                {ticks.map(m => (
                  <span key={m} className="absolute top-0 bottom-0 border-l border-line t-cap text-ink/65 tabular-nums pl-1 pt-1.5 leading-none" style={{ left: x(m) }}>{hourWord(m)}</span>
                ))}
              </div>
            </div>
            <ul className="divide-y divide-line">
              {days.map(d => {
                const here = dayOrder(items, d)
                const isToday = d === today
                const sheet = bookable(items, d)
                const rise = clockMinutes(sun[d]?.rise ?? null)
                const set = clockMinutes(sun[d]?.set ?? null)
                // Each thing's drawn extent — at least a readable card — laid in lanes so none overlaps.
                const placed = lanesOf(here.map(i => {
                  const s = span(i)
                  const from = s ? s.from : start
                  const to = s ? Math.max(s.to, from + CARD_MIN / ppm) : Math.max(MIDNIGHT, start + CARD_MIN / ppm)
                  return { key: i.key, from, to, i, allDay: !s }
                }))
                const lanes = Math.max(1, ...placed.map(p => p.lanes))
                const rows = Array.from({ length: lanes }, (_, n) => placed.filter(p => p.lane === n).sort((a, b) => a.from - b.from))
                return (
                  <li key={d} className="flex items-stretch min-h-16">
                    <button type="button" onClick={() => open(d)} aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}, hour by hour`}
                      className="sticky left-0 z-20 bg-surface border-r border-line flex-shrink-0 flex flex-col items-center justify-center py-2 press ch-focus" style={{ width: DAY_COL }}>
                      <span className={`t-cap ${isToday ? 'text-club-deep font-semibold' : 'text-ink/65'}`}>{fmt(d, { weekday: 'short' })}</span>
                      <span className={`t-data text-[17px] w-9 h-9 leading-9 text-center rounded-full ${isToday ? 'bg-club text-on-club' : 'text-ink'}`}>{Number(d.slice(8))}</span>
                    </button>
                    <div className="relative flex-shrink-0 py-1.5" style={{ width: track }}>
                      {/* The dark either side of the day, faintly. */}
                      {rise !== null && rise > start && <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 bg-tint" style={{ width: x(rise) }} />}
                      {set !== null && <span aria-hidden="true" className="absolute top-0 bottom-0 right-0 bg-tint" style={{ left: x(set) }} />}
                      {sheet && (
                        <button type="button" onClick={() => router.push(sheet.href!)} aria-label={`Book a tee time on ${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}`}
                          className="absolute inset-0 z-0 ch-focus" />
                      )}
                      {isToday && nowMins !== null && nowMins >= start && (
                        <span aria-hidden="true" className="absolute top-0 bottom-0 z-[5] border-l-2 border-club pointer-events-none" style={{ left: x(nowMins) }} />
                      )}
                      <div className="relative z-10 space-y-1.5 pointer-events-none">
                        {rows.map((r, n) => (
                          <div key={n} className="flex items-stretch">
                            {r.map((p, k) => (
                              <WeekCard key={p.key} i={p.i} onNote={onNote} allDay={p.allDay}
                                style={{ marginLeft: (p.from - (k ? r[k - 1].to : start)) * ppm, width: (p.to - p.from) * ppm - 4 }} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/** One thing in a week's row: its colour down the left, the title (wrapping), the time and the member's line. */
function WeekCard({ i, onNote, allDay, style }: { i: CalItem; onNote: (i: CalItem) => void; allDay: boolean; style: React.CSSProperties }) {
  const body = (
    <>
      <span aria-hidden="true" className={`w-1.5 flex-shrink-0 rounded-l-tile ${i.colour ? '' : KIND_BAR[i.kind]}`} style={edgeStyle(i)} />
      {/* An all-day card's words keep to the screen's left edge as it scrolls. */}
      <span className={`min-w-0 px-2 py-1.5 text-left ${allDay ? 'sticky' : 'flex-1'}`} style={allDay ? { left: DAY_COL + 8, maxWidth: CARD_MIN * 2 } : undefined}>
        <span className="block t-label text-ink leading-snug break-words">{i.title}</span>
        <span className="block t-cap text-ink/65">{whenLine(i, false) || 'All day'}</span>
        <StatusLines status={i.status} className="mt-0.5" />
      </span>
    </>
  )
  const cls = `pointer-events-auto flex-shrink-0 flex items-stretch rounded-tile bg-surface border border-line shadow-raised press ch-focus ${allDay ? '' : 'overflow-hidden'}`
  const st = { ...style, ...(i.colour ? { background: `color-mix(in srgb, ${i.colour} 10%, var(--color-surface))` } : {}) }
  if (i.href) return <Link href={i.href} className={cls} style={st}>{body}</Link>
  if (i.note) return <button type="button" onClick={() => onNote(i)} className={cls} style={st}>{body}</button>
  return <div className={cls} style={st}>{body}</div>
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
  const router = useRouter()
  const here = shown(items).filter(i => onDay(i, day))
  const { start, end } = useMemo(() => hoursOf(here), [here])
  // D289: the open sheet is no block — a tap on a free time books it; its line says when it cannot.
  const sheet = items.find(i => i.kind === 'open' && i.date === day && i.status?.tone !== 'booked') ?? null
  const canBook = bookable(items, day)
  const timed = lanesOf(here.filter(i => i.date === day).flatMap(i => {
    const s = span(i)
    return s ? [{ ...s, key: i.key, i }] : []
  }))
  const allDay = here.filter(i => !span(i))
  const nowMins = day === today ? clockMinutes(irishParts(Date.now()).clock) : null
  const firstAt = Math.min(...here.map(span).filter(Boolean).map(s => s!.from), 9 * 60)
  const box = useScrollTo(start, DAY_PPM, nowMins ?? firstAt, [day])
  return (
    <div className="mt-3">
      {allDay.length > 0 && <ul className="space-y-2 mb-3">{allDay.map(i => <ItemRow key={i.key} i={i} onNote={onNote} />)}</ul>}
      {here.length === 0 && <p className="text-ink/80 text-[15px] mb-1">Nothing on at the club this day.</p>}
      {canBook ? <p className="t-cap text-ink/65 mb-3">Tap a free time to book a tee time.</p>
        : sheet?.status ? <p className="t-cap text-ink/65 mb-3">Tee times: {sheet.status.line}</p> : here.length === 0 ? <div className="mb-2" /> : null}
      <div className={`${cardClass()} overflow-hidden`}>
        <div ref={box} className="relative overflow-y-auto" style={{ height: 'min(64dvh, 620px)' }}>
          <div className="relative" style={{ height: (end - start) * DAY_PPM + 8 }}>
            <HourRail start={start} end={end} ppm={DAY_PPM} />
            <div className="absolute top-0 bottom-0 right-1" style={{ left: '3rem' }}>
              {canBook && (
                <button type="button" onClick={() => router.push(canBook.href!)} aria-label="Book a tee time this day" className="absolute inset-0 ch-focus" />
              )}
              <div className="absolute top-0 bottom-0 right-0" style={{ left: 0 }}>
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
