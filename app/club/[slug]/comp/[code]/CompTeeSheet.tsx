'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus, IconX } from '@/app/components/icons'
import { FIELD, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { askBooking, peekKept, type BookingAnswer } from '@/lib/accountClient'
import { enterEvent } from '@/lib/entryClient'
import { formatHandicap } from '@/lib/handicap'
import { rememberPlayer } from '@/lib/playerCookie'

export interface CompSeat { rowId: string | null; playerId: string; name: string; handicap: number | null; bookedBy: string | null }
export interface CompSlot { index: number; clock: string; seats: CompSeat[]; gone: boolean }

type Me = Pick<BookingAnswer, 'myRowId' | 'myPlayerId' | 'admin' | 'entry' | 'myRefusal'> | null

/**
 * A club competition's tee sheet (D173): every time and who is on it, and
 * booking from the club's list — your own name in one tap, partners by a
 * name search, withdraw until the time has gone. Every write is the
 * server's (`/api/club/booking`), which makes a player for a list row the
 * first time it is booked; the sheet is read again after each.
 */
export default function CompTeeSheet({ code, slots, groupSize, bookingOpen, waitLine }: {
  code: string
  slots: CompSlot[]
  groupSize: number
  /** Booking open to the field now (the club's admins may place people before). */
  bookingOpen: boolean
  /** Said while booking is not open yet. */
  waitLine: string | null
}) {
  const router = useRouter()
  const [me, setMe] = useState<Me>(() => {
    const r = peekKept<{ ok: true } & BookingAnswer>('booking', code)
    return r ? { myRowId: r.myRowId, myPlayerId: r.myPlayerId ?? null, admin: !!r.admin, entry: r.entry, myRefusal: r.myRefusal } : null
  })
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<{ slot: number; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    askBooking('state', { code }).then(r => {
      if (!live || !r.ok) return
      setMe({ myRowId: r.myRowId, myPlayerId: r.myPlayerId ?? null, admin: !!r.admin, entry: r.entry, myRefusal: r.myRefusal })
      // This phone is "me" on the sheet and the card, as everywhere.
      if (r.myPlayerId) { rememberPlayer(code, r.myPlayerId); void enterEvent(code, { playerId: r.myPlayerId }) }
    })
    return () => { live = false }
  }, [code])

  const iAmBooked = !!me?.myPlayerId && slots.some(s => s.seats.some(x => x.playerId === me.myPlayerId))
  const mayBook = !!me && (bookingOpen || !!me.admin)

  async function withdraw(slot: CompSlot, seat: CompSeat) {
    if (!seat.rowId || busy) return
    setBusy(true); setError(null)
    const r = await askBooking('withdraw', { code, memberId: seat.rowId })
    setBusy(false)
    if (!r.ok) { setError({ slot: slot.index, text: r.error }); return }
    setMe(m => (m ? { ...m, myPlayerId: r.myPlayerId ?? null } : m))
    router.refresh()
  }

  return (
    <section className="mt-6">
      <h1 className="t-h1 text-ink">Tee sheet</h1>
      {me?.entry && <p className="t-label text-ink mt-2">Open to: {me.entry}</p>}
      {me?.myRefusal && !iAmBooked && <p className="text-ink/80 text-[15px] mt-1">{me.myRefusal}</p>}
      {waitLine && <p className="text-ink/80 text-[15px] mt-2">{waitLine}</p>}
      {!bookingOpen && me?.admin && <p className="t-cap text-ink/65 mt-1">Until then, only the club’s admins place people.</p>}
      <ul className="mt-5 space-y-3">
        {slots.map(slot => {
          const free = groupSize - slot.seats.length
          return (
            <li key={slot.index} className={`${cardClass()} p-3`}>
              <div className="flex items-start gap-3">
                <span className="t-data text-[18px] text-ink w-14 flex-shrink-0 pt-1">{slot.clock}</span>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                  {slot.seats.map(seat => {
                    const mineSeat = !!me?.myPlayerId && seat.playerId === me.myPlayerId
                    const mayTakeOff = !slot.gone && !!me && !!seat.rowId
                      && (!!me.admin || seat.rowId === me.myRowId || (!!me.myPlayerId && seat.bookedBy === me.myPlayerId))
                    return (
                      <div key={seat.playerId}
                        className={`rounded-tile border px-2.5 py-2 flex items-start gap-1 ${mineSeat ? 'bg-accent-tint border-accent-deep' : 'bg-surface border-line'}`}>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-medium text-ink leading-snug break-words">{seat.name}</span>
                          <span className="block t-cap text-ink/65">{seat.handicap === null ? 'HCP pending' : `HCP ${formatHandicap(seat.handicap)}`}</span>
                        </span>
                        {mayTakeOff && (
                          <button type="button" disabled={busy} onClick={() => void withdraw(slot, seat)}
                            aria-label={`Take ${seat.name} off ${slot.clock}`} className="text-ink/50 hover:text-ink p-1 -m-1 press">
                            <IconX size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {Array.from({ length: Math.max(0, free) }, (_, i) => (
                    mayBook && !slot.gone && i === 0 && open !== slot.index ? (
                      <button key={`open-${i}`} type="button" onClick={() => { setOpen(slot.index); setError(null) }}
                        className="rounded-tile border border-dashed border-line-strong min-h-12 flex items-center justify-center gap-1 t-label text-accent-deep press">
                        <IconPlus size={16} /> Book
                      </button>
                    ) : (
                      <span key={`open-${i}`} aria-hidden="true" className="rounded-tile border border-dashed border-line min-h-12" />
                    )
                  ))}
                </div>
              </div>
              {error?.slot === slot.index && <p className="t-cap text-rust-deep mt-2" role="alert">{error.text}</p>}
              {open === slot.index && me && (
                <BookPanel code={code} slot={slot} free={free} offerMe={!iAmBooked && (!me.myRefusal || !!me.admin)} admin={!!me.admin}
                  onDone={async (myPlayerId) => {
                    setOpen(null)
                    if (myPlayerId) {
                      setMe(m => (m ? { ...m, myPlayerId } : m))
                      rememberPlayer(code, myPlayerId); void enterEvent(code, { playerId: myPlayerId })
                    }
                    router.refresh()
                  }}
                  onCancel={() => setOpen(null)} myRowId={me.myRowId ?? null} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Booking one time: yourself, and partners searched from the club's list. */
function BookPanel({ code, slot, free, offerMe, admin, myRowId, onDone, onCancel }: {
  code: string
  slot: CompSlot
  free: number
  offerMe: boolean
  /** An Officer: may book somebody the entry rules refuse, said and logged (stage (m)). */
  admin: boolean
  myRowId: string | null
  onDone: (myPlayerId: string | null) => void
  onCancel: () => void
}) {
  const [withMe, setWithMe] = useState(offerMe)
  const [chosen, setChosen] = useState<{ id: string; name: string }[]>([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; booked: boolean; linked: boolean; why?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [anyway, setAnyway] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const count = chosen.length + (withMe ? 1 : 0)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setFound([]); return }
    timer.current = setTimeout(() => {
      askBooking('names', { code, q: q.trim() }).then(r => setFound(r.ok ? r.names ?? [] : []))
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, code])

  async function book(over = false) {
    const ids = [...(withMe && myRowId ? [myRowId] : []), ...chosen.map(c => c.id)]
    setBusy(true); setError(''); setAnyway(false)
    const r = await askBooking('book', { code, slot: slot.index, memberIds: ids, ...(over ? { anyway: true } : {}) })
    setBusy(false)
    if (!r.ok) { setError(r.error); setAnyway(!!r.anyway); return }
    onDone(r.myPlayerId ?? null)
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-3">
      <div className="flex flex-wrap gap-2">
        {offerMe && myRowId && (
          <button type="button" className={chipClass(withMe)} onClick={() => { setWithMe(v => !v); setAnyway(false) }} aria-pressed={withMe}>Me</button>
        )}
        {chosen.map(c => (
          <button key={c.id} type="button" className={chipClass(true)} onClick={() => { setChosen(x => x.filter(y => y.id !== c.id)); setAnyway(false) }}
            aria-label={`Take ${c.name} out`}>
            {c.name} <IconX size={14} />
          </button>
        ))}
      </div>
      {count < free && (
        <div>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Add a partner from the club’s list"
            aria-label="Search the club’s list" className={FIELD} />
          {found.length > 0 && (
            <ul className="mt-2 space-y-1">
              {found.map(f => {
                const taken = f.booked || !f.linked || chosen.some(c => c.id === f.id) || f.id === myRowId || (!!f.why && !admin)
                return (
                  <li key={f.id}>
                    <button type="button" disabled={taken} onClick={() => { setChosen(x => [...x, { id: f.id, name: f.name }]); setQ(''); setAnyway(false) }}
                      className="w-full text-left px-3 py-2 rounded-tile hover:bg-tint press disabled:text-ink/40">
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
      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
      {anyway && <p className="t-cap text-ink/65">As an Officer you can book them anyway. It’s kept on the club’s record.</p>}
      <div className="flex flex-wrap gap-3">
        {anyway ? (
          <button type="button" disabled={busy} onClick={() => void book(true)} className={buttonClass('primary', false)}>
            {busy ? 'Booking…' : 'Book anyway'}
          </button>
        ) : (
          <button type="button" disabled={busy || count === 0 || count > free} onClick={() => void book()} className={buttonClass('primary', false)}>
            {busy ? 'Booking…' : count > 1 ? `Book ${count}` : 'Book'}
          </button>
        )}
        <button type="button" onClick={onCancel} className={buttonClass('quiet', false)}>Cancel</button>
      </div>
    </div>
  )
}
