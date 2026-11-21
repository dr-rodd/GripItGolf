// A club's locations — the only copy of their rules (D277, Ross, 21 Nov
// 2026). Clubs book things into places: rooms (the bar, the function room)
// and the courses. Pure: the Clubhouse draws, the server reads and writes
// (`club_locations`, migration 099).
//
// * **Courses** are Course 1, Course 2… — the home course first, then any
//   course added in Locations, then any course a competition uses, each
//   once. They are worked out, never typed: a club's course appears unasked.
//   **A one-course club never chooses** (Ross: "the vast majority will have
//   one course") — its course is just "Course", and every golf event is on it.
// * **Rooms** are the club's own names, in the order it keeps them.
// * **Where an event is**: a competition on its course; a Golf or Course
//   event on the course it names, else Course 1; anything else in its room,
//   else "Other" — the free text it always had.

import type { ClubEventType, ClubNote } from './clubEvents'
import { splitCourseName } from './courseDirectory'

export const LOCATION_NAME_MAX = 40

/** A room as stored. */
export interface ClubRoom {
  id: string
  name: string
  position: number
}

/** A course the club plays, as the Clubhouse shows it. */
export interface ClubCourse {
  courseId: string
  name: string
  /** "Course" for a one-course club, else "Course 1", "Course 2"… */
  label: string
  /** The stored row that lists it, when it was added in Locations — removable; worked-out ones are not. */
  locationId: string | null
}

/** Everything the Clubhouse needs to place an event: the courses, then the rooms. */
export interface ClubPlaces {
  courses: ClubCourse[]
  rooms: ClubRoom[]
  /** False before migration 099: rooms cannot be kept yet. */
  ready: boolean
}

export const NO_PLACES: ClubPlaces = { courses: [], rooms: [], ready: false }

/**
 * The club's courses, each once: the home course, those added in Locations
 * (in their order), then those its competitions use. A course with no name
 * on file is left out — there is nothing to call it.
 */
export function clubCourses(o: {
  homeCourseId: string | null
  added: { id: string; courseId: string; position: number }[]
  used: string[]
  names: Map<string, string>
}): ClubCourse[] {
  const seen = new Set<string>()
  const list: { courseId: string; locationId: string | null }[] = []
  const add = (courseId: string | null | undefined, locationId: string | null) => {
    if (!courseId || seen.has(courseId) || !o.names.has(courseId)) return
    seen.add(courseId); list.push({ courseId, locationId })
  }
  add(o.homeCourseId, null)
  for (const a of [...o.added].sort((x, y) => x.position - y.position)) add(a.courseId, a.id)
  for (const u of o.used) add(u, null)
  // A course added in Locations that is also the home course stays removable from the list it was added to.
  const addedRow = new Map(o.added.map(a => [a.courseId, a.id]))
  return list.map((c, i) => ({
    courseId: c.courseId, name: o.names.get(c.courseId)!, label: list.length === 1 ? 'Course' : `Course ${i + 1}`,
    locationId: c.locationId ?? addedRow.get(c.courseId) ?? null,
  }))
}

/** Why a room's name cannot be kept — or null. Names are the club's own, unique ignoring case. */
export function roomNameIssue(name: string, others: { id: string; name: string }[], id: string | null = null): string | null {
  const n = name.trim()
  if (!n) return 'Give the place a name.'
  if (n.length > LOCATION_NAME_MAX) return `Keep the name under ${LOCATION_NAME_MAX} characters.`
  if (others.some(o => o.id !== id && o.name.trim().toLowerCase() === n.toLowerCase())) return `The club already has ${n}.`
  return null
}

/** Golf and Course events are on a course; anything else is in a room. */
export function onCourse(type: ClubEventType): boolean {
  return type === 'GOLF' || type === 'COURSE'
}

/** Where an event sits: a course, a room, or Other (its free text, if any). */
export type EventPlace =
  | { kind: 'course'; course: ClubCourse }
  | { kind: 'room'; room: ClubRoom }
  | { kind: 'other'; text: string | null }

export function placeOf(n: Pick<ClubNote, 'type' | 'place'> & { locationId?: string | null; locationCourseId?: string | null }, p: ClubPlaces): EventPlace {
  if (onCourse(n.type)) {
    const c = p.courses.find(x => x.courseId === n.locationCourseId) ?? p.courses[0]
    if (c) return { kind: 'course', course: c }
    return { kind: 'other', text: n.place }
  }
  const r = n.locationId ? p.rooms.find(x => x.id === n.locationId) : undefined
  return r ? { kind: 'room', room: r } : { kind: 'other', text: n.place }
}

/** The place in words for a table: a one-course club's course is "Course", else "Course 2 · Old"; a room by name; Other its text. */
export function placeLine(pl: EventPlace): string | null {
  if (pl.kind === 'course') return pl.course.label === 'Course' ? 'Course' : `${pl.course.label} · ${shortCourse(pl.course.name)}`
  if (pl.kind === 'room') return pl.room.name
  return pl.text
}

/** A course's own name, short: the course part of "Club -- Course", else the club. */
export function shortCourse(name: string): string {
  const s = splitCourseName(name)
  return s.course ?? s.club
}

/** A place's words made comparable: lower case, a leading "the" and punctuation gone. */
export function placeKey(s: string): string {
  return s.toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '')
}

/**
 * What a typed place (an imported calendar's Where) means at this club: a
 * room by its name, a course by its label ("Course 2"), its name, its club or
 * course part, or "course" in a one-course club — else null, kept as text.
 */
export function matchPlace(text: string | null | undefined, p: ClubPlaces): { locationId: string } | { courseId: string } | null {
  if (!text || !text.trim()) return null
  const k = placeKey(text)
  const room = p.rooms.find(r => placeKey(r.name) === k)
  if (room) return { locationId: room.id }
  for (const c of p.courses) {
    const s = splitCourseName(c.name)
    const keys = [c.label, c.name, s.club, s.course ?? ''].filter(Boolean).map(placeKey)
    if (keys.includes(k)) return { courseId: c.courseId }
  }
  if (p.courses.length === 1 && (k === 'course' || k === 'golf course')) return { courseId: p.courses[0].courseId }
  return null
}

/**
 * Where an event on the season is, in words, for the Events table (D277,
 * D272): a competition on its course — "Course" in a one-course club, else
 * "Course 2 · Old" — a club event by its place, and a competition whose
 * course the club's list does not know by its own name.
 */
export function seasonPlaceLine(
  e: { competition: { courseId?: string | null; courseName: string | null } | null; note?: Pick<ClubNote, 'type' | 'place' | 'locationId' | 'locationCourseId'> },
  p: ClubPlaces,
): string | null {
  if (e.competition) {
    const c = p.courses.find(x => x.courseId === e.competition!.courseId)
    if (c) return placeLine({ kind: 'course', course: c })
    return e.competition.courseName ? shortCourse(e.competition.courseName) : null
  }
  return e.note ? placeLine(placeOf(e.note, p)) : null
}

/**
 * An imported Where as an event's place (D277): a course for a Golf or Course
 * event, a room for anything else — matched by name — else the text as it
 * came, `kept` saying so when the club has places it could have been.
 */
export function placeFields(type: ClubEventType, where: string | null, p: ClubPlaces): { locationId: string | null; locationCourseId: string | null; place: string | null; kept: boolean } {
  const m = matchPlace(where, p)
  if (m && onCourse(type) && 'courseId' in m) {
    // Course 1 is stored as no course: a one-course club never chooses.
    return { locationId: null, locationCourseId: m.courseId === p.courses[0]?.courseId ? null : m.courseId, place: null, kept: false }
  }
  if (m && !onCourse(type) && 'locationId' in m) return { locationId: m.locationId, locationCourseId: null, place: null, kept: false }
  const text = where?.trim() || null
  return { locationId: null, locationCourseId: null, place: text, kept: !!text && (onCourse(type) ? p.courses.length > 0 : p.rooms.length > 0) }
}
