'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronLeft, IconPlus, IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { askClub, askMatchPlay } from '@/lib/accountClient'
import { filterOverdue } from '@/lib/clubMatchPlay'
import { tripBase } from '@/lib/tripPaths'
import { describeTime } from '@/lib/itinerary'
import { formatHandicap } from '@/lib/handicap'
import { courseLabel } from '@/lib/courseDirectory'
import type { Preset } from '@/lib/clubPresets'
import type { OfficeBody, OfficeSlot } from '@/app/api/club/booking'
import { askCompOffice, readClubMatchPlay, type MatchPlayOfficeBody } from '../../../clubhouseClient'
import { useShell } from '../../ShellContext'
import { useCategories } from '../../useCategories'
import CompPanel from '../CompPanel'

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
 * is the server's (`/api/club/booking`, `office.*`).
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
  const [mp, setMp] = useState<({ ok: true } & MatchPlayOfficeBody) | null>(null)
  const { categories, ageDate } = useCategories(club.id)

  useEffect(() => {
    let live = true
    askCompOffice<OfficeBody>('sheet', code).then(async r => {
      if (!live) return
      if (!r.ok) {
        // A club match play has no tee sheet (Ross, 17 Nov 2026): its own page.
        const m = await readClubMatchPlay(club.id, code)
        if (!live) return
        if (m.ok) { setLost(null); setMp(m); return }
        setLost(r.error); return
      }
      setLost(null); setSheet(r)
    })
    return () => { live = false }
  }, [code, n, club.id])
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
      {mp && <MatchPlayOffice mp={mp} code={code} />}
      {!sheet && !lost && !mp && <div className="skeleton h-96 rounded-card mt-4" />}
      {sheet && (
        <>
          <div className="flex flex-wrap items-start gap-3 mt-2">
            <div className="flex-1 min-w-0">
              <h1 className="t-h1 text-ink break-words">{sheet.comp.name}</h1>
              <p className="text-ink/80 text-[15px] mt-1">{[longDay(sheet.comp.date), sheet.comp.courseName ? courseLabel(sheet.comp.courseName) : null].filter(Boolean).join(' · ')}</p>
              {sheet.entry && <p className="t-cap text-ink/65 mt-1">Open to: {sheet.entry}</p>}
            </div>
            <button type="button" onClick={() => setChanging(true)} className={`${buttonClass('secondary', false)} ch-focus hidden md:inline-flex`}>Change</button>
          </div>
          {locked && <p className="text-ink/80 text-[15px] mt-3">The results are certified, so the tee sheet can’t change. An Officer reopens them first.</p>}
          {!locked && sheet.opening && <p className="t-cap text-ink/65 mt-3">Booking opens for members {sheet.opening}. The office books any time before.</p>}
          {!locked && sheet.cardsStarted && <p className="t-cap text-ink/65 mt-1">Cards have started: a player out on the course can’t be moved or taken off.</p>}
          <p className="md:hidden t-cap text-ink/65 mt-3">Open this on a computer to keep the tee sheet.</p>

          <div className={`${cardClass()} mt-5 overflow-hidden hidden md:block`}>
            <div className="flex items-baseline justify-between px-4 py-2 border-b border-line">
              <h2 className="t-label text-ink">Tee sheet</h2>
              <p className="t-cap text-ink/65">{seats.length} booked of {sheet.slots.reduce((a, s) => a + s.size, 0)}</p>
            </div>
            {sheet.sun.sunrise && <p className="t-cap text-ink/65 px-4 py-2 border-b border-line">Sunrise {describeTime(sheet.sun.sunrise)}{sheet.sun.located ? '' : ' (Greenwich — the course has no location)'}</p>}
            <table className="w-full table-fixed text-[15px]">
              <colgroup><col style={{ width: '7rem' }} />{Array.from({ length: width }, (_, i) => <col key={i} />)}</colgroup>
              <thead className="sr-only"><tr><th>Time</th>{Array.from({ length: width }, (_, i) => <th key={i}>Place {i + 1}</th>)}</tr></thead>
              <tbody>
                {sheet.slots.map(slot => (
                  <tr key={slot.index} className={`border-b border-line last:border-b-0 ${slot.gone ? 'opacity-60' : ''}`}>
                    <th scope="row" className="t-label tabular-nums text-ink text-left px-4 py-2.5 align-top">{describeTime(slot.clock)}</th>
                    {Array.from({ length: width }, (_, i) => {
                      const s = slot.seats[i]
                      if (i >= slot.size) return <td key={i} />
                      if (s) {
                        const on = !!s.rowId && picked.has(s.rowId)
                        const can = !!s.rowId && !s.started && !locked && !slot.gone
                        return (
                          <td key={i} className="px-1 py-1.5 align-top">
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
                          </td>
                        )
                      }
                      return (
                        <td key={i} className="px-1 py-1.5 align-top">
                          {i === slot.seats.length && !locked && !slot.gone ? (
                            <button type="button" onClick={() => { setBooking(slot); setError('') }} aria-label={`Book ${describeTime(slot.clock)}`}
                              className="ch-hover ch-focus w-full min-h-10 rounded-tile border border-dashed border-line-strong flex items-center justify-center gap-1 t-label text-accent-deep">
                              <IconPlus size={16} /> Book
                            </button>
                          ) : <span aria-hidden="true" className="block min-h-10 rounded-tile border border-dashed border-line" />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {sheet.sun.sunset && <p className="t-cap text-ink/65 px-4 py-2 border-t border-line">Sunset {describeTime(sheet.sun.sunset)}</p>}
          </div>

          {chosen.length > 0 && (
            <div className="sticky bottom-4 mt-4 z-10 hidden md:block">
              <div className={`${cardClass('floating')} p-3 flex flex-wrap items-center gap-3`}>
                <p className="t-label text-ink">{chosen.length} selected</p>
                <label className="sr-only" htmlFor="comp-move-to">Move to</label>
                <div className="w-56">
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

/** A club match play from the office (Ross, 17 Nov 2026): where it stands, its rules and play-by dates. The draw and the matches come in later stages. */
function MatchPlayOffice({ mp, code }: { mp: MatchPlayOfficeBody; code: string }) {
  // Stage 2: who has entered, and the office taking an entry out until the draw (logged).
  const [field, setField] = useState<{ rowId: string | null; name: string }[] | null>(null)
  // Stage 4: a Fourball or Foursomes match play's pairs, each member taken out on their own.
  const [pairs, setPairs] = useState<{ teamId: string; members: { rowId: string | null; name: string }[] }[] | null>(null)
  const [phase, setPhase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void askMatchPlay('office.state', { code }).then(r => { if (live && r.ok) { setField(r.entrants); setPairs(r.pairs ?? null); setPhase(r.phase) } })
    return () => { live = false }
  }, [code])
  async function takeOut(rowId: string) {
    setBusy(true); setError('')
    const r = await askMatchPlay('office.withdraw', { code, memberId: rowId })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setField(r.entrants)
    setPairs(r.pairs ?? null)
  }
  const open = phase === 'entries' || phase === 'draw_pending'
  // Stage 3 (D271): the matches past their play-by date, filtered — a club may have hundreds.
  const [round, setRound] = useState<number | null>(null)
  const [minDays, setMinDays] = useState(0)
  const late = filterOverdue(mp.overdue ?? [], { round, minDays })
  return (
    <>
      <div className="mt-2">
        <h1 className="t-h1 text-ink break-words">{mp.name}</h1>
        <p className="text-ink/80 text-[15px] mt-1">{mp.format}</p>
      </div>
      <div className={`${cardClass('floating')} p-4 mt-5 max-w-xl`}>
        <p className="t-label text-ink">{mp.phase}</p>
        <p className="text-ink/80 text-[15px] mt-1">{mp.line}</p>
        <p className="t-cap text-ink/65 mt-2">{mp.entered} entered{mp.cap ? ` of ${mp.cap}` : ''}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5 mt-5 max-w-4xl">
        {(mp.overdue ?? []).length > 0 && (
          <section className="md:col-span-2">
            <h2 className="t-h2 text-ink">Past the play-by date · {(mp.overdue ?? []).length}</h2>
            <p className="t-cap text-ink/65 mt-1">Nothing happens on its own: an Officer decides each on its match page — a walkover, or both out.</p>
            <div className="flex flex-wrap items-end gap-3 mt-3">
              <div>
                <label htmlFor="od-round" className={FIELD_LABEL}>Round</label>
                <select id="od-round" value={round ?? ''} onChange={e => setRound(e.target.value ? Number(e.target.value) : null)} className={`${FIELD} ch-focus w-[200px]`}>
                  <option value="">Every round</option>
                  {(mp.rounds ?? []).map(r => <option key={r.roundNumber} value={r.roundNumber}>{r.roundName}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="od-days" className={FIELD_LABEL}>Overdue by</label>
                <select id="od-days" value={minDays} onChange={e => setMinDays(Number(e.target.value))} className={`${FIELD} ch-focus w-[200px]`}>
                  <option value={0}>Any time</option>
                  <option value={7}>A week or more</option>
                  <option value={14}>Two weeks or more</option>
                  <option value={30}>A month or more</option>
                </select>
              </div>
            </div>
            {late.length === 0
              ? <p className="text-ink/80 text-[15px] mt-3">None like that.</p>
              : (
                <ul className={`${cardClass()} mt-3 divide-y divide-line max-w-3xl`}>
                  {late.map(m => (
                    <li key={m.id} className="flex flex-wrap items-baseline gap-3 px-4 py-2.5">
                      <span className="flex-1 min-w-[12rem] text-ink text-[15px]">{m.sideA} <span className="text-ink/65">v</span> {m.sideB}</span>
                      <span className="t-cap text-ink/65 whitespace-nowrap">{m.roundName} · {m.daysOver} {m.daysOver === 1 ? 'day' : 'days'} over</span>
                      <a href={`${tripBase(code, 'tournament')}/match/${m.id}`} target="_blank" rel="noopener" className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9 inline-flex items-center">Open the match</a>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}
        <section className="md:col-span-2">
          <h2 className="t-h2 text-ink">Entered{pairs ? ` · ${pairs.length}${mp.cap ? ` of ${mp.cap}` : ''} ${pairs.length === 1 ? 'pair' : 'pairs'}` : field ? ` · ${field.length}${mp.cap ? ` of ${mp.cap}` : ''}` : ''}</h2>
          {!field && <div className="skeleton h-24 rounded-card mt-3" />}
          {field && field.length === 0 && <p className="text-ink/80 text-[15px] mt-2">Nobody has entered yet.</p>}
          {pairs && pairs.length > 0 && (
            <ul className={`${cardClass()} mt-3 divide-y divide-line max-w-2xl`}>
              {pairs.map(p => (
                <li key={p.teamId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  {p.members.map(m => (
                    <span key={m.rowId ?? m.name} className="inline-flex items-center gap-1">
                      <span className="text-ink text-[15px]">{m.name}</span>
                      {open && m.rowId && (
                        <button type="button" disabled={busy} onClick={() => void takeOut(m.rowId!)} className="ch-hover ch-focus t-cap text-ink/80 rounded-tile px-2 min-h-9">Take out</button>
                      )}
                    </span>
                  ))}
                  {p.members.length < 2 && <span className="t-cap text-ink/65">Looking for a partner — not drawn unless one joins</span>}
                </li>
              ))}
            </ul>
          )}
          {!pairs && field && field.length > 0 && (
            <ul className={`${cardClass()} mt-3 divide-y divide-line max-w-xl`}>
              {field.map(e => (
                <li key={e.rowId ?? e.name} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1 min-w-0 truncate text-ink text-[15px]">{e.name}</span>
                  {open && e.rowId && (
                    <button type="button" disabled={busy} onClick={() => void takeOut(e.rowId!)} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Take out</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
        </section>
        <section>
          <h2 className="t-h2 text-ink">Rules</h2>
          <dl className={`${cardClass()} mt-3 divide-y divide-line`}>
            {mp.rules.lines.map(l => (
              <div key={l.label} className="px-4 py-2.5">
                <dt className="t-cap text-ink/65">{l.label}</dt>
                <dd className="text-ink text-[15px]">{l.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h2 className="t-h2 text-ink">Play-by dates</h2>
          <ol className={`${cardClass()} mt-3 divide-y divide-line`}>
            {mp.rules.deadlines.map(d => (
              <li key={d.round} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="flex-1 text-ink text-[15px]">{d.round}</span>
                <span className="text-ink text-[15px] tabular-nums">{d.date}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
