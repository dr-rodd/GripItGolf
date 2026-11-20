'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass, iconButtonClass } from '@/app/components/ui'
import { askTeeTimes } from '@/lib/accountClient'
import {
  CASUAL_LOOK_AHEAD_DAYS, MAX_CASUAL_DAYS_BEFORE, MAX_PER_DAY, casualSettingsIssue, overlayAt, overlaySpan, settingsLine, sheetRows,
  type CasualSettings, type Overlay, type TeeBookingView, type TeeCategory, type TeeDayBody,
} from '@/lib/clubTeeSheet'
import { MAX_TEE_INTERVAL_MINS, MIN_TEE_INTERVAL_MINS } from '@/lib/teeSheet'
import { describeTime } from '@/lib/itinerary'
import { irishToday } from '@/lib/clubs'
import { daysLine } from '@/lib/clubMembership'
import type { ClubNote } from '@/lib/clubEvents'
import EventPanel from '../events/EventPanel'
import { useShell } from '../ShellContext'
import { useSeason } from '../useSeason'
import SheetRow from '../SheetRow'

type Day = { ok: true } & TeeDayBody
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const longDay = (d: string) => new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
const shortDay = (d: string) => new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

/**
 * Tee sheet (Ross, 17 Nov 2026): the club's casual tee sheet from the
 * office — a week across the top, each day's places booked of all, and the
 * day below at a glance: every time, every name, the competitions and
 * block bookings over the times they take. The Clubhouse books anybody,
 * moves bookings to another time, takes anybody off, blocks the sheet for
 * an outing (a Golf or Course event that takes the sheet), and sets how the
 * sheet runs and which memberships book. Every rule is the server's
 * (`/api/club/tee-times`, `office.*`); every change is on the activity log.
 * A phone does all of it too (Ross, 20 Nov 2026): the week scrolls
 * sideways, a fourball is two by two beside its time, the panels fill the
 * screen.
 */
export default function TeeSheet() {
  const { face, club, may } = useShell()
  const office = may('keep_tee_sheet')
  const season = useSeason(club.id)
  const [asked, setAsked] = useState<{ date: string; n: number }>(() => ({ date: irishToday(new Date()), n: 0 }))
  const [day, setDay] = useState<Day | null>(null)
  const [lost, setLost] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [booking, setBooking] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [blocking, setBlocking] = useState<ClubNote | 'new' | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    askTeeTimes<TeeDayBody>('office.day', { clubId: club.id, date: asked.date }).then(r => {
      if (!live) return
      if (!r.ok) { setLost(r.error); return }
      setLost(null); setDay(r)
    })
    return () => { live = false }
  }, [club.id, asked])

  const go = (date: string) => { setPicked(new Set()); setMoveTo(''); setError(''); setAsked(a => ({ date, n: a.n + 1 })) }
  const again = () => setAsked(a => ({ ...a, n: a.n + 1 }))
  const date = day?.date ?? asked.date
  const today = day?.today ?? irishToday(new Date())
  const rows = useMemo(() => (day ? sheetRows(day.times, day.overlays, day.bookings.map(b => b.time)) : []), [day])
  const chosen = day ? day.bookings.filter(b => picked.has(b.id)) : []
  const moveTimes = day ? day.times.filter(t => !overlayAt(day.overlays, t) && !chosen.every(b => b.time === t)) : []

  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function act(action: 'office.move' | 'office.remove') {
    if (!chosen.length || busy) return
    setBusy(true); setError('')
    const r = await askTeeTimes(action, { clubId: club.id, date, ids: chosen.map(b => b.id), ...(action === 'office.move' ? { time: moveTo } : {}) })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setPicked(new Set()); setMoveTo(''); again()
  }

  const openOverlay = (o: Overlay) => {
    if (o.kind !== 'block') return
    const note = (season.events ?? []).find(e => e.note?.id === o.id)?.note
    if (note) setBlocking(note)
  }

  if (!office) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse keeps the tee sheet.</p>

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="t-h1 text-ink flex-1">Tee sheet</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setBlocking('new')} className={`${buttonClass('secondary', false)} ch-focus`}>Block the tee sheet</button>
          <button type="button" onClick={() => setSettingsOpen(true)} className={`${buttonClass('quiet', false)} ch-focus`}>Settings</button>
        </div>
      </div>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">{lost}</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} ch-focus mt-3`}>Try again</button>
        </div>
      )}

      {day && (
        <div>
          {!day.ready && <p className="text-ink/80 text-[15px] mt-4">The tee sheet isn’t set up yet — it opens once the club’s calendar and tee sheet are in (migrations 095 and 096).</p>}

          {/* The week, Monday first: each day's places booked of all, and what has the course. */}
          <div className="flex items-center gap-1 md:gap-2 mt-6">
            <button type="button" onClick={() => go(addDays(date, -7))} aria-label="The week before" className={`${iconButtonClass(true)} ch-focus`}><IconChevronLeft size={20} /></button>
            <div className="flex gap-2 flex-1 min-w-0 overflow-x-auto md:grid md:grid-cols-7 md:overflow-visible">
              {(day.week ?? []).map(w => {
                const on = w.date === date
                return (
                  <button key={w.date} type="button" onClick={() => go(w.date)} aria-pressed={on}
                    className={`ch-hover ch-focus rounded-tile border px-3 py-2 text-left flex-shrink-0 min-w-[7.5rem] md:min-w-0 ${on ? 'border-accent-deep bg-accent-tint' : 'border-line bg-surface'}`}>
                    <span className="block t-label text-ink">{w.date === today ? 'Today' : shortDay(w.date)}</span>
                    <span className="block t-cap text-ink/65 tabular-nums">{w.booked} of {w.places} places</span>
                    {w.overlays > 0 && <span className="block t-cap text-ink/65">{w.overlays} taking the course</span>}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={() => go(addDays(date, 7))} aria-label="The next week" className={`${iconButtonClass(true)} ch-focus`}><IconChevronRight size={20} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="w-56"><input type="date" aria-label="Go to a day" value={date} onChange={e => e.target.value && go(e.target.value)} className={`${FIELD} ch-focus`} /></div>
            {date !== today && <button type="button" onClick={() => go(today)} className={`${buttonClass('quiet', false)} ch-focus`}>Today</button>}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-6">
            <h2 className="t-h2 text-ink">{longDay(date)}</h2>
            <p className="t-cap text-ink/65">{settingsLine(day.settings)}</p>
          </div>
          {day.opening && <p className="t-cap text-ink/65 mt-1">Members: {day.opening.charAt(0).toLowerCase() + day.opening.slice(1)}. The office books any time.</p>}
          {date > addDays(today, CASUAL_LOOK_AHEAD_DAYS) && <p className="t-cap text-ink/65 mt-1">Further ahead than members can see ({CASUAL_LOOK_AHEAD_DAYS} days).</p>}
          {day.noHomeCourse && (
            <p className="t-cap text-ink/80 mt-1">
              The club has no home course, so sunrise and sunset are Greenwich’s and every competition takes the sheet. <Link href={`/clubhouse/${face.slug}/settings`} className="ch-hover ch-focus underline">Set the home course</Link>
            </p>
          )}

          <div className={`${cardClass()} mt-4 overflow-hidden`}>
            {day.sun.sunrise && <p className="t-cap text-ink/65 px-4 py-2 border-b border-line">Sunrise {describeTime(day.sun.sunrise)}{day.sun.located ? '' : ' (Greenwich)'}</p>}
            {day.times.length === 0 && <p className="text-ink/80 text-[15px] px-4 py-3">No tee times this day.</p>}
            <div className="text-[15px]">
                {rows.map(row => row.kind === 'overlay' ? (
                  <Fragment key={`o-${row.overlay.kind}-${row.overlay.id}`}>
                  <div className="border-b border-line last:border-b-0 bg-tint">
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="t-cap text-ink/65 tabular-nums">{overlaySpan(row.overlay)}</span>
                        <span className="t-label text-ink">{row.overlay.title}</span>
                        <span className="t-cap text-ink/65">{row.overlay.kind === 'competition' ? 'Competition' : 'Block booking'}{row.times.length ? ` · ${row.times.length} tee time${row.times.length === 1 ? '' : 's'}` : ''}</span>
                        <span className="flex-1" />
                        {row.overlay.kind === 'competition'
                          ? <Link href={`/clubhouse/${face.slug}/events/${row.overlay.id}`} className="t-label text-accent-deep ch-hover ch-focus">Its tee sheet</Link>
                          : <button type="button" onClick={() => openOverlay(row.overlay)} className="t-label text-accent-deep ch-hover ch-focus">Change</button>}
                      </div>
                      {row.overlay.detail && row.overlay.kind === 'block' && <p className="t-cap text-ink/80 mt-1 break-words">{row.overlay.detail}</p>}
                      {row.caught.length > 0 && <p className="t-cap text-rust-deep mt-1">Booked before it took the course — tick them below to move them.</p>}
                    </div>
                  </div>
                  {row.caught.map(t => (
                    <TimeRow key={t} time={t} size={day.settings.groupSize} seats={day.bookings.filter(b => b.time === t)}
                      picked={picked} onToggle={toggle} onBook={null} />
                  ))}
                  </Fragment>
                ) : (
                  <TimeRow key={row.time} time={row.time} size={day.settings.groupSize} seats={day.bookings.filter(b => b.time === row.time)}
                    picked={picked} onToggle={toggle} onBook={day.times.includes(row.time) ? () => { setBooking(row.time); setError('') } : null} />
                ))}
            </div>
            {day.sun.sunset && <p className="t-cap text-ink/65 px-4 py-2 border-t border-line">Sunset {describeTime(day.sun.sunset)}</p>}
          </div>

          {chosen.length > 0 && (
            <div className="sticky bottom-4 mt-4 z-10">
              <div className={`${cardClass('floating')} p-3 flex flex-wrap items-center gap-3`}>
                <p className="t-label text-ink">{chosen.length} selected</p>
                <label className="sr-only" htmlFor="move-to">Move to</label>
                <div className="w-full sm:w-56"><select id="move-to" value={moveTo} onChange={e => setMoveTo(e.target.value)} className={`${FIELD} ch-focus`}>
                  <option value="">Move to…</option>
                  {moveTimes.map(t => {
                    const free = day.settings.groupSize - day.bookings.filter(b => b.time === t && !picked.has(b.id)).length
                    return <option key={t} value={t} disabled={free < chosen.length}>{describeTime(t)} · {free} free</option>
                  })}
                </select></div>
                <button type="button" disabled={busy || !moveTo} onClick={() => void act('office.move')} className={`${buttonClass('primary', false)} ch-focus`}>Move</button>
                <button type="button" disabled={busy} onClick={() => void act('office.remove')} className={`${buttonClass('quiet', false)} ch-focus text-rust-deep`}>Take off</button>
                <button type="button" onClick={() => setPicked(new Set())} className={`${buttonClass('quiet', false)} ch-focus ml-auto`}>Clear</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
        </div>
      )}

      {booking && day && (
        <BookPanel clubId={club.id} date={date} time={booking} free={day.settings.groupSize - day.bookings.filter(b => b.time === booking).length}
          onClose={() => setBooking(null)} onBooked={() => { setBooking(null); again() }} />
      )}
      {settingsOpen && <SettingsPanel clubId={club.id} onClose={() => setSettingsOpen(false)} onSaved={again} />}
      {blocking && (
        <EventPanel clubId={club.id} note={blocking === 'new' ? null : blocking} day={blocking === 'new' ? date : undefined} blocking={blocking === 'new'}
          onClose={() => setBlocking(null)} onSaved={() => { season.again(); again() }} />
      )}
    </>
  )
}

/** One casual tee time: its places, each name a tick to move or take off, the free ones to book. */
function TimeRow({ time, size, seats, picked, onToggle, onBook }: {
  time: string; size: number; seats: TeeBookingView[]; picked: Set<string>; onToggle: (id: string) => void
  /** Null for a time off the grid or under an overlay: shown, never booked. */
  onBook: (() => void) | null
}) {
  return (
    <SheetRow time={describeTime(time)} places={size}>
      {Array.from({ length: size }, (_, i) => {
        const b = seats[i]
        if (b) {
          const on = picked.has(b.id)
          return (
            <div key={i}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(b.id)}
                className={`ch-hover ch-focus w-full text-left rounded-tile border px-2.5 py-1.5 ${on ? 'border-accent-deep bg-accent-tint' : 'border-line bg-surface'}`}>
                <span className="flex items-start gap-1.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-ink font-medium leading-snug truncate">{b.name}</span>
                    {b.memberId === null && <span className="block t-cap text-ink/65 truncate">{b.guestOf ? `Guest of ${b.guestOf}` : 'Guest'}</span>}
                  </span>
                  {on && <IconCheck size={16} className="text-accent-deep flex-shrink-0 mt-0.5" />}
                </span>
              </button>
            </div>
          )
        }
        return (
          <div key={i}>
            {i === seats.length && onBook ? (
              <button type="button" onClick={onBook} aria-label={`Book ${describeTime(time)}`}
                className="ch-hover ch-focus w-full h-full min-h-11 rounded-tile border border-dashed border-line-strong flex items-center justify-center gap-1 t-label text-accent-deep">
                <IconPlus size={16} /> Book
              </button>
            ) : <span aria-hidden="true" className="block h-full min-h-10 rounded-tile border border-dashed border-line" />}
          </div>
        )
      })}
    </SheetRow>
  )
}

type Pick = { memberId: string; name: string } | { guestName: string }

/** The office books a time: anybody on the list, guests by name — no opening, no playing days, no daily limit. */
function BookPanel({ clubId, date, time, free, onClose, onBooked }: {
  clubId: string; date: string; time: string; free: number; onClose: () => void; onBooked: () => void
}) {
  const [chosen, setChosen] = useState<Pick[]>([])
  const [q, setQ] = useState('')
  const [guest, setGuest] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; why: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shown = q.trim().length >= 2 ? found : []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) return
    timer.current = setTimeout(() => {
      askTeeTimes<{ names: { id: string; name: string; why: string | null }[] }>('office.names', { clubId, date, q: q.trim() })
        .then(r => setFound(r.ok ? r.names : []))
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, clubId, date])

  const addGuest = () => {
    const name = guest.trim()
    if (!name || chosen.length >= free) return
    setChosen(x => [...x, { guestName: name }]); setGuest('')
  }

  async function book() {
    setBusy(true); setError('')
    const r = await askTeeTimes('office.book', { clubId, date, time, people: chosen.map(c => ('memberId' in c ? { memberId: c.memberId } : { guestName: c.guestName })) })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onBooked()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="book-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void book() }} className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="book-title" className="t-h2 text-ink flex-1">Book {describeTime(time)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0"><IconX size={22} /></button>
        </div>
        <p className="t-cap text-ink/65 mt-1">{shortDay(date)} · {free} place{free === 1 ? '' : 's'} free. The office books anybody on the list, any day.</p>
        <div className="flex flex-wrap gap-2 mt-5">
          {chosen.map((c, i) => {
            const name = 'memberId' in c ? c.name : `${c.guestName} (guest)`
            return (
              <button key={'memberId' in c ? c.memberId : `g-${i}`} type="button" className={`${chipClass(true)} ch-focus`}
                onClick={() => setChosen(x => x.filter((_, j) => j !== i))} aria-label={`Take ${name} out`}>
                {name} <IconX size={14} />
              </button>
            )
          })}
        </div>
        {chosen.length < free && (
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="book-q" className={FIELD_LABEL}>A member</label>
              <input id="book-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the club’s list" autoFocus className={`${FIELD} ch-focus`} />
              {shown.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {shown.map(f => (
                    <li key={f.id}>
                      <button type="button" disabled={chosen.some(c => 'memberId' in c && c.memberId === f.id)}
                        onClick={() => { setChosen(x => [...x, { memberId: f.id, name: f.name }]); setQ('') }}
                        className="ch-hover ch-focus w-full text-left px-3 py-2 rounded-tile disabled:text-disabled-fg">
                        {f.name}
                        {f.why && <span className="block t-cap text-ink/65">{f.why} The office can book them anyway.</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label htmlFor="book-guest" className={FIELD_LABEL}>A guest</label>
              <div className="flex gap-2">
                <input id="book-guest" value={guest} maxLength={40} onChange={e => setGuest(e.target.value)} placeholder="Their name" className={`${FIELD} ch-focus flex-1 min-w-0`}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }} />
                <button type="button" disabled={!guest.trim()} onClick={addGuest} className={`${buttonClass('secondary', false)} ch-focus`}>Add</button>
              </div>
            </div>
          </div>
        )}
        {error && <p role="alert" className="t-cap text-rust-deep mt-4">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || chosen.length === 0} className={`${buttonClass('primary', false)} ch-focus`}>
            {busy ? 'Booking…' : chosen.length > 1 ? `Book ${chosen.length}` : 'Book'}
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

/** How the sheet runs, and which memberships book tee times. */
function SettingsPanel({ clubId, onClose, onSaved }: { clubId: string; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<CasualSettings | null>(null)
  const [cats, setCats] = useState<TeeCategory[]>([])
  const [books, setBooks] = useState<Record<string, boolean>>({})
  const [ready, setReady] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    askTeeTimes<{ settings: CasualSettings; categories: TeeCategory[]; ready: boolean }>('office.settings', { clubId }).then(r => {
      if (!live) return
      if (!r.ok) { setError(r.error); return }
      setS(r.settings); setCats(r.categories); setReady(r.ready)
      setBooks(Object.fromEntries(r.categories.map(c => [c.id, c.booksTeeTimes])))
    })
    return () => { live = false }
  }, [clubId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const issue = s ? casualSettingsIssue(s) : null
  const num = (k: keyof CasualSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS(x => (x ? { ...x, [k]: Number(e.target.value) } : x))

  async function save() {
    if (!s || issue) return
    setBusy(true); setError('')
    const r = await askTeeTimes('office.settings', { clubId, settings: s, books: cats.map(c => ({ id: c.id, books: !!books[c.id] })) })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ts-settings">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void save() }} className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="ts-settings" className="t-h2 text-ink flex-1">Tee sheet settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0"><IconX size={22} /></button>
        </div>
        <p className="t-cap text-ink/65 mt-1">Casual tee times run from sunrise to an hour before sunset on the home course. Changing these never moves a booking already made.</p>
        {!ready && <p className="text-ink/80 text-[15px] mt-4">The tee sheet isn’t set up yet — these can be saved once it is.</p>}
        {s && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ts-int" className={FIELD_LABEL}>Minutes apart</label>
                <input id="ts-int" type="number" min={MIN_TEE_INTERVAL_MINS} max={MAX_TEE_INTERVAL_MINS} value={s.interval} onChange={num('interval')} className={`${FIELD} ch-focus`} />
              </div>
              <div>
                <label htmlFor="ts-size" className={FIELD_LABEL}>Players a time</label>
                <select id="ts-size" value={s.groupSize} onChange={num('groupSize')} className={`${FIELD} ch-focus`}>
                  {[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ts-days" className={FIELD_LABEL}>Booking opens, days before</label>
                <input id="ts-days" type="number" min={0} max={MAX_CASUAL_DAYS_BEFORE} value={s.opensDaysBefore} onChange={num('opensDaysBefore')} className={`${FIELD} ch-focus`} />
              </div>
              <div>
                <label htmlFor="ts-time" className={FIELD_LABEL}>At (Irish time)</label>
                <input id="ts-time" type="time" value={s.opensTime} onChange={e => setS(x => (x ? { ...x, opensTime: e.target.value } : x))} className={`${FIELD} ch-focus`} />
              </div>
            </div>
            <div>
              <label htmlFor="ts-per" className={FIELD_LABEL}>Tee times a member a day</label>
              <select id="ts-per" value={s.perDay} onChange={num('perDay')} className={`${FIELD} ch-focus`}>
                {Array.from({ length: MAX_PER_DAY }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <p className={FIELD_LABEL}>Memberships that book tee times</p>
              {cats.length === 0 ? (
                <p className="t-cap text-ink/80">The club has no memberships set up, so everybody who plays here books, any day.</p>
              ) : (
                <ul>
                  {cats.map(c => {
                    const on = !!books[c.id]
                    return (
                      <li key={c.id}>
                        <button type="button" role="checkbox" aria-checked={on} onClick={() => setBooks(b => ({ ...b, [c.id]: !on }))}
                          className="ch-hover ch-focus w-full flex items-center gap-3 min-h-12 text-left rounded-tile -mx-2 px-2">
                          <span className="flex-1">
                            <span className="block text-ink text-[15px]">{c.name}</span>
                            <span className="block t-cap text-ink/65">{on ? `Books on its playing days: ${daysLine(c.days)}` : 'Doesn’t book tee times'}</span>
                          </span>
                          <span aria-hidden="true" className={`inline-flex items-center justify-center w-6 h-6 rounded-[6px] border ${on ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'}`}>
                            {on && <IconCheck size={16} />}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
        {(error || issue) && <p role="alert" className="t-cap text-rust-deep mt-4">{error || issue}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || !s || !!issue || !ready} className={`${buttonClass('primary', false)} ch-focus`}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
