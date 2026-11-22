'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { IconChevronRight } from '@/app/components/icons'
import { cardClass } from '@/app/components/ui'
import { askTeeTimes } from '@/lib/accountClient'
import { describeTime } from '@/lib/itinerary'
import { clubEventDates } from '@/lib/clubs'
import type { CalItem, CalKind, CalStatus } from '@/lib/clubCalendar'

/**
 * A member's calendar, shared by Home (Your bookings, the Calendar preview)
 * and the Calendar page (D286). Every line is the server's, worked out by
 * lib/clubCalendar.ts; these only draw it.
 */

type Answer = { today: string; items: CalItem[] }

/** Kept in this tab a minute, so moving between views and back is instant. */
const kept = new Map<string, { at: number; answer: Promise<Answer | { error: string }> }>()
const KEEP_MS = 60_000

function ask(clubId: string, from: string, to: string, fresh = false): Promise<Answer | { error: string }> {
  const key = `${clubId}:${from}:${to}`
  const had = kept.get(key)
  if (!fresh && had && Date.now() - had.at < KEEP_MS) return had.answer
  const answer = askTeeTimes<Answer>('calendar', { clubId, from, to })
    .then(r => (r.ok ? { today: r.today, items: r.items } : { error: r.error }))
    .catch(() => ({ error: 'Could not reach Green Dot — try again.' }))
  kept.set(key, { at: Date.now(), answer })
  return answer
}

/** The calendar's items for some days — null while asked, with a way to ask again. */
export function useMemberCalendar(clubId: string | null | undefined, from: string, to: string) {
  const [state, setState] = useState<{ key: string; items: CalItem[] | null; today: string | null; error: string | null }>({ key: '', items: null, today: null, error: null })
  const [n, setN] = useState(0)
  const key = `${clubId}:${from}:${to}`
  useEffect(() => {
    if (!clubId) return
    let live = true
    void ask(clubId, from, to, n > 0).then(r => {
      if (!live) return
      setState('error' in r ? { key, items: null, today: null, error: r.error } : { key, items: r.items, today: r.today, error: null })
    })
    return () => { live = false }
  }, [clubId, from, to, n, key])
  const here = state.key === key
  return { items: here ? state.items : null, today: here ? state.today : null, error: here ? state.error : null, again: () => setN(x => x + 1) }
}

/** The member's own line: "Booked in at 14:00 with:" and the names one a line, or one short line. */
export function StatusLines({ status, className = '' }: { status: CalStatus | null; className?: string }) {
  if (!status) return null
  const tone = status.tone === 'booked' || status.tone === 'open' ? 'text-club-deep font-semibold' : 'text-ink/65'
  return (
    <span className={`block t-cap ${tone} ${className}`}>
      {status.line}
      {status.names?.map(n => <span key={n} className="block font-normal text-ink/80">{n}</span>)}
    </span>
  )
}

/** The fill a thing on the calendar wears, by kind — a competition in the club's colour, the open sheet its tint. */
export const KIND_FILL: Record<CalKind, string> = {
  comp: 'bg-club text-on-club',
  open: 'bg-club-tint text-club-deep',
  block: 'bg-tint text-ink border border-line-strong',
  event: 'bg-surface text-ink border border-line',
  golf: 'bg-surface text-ink border border-line',
}

/** The colour down a card's left edge (D287), by kind — the label's colour from D288. */
export const KIND_BAR: Record<CalKind, string> = {
  comp: 'bg-club',
  open: 'bg-accent',
  block: 'bg-line-strong',
  event: 'bg-line-strong',
  golf: 'bg-line-strong',
}

export const KIND_WORD: Record<CalKind, string> = {
  comp: 'Competition', open: 'Tee sheet open', block: 'Course booked', event: 'Club event', golf: 'Golf event',
}

/** When, said short: "Sat 22 Nov · 14:00–16:30", or the day alone. */
export function whenLine(i: CalItem, withDay = true): string {
  const day = withDay ? clubEventDates(i.date, i.endDate ?? i.date) : null
  const time = i.from ? (i.to && i.to !== i.from ? `${describeTime(i.from)} to ${describeTime(i.to)}` : describeTime(i.from)) : null
  return [day, time].filter(Boolean).join(' · ')
}

/** D288: the colour down a card's left edge — its label's (else its type's); the open sheet's the action green. */
export function edgeStyle(i: Pick<CalItem, 'colour'>): React.CSSProperties | undefined {
  return i.colour ? { background: i.colour } : undefined
}

/** D288: a block filled with its label's colour softly, its edge in full — the words stay ink. */
export function fillStyle(i: Pick<CalItem, 'colour'>): React.CSSProperties | undefined {
  return i.colour ? { background: `color-mix(in srgb, ${i.colour} 16%, var(--color-surface))`, borderLeft: `4px solid ${i.colour}` } : undefined
}

/** One thing as a row: its colour down the left edge (D288), a date tile, its name, when, and the member's own line. A tap goes where it should. */
export function ItemRow({ i, onNote }: { i: CalItem; onNote?: (i: CalItem) => void }) {
  const d = new Date(`${i.date}T12:00:00Z`)
  const body = (
    <>
      <span aria-hidden="true" className={`w-1.5 self-stretch -my-2 -ml-2 rounded-l-card flex-shrink-0 ${i.colour ? '' : KIND_BAR[i.kind]}`} style={edgeStyle(i)} />
      <span className="w-[52px] h-14 flex-shrink-0 rounded-tile flex flex-col items-center justify-center bg-tint">
        <span className="t-data text-[20px] leading-none text-ink">{d.getUTCDate()}</span>
        <span className="text-[13px] leading-none text-ink/65 mt-1">{new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' }).format(d)}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-medium leading-snug text-ink">{i.title}</span>
        <span className="block t-cap text-ink/65">{[KIND_WORD[i.kind], whenLine(i, false)].filter(Boolean).join(' · ')}</span>
        <StatusLines status={i.status} className="mt-0.5" />
      </span>
      {(i.href || i.note) && <IconChevronRight size={20} className="text-ink/50 flex-shrink-0" />}
    </>
  )
  const cls = `${cardClass('raised', true)} w-full text-left flex items-center gap-3 p-2 pr-3 overflow-hidden`
  return (
    <li>
      {i.href
        ? <Link href={i.href} className={cls}>{body}</Link>
        : i.note && onNote
          ? <button type="button" onClick={() => onNote(i)} className={cls}>{body}</button>
          : <div className={cls}>{body}</div>}
    </li>
  )
}
