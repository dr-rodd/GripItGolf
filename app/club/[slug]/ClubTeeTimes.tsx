'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconCalendar, IconChevronLeft, IconChevronRight, IconPlus, IconX } from '@/app/components/icons'
import { FIELD, PageTitle, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { popClose, popOpen } from '@/app/components/popOut'
import { stepView, viewRange } from '@/lib/clubCalendar'
import { useMemberCalendar } from './calendarParts'
import { MonthView } from './calendar/CalendarScreen'
import { askTeeTimes } from '@/lib/accountClient'
import {
  lookAheadDays, overlaySpan, sheetRows, timeGone,
  type Overlay, type SheetRow, type TeeBookingView, type TeeDayBody,
} from '@/lib/clubTeeSheet'
import { describeTime } from '@/lib/itinerary'
import DemoPill from '@/app/components/DemoPill'

type Day = { ok: true } & TeeDayBody
type Pick = { memberId: string; name: string } | { guestName: string }
type Item = { key: string; row: Extract<SheetRow, { kind: 'overlay' }> } | { key: string; time: string; caught: string | null }

/**
 * Today's sheet asked for ahead of the tap (MO3, D282): the club home starts
 * it, the tab draws it at once and asks again behind it. Held in this
 * browser tab only, a few minutes at most — never a stand-in for the server.
 */
const ahead = new Map<string, { at: number; day: Promise<Day | null> }>()
const AHEAD_MS = 5 * 60_000
export function prefetchTeeDay(clubId: string) {
  const had = ahead.get(clubId)
  if (had && Date.now() - had.at < 60_000) return
  const day = askTeeTimes<TeeDayBody>('day', { clubId }).then(r => (r.ok ? r as Day : null)).catch(() => null)
  ahead.set(clubId, { at: Date.now(), day })
}

const dayWords = (d: string, today: string) => {
  const t = new Date(`${d}T12:00:00Z`)
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return {
    head: d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : t.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    sub: d === today || d === tomorrow
      ? t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })
      : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }),
    long: t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  }
}

/**
 * The club's casual tee sheet on the members app (Ross, 17 Nov 2026): a
 * day at a time, today and the weeks ahead; every time from sunrise to an
 * hour before sunset with who is on it — one opaque sheet, a time a row
 * under hairlines, read like the starter's sheet rather than a stack of
 * cards (Ross, 25 Nov 2026: "a more serious look"). The day is a boxed title
 * that springs open the club's month calendar (the pop-out), today marked,
 * the days with a sheet the ones to pick; a competition or an event that has
 * the course said over the times it takes, a competition's going on to its
 * own tee sheet for whoever may enter. A member books themselves, members
 * from the list and guests by name, and takes off their own. Every rule is
 * the server's (`/api/club/tee-times`), the sheet asked again after each change.
 */
export default function ClubTeeTimes({ clubId }: { clubId: string }) {
  const [day, setDay] = useState<Day | null>(null)
  const [lost, setLost] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<{ time: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // The day asked for; null is today, which the server knows in Irish time.
  // D286: the Calendar opens the sheet on a day (`?day=`).
  const [asked, setAsked] = useState<{ date: string | null; n: number }>(() => {
    const d = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('day')
    return { date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null, n: 0 }
  })
  const date = day?.date ?? asked.date

  // The month calendar, sprung out of the day's box (D341).
  const [picking, setPicking] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let live = true
    // Today, fetched ahead by the club home: drawn at once, then asked again behind it.
    const kept = !asked.date && asked.n === 0 ? ahead.get(clubId) : undefined
    if (kept && Date.now() - kept.at < AHEAD_MS) void kept.day.then(d => { if (live && d) setDay(prev => prev ?? d) })
    askTeeTimes<TeeDayBody>('day', { clubId, ...(asked.date ? { date: asked.date } : {}) }).then(r => {
      if (!live) return
      if (!r.ok) { setLost(r.error); return }
      setLost(null)
      setDay(r)
    })
    return () => { live = false }
  }, [clubId, asked])

  /** Ask for a day again — after a change, or another day chosen. */
  const load = useCallback((d: string | null) => setAsked(a => ({ date: d, n: a.n + 1 })), [])
  const choose = (d: string) => { setOpen(null); setError(null); load(d) }

  async function cancel(b: TeeBookingView) {
    if (busy || !day) return
    setBusy(true); setError(null)
    const r = await askTeeTimes('cancel', { clubId, date: day.date, id: b.id })
    setBusy(false)
    if (!r.ok) { setError({ time: b.time, text: r.error }); return }
    load(day.date)
  }

  if (!day) {
    return (
      <section className="mt-6">
        <PageTitle sub={lost ? undefined : 'Opening the tee sheet…'}>Tee times</PageTitle>
        {lost && (
          <div role="alert" className={`${cardClass()} p-4 mt-4`}>
            <p className="text-ink/80 text-[15px]">{lost}</p>
            <button type="button" onClick={() => load(date)} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
          </div>
        )}
        {!lost && <div className="skeleton h-72 rounded-card mt-4" aria-busy="true" />}
      </section>
    )
  }

  const days = lookAheadDays(day.today)
  const at = days.indexOf(day.date)
  const mine = day.me ? day.bookings.filter(b => b.memberId === day.me!.memberId) : []
  const offerMe = !!day.me && !day.me.refusal && mine.length < day.settings.perDay
  const mayBook = day.ready && !day.opening
  const rows = sheetRows(day.times, day.overlays, day.bookings.map(b => b.time))
  const words = dayWords(day.date, day.today)
  const step = (by: 1 | -1) => { const d = days[at + by]; if (d) choose(d) }
  const arrow = 'w-10 h-12 flex-shrink-0 rounded-tile inline-flex items-center justify-center text-ink press ch-focus disabled:text-disabled-fg disabled:cursor-default'

  return (
    <section className="mt-6">
      <PageTitle below={<>
        {/* D341: the day is a boxed title; a tap springs the month calendar out of it. */}
        <div className="flex items-stretch gap-1 mt-3">
          <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label="The day before" className={arrow}>
            <IconChevronLeft size={22} />
          </button>
          <button type="button" onClick={e => { const el = e.currentTarget; setPicking(p => p ?? el) }} aria-haspopup="dialog" aria-expanded={!!picking}
            aria-label={`${words.long}. Choose another day`}
            className="flex-1 min-w-0 min-h-12 px-3 rounded-tile border border-line-strong bg-surface flex items-center gap-3 text-left press ch-focus">
            <span className="flex-1 min-w-0">
              <span className="block t-card text-ink leading-tight">{words.head}</span>
              <span className="block t-cap text-ink/65 truncate">{words.sub}</span>
            </span>
            <IconCalendar size={20} className="text-ink/65 flex-shrink-0" />
          </button>
          <button type="button" onClick={() => step(1)} disabled={at < 0 || at >= days.length - 1} aria-label="The day after" className={arrow}>
            <IconChevronRight size={22} />
          </button>
        </div>
        {!day.ready && <p className="text-ink/80 text-[15px] mt-3">The club’s tee sheet isn’t set up yet. Competitions are booked from Comps.</p>}
        {day.ready && day.opening && <p className="text-ink/80 text-[15px] mt-3">{day.opening}.</p>}
        {day.ready && !day.opening && day.me?.refusal && <p className="text-ink/80 text-[15px] mt-3">{day.me.refusal}</p>}
        {mine.length > 0 && <p className="t-label text-accent-deep mt-3">You’re on {mine.map(b => describeTime(b.time)).join(' and ')}.</p>}
      </>}>Tee times</PageTitle>

      {/* The sheet: one opaque card, a time a row under hairlines, sunrise at its head and sunset at its foot. */}
      <div className={`${cardClass()} mt-4 overflow-hidden`}>
        {(day.sun.sunrise || !day.sun.located) && (
          <p className="t-cap text-ink/65 px-4 py-2 bg-tint">
            {day.sun.sunrise ? `Sunrise ${describeTime(day.sun.sunrise)}` : ''}
            {!day.sun.located && <span className="block">Worked out for Greenwich — the club’s home course has no location.</span>}
          </p>
        )}
        {day.times.length === 0 && <p className="text-ink/80 text-[15px] px-4 py-4">No tee times this day.</p>}
        <ul className="divide-y divide-line">
          {rows.flatMap((row): Item[] => row.kind === 'overlay'
            ? [{ key: `o-${row.overlay.kind}-${row.overlay.id}`, row }, ...row.caught.map(time => ({ key: time, time, caught: row.overlay.title }))]
            : [{ key: row.time, time: row.time, caught: null }]
          ).map(item => {
            if ('row' in item) return <OverlayRow key={item.key} o={item.row.overlay} times={item.row.times.length} />
            const { time, caught } = item
            // Off the grid (the interval changed since) or under an overlay since: shown, never offered.
            const bookable = !caught && day.times.includes(time)
            const seats = day.bookings.filter(b => b.time === time)
            const free = day.settings.groupSize - seats.length
            const gone = timeGone(day.date, time, new Date())
            const yours = seats.some(b => b.mine)
            return (
              <li key={time} className={`px-4 py-2.5 ${yours ? 'bg-accent-tint' : ''} ${gone ? 'opacity-55' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="t-data text-[17px] text-ink w-[72px] flex-shrink-0 pt-[3px] tabular-nums">{describeTime(time)}</span>
                  <div className="flex-1 min-w-0">
                    {seats.length > 0 && (
                      <ul>
                        {seats.map(b => (
                          <li key={b.id} className="flex items-start gap-2 min-h-7">
                            <span className="flex-1 min-w-0 pt-[3px]">
                              <span className={`text-[15px] leading-snug break-words ${b.mine ? 'font-semibold text-accent-deep' : 'font-medium text-ink'}`}>{b.name}</span>
                              {b.demo && <DemoPill className="ml-1.5" />}
                              {b.memberId === null && <span className="t-cap text-ink/65"> · {b.guestOf ? `guest of ${b.guestOf}` : 'guest'}</span>}
                            </span>
                            {b.mayCancel && !gone && (
                              <button type="button" disabled={busy} onClick={() => void cancel(b)}
                                aria-label={`Take ${b.name} off ${describeTime(time)}`} className="w-8 h-8 -my-0.5 -mr-1 flex items-center justify-center text-ink/50 hover:text-ink press rounded-tile">
                                <IconX size={16} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* The places left, one line. */}
                    {free > 0 && bookable && (mayBook && !gone && open !== time ? (
                      <button type="button" onClick={() => { setOpen(time); setError(null) }}
                        className="min-h-9 inline-flex items-center gap-1 t-label text-accent-deep press ch-focus rounded-tile">
                        <IconPlus size={16} /> Book <span className="text-ink/65 font-normal">· {free} place{free === 1 ? '' : 's'}</span>
                      </button>
                    ) : (
                      <p className="t-cap text-ink/65 min-h-7 flex items-center">{free} place{free === 1 ? '' : 's'} free</p>
                    ))}
                    {free <= 0 && seats.length > 0 && <p className="t-cap text-ink/65">Full</p>}
                  </div>
                </div>
                {caught && <p className="t-cap text-ink/65 mt-2">Booked before {caught} had the course — the office will be in touch.</p>}
                {error?.time === time && <p className="t-cap text-rust-deep mt-2" role="alert">{error.text}</p>}
                {open === time && day.me && (
                  <BookPanel clubId={clubId} date={day.date} time={time} free={free} offerMe={offerMe} me={day.me}
                    onDone={() => { setOpen(null); load(day.date) }} onCancel={() => setOpen(null)} />
                )}
              </li>
            )
          })}
        </ul>
        {day.sun.sunset && <p className="t-cap text-ink/65 px-4 py-2 bg-tint border-t border-line">Sunset {describeTime(day.sun.sunset)}</p>}
      </div>
      {picking && (
        <DayPicker clubId={clubId} today={day.today} chosen={day.date} last={days[days.length - 1]} origin={picking}
          onPick={choose} onClose={() => setPicking(null)} />
      )}
    </section>
  )
}

/**
 * The day picker (D341, Ross, 25 Nov 2026): the club's own month calendar
 * sprung out of the day's box (the pop-out) — today in the club's colour,
 * the day on show ringed, what is on marked as the Calendar marks it, and
 * only the days with a tee sheet (today and the weeks ahead) to pick.
 */
function DayPicker({ clubId, today, chosen, last, origin, onPick, onClose }: {
  clubId: string; today: string; chosen: string; last: string; origin: HTMLElement
  onPick: (d: string) => void; onClose: () => void
}) {
  const [month, setMonth] = useState(chosen)
  const range = viewRange('month', month)
  const cal = useMemberCalendar(clubId, range.from, range.to)
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const close = useCallback((then?: () => void) => {
    if (closing.current) return
    closing.current = true
    then?.()
    void popClose(panel.current, origin, backdrop.current).then(onClose)
  }, [origin, onClose])
  useLayoutEffect(() => { popOpen(panel.current, origin, backdrop.current) }, [origin])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [close])
  const ym = month.slice(0, 7)
  const title = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const arrow = 'w-11 h-11 rounded-tile inline-flex items-center justify-center text-ink press ch-focus disabled:text-disabled-fg disabled:cursor-default'
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Choose a day">
      <div ref={backdrop} className="absolute inset-0 bg-ink/50" onClick={() => close()} />
      <div className="absolute inset-0 flex items-center justify-center p-3 pointer-events-none">
        <div ref={panel} className={`${cardClass('floating')} bg-surface pointer-events-auto w-full max-w-md p-4`} style={{ transformOrigin: 'top left' }}>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(stepView('month', month, -1))} disabled={ym <= today.slice(0, 7)} aria-label="The month before" className={arrow}>
              <IconChevronLeft size={22} />
            </button>
            <p className="t-card text-ink flex-1 text-center">{title}</p>
            <button type="button" onClick={() => setMonth(stepView('month', month, 1))} disabled={ym >= last.slice(0, 7)} aria-label="The month after" className={arrow}>
              <IconChevronRight size={22} />
            </button>
            <button type="button" onClick={() => close()} aria-label="Close" className={`${arrow} -mr-2`}>
              <IconX size={20} />
            </button>
          </div>
          <MonthView day={month} today={today} range={range} items={cal.items ?? []} chosen={chosen}
            mayOpen={d => d >= today && d <= last}
            onDay={d => close(() => onPick(d))}
            hint="Tee times open from today for the weeks ahead." />
        </div>
      </div>
    </div>
  )
}

/** A competition or an event that has the course: what, for how long, and — a competition one may enter — the way to book it. */
function OverlayRow({ o, times }: { o: Overlay; times: number }) {
  return (
    // D288: its label's colour down the left edge; a row of the sheet, set apart by its tint.
    <li className="px-4 py-3 bg-tint" style={o.colour ? { borderLeft: `6px solid ${o.colour}` } : undefined}>
      <p className="t-cap text-ink/65">{o.kind === 'competition' ? 'Competition' : 'The course is taken'} · {overlaySpan(o)}</p>
      <p className="t-card text-ink mt-1 break-words">{o.title}</p>
      {o.detail && <p className="text-ink/80 text-[15px] mt-1 break-words">{o.detail}</p>}
      {times > 0 && <p className="t-cap text-ink/65 mt-1">{times} tee time{times === 1 ? '' : 's'} not open for casual golf</p>}
      {o.bookHref && (
        <Link href={o.bookHref} className={`${buttonClass('primary', false)} mt-3`}>Book</Link>
      )}
      {!o.bookHref && o.bookNote && <p className="t-cap text-ink/80 mt-2">{o.bookNote}</p>}
    </li>
  )
}

/** Booking one time: yourself, members from the club's list, guests by name. */
function BookPanel({ clubId, date, time, free, offerMe, me, onDone, onCancel }: {
  clubId: string
  date: string
  time: string
  free: number
  offerMe: boolean
  me: { memberId: string; name: string }
  onDone: () => void
  onCancel: () => void
}) {
  const [withMe, setWithMe] = useState(offerMe)
  const [chosen, setChosen] = useState<Pick[]>([])
  const [q, setQ] = useState('')
  const [guest, setGuest] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; why: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const count = chosen.length + (withMe ? 1 : 0)
  const shown = q.trim().length >= 2 ? found : []

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) return
    timer.current = setTimeout(() => {
      askTeeTimes<{ names: { id: string; name: string; why: string | null }[] }>('names', { clubId, date, q: q.trim() })
        .then(r => setFound(r.ok ? r.names : []))
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, clubId, date])

  const addGuest = () => {
    const name = guest.trim()
    if (!name || count >= free) return
    setChosen(x => [...x, { guestName: name }]); setGuest('')
  }

  async function book() {
    const people = [...(withMe ? [{ memberId: me.memberId }] : []), ...chosen.map(c => ('memberId' in c ? { memberId: c.memberId } : { guestName: c.guestName }))]
    setBusy(true); setError('')
    const r = await askTeeTimes('book', { clubId, date, time, people })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone()
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-3">
      <div className="flex flex-wrap gap-2">
        {offerMe && (
          <button type="button" className={chipClass(withMe)} onClick={() => setWithMe(v => !v)} aria-pressed={withMe}>Me</button>
        )}
        {chosen.map((c, i) => {
          const name = 'memberId' in c ? c.name : `${c.guestName} (guest)`
          return (
            <button key={'memberId' in c ? c.memberId : `g-${i}`} type="button" className={chipClass(true)}
              onClick={() => setChosen(x => x.filter((_, j) => j !== i))} aria-label={`Take ${name} out`}>
              {name} <IconX size={14} />
            </button>
          )
        })}
      </div>
      {count < free && (
        <>
          <div>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Add a member from the club’s list"
              aria-label="Search the club’s list" className={FIELD} />
            {shown.length > 0 && (
              <ul className="mt-2 space-y-1">
                {shown.map(f => {
                  const taken = chosen.some(c => 'memberId' in c && c.memberId === f.id) || f.id === me.memberId || !!f.why
                  return (
                    <li key={f.id}>
                      <button type="button" disabled={taken} onClick={() => { setChosen(x => [...x, { memberId: f.id, name: f.name }]); setQ('') }}
                        className="w-full text-left px-3 py-2 rounded-tile hover:bg-tint press disabled:text-disabled-fg">
                        {f.name}
                        {f.why && <span className="block t-cap text-ink/65">{f.why}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <input type="text" value={guest} onChange={e => setGuest(e.target.value)} maxLength={40} placeholder="A guest’s name"
              aria-label="A guest’s name" className={`${FIELD} flex-1 min-w-0`}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }} />
            <button type="button" disabled={!guest.trim()} onClick={addGuest} className={buttonClass('secondary', false)}>Add guest</button>
          </div>
        </>
      )}
      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || count === 0 || count > free} onClick={() => void book()} className={buttonClass('primary', false)}>
          {busy ? 'Booking…' : count > 1 ? `Book ${count}` : 'Book'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('quiet', false)}>Cancel</button>
      </div>
    </div>
  )
}
