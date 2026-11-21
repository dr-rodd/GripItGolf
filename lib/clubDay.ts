// The Clubhouse's day view (D277, Ross, 21 Nov 2026) — the only copy of its
// rules. One column per location, time from top to bottom, every booking a
// block for its length. Pure: `calendar/[day]/DayView.tsx` only multiplies by
// pixels.
//
// * **Columns**: the courses first (Course 1, Course 2…), then the rooms in
//   the club's order, then "Elsewhere" — only when something is there.
// * **A competition** sits on its course from its first tee to its last —
//   the block the casual tee sheet already shows. A match play is no day's
//   booking and is left out.
// * **A club event** sits in its room, or on its course (Golf, Course), or
//   Elsewhere: from its start to its end, an hour without an end; all day —
//   a strip at the column's head — without a start, or over several days.
// * **Overlaps** sit side by side in lanes inside their column, never refused.
// * **The window** runs 07:00 to 22:00, widened to the hour for anything
//   earlier or later.

import { eventsOn, type SeasonEvent } from './clubhouse'
import { placeOf, shortCourse, type ClubPlaces } from './clubLocations'
import { isOfficeOnly } from './clubhouse'

export const DAY_FROM = 7 * 60
export const DAY_TO = 22 * 60
/** An event without an end time occupies an hour (the Event Hub's rule). */
export const DEFAULT_EVENT_MINS = 60
/** A competition with one tee time still shows as a block this long. */
export const MIN_BLOCK_MINS = 30
export const ELSEWHERE = 'other'

export interface DayColumn {
  key: string
  label: string
  /** A course's own name under its label; null for a room. */
  sub: string | null
  kind: 'course' | 'room' | 'other'
  /** The course's id, for the casual tee sheet's band. */
  courseId?: string
}

export interface DayBlock {
  key: string
  column: string
  /** Minutes into the day — null for all day. */
  from: number | null
  to: number | null
  title: string
  sub: string | null
  kind: 'competition' | 'golf' | 'event'
  office: boolean
  /** The competition's code, or a club event's id — what a tap opens. */
  code?: string
  noteId?: string
  /** Its lane and how many lanes its overlap shares — set by `dayLayout`. */
  lane: number
  lanes: number
}

export function clockMins(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function minsClock(m: number): string {
  const h = Math.floor(m / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A day: its columns, its timed blocks in lanes, its all-day strips, the window and its hours. */
export function dayLayout(events: SeasonEvent[], day: string, places: ClubPlaces): {
  columns: DayColumn[]; blocks: DayBlock[]; allDay: DayBlock[]; from: number; to: number; hours: number[]
} {
  const columns: DayColumn[] = [
    ...places.courses.map(c => ({ key: `course:${c.courseId}`, label: c.label, sub: shortCourse(c.name), kind: 'course' as const, courseId: c.courseId })),
    ...places.rooms.map(r => ({ key: `room:${r.id}`, label: r.name, sub: null, kind: 'room' as const })),
  ]
  const known = new Set(columns.map(c => c.key))
  const courseCol = (courseId: string | null | undefined) => {
    const k = `course:${courseId ?? places.courses[0]?.courseId ?? ''}`
    return known.has(k) ? k : places.courses[0] ? `course:${places.courses[0].courseId}` : ELSEWHERE
  }
  const raw: Omit<DayBlock, 'lane' | 'lanes'>[] = []
  for (const e of eventsOn(events, day)) {
    const c = e.competition
    if (c?.matchPlay) continue
    if (c) {
      const a = clockMins(c.firstTee), b = clockMins(c.lastTee)
      raw.push({
        key: e.code, column: c.courseId ? (known.has(`course:${c.courseId}`) ? `course:${c.courseId}` : ELSEWHERE) : courseCol(null),
        from: a, to: a === null ? null : Math.max(b ?? a, a + MIN_BLOCK_MINS),
        title: e.name, sub: c.firstTee && c.lastTee ? `${c.firstTee} to ${c.lastTee} · ${c.booked}${c.capacity ? ` of ${c.capacity}` : ''} booked` : `${c.booked} booked`,
        kind: 'competition', office: false, code: e.code,
      })
      continue
    }
    const n = e.note
    if (!n) {
      // A trip or event the club runs on its own pages: golf, on the course, all day.
      raw.push({ key: e.code, column: e.kind === 'run' ? ELSEWHERE : courseCol(null), from: null, to: null, title: e.name, sub: null, kind: 'golf', office: false, code: e.code })
      continue
    }
    const pl = placeOf(n, places)
    const column = pl.kind === 'course' ? `course:${pl.course.courseId}` : pl.kind === 'room' ? `room:${pl.room.id}` : ELSEWHERE
    const multi = (n.endsOn ?? n.startsOn) !== n.startsOn
    const a = multi ? null : clockMins(n.startTime)
    const b = a === null ? null : clockMins(n.endTime)
    raw.push({
      key: e.code, column, from: a, to: a === null ? null : Math.min(24 * 60, b !== null && b > a ? b : a + DEFAULT_EVENT_MINS),
      title: n.title, sub: [a !== null ? `${minsClock(a)}${n.endTime && b !== null && b > a ? ` to ${n.endTime}` : ''}` : null, pl.kind === 'other' ? pl.text : null].filter(Boolean).join(' · ') || null,
      kind: pl.kind === 'course' ? 'golf' : 'event', office: isOfficeOnly(e), noteId: n.id,
    })
  }
  if (raw.some(b => b.column === ELSEWHERE)) columns.push({ key: ELSEWHERE, label: 'Elsewhere', sub: null, kind: 'other' })
  const timed = raw.filter(b => b.from !== null)
  const blocks = columns.flatMap(c => lanesOf(timed.filter(b => b.column === c.key)))
  const allDay = raw.filter(b => b.from === null).map(b => ({ ...b, lane: 0, lanes: 1 }))
  const earliest = Math.min(DAY_FROM, ...timed.map(b => b.from!))
  const latest = Math.max(DAY_TO, ...timed.map(b => b.to!))
  const from = Math.floor(earliest / 60) * 60, to = Math.min(24 * 60, Math.ceil(latest / 60) * 60)
  const hours: number[] = []
  for (let h = from; h <= to; h += 60) hours.push(h)
  return { columns, blocks, allDay, from, to, hours }
}

/**
 * Blocks side by side where they overlap: each takes the first lane free at
 * its start, and every block in a run of overlaps shares that run's count.
 */
export function lanesOf<T extends { from: number | null; to: number | null; key: string }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.from! - b.from! || (b.to! - b.from!) - (a.to! - a.from!) || a.key.localeCompare(b.key))
  const out: (T & { lane: number; lanes: number })[] = []
  let cluster: (T & { lane: number; lanes: number })[] = []
  let clusterEnd = -1
  const close = () => { const n = Math.max(1, ...cluster.map(c => c.lane + 1)); for (const c of cluster) c.lanes = n; out.push(...cluster); cluster = [] }
  for (const it of sorted) {
    if (cluster.length && it.from! >= clusterEnd) close()
    const busy = new Set(cluster.filter(c => c.to! > it.from!).map(c => c.lane))
    let lane = 0
    while (busy.has(lane)) lane++
    cluster.push({ ...it, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, it.to!)
  }
  if (cluster.length) close()
  return out
}
