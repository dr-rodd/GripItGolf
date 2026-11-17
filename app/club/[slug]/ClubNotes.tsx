'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronRight, IconX } from '@/app/components/icons'
import { cardClass, chipClass } from '@/app/components/ui'
import { clubEventDates } from '@/lib/clubs'
import { EVENT_TYPES, noteTimeLine, typeLabel, type ClubNote, type EventType } from '@/lib/clubEvents'

/**
 * The club's own events in the members app (stage c1, M6): a row on the
 * club calendar and Upcoming, chips to narrow Upcoming by type, and a
 * simple sheet when one is tapped — title, date, times, where, notes. No
 * booking and no tee sheet: these are not golf members book.
 */

/** A date tile and the event beside it, as the club calendar draws a competition. */
export function NoteRow({ n, onOpen }: { n: ClubNote; onOpen: () => void }) {
  const d = new Date(`${n.startsOn}T12:00:00Z`)
  const time = noteTimeLine(n)
  return (
    <li>
      <button type="button" onClick={onOpen} className={`${cardClass('raised', true)} w-full text-left flex items-center gap-3 p-2 pr-3`}>
        <span className="w-[52px] h-14 flex-shrink-0 rounded-tile bg-tint flex flex-col items-center justify-center">
          <span className="t-data text-[20px] leading-none text-ink">{d.getUTCDate()}</span>
          <span className="text-[13px] leading-none text-ink/65 mt-1">{new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' }).format(d)}</span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-medium leading-snug text-ink">{n.title}</span>
          <span className="block t-cap text-ink/65">{[typeLabel(n.type), time, n.place].filter(Boolean).join(' · ')}</span>
        </span>
        <IconChevronRight size={20} className="text-ink/50 flex-shrink-0" />
      </button>
    </li>
  )
}

/** Chips for the types present — Every type first. Only drawn with more than one type to choose between. */
export function TypeChips({ types, value, onChange }: { types: EventType[]; value: EventType | 'all'; onChange: (t: EventType | 'all') => void }) {
  if (types.length < 2) return null
  const ordered = EVENT_TYPES.filter(t => types.includes(t.code))
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 mt-4" role="group" aria-label="Which events">
      <button type="button" aria-pressed={value === 'all'} className={`${chipClass(value === 'all')} flex-shrink-0`} onClick={() => onChange('all')}>Everything</button>
      {ordered.map(t => (
        <button key={t.code} type="button" aria-pressed={value === t.code} className={`${chipClass(value === t.code)} flex-shrink-0`} onClick={() => onChange(t.code)}>{t.plural}</button>
      ))}
    </div>
  )
}

/** One club event, opened: what, when, where, notes — over the club's footer, so portalled to the page. */
export function NoteSheet({ n, onClose }: { n: ClubNote; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const time = noteTimeLine(n)
  // Drawn only after a tap, so the page's body is there.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="note-title" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40 page-enter" />
      <div className="relative paper rounded-t-sheet shadow-floating-up max-h-[88vh] overflow-y-auto sheet-up px-5 pt-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="t-cap text-ink/65">{typeLabel(n.type)}</p>
            <h2 id="note-title" className="t-h2 text-ink mt-1 break-words">{n.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink press flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="t-cap text-ink/65">When</dt>
            <dd className="text-ink text-[17px]">{clubEventDates(n.startsOn, n.endsOn ?? n.startsOn)}{time ? ` · ${time}` : ''}</dd>
          </div>
          {n.place && (
            <div>
              <dt className="t-cap text-ink/65">Where</dt>
              <dd className="text-ink text-[17px]">{n.place}</dd>
            </div>
          )}
          {n.notes && (
            <div>
              <dt className="t-cap text-ink/65">Notes</dt>
              <dd className="text-ink text-[15px] leading-relaxed whitespace-pre-line">{n.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>,
    document.body,
  )
}
