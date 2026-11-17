'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@/app/components/icons'
import { buttonClass, cardClass } from '@/app/components/ui'
import { eventHref, eventsOn, isOfficeOnly, monthGrid, seasonType, stepMonth, type SeasonEvent } from '@/lib/clubhouse'
import { typeLabel, type ClubNote } from '@/lib/clubEvents'
import EventPanel from '../events/EventPanel'
import { irishToday } from '@/lib/clubs'
import { PHASE_WORDS } from '@/lib/compPhase'
import { useShell } from '../ShellContext'
import { useSeason } from '../useSeason'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Calendar (stage (k2), D215): every event under the club — competitions
 * and the rest — a month at a time, Monday first, today ringed. Each event
 * opens where it lives. On a phone the month is a list of its days with
 * something on (D202).
 */
export default function ClubCalendar() {
  const { face, club, may } = useShell()
  const { events, lost, again } = useSeason(club.id)
  const [editing, setEditing] = useState<ClubNote | null>(null)
  const office = may('keep_calendar')
  const today = irishToday(new Date())
  const [ym, setYm] = useState<[number, number]>([Number(today.slice(0, 4)), Number(today.slice(5, 7))])
  const [year, month] = ym
  const weeks = useMemo(() => monthGrid(year, month), [year, month])
  const title = new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
  const days = weeks.flat().filter((d): d is string => !!d)
  const busyDays = days.map(d => ({ d, on: eventsOn(events ?? [], d) })).filter(x => x.on.length > 0)

  // Stage c1: an event's type is said in words, never by colour alone; a
  // club event opens its panel here (the office's), a competition or other
  // golf event opens where it lives.
  const chipBody = (e: SeasonEvent) => (
    <>
      {seasonType(e) !== 'COMP' && <span className="block text-[13px] font-normal text-ink/65 leading-tight">{typeLabel(seasonType(e))}{isOfficeOnly(e) ? ' · Office' : ''}</span>}
      <span className="block truncate">{e.name}</span>
    </>
  )
  const chipClass = (e: SeasonEvent) => `ch-hover ch-focus block w-full text-left rounded-tile px-1.5 py-1 text-[13px] font-semibold leading-tight ${e.competition ? 'bg-club-tint text-club-deep' : 'bg-tint text-ink'}`
  const chip = (e: SeasonEvent) => {
    const href = eventHref(e, face.slug)
    if (!href) {
      return office && e.note
        ? <button key={e.code} type="button" title={e.name} onClick={() => setEditing(e.note!)} className={chipClass(e)}>{chipBody(e)}</button>
        : <div key={e.code} title={e.name} className={chipClass(e)}>{chipBody(e)}</div>
    }
    return <Link key={e.code} href={href} title={e.name} className={chipClass(e)}>{chipBody(e)}</Link>
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="t-h1 text-ink flex-1">Calendar</h1>
        {office && <Link href={`/clubhouse/${face.slug}/calendar/import`} className={`${buttonClass('secondary', false)} ch-focus hidden md:inline-flex`}>Import a calendar</Link>}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setYm(stepMonth(year, month, -1))} aria-label="The month before" className={`${buttonClass('quiet', false)} ch-focus`}><IconChevronLeft size={20} /></button>
          <p className="t-label text-ink min-w-[10rem] text-center" aria-live="polite">{title}</p>
          <button type="button" onClick={() => setYm(stepMonth(year, month, 1))} aria-label="The next month" className={`${buttonClass('quiet', false)} ch-focus`}><IconChevronRight size={20} /></button>
        </div>
      </div>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}

      <div className={`${cardClass()} mt-6 overflow-hidden hidden md:block`} aria-busy={!events}>
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map(w => <p key={w} className="t-eyebrow text-ink/65 px-2 py-2">{w}</p>)}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {w.map((d, j) => (
              <div key={j} className={`min-h-24 p-1.5 border-r border-line last:border-r-0 ${d ? '' : 'bg-tint'}`}>
                {d && (
                  <>
                    <p className={`text-[13px] tabular-nums mb-1 inline-flex items-center justify-center w-6 h-6 rounded-full ${d === today ? 'ring-2 ring-accent-deep text-ink font-semibold' : 'text-ink/65'}`}>
                      {Number(d.slice(8))}
                    </p>
                    <div className="space-y-1">{eventsOn(events ?? [], d).map(chip)}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="md:hidden mt-6">
        {events && busyDays.length === 0 && <p className="text-ink/65 text-[15px]">Nothing on in {title}.</p>}
        <ul className={`${cardClass()} divide-y divide-line overflow-hidden ${busyDays.length ? '' : 'hidden'}`}>
          {busyDays.map(({ d, on }) => (
            <li key={d} className="px-4 py-3">
              <p className="t-cap text-ink/65">{new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))}</p>
              {on.map(e => {
                const href = eventHref(e, face.slug)
                const inner = (
                  <>
                    {e.name}
                    <span className="t-cap text-ink/65 font-normal">{e.competition ? PHASE_WORDS[e.competition.phase] : `${typeLabel(seasonType(e))}${isOfficeOnly(e) ? ' · Office only' : ''}`}</span>
                  </>
                )
                const cls = 'flex items-center justify-between gap-3 min-h-11 text-ink text-[15px] font-medium w-full text-left'
                return href
                  ? <Link key={e.code} href={href} className={cls}>{inner}</Link>
                  : e.note && office ? <button key={e.code} type="button" onClick={() => setEditing(e.note!)} className={cls}>{inner}</button>
                    : <div key={e.code} className={cls}>{inner}</div>
              })}
            </li>
          ))}
        </ul>
      </div>
      {editing && <EventPanel clubId={club.id} note={editing} onClose={() => setEditing(null)} onSaved={again} />}
    </>
  )
}
