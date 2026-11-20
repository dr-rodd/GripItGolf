'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronLeft, IconPlus, IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { describeTime } from '@/lib/itinerary'
import { formatHandicap } from '@/lib/handicap'
import { courseLabel } from '@/lib/courseDirectory'
import type { Preset } from '@/lib/clubPresets'
import type { OfficeBody, OfficeSlot } from '@/app/api/club/booking'
import { askCompOffice } from '../../../clubhouseClient'
import { useShell } from '../../ShellContext'
import { useCategories } from '../../useCategories'
import CompPanel from '../CompPanel'
import SheetRow from '../../SheetRow'

type Sheet = { ok: true } & OfficeBody
const longDay = (d: string) => new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

/**
 * One competition from the office (Ross, 17 Nov 2026: "all the admin
 * functions of the Clubhouse stay within the Clubhouse" — nothing here goes
 * out to the members app): its day, course and who can enter, **Change**
 * (the competition's own panel), and its tee sheet at a glance — every time
 * and who is on it, sunrise at its head and sunset at its foot. The office
 * books anybody (Book anyway for somebody the entry rules refuse, logged),
 * ticks players to move them to another time or take them off. Every write
 * is the server's (`/api/club/booking`, `office.*`). On a phone the same,
 * each time's places two by two beside it (Ross, 20 Nov 2026).
 */
export default function CompOffice({ code }: { code: string }) {
  const { face, club, may } = useShell()
  const office = may('keep_calendar')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [lost, setLost] = useState<string | null>(null)
  const [n, setN] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [booking, setBooking] = useState<OfficeSlot | null>(null)
  const [changing, setChanging] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [presets, setPresets] = useState<Preset[]>([])
  const { categories, ageDate } = useCategories(club.id)

  useEffect(() => {
    let live = true
    askCompOffice<OfficeBody>('sheet', code).then(r => {
      if (!live) return
      if (!r.ok) { setLost(r.error); return }
      setLost(null); setSheet(r)
    })
    return () => { live = false }
  }, [code, n])
  useEffect(() => {
    let live = true
    void askClub('presets', { clubId: club.id }).then(r => { if (live && r.ok) setPresets(r.presets ?? []) })
    return () => { live = false }
  }, [club.id])

  const again = () => { setPicked(new Set()); setMoveTo(''); setN(x => x + 1) }
  const seats = sheet ? sheet.slots.flatMap(s => s.seats.map(x => ({ ...x, slot: s.index }))) : []
  const chosen = seats.filter(x => x.rowId && picked.has(x.rowId))
  const width = sheet ? Math.max(2, ...sheet.slots.map(s => s.size)) : 4
  const locked = !!sheet?.certified
  const toggle = (rowId: string) => setPicked(p => { const q = new Set(p); if (q.has(rowId)) q.delete(rowId); else q.add(rowId); return q })

  async function act(action: 'move' | 'withdraw') {
    if (!chosen.length || busy) return
    setBusy(true); setError('')
    const r = await askCompOffice(action, code, { memberIds: chosen.map(x => x.rowId), ...(action === 'move' ? { slot: Number(moveTo) } : {}) })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    again()
  }

  if (!office) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse keeps the club’s competitions here.</p>

  return (
    <>
      <Link href={`/clubhouse/${face.slug}/events`} className="ch-hover ch-focus inline-flex items-center gap-1 t-label text-ink rounded-tile -mx-1 px-1 min-h-11">
        <IconChevronLeft size={18} /> Events
      </Link>
      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">{lost}</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} ch-focus mt-3`}>Try again</button>
        </div>
      )}
      {!sheet && !lost && <div className="skeleton h-96 rounded-card mt-4" />}
      {sheet && (
        <>
          <div className="flex flex-wrap items-start gap-3 mt-2">
            <div className="flex-1 min-w-0">
              <h1 className="t-h1 text-ink break-words">{sheet.comp.name}</h1>
              <p className="text-ink/80 text-[15px] mt-1">{[longDay(sheet.comp.date), sheet.comp.courseName ? courseLabel(sheet.comp.courseName) : null].filter(Boolean).join(' · ')}</p>
              {sheet.entry && <p className="t-cap text-ink/65 mt-1">Open to: {sheet.entry}</p>}
            </div>
            <button type="button" onClick={() => setChanging(true)} className={`${buttonClass('secondary', false)} ch-focus`}>Change</button>
          </div>
          {locked && <p className="text-ink/80 text-[15px] mt-3">The results are certified, so the tee sheet can’t change. An Officer reopens them first.</p>}
          {!locked && sheet.opening && <p className="t-cap text-ink/65 mt-3">Booking opens for members {sheet.opening}. The office books any time before.</p>}
          {!locked && sheet.cardsStarted && <p className="t-cap text-ink/65 mt-1">Cards have started: a player out on the course can’t be moved or taken off.</p>}

          <div className={`${cardClass()} mt-5 overflow-hidden`}>
            <div className="flex items-baseline justify-between px-4 py-2 border-b border-line">
              <h2 className="t-label text-ink">Tee sheet</h2>
              <p className="t-cap text-ink/65">{seats.length} booked of {sheet.slots.reduce((a, s) => a + s.size, 0)}</p>
            </div>
            {sheet.sun.sunrise && <p className="t-cap text-ink/65 px-4 py-2 border-b border-line">Sunrise {describeTime(sheet.sun.sunrise)}{sheet.sun.located ? '' : ' (Greenwich — the course has no location)'}</p>}
            <div className="text-[15px]">
                {sheet.slots.map(slot => (
                  <SheetRow key={slot.index} time={describeTime(slot.clock)} places={width} dim={slot.gone}>
                    {Array.from({ length: width }, (_, i) => {
                      const s = slot.seats[i]
                      if (i >= slot.size) return <div key={i} className="hidden md:block" />
                      if (s) {
                        const on = !!s.rowId && picked.has(s.rowId)
                        const can = !!s.rowId && !s.started && !locked && !slot.gone
                        return (
                          <div key={i}>
                            <button type="button" role="checkbox" aria-checked={on} disabled={!can} onClick={() => s.rowId && toggle(s.rowId)}
                              className={`ch-hover ch-focus w-full text-left rounded-tile border px-2.5 py-1.5 ${on ? 'border-accent-deep bg-accent-tint' : 'border-line bg-surface'} disabled:cursor-default`}>
                              <span className="flex items-start gap-1.5">
                                <span className="flex-1 min-w-0">
                                  <span className="block text-ink font-medium leading-snug truncate">{s.name}</span>
                                  <span className="block t-cap text-ink/65 truncate">{s.started ? 'Card started' : s.handicap === null ? 'HCP pending' : `HCP ${formatHandicap(s.handicap)}`}</span>
                                </span>
                                {on && <IconCheck size={16} className="text-accent-deep flex-shrink-0 mt-0.5" />}
                              </span>
                            </button>
                          </div>
                        )
                      }
                      return (
                        <div key={i}>
                          {i === slot.seats.length && !locked && !slot.gone ? (
                            <button type="button" onClick={() => { setBooking(slot); setError('') }} aria-label={`Book ${describeTime(slot.clock)}`}
                              className="ch-hover ch-focus w-full h-full min-h-11 rounded-tile border border-dashed border-line-strong flex items-center justify-center gap-1 t-label text-accent-deep">
                              <IconPlus size={16} /> Book
                            </button>
                          ) : <span aria-hidden="true" className="block h-full min-h-10 rounded-tile border border-dashed border-line" />}
                        </div>
                      )
                    })}
                  </SheetRow>
                ))}
            </div>
            {sheet.sun.sunset && <p className="t-cap text-ink/65 px-4 py-2 border-t border-line">Sunset {describeTime(sheet.sun.sunset)}</p>}
          </div>

          {chosen.length > 0 && (
            <div className="sticky bottom-4 mt-4 z-10">
              <div className={`${cardClass('floating')} p-3 flex flex-wrap items-center gap-3`}>
                <p className="t-label text-ink">{chosen.length} selected</p>
                <label className="sr-only" htmlFor="comp-move-to">Move to</label>
                <div className="w-full sm:w-56">
                  <select id="comp-move-to" value={moveTo} onChange={e => setMoveTo(e.target.value)} className={`${FIELD} ch-focus`}>
                    <option value="">Move to…</option>
                    {sheet.slots.filter(s => !s.gone && !chosen.every(c => c.slot === s.index)).map(s => {
                      const free = s.size - s.seats.filter(x => !(x.rowId && picked.has(x.rowId))).length
                      return <option key={s.index} value={s.index} disabled={free < chosen.length}>{describeTime(s.clock)} · {free} free</option>
                    })}
                  </select>
                </div>
                <button type="button" disabled={busy || moveTo === ''} onClick={() => void act('move')} className={`${buttonClass('primary', false)} ch-focus`}>Move</button>
                <button type="button" disabled={busy} onClick={() => void act('withdraw')} className={`${buttonClass('quiet', false)} ch-focus text-rust-deep`}>Take off</button>
                <button type="button" onClick={() => setPicked(new Set())} className={`${buttonClass('quiet', false)} ch-focus ml-auto`}>Clear</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
        </>
      )}

      {booking && <BookPanel code={code} slot={booking} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); again() }} />}
      {changing && (
        <CompPanel clubId={club.id} slug={face.slug} code={code} homeCourseId={club.homeCourseId ?? null}
          cats={categories ?? []} ageDate={ageDate} presets={presets} onClose={() => setChanging(false)} onDone={again} />
      )}
    </>
  )
}

type Name = { id: string; name: string; booked: boolean; linked: boolean; why?: string }

/** The office books a time: anybody on the list with their own account; somebody the entry rules refuse, anyway. */
function BookPanel({ code, slot, onClose, onBooked }: { code: string; slot: OfficeSlot; onClose: () => void; onBooked: () => void }) {
  const free = slot.size - slot.seats.length
  const [chosen, setChosen] = useState<Name[]>([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Name[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shown = q.trim().length >= 2 ? found : []
  const anyway = chosen.some(c => c.why)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) return
    timer.current = setTimeout(() => {
      askCompOffice<{ names: Name[] }>('names', code, { q: q.trim() }).then(r => setFound(r.ok ? r.names : []))
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, code])

  async function book() {
    setBusy(true); setError('')
    const r = await askCompOffice('book', code, { slot: slot.index, memberIds: chosen.map(c => c.id), anyway })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onBooked()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="comp-book-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void book() }} className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="comp-book-title" className="t-h2 text-ink flex-1">Book {describeTime(slot.clock)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0"><IconX size={22} /></button>
        </div>
        <p className="t-cap text-ink/65 mt-1">{free} place{free === 1 ? '' : 's'} free. Everybody plays on their own Green Dot account.</p>
        <div className="flex flex-wrap gap-2 mt-5">
          {chosen.map(c => (
            <button key={c.id} type="button" className={`${chipClass(true)} ch-focus`} onClick={() => setChosen(x => x.filter(y => y.id !== c.id))} aria-label={`Take ${c.name} out`}>
              {c.name} <IconX size={14} />
            </button>
          ))}
        </div>
        {chosen.length < free && (
          <div className="mt-4">
            <label htmlFor="comp-book-q" className={FIELD_LABEL}>A member</label>
            <input id="comp-book-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the club’s list" autoFocus className={`${FIELD} ch-focus`} />
            {shown.length > 0 && (
              <ul className="mt-2 space-y-1">
                {shown.map(f => {
                  const off = f.booked || !f.linked || chosen.some(c => c.id === f.id)
                  return (
                    <li key={f.id}>
                      <button type="button" disabled={off} onClick={() => { setChosen(x => [...x, f]); setQ('') }}
                        className="ch-hover ch-focus w-full text-left px-3 py-2 rounded-tile disabled:text-disabled-fg">
                        {f.name}{f.booked ? ' · has a time' : !f.linked ? ' · needs a Green Dot account' : ''}
                        {!f.booked && f.linked && f.why && <span className="block t-cap text-ink/65">{f.why}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
        {anyway && <p className="t-cap text-ink/80 mt-4">Somebody chosen can’t enter by the competition’s rules. Booking them anyway is kept on the club’s record.</p>}
        {error && <p role="alert" className="t-cap text-rust-deep mt-4">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || chosen.length === 0} className={`${buttonClass('primary', false)} ch-focus`}>
            {busy ? 'Booking…' : anyway ? 'Book anyway' : chosen.length > 1 ? `Book ${chosen.length}` : 'Book'}
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
