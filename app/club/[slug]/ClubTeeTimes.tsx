'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconPlus, IconX } from '@/app/components/icons'
import { FIELD, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { askTeeTimes } from '@/lib/accountClient'
import {
  lookAheadDays, overlaySpan, sheetRows, timeGone,
  type Overlay, type TeeBookingView, type TeeDayBody,
} from '@/lib/clubTeeSheet'
import { describeTime } from '@/lib/itinerary'

type Day = { ok: true } & TeeDayBody
type Pick = { memberId: string; name: string } | { guestName: string }

const dayChip = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`)
  return {
    week: t.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    num: t.getUTCDate(),
    long: t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  }
}

/**
 * The club's casual tee sheet on the members app (Ross, 17 Nov 2026): a
 * day at a time, today and the weeks ahead; every time from sunrise to an
 * hour before sunset with who is on it; a competition or an event that has
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
  const [asked, setAsked] = useState<{ date: string | null; n: number }>({ date: null, n: 0 })
  const date = day?.date ?? asked.date

  // The chosen day kept in view on the strip.
  const chosenChip = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { chosenChip.current?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [day?.date])

  useEffect(() => {
    let live = true
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
        <h1 className="t-h1 text-ink">Tee times</h1>
        {lost ? (
          <div role="alert" className="mt-3">
            <p className="text-ink/80 text-[15px]">{lost}</p>
            <button type="button" onClick={() => load(date)} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
          </div>
        ) : <p className="t-cap text-ink/65 mt-3">Opening the tee sheet…</p>}
      </section>
    )
  }

  const days = lookAheadDays(day.today)
  const mine = day.me ? day.bookings.filter(b => b.memberId === day.me!.memberId) : []
  const offerMe = !!day.me && !day.me.refusal && mine.length < day.settings.perDay
  const mayBook = day.ready && !day.opening
  const rows = sheetRows(day.times, day.overlays)

  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">Tee times</h1>
      <div className="mt-4 -mx-4 px-4 overflow-x-auto scroll-strip" role="tablist" aria-label="Day">
        <div className="flex gap-2 w-max pb-1">
          {days.map(d => {
            const c = dayChip(d)
            return (
              <button key={d} ref={d === day.date ? chosenChip : undefined} type="button" role="tab" aria-selected={d === day.date} aria-label={c.long}
                onClick={() => choose(d)} className={chipClass(d === day.date)}>
                {d === day.today ? 'Today' : `${c.week} ${c.num}`}
              </button>
            )
          })}
        </div>
      </div>
      <p className="t-label text-ink mt-4">{dayChip(day.date).long}</p>
      {!day.ready && <p className="text-ink/80 text-[15px] mt-2">The club’s tee sheet isn’t set up yet. Competitions are booked from Comps.</p>}
      {day.ready && day.opening && <p className="text-ink/80 text-[15px] mt-1">{day.opening}.</p>}
      {day.ready && !day.opening && day.me?.refusal && <p className="text-ink/80 text-[15px] mt-1">{day.me.refusal}</p>}
      {mine.length > 0 && (
        <p className="t-cap text-ink/65 mt-1">You’re on {mine.map(b => describeTime(b.time)).join(' and ')}.</p>
      )}
      {day.sun.sunrise && <p className="t-cap text-ink/65 mt-5">Sunrise {describeTime(day.sun.sunrise)}</p>}
      {!day.sun.located && <p className="t-cap text-ink/65">Worked out for Greenwich — the club’s home course has no location.</p>}
      {day.times.length === 0 && <p className="text-ink/80 text-[15px] mt-4">No tee times this day.</p>}
      <ul className="mt-2 space-y-3">
        {rows.map(row => {
          if (row.kind === 'overlay') return <OverlayRow key={`o-${row.overlay.kind}-${row.overlay.id}`} o={row.overlay} times={row.times.length} />
          const time = row.time
          const seats = day.bookings.filter(b => b.time === time)
          const free = day.settings.groupSize - seats.length
          const gone = timeGone(day.date, time, new Date())
          return (
            <li key={time} className={`${cardClass()} p-3 ${gone ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="t-data text-[18px] text-ink w-16 flex-shrink-0 pt-1">{describeTime(time).replace(' ', ' ')}</span>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                  {seats.map(b => (
                    <div key={b.id} className={`rounded-tile border px-2.5 py-2 flex items-start gap-1 ${b.mine ? 'bg-accent-tint border-accent-deep' : 'bg-surface border-line'}`}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium text-ink leading-snug break-words">{b.name}</span>
                        {b.memberId === null && <span className="block t-cap text-ink/65">{b.guestOf ? `Guest of ${b.guestOf}` : 'Guest'}</span>}
                      </span>
                      {b.mayCancel && !gone && (
                        <button type="button" disabled={busy} onClick={() => void cancel(b)}
                          aria-label={`Take ${b.name} off ${describeTime(time)}`} className="text-ink/50 hover:text-ink p-1 -m-1 press">
                          <IconX size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {/* The places left, one line — a full sheet of four empty boxes a time was a long scroll. */}
                  {free > 0 && (mayBook && !gone && open !== time ? (
                    <button type="button" onClick={() => { setOpen(time); setError(null) }}
                      className="col-span-2 rounded-tile border border-dashed border-line-strong min-h-11 flex items-center justify-center gap-1 t-label text-accent-deep press">
                      <IconPlus size={16} /> Book <span className="text-ink/65 font-normal">· {free} place{free === 1 ? '' : 's'}</span>
                    </button>
                  ) : (
                    <span className="col-span-2 t-cap text-ink/65 self-center min-h-11 flex items-center">{free} place{free === 1 ? '' : 's'} free</span>
                  ))}
                </div>
              </div>
              {error?.time === time && <p className="t-cap text-rust-deep mt-2" role="alert">{error.text}</p>}
              {open === time && day.me && (
                <BookPanel clubId={clubId} date={day.date} time={time} free={free} offerMe={offerMe} me={day.me}
                  onDone={() => { setOpen(null); load(day.date) }} onCancel={() => setOpen(null)} />
              )}
            </li>
          )
        })}
      </ul>
      {day.sun.sunset && <p className="t-cap text-ink/65 mt-2">Sunset {describeTime(day.sun.sunset)}</p>}
    </section>
  )
}

/** A competition or an event that has the course: what, for how long, and — a competition one may enter — the way to book it. */
function OverlayRow({ o, times }: { o: Overlay; times: number }) {
  return (
    <li className={`${cardClass('flat')} p-4 bg-tint`}>
      <p className="t-cap text-ink/65">{o.kind === 'competition' ? 'Competition' : 'The course is taken'} · {overlaySpan(o)}</p>
      <p className="t-card text-ink mt-1 break-words">{o.title}</p>
      {o.detail && <p className="text-ink/80 text-[15px] mt-1 break-words">{o.detail}</p>}
      {times > 0 && <p className="t-cap text-ink/65 mt-1">{times} tee time{times === 1 ? '' : 's'} not open for casual golf</p>}
      {o.bookHref && (
        <Link href={o.bookHref} className={`${buttonClass('primary', false)} mt-3`}>Book</Link>
      )}
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
                        className="w-full text-left px-3 py-2 rounded-tile hover:bg-tint press disabled:text-ink/40">
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
