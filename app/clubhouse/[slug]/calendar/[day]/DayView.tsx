'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@/app/components/icons'
import { Pill, buttonClass, cardClass } from '@/app/components/ui'
import { askTeeTimes } from '@/lib/accountClient'
import { clubhouseHref, eventHref, opensOutside } from '@/lib/clubhouse'
import { DAY_FROM, clockMins, dayLayout, minsClock, type DayBlock, type DayColumn } from '@/lib/clubDay'
import { addDays } from '@/lib/clubOverview'
import type { ClubNote } from '@/lib/clubEvents'
import { irishToday } from '@/lib/clubs'
import EventPanel from '../../events/EventPanel'
import { useShell } from '../../ShellContext'
import { useSeason } from '../../useSeason'

/** Pixels an hour — the one number the drawing multiplies by. */
const HOUR_PX = 56
const COLUMN_MIN = 180
const RAIL = 56

type TeeBand = { from: number; to: number; booked: number; places: number }

/**
 * One day in the Clubhouse (D277): every location side by side — the
 * courses first, tinted the club's colour so they read as golf, the rooms
 * after — with time from top to bottom and each booking a block for its
 * length (`lib/clubDay.ts`). Today carries a line at the time now. A
 * competition opens its office page, a club event its panel.
 */
export default function DayView({ day }: { day: string }) {
  const { face, club, may } = useShell()
  const router = useRouter()
  const { events, lost, again, places } = useSeason(club.id)
  const [editing, setEditing] = useState<ClubNote | null>(null)
  const [band, setBand] = useState<TeeBand | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const office = may('keep_calendar')
  const keepsSheet = may('keep_tee_sheet')
  const today = irishToday(new Date())
  const layout = useMemo(() => dayLayout(events ?? [], day, places), [events, day, places])

  // The casual tee sheet's hours and how full, on the home course's column.
  useEffect(() => {
    if (!keepsSheet) return
    let live = true
    void askTeeTimes<{ ready?: boolean; times?: string[]; bookings?: unknown[]; settings?: { groupSize: number; interval: number } }>('office.day', { clubId: club.id, date: day }).then(r => {
      if (!live || !r.ok || r.ready === false || !r.times?.length) { if (live) setBand(null); return }
      const a = clockMins(r.times[0]), b = clockMins(r.times[r.times.length - 1])
      if (a === null || b === null) return
      setBand({ from: a, to: b + (r.settings?.interval ?? 10), booked: r.bookings?.length ?? 0, places: r.times.length * (r.settings?.groupSize ?? 4) })
    })
    return () => { live = false }
  }, [club.id, day, keepsSheet])

  // The line at the time now, on today only, moving each minute.
  useEffect(() => {
    if (day !== today) return
    const tick = () => {
      const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
      setNow(h * 60 + m)
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [day, today])

  const title = new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  const height = (layout.to - layout.from) / 60 * HOUR_PX
  const y = (m: number) => (m - layout.from) / 60 * HOUR_PX
  const homeCol = places.courses[0] ? `course:${places.courses[0].courseId}` : null
  const empty = !!events && layout.blocks.length === 0 && layout.allDay.length === 0
  const go = (d: string) => router.push(`${clubhouseHref(face.slug, 'calendar')}/${d}`)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${clubhouseHref(face.slug, 'calendar')}?day=${day}`} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9 inline-flex items-center gap-1"><IconChevronLeft size={18} /> Calendar</Link>
        <h1 className="t-h1 text-ink flex-1 min-w-[12rem]">{title}</h1>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(addDays(day, -1))} aria-label="The day before" className={`${buttonClass('quiet', false)} ch-focus`}><IconChevronLeft size={20} /></button>
          {day !== today && <button type="button" onClick={() => go(today)} className={`${buttonClass('quiet', false)} ch-focus`}>Today</button>}
          <button type="button" onClick={() => go(addDays(day, 1))} aria-label="The next day" className={`${buttonClass('quiet', false)} ch-focus`}><IconChevronRight size={20} /></button>
        </div>
      </div>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!events && !lost && <div className="skeleton h-96 rounded-card mt-6" />}
      {events && layout.columns.length === 0 && (
        <div className={`${cardClass()} p-6 mt-6 max-w-xl`}>
          <p className="t-card text-ink">No locations yet</p>
          <p className="text-ink/80 text-[15px] mt-2">Set the home course and add the club’s rooms in Club settings, and each gets a column here.</p>
          <Link href={`${clubhouseHref(face.slug, 'settings')}#locations`} className={`${buttonClass('secondary', false)} ch-focus mt-4`}>Locations</Link>
        </div>
      )}
      {events && layout.columns.length > 0 && (
        <>
          {empty && <p className="text-ink/65 text-[15px] mt-4">Nothing booked on this day.</p>}
          <div className={`${cardClass()} mt-4 overflow-x-auto`}>
            <div className="relative" style={{ minWidth: RAIL + layout.columns.length * COLUMN_MIN }}>
              {/* Heads: each location, the courses in the club's colour. */}
              <div className="flex border-b border-line sticky top-0 z-20 paper">
                <div className="flex-shrink-0 sticky left-0 z-10 paper border-r border-line" style={{ width: RAIL }} />
                {layout.columns.map(c => <Head key={c.key} c={c} />)}
              </div>
              {/* All day: a strip under each head, only when something is all day. */}
              {layout.allDay.length > 0 && (
                <div className="flex border-b border-line">
                  <div className="flex-shrink-0 sticky left-0 z-10 paper border-r border-line t-cap text-ink/65 px-2 py-2" style={{ width: RAIL }}>All day</div>
                  {layout.columns.map(c => (
                    <div key={c.key} className={`flex-1 border-r border-line last:border-r-0 p-1 space-y-1 ${c.kind === 'course' ? 'bg-club-tint' : ''}`} style={{ minWidth: COLUMN_MIN }}>
                      {layout.allDay.filter(b => b.column === c.key).map(b => <Block key={b.key} b={b} slug={face.slug} office={office} events={events} onEdit={setEditing} allDay />)}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex relative" style={{ height }}>
                {/* The hour rail, fixed while the columns scroll sideways. */}
                <div className="flex-shrink-0 sticky left-0 z-10 paper border-r border-line relative" style={{ width: RAIL }}>
                  {layout.hours.map(h => (
                    <span key={h} className="absolute right-2 t-cap text-ink/65 tabular-nums -translate-y-1/2" style={{ top: y(h) }}>{h === layout.from && h === DAY_FROM ? '' : minsClock(h)}</span>
                  ))}
                </div>
                {layout.columns.map(c => (
                  <div key={c.key} className="flex-1 relative border-r border-line last:border-r-0" style={{ minWidth: COLUMN_MIN }}>
                    {layout.hours.map(h => <div key={h} aria-hidden="true" className="absolute left-0 right-0 border-t border-line" style={{ top: y(h) }} />)}
                    {c.key === homeCol && band && (
                      <div className="absolute left-0 right-0 bg-club-tint" style={{ top: y(band.from), height: Math.max(8, y(band.to) - y(band.from)) }}>
                        <Link href={`${clubhouseHref(face.slug, 'teesheet')}?day=${day}`} className="ch-focus block t-cap text-club-deep px-2 pt-1 underline underline-offset-2">
                          Tee sheet · {band.booked} of {band.places} booked
                        </Link>
                      </div>
                    )}
                    {layout.blocks.filter(b => b.column === c.key).map(b => (
                      <div key={b.key} className="absolute px-1" style={{ top: y(b.from!), height: Math.max(28, y(b.to!) - y(b.from!)), left: `${(b.lane / b.lanes) * 100}%`, width: `${100 / b.lanes}%` }}>
                        <Block b={b} slug={face.slug} office={office} events={events} onEdit={setEditing} />
                      </div>
                    ))}
                  </div>
                ))}
                {now !== null && now >= layout.from && now <= layout.to && (
                  <div aria-hidden="true" className="absolute right-0 z-10 pointer-events-none" style={{ top: y(now), left: RAIL }}>
                    <div className="h-0.5 bg-accent-deep" />
                    <span className="absolute -left-1.5 -top-[5px] w-3 h-3 rounded-full bg-accent-deep" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {editing && <EventPanel clubId={club.id} note={editing} onClose={() => setEditing(null)} onSaved={again} />}
    </>
  )
}

function Head({ c }: { c: DayColumn }) {
  return (
    <div className={`flex-1 px-3 py-2 border-r border-line last:border-r-0 ${c.kind === 'course' ? 'bg-club-tint' : ''}`} style={{ minWidth: COLUMN_MIN }}>
      <p className={`t-label truncate ${c.kind === 'course' ? 'text-club-deep' : 'text-ink'}`}>{c.label}</p>
      {c.sub && <p className="t-cap text-ink/65 truncate">{c.sub}</p>}
    </div>
  )
}

function Block({ b, slug, office, events, onEdit, allDay = false }: {
  b: DayBlock; slug: string; office: boolean; events: import('@/lib/clubhouse').SeasonEvent[]; onEdit: (n: ClubNote) => void; allDay?: boolean
}) {
  const golf = b.kind !== 'event'
  const cls = `block w-full ${allDay ? '' : 'h-full'} overflow-hidden text-left rounded-tile px-2 py-1 border ${golf ? 'bg-club-tint border-club text-club-deep' : 'bg-surface border-line-strong text-ink'} ch-focus`
  const inner = (
    <>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="t-label truncate flex-1">{b.title}</span>
        {b.office && <Pill className="flex-shrink-0">Office only</Pill>}
      </span>
      {b.sub && <span className="block t-cap text-ink/80 truncate">{b.sub}</span>}
    </>
  )
  if (b.noteId) {
    const ev = events.find(e => e.note?.id === b.noteId)
    const note = ev?.note
    const noteEdge = ev?.colour ? { borderLeft: `4px solid ${ev.colour}` } : undefined
    return office && note
      ? <button type="button" onClick={() => onEdit(note)} title={b.title} className={`${cls} ch-hover`} style={noteEdge}>{inner}</button>
      : <div title={b.title} className={cls} style={noteEdge}>{inner}</div>
  }
  const e = events.find(x => x.code === b.code)
  const href = e ? eventHref(e, slug) : null
  // D285: an event unlinked from the members app is greyed.
  const dim = e?.unlinked ? ' opacity-60' : ''
  // D288: its label's colour down the block's left edge.
  const edge = e?.colour ? { borderLeft: `4px solid ${e.colour}` } : undefined
  return href
    ? <Link href={href} title={b.title} {...(e && opensOutside(e) ? { target: '_blank', rel: 'noopener' } : {})} className={`${cls} ch-hover${dim}`} style={edge}>{inner}</Link>
    : <div title={b.title} className={`${cls}${dim}`} style={edge}>{inner}</div>
}
